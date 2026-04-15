import { addDays, addHours, addMinutes, addMonths, addYears, format, secondsToHours, secondsToMinutes } from "date-fns";
import { formatInTimeZone, getTimezoneOffset } from "date-fns-tz";

import { JsonUtils, Log, LogLevels, StringUtils, Utils } from "../index";

// ─── PublicHolidays stub ─────────────────────────────────────────────────────
// TODO: Replace with a real import when a PublicHolidays module is provided by the consumer.
//       The region string is an opaque identifier passed through by the caller (e.g. "us-east", "eu-london").
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PublicHolidays {
  export type IANATimeZone = string;
  export interface PublicHoliday { date: Date; }
  export function getIANAZone(_region: string): IANATimeZone { throw new Error("PublicHolidays not yet implemented"); }
  export async function isDatePublicHoliday(_date: number, _region: string): Promise<boolean> { throw new Error("PublicHolidays not yet implemented"); }
  export async function getFirstPublicHolidayBetweenDates(_start: number, _end: number, _region: string): Promise<PublicHoliday | undefined> { throw new Error("PublicHolidays not yet implemented"); }
}

// ─── MockUtils stub ───────────────────────────────────────────────────────────
// TODO: Replace with real import when MockUtils is brought into the package
const MockUtils = {
  interceptedRequests: undefined as object[] | undefined,
};


interface RunningString {
  currentToken: InnermostToken;
  outputString: string;
}
interface DoTokenReturn {
  processedToken?: string;
  state?: string;
  tokenBodyIfDateToken?: string;
}
interface DoTokenPreambleReturn {
  offsetAndFormat: string[];
  verb: string;
  params: string | undefined;
  errParseDateOffset: string;
  errInvalidEpoch: string;
  errRandomParams: string;
  errFollowingDayParams: string;
  errNextPublicHoldayParams: string;
  errAddWorkingDaysParams: string;
  errInvalidDateVerb: string;
  stateIANAZone: PublicHolidays.IANATimeZone | undefined;
}

/**
 * Processes strings containing tokens in the format `[[tokenType|expression|format]]`, replacing each
 * token with its resolved value. Tokens can be nested — the innermost is always resolved first.
 *
 * ## Token syntax
 * ```
 * [[tokenType|expression|format]]
 * ```
 * - **tokenType** — identifies the built-in handler or is matched against registered callbacks
 * - **expression** — what to compute (type-specific)
 * - **format** — how to format the result (type-specific, often optional)
 *
 * ---
 * ## Built-in token types
 *
 * ### `random` — random data
 * | Expression | Format | Example | Sample output |
 * |---|---|---|---|
 * | `digits` | count | `[[random\|digits\|6]]` | `482910` |
 * | `letters` | count | `[[random\|letters\|4]]` | `xKpQ` |
 * | `lowercaseletters` | count | `[[random\|lowercaseletters\|4]]` | `xkpq` |
 * | `uppercaseletters` | count | `[[random\|uppercaseletters\|4]]` | `XKPQ` |
 * | `alphanumerics` | count | `[[random\|alphanumerics\|8]]` | `a3Kx92Zp` |
 * | `from(<chars>)` | count | `[[random\|from(aeiou)\|3]]` | `ioa` |
 * | `float(min,max)` | decimal places | `[[random\|float(1.5,3.7)\|2]]` | `2.83` |
 * | `date(fromEpoch,toEpoch)` | date format | `[[random\|date(0,1700000000000)\|yyyy-MM-dd]]` | `1994-07-12` |
 *
 * ### `date` / `date(<state>)` — date and time
 * Format is a [date-fns format string](https://date-fns.org/docs/format), or the special values
 * `epoch` (milliseconds since 1970-01-01) or `second-epoch`.
 *
 * | Expression | Example | Sample output |
 * |---|---|---|
 * | `today` / `now` | `[[date\|today\|dd-MM-yyyy]]` | `01-04-2026` |
 * | `yesterday` | `[[date\|yesterday\|dd-MM-yyyy]]` | `31-03-2026` |
 * | `tomorrow` | `[[date\|tomorrow\|dd-MM-yyyy]]` | `02-04-2026` |
 * | `addYears(n)` | `[[date\|addYears(-1)\|yyyy]]` | `2025` |
 * | `addMonths(n)` | `[[date\|addMonths(3)\|MMM yyyy]]` | `Jul 2026` |
 * | `addDays(n)` | `[[date\|addDays(5)\|dd-MM-yyyy]]` | `06-04-2026` |
 * | `addHours(n)` | `[[date\|addHours(2)\|HH:mm]]` | `14:30` |
 * | `addMinutes(n)` | `[[date\|addMinutes(30)\|HH:mm]]` | `13:00` |
 * | `random(fromEpoch,toEpoch)` | date format | `[[date\|random(0,1700000000000)\|yyyy-MM-dd]]` | random date |
 * | `followingDay(epoch,dayName)` | date format | `[[date\|followingDay(1711929600000,wednesday)\|dd-MM-yyyy]]` | next Wednesday |
 * | `yyyy-MM-dd` _(fixed date)_ | date format | `[[date\|2026-06-15\|EEEE]]` | `Monday` |
 * | `timezoneOffset` _(with region)_ | _(none)_ | `[[date(us-east)\|timezoneOffset]]` | `-0500` |
 *
 * A region qualifier routes date formatting through the region's IANA timezone (resolved by the
 * consumer-provided `PublicHolidays` module):
 * ```
 * [[date(eu-london)|today|HH:mm]]        ← formatted in London time
 * [[date(us-east)|addDays(1)|dd-MM-yyyy]]
 * ```
 *
 * The following expressions are **async-only** — use {@link Detokeniser.doAsync} with a region qualifier:
 * - `addWorkingDays(n)` — adds business days, skipping weekends and public holidays
 * - `followingWorkingDay(epoch,dayName)` — as `followingDay` but skips weekends and public holidays
 * - `nextPublicHoliday(fromEpoch,maxDays)` — next public holiday within a search window
 *
 * ```typescript
 * await Detokeniser.doAsync('[[date(us-east)|addWorkingDays(5)|dd-MM-yyyy]]');
 * await Detokeniser.doAsync('[[date(eu-london)|nextPublicHoliday([[date|today|epoch]],90)|dd-MM-yyyy]]');
 * ```
 *
 * ### `setting` — retrieve a configured value
 * Parameters are given as JSON key/value pairs after the delimiter. Resolution order:
 * process env → npm config → context parameters → default value.
 * ```
 * [[setting|processEnvName: "MY_VAR"]]
 * [[setting|processEnvName: "MY_VAR", defaultValue: "fallback"]]
 * [[setting|npmPackageConfigName: "myconfig"]]
 * [[setting|profileParameterName: "myParam", defaultValue: "none"]]
 * ```
 *
 * ### `base64` — encode or decode
 * ```
 * [[base64|encode|Hello World]]        →  SGVsbG8gV29ybGQ=
 * [[base64|decode|SGVsbG8gV29ybGQ=]]   →  Hello World
 * ```
 *
 * ### `jwt` — generate a signed JWT
 * ```
 * [[jwt|{"sub":"1234","name":"Test"}|MySecret]]
 * [[jwt|{"sub":"1234"}|MySecret|{"algorithm":"HS256"}]]
 * ```
 *
 * ### `mockintercepts` — harvest a value from intercepted mock requests
 * ```
 * [[mockintercepts|$.requests[0].body.userId]]
 * ```
 *
 * ---
 * ## Nesting
 * Tokens are resolved innermost-first, so nested tokens compose naturally:
 * ```typescript
 * // Date N random days from now, where N is itself a random digit
 * Detokeniser.do('[[date|addDays([[random|digits|1]])|dd-MM-yyyy]]');
 *
 * // Next NSW public holiday from today (async — needs doAsync)
 * await Detokeniser.doAsync('[[date(eu-london)|nextPublicHoliday([[date|today|epoch]],90)|dd-MM-yyyy]]');
 * ```
 *
 * ---
 * ## Escaping
 * The escape character is `/` (configurable via `EscapeChar`). Escaping applies both inside and
 * outside tokens. A double escape `//` produces a literal `/`.
 *
 * | Input | Output | Notes |
 * |---|---|---|
 * | `/[[` | `[[` | Literal `[[` — not treated as token start |
 * | `/]]` | `]]` | Literal `]]` — not treated as token end |
 * | `//` | `/` | Literal escape char |
 * | `[[random\|from(xyz/[[)\|3]]` | 3 chars from `xyz[[` | `/[[` inside `from()` = `/[` (→`[`) + `[` = two `[` (higher weight) |
 * | `[[random\|from(abc/))\|2]]` | 2 chars from `abc)` | `/)` inside `from()` = literal `)` |
 *
 * ---
 * ## Extending with callbacks
 * Custom token types are registered via {@link Detokeniser.addCallback}. Both sync and async handlers
 * share the same registration method and callback list. Callbacks are tried in registration order;
 * return `undefined` to pass to the next callback. If all callbacks return `undefined` and no built-in
 * handler matched, an error is thrown.
 *
 * Async callbacks are silently skipped when {@link Detokeniser.do} (sync) is used — use
 * {@link Detokeniser.doAsync} if your callback returns a Promise.
 *
 * @see {@link Detokeniser.addCallback}
 * @see {@link Detokeniser.do}
 * @see {@link Detokeniser.doAsync}
 */
export class Detokeniser {
  private static readonly _endTokenChar = "]]";
  private static readonly _startTokenChar = "[[";
  private static EscapeChar = "/";
  private static readonly _delimiter = "|";

  private static _callbacks: Array<Detokeniser.Callback> | undefined = undefined;

  /**
   * Resets the Detokeniser to factory defaults:
   * - Escape char restored to `/`
   * - All registered sync and async callbacks cleared
   *
   * Call this in test teardown to guarantee a clean state between scenarios.
   * @example
   * afterEach(() => Detokeniser.reset());
   */
  public static reset() {
    this.EscapeChar = "/";
    this._callbacks = undefined;
  }

  /**
   * Registers a custom token handler. Both sync and async handlers are registered via this method
   * and share the same callback list.
   *
   * Callbacks are tried in registration order. The first to return a non-`undefined` value wins.
   * Return `undefined` to pass to the next callback. If all callbacks return `undefined` and no
   * built-in handler matched, an error is thrown.
   *
   * Async callbacks (those returning a `Promise`) are silently skipped when {@link Detokeniser.do}
   * is used — register an async callback only if you intend to call {@link Detokeniser.doAsync}.
   *
   * @param callback - `(token: string) => string | undefined | Promise<string | undefined>`
   *   - `token` — full token body without `[[` / `]]`, e.g. `"mytype|arg1|arg2"` (delimiter is always `|`)
   *
   * @example
   * // Sync handler for [[env|VAR_NAME]] tokens
   * Detokeniser.addCallback((token) => {
   *   const [type, name] = token.split('|');
   *   if (type !== 'env') return undefined;
   *   return process.env[name] ?? '';
   * });
   * Detokeniser.do('Path: [[env|HOME]]'); // → 'Path: /home/user'
   *
   * @example
   * // Async handler for [[db|table|column|where]] tokens
   * Detokeniser.addCallback(async (token) => {
   *   const [type, table, column, where] = token.split('|');
   *   if (type !== 'db') return undefined;
   *   const row = await db.query(`SELECT ${column} FROM ${table} WHERE ${where} LIMIT 1`);
   *   return String(row[column]);
   * });
   * const result = await Detokeniser.doAsync('ID: [[db|users|id|active=1]]');
   *
   * @see {@link Detokeniser.resetCallbacks} to remove all registered callbacks
   * @see {@link Detokeniser.doAsync} for async token resolution
   */
  public static addCallback(callback: Detokeniser.Callback) {
    if (!this._callbacks) {
      this._callbacks = new Array<Detokeniser.Callback>();
    }
    this._callbacks.push(callback);
  }

  /**
   * Removes all registered callbacks. Built-in token handlers are unaffected.
   * Use between tests or scenarios to ensure callback isolation.
   * @see {@link Detokeniser.reset} to also restore all defaults
   */
  public static resetCallbacks() {
    this._callbacks = undefined;
  }

  /**
   * Synchronously resolves all tokens in the given string and returns the result.
   *
   * Tokens are resolved innermost-first. Registered sync callbacks are invoked for token types not
   * handled by the built-in set. Use {@link Detokeniser.doAsync} if you need async callbacks or any
   * of the async-only date expressions (`addWorkingDays`, `followingWorkingDay`, `nextPublicHoliday`).
   *
   * @param tokenisedString - String potentially containing `[[...]]` tokens
   * @param options - Optional processing options
   * @returns The input string with all tokens replaced by their resolved values
   * @throws If any token is malformed, unsupported, or a callback throws
   *
   * @example
   * Detokeniser.do('Ref-[[random|digits|6]]');                        // → e.g. 'Ref-482910'
   * Detokeniser.do('Expires [[date|addDays(30)|dd/MM/yyyy]]');        // → e.g. 'Expires 01/05/2026'
   * Detokeniser.do('[[random|uppercaseletters|3]]-[[random|digits|4]]'); // → e.g. 'XKP-7391'
   *
   * @example
   * // Nested tokens — innermost resolved first
   * Detokeniser.do('[[date|addDays([[random|digits|1]])|dd-MM-yyyy]]');
   *
   * @example
   * // Context parameters for [[setting|...]] tokens
   * Detokeniser.do('Hello [[setting|profileParameterName: "username"]]', {
   *   contextParameters: { username: 'Alice' }
   * }); // → 'Hello Alice'
   *
   * @example
   * // Escaping — produce literal [[ / ]] in output
   * Detokeniser.do('Press /[[Enter/]] to continue'); // → 'Press [[Enter]] to continue'
   */
  public static do(tokenisedString: string, options: Detokeniser.DoOptions = {}): string {
    let deEscape = true;
    try {
      const runningString = this.doPreamble(tokenisedString);

      // Loop until last token find found no tokens
      while (runningString.currentToken.hasToken) {
        // Process the last found token, prepend it to the text after the last found token then find any token in the resulting string
        runningString.currentToken = new InnermostToken(
          this.doToken(runningString.currentToken.childToken.substring(this._startTokenChar.length),options) + runningString.currentToken.postamble,
          this._startTokenChar,
          this._endTokenChar,
          this.EscapeChar
        );
        // Concatinate the last found tokens preable (or full text if none found) to the built string and recursivley call self to ensure full token resolution
        runningString.outputString = this.do(runningString.outputString + runningString.currentToken.preamble);
        deEscape = false;
      }

      //
      // Okay, so there is a bug here.  But it shall remain unfixed as it requires time.
      //
      // The bug is that is the resolved token string contains a sequence of characters that makes doDeEscapesIfRequired think it sees an escaped special char
      // the it will de-escape it!!  However, probablity of incidence is currently low.  When/If it does happen (impact could be high!) it can then be fixed.
      //
      // IE.
      //  const encoded = Buffer.from('this/>escaped').toString('base64');
      //  const decoded = Detokeniser.do(`<base64;decode;${encoded}>`);
      //
      //  decoded would now be "this>escaped".  Should be "this/>escaped".
      //
      runningString.outputString = this.doDeEscapesIfRequired(tokenisedString, deEscape, runningString.outputString);
      return runningString.outputString;
    } catch (err: unknown) {
      const errText = `Error processing [${tokenisedString}]: ${typeof err === "string" ? err : err instanceof Error ? err.message : "<unknown>"}`;
      Log.writeLine(LogLevels.Error, errText);
      throw Error(errText);
    }
  }

  /**
   * Asynchronously resolves all tokens in the given string and returns a Promise of the result.
   *
   * Functionally equivalent to {@link Detokeniser.do} but additionally supports:
   * - Async callbacks registered via {@link Detokeniser.addCallbackAsync}
   * - Async-only date expressions: `addWorkingDays`, `followingWorkingDay`, `nextPublicHoliday`
   *
   * Note: sync callbacks registered via {@link Detokeniser.addCallbackSync} are **not** invoked
   * during async processing — re-register them with {@link Detokeniser.addCallbackAsync} if needed.
   *
   * @param tokenisedString - String potentially containing `[[...]]` tokens
   * @returns Promise resolving to the input string with all tokens replaced
   * @throws If any token is malformed, unsupported, or a callback throws
   *
   * @example
   * // Async-only date expressions require doAsync and a region qualifier
   * await Detokeniser.doAsync('[[date(us-east)|addWorkingDays(5)|dd-MM-yyyy]]');
   * await Detokeniser.doAsync('[[date(eu-london)|nextPublicHoliday([[date|today|epoch]],90)|dd-MM-yyyy]]');
   *
   * @example
   * // Async callback for database-driven tokens
   * Detokeniser.addCallbackAsync(async (token) => {
   *   const [type, key] = token.split('|');
   *   if (type !== 'db') return undefined;
   *   return await fetchFromDatabase(key);
   * });
   * await Detokeniser.doAsync('User: [[db|users.name.first]]');
   */
  public static async doAsync(tokenisedString: string): Promise<string> {
    let deEscape = true;

    try {
      const runningString = this.doPreamble(tokenisedString);

      // Loop until last token find found no tokens
      while (runningString.currentToken.hasToken) {
        // Process the last found token, prepend it to the text after the last found token then find any token in the resulting string
        runningString.currentToken = new InnermostToken(
          (await this.asyncDoToken(runningString.currentToken.childToken.substring(this._startTokenChar.length))) +
          runningString.currentToken.postamble,
          this._startTokenChar,
          this._endTokenChar,
          this.EscapeChar
        );
        const logToken = runningString.currentToken.hasToken ? runningString.currentToken.childToken : '<No Token>';
        Log.writeLine(
          LogLevels.FrameworkDebug,
          `Preamble:[${runningString.currentToken.preamble}] Token:[${logToken}] Postamble:[${runningString.currentToken.postamble}]`
        );
        // Concatinate the last found tokens preable (or full text if none found) to the built string and recursivley call self to ensure full token resolution
        runningString.outputString = await this.doAsync(runningString.outputString + runningString.currentToken.preamble);
        deEscape = false;
      }

      runningString.outputString = this.doDeEscapesIfRequired(tokenisedString, deEscape, runningString.outputString);
      return runningString.outputString;
    } catch (err: unknown) {
      const errText = `Error processing [${tokenisedString}]: ${typeof err === "string" ? err : err instanceof Error ? err.message : "<unknown>"}`;
      Log.writeLine(LogLevels.Error, errText);
      throw Error(errText);
    }
  }

  private static doDeEscapesIfRequired(tokenisedString: string, deEscape: boolean, stringToProcess: string): string {
    // After all tokens are resolved, remove escaping from any chars that were escaped to prevent token recognition.
    // Uses a 3-pass approach to correctly handle escaped escape chars (e.g. //) adjacent to other escapes (e.g. /[):
    //   Pass 1: replace // with \x00 placeholder
    //   Pass 2: de-escape each char that makes up the start/end token sequences
    //   Pass 3: restore \x00 back to the escape char
    let processedString = stringToProcess;

    if (deEscape && !StringUtils.isBlank(processedString)) {
      const doubleEscapes = this.EscapeChar + this.EscapeChar;
      processedString = StringUtils.replaceAll(processedString, doubleEscapes, "\x00");
      const tokenChars = new Set([...this._startTokenChar, ...this._endTokenChar]);
      for (const char of tokenChars) {
        processedString = StringUtils.replaceAll(processedString, this.EscapeChar + char, char);
      }
      processedString = StringUtils.replaceAll(processedString, "\x00", this.EscapeChar);
    }
    if (tokenisedString !== processedString) {
      Log.writeLine(LogLevels.FrameworkDebug, `Processed [${tokenisedString}]\nto [${processedString}]`);
    }
    return processedString;
  }

  private static doPreamble(tokenisedString: string): RunningString {
    // Drill down to the left-most deepest (if nested) token
    const token = new InnermostToken(tokenisedString, this._startTokenChar, this._endTokenChar, this.EscapeChar);

    // Get all text to the left of any token found in the string passed in.  If no token was found Preamble will contain all text from passed string
    const outputString = token.preamble;
    return { currentToken: token, outputString };
  }

  private static doTokenMain(token: string, options: Detokeniser.DoOptions = {}): DoTokenReturn {
    const doTokenReturn: DoTokenReturn = {};

    doTokenReturn.processedToken = undefined;

    if (!token || token === "") {
      throw new Error("Empty token!  Token must be populated.");
    }
    const [tokenName, postAmble] = StringUtils.splitRemaining(token, this._delimiter, 2);
    const loweredTokenName = tokenName.toLowerCase().trim();
    const postAmbleDeEscaped = this.doDeEscapesIfRequired(postAmble, true, postAmble);

    if (typeof doTokenReturn.processedToken === "undefined") {
      switch (loweredTokenName) {
        case "random":
          if (StringUtils.isBlank(postAmbleDeEscaped)) throw new Error(`Random token [${token}] needs at least 2 parts (IE. {{random;type[;<length>]}} etc.)`);
          doTokenReturn.processedToken = this.doRandomToken(postAmbleDeEscaped);
          break;
        case "setting":
          {
            if (StringUtils.isBlank(postAmbleDeEscaped)) throw new Error(`Setting token [${token}] needs at least 2 parts (IE. {{setting;processEnvName: "TEST_LOG_TO_CONSOLE")`);
            doTokenReturn.processedToken = this.doSettingToken(postAmbleDeEscaped, options);
            break;
          }
        case "mockintercepts":
          if (StringUtils.isBlank(postAmbleDeEscaped)) throw new Error(`Request token [${token}] needs 2 parts {{mockintercepts;JSONPath}}`);
          doTokenReturn.processedToken = this.doMockRequests(postAmbleDeEscaped);
          break;
        case "jwt":
          if (StringUtils.isBlank(postAmbleDeEscaped))
            throw new Error(`JWT token [${token}] needs at least 2 parts (IE. {{jwt;payload[;signature[;options]]}} etc.)`);
          doTokenReturn.processedToken = this.doJWTToken(postAmbleDeEscaped);
          break;
        case "base64":
          // aha, we actuall need three parts <base64;encode|decode;<string>>
          if (!StringUtils.isBlank(postAmbleDeEscaped)) {
            const [direction, value] = StringUtils.splitRemaining(postAmbleDeEscaped, this._delimiter, 2);
            if (direction == "encode" || direction == "decode") {
              doTokenReturn.processedToken = this.doBase64(value, direction);
              break;
            }
          }
          throw new Error(`BASE64 token [${token}] needs 3 parts (IE. {{base64;encode|decode;value}})`);
        default:
          if (loweredTokenName.startsWith("date")) {
            doTokenReturn.tokenBodyIfDateToken = postAmbleDeEscaped;
            if (loweredTokenName[4] === "(" && loweredTokenName.endsWith(")")) {
              if (StringUtils.isBlank(postAmbleDeEscaped)) {
                throw new Error(`Date token [${token}] needs 2 or 3 parts {{date(<state>);<offset>;<format>}} or {{date;timezone}}`);
              } else {
                const state = StringUtils.trimChar(StringUtils.splitRemaining(tokenName, "(", 2)[1], ")");
                const body = postAmbleDeEscaped;
                Log.writeLine(LogLevels.FrameworkDebug, `Calling doDateToken.  State = [${state}]. Body = [${body}]`);
                doTokenReturn.state = state;
              }
            }
          }
      }
    }
    return doTokenReturn;
  }

  private static doToken(token: string, options: Detokeniser.DoOptions = {}): string {
    const doTokenReturn = this.doTokenMain(token,options);
    let processedToken: string | undefined;
    if (Utils.isNullOrUndefined(doTokenReturn.processedToken) && doTokenReturn.tokenBodyIfDateToken) {
      processedToken = this.doDateToken(doTokenReturn.state as string, doTokenReturn.tokenBodyIfDateToken as string);
    } else {
      processedToken = doTokenReturn.processedToken as string;
    }
    //
    // If token still not been processed itterate through the callbacks, breaking as soon as it is processed
    //
    try {
      if (Utils.isNullOrUndefined(processedToken)) {
        if (typeof this._callbacks != "undefined") {
          this._callbacks.every((callback) => {
            const result = callback(token);
            if (result instanceof Promise) return true; // skip async callbacks in sync context
            processedToken = result;
            return Utils.isNullOrUndefined(processedToken);
          });
        }
      }
    } catch (e) {
      throw new Error(`Error processing callback for [${token}]: ${(e as Error)?.message ?? "<Unknown Error>"}}`);
    }
    if (Utils.isNullOrUndefined(processedToken)) {
      throw new Error(`Unsupported token [${StringUtils.splitRemaining(token, this._delimiter, 2)[0]}]`);
    } else {
      return processedToken as string;
    }
  }

  private static async asyncDoToken(token: string, options: Detokeniser.DoOptions = {}): Promise<string> {
    const doTokenReturn = this.doTokenMain(token, options);
    let processedToken: string | undefined;
    if (Utils.isNullOrUndefined(doTokenReturn.processedToken) && doTokenReturn.tokenBodyIfDateToken) {
      processedToken = await this.asyncDoDateToken(doTokenReturn.state as string, doTokenReturn.tokenBodyIfDateToken as string);
    } else {
      processedToken = doTokenReturn.processedToken as string;
    }
    //
    // If token still not been processed itterate through the callbacks, breaking as soon as it is processed.  Dirty
    // ucky loop. But it works....  If you know a sexier way of doing it please change!!
    //
    try {
      if (Utils.isNullOrUndefined(processedToken)) {
        if (typeof this._callbacks != "undefined") {
          for (const callback of this._callbacks) {
            processedToken = await Promise.resolve(callback(token));
            if (!Utils.isNullOrUndefined(processedToken)) break;
          }
        }
      }
    } catch (e) {
      Log.writeLine(
        LogLevels.Error,
        `Error processing async callback (ignoring and setting response to undefined):${(e as Error)?.message ?? "<Unknown Error>"}}`
      );
      processedToken = undefined;
    }
    if (Utils.isNullOrUndefined(processedToken)) {
      throw new Error(`Unsupported token [${StringUtils.splitRemaining(token, this._delimiter, 2)[0]}]`);
    } else {
      return processedToken as string;
    }
  }

  private static doSettingToken(tokenBody: string, options: Detokeniser.DoOptions = {}): string | undefined {
    const bodyJSON = `{${tokenBody}}`;
    if (!JsonUtils.isJson(bodyJSON, true)) {
      const errText = `Token 'Setting'.\nExpected: parameters in name: value format (IE. ${this._startTokenChar}setting;processEnvName: "MY_SETTING"${this._endTokenChar}\nToken was: ${this._startTokenChar}setting;${tokenBody}${this._endTokenChar}\n\nValid Setting parameters include;\n  processEnvName - Name of process env variable\n  npmPackageConfigName - Name of NPM config var\n  profileParameterName - Name of Cucumber profile parameter\n  defaultValue - default value if cannot be found`;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    }
    const result = Utils.getSetting(LogLevels.TestInformation, "From Detokeniser", JsonUtils.parse(bodyJSON, true), options.contextParameters);
    if (Utils.isNullOrUndefined(result)) {
      return result as undefined;
    } else {
      return typeof result === 'object' ? JSON.stringify(result) : String(result);
    }
  }

  /**
   * Base64-encodes or decodes a string.
   *
   * This is the underlying handler for `[[base64|encode|...]]` and `[[base64|decode|...]]` tokens
   * but is also exposed for direct use.
   *
   * @param original - The string to encode or decode
   * @param direction - `"encode"` to base64-encode; `"decode"` to base64-decode
   * @returns The encoded or decoded string
   * @throws If the conversion fails (e.g. invalid base64 input for decode)
   *
   * @example
   * Detokeniser.doBase64('Hello World', 'encode');      // → 'SGVsbG8gV29ybGQ='
   * Detokeniser.doBase64('SGVsbG8gV29ybGQ=', 'decode'); // → 'Hello World'
   */
  public static doBase64(original: string, direction: "encode" | "decode"): string {
    try {
      return direction == "encode" ? Buffer.from(original).toString("base64") : Buffer.from(original, "base64").toString();
    } catch (err) {
      const errText = `Converting:\n[${original}]\n  ${direction == "encode" ? "to" : "from"} base64:\n {${(err as Error).message}}`;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    }
  }

  //
  //  So, this has been created quickly with little/no checking/testing.  Lots and lots of error handling needs adding or testers will get
  //  errors/fails they have no idea how to fix!!!!
  //
  private static doJWTToken(tokenBody: string): string {
    Log.writeLine(LogLevels.FrameworkDebug, `JWT token [${tokenBody}]`);
    const typeAndLengthOrFormat: string[] = StringUtils.splitRemaining(tokenBody, this._delimiter, 3);
    if (typeAndLengthOrFormat.length == 3) {
      return Utils.createJWT(typeAndLengthOrFormat[0], typeAndLengthOrFormat[1], typeAndLengthOrFormat[2]);
    } else if (typeAndLengthOrFormat.length == 2) {
      return Utils.createJWT(typeAndLengthOrFormat[0], typeAndLengthOrFormat[1]);
    } else {
      return Utils.createJWT(typeAndLengthOrFormat[0], "DummySignature");
    }
  }

  private static doMockRequests(jsonPath: string): string {
    //
    // NOTE.  This is MockUtils only at the moment.  When playwright is brought in to the library this MUST be made generic so user can harvest from Mock intercepts,
    // whether MSW OR Playwright.
    //
    if (!MockUtils.interceptedRequests || MockUtils.interceptedRequests.length <= 0) {
      const errMessage = "No Mock Intercepted requests to harvest from!?";
      Log.writeLine(LogLevels.Error, errMessage);
      throw new Error(errMessage);
    }

    const jsonProperties = JsonUtils.getPropertiesMatchingPath(MockUtils.interceptedRequests, jsonPath);
    if (jsonProperties.length != 1) {
      throw new Error(`Expected path (${jsonPath}) to match exactly one JSON node.  However, path matched ${jsonProperties.length} nodes!`);
    } else {
      return jsonProperties[0].value as string;
    }
  }

  /**
   * Extracts the content inside the first set of parentheses in `input`, respecting the escape char.
   * An escaped `)` (i.e. `/)`) is treated as a literal `)` and does not end the content.
   * @example parseParenContent("from(abc/))") → "abc)"
   * @example parseParenContent("from(xyz/[[)") → "xyz[["  (with default escape char `/`)
   */
  private static parseParenContent(input: string): string {
    const openParen = input.indexOf("(");
    if (openParen === -1) return "";
    let result = "";
    let i = openParen + 1;
    while (i < input.length) {
      if (input[i] === this.EscapeChar && i + 1 < input.length) {
        result += input[i + 1];
        i += 2;
      } else if (input[i] === ")") {
        break;
      } else {
        result += input[i];
        i++;
      }
    }
    return result;
  }

  private static doRandomToken(tokenBody: string): string {
    const typeAndLengthOrFormat: string[] = StringUtils.splitRemaining(tokenBody, this._delimiter, 2);
    let result = "";
    let select = "";
    const verb: string = typeAndLengthOrFormat[0].toLowerCase().trim();

    if (verb.startsWith("date(")) {
      const randomDate = this.doRandomDate(verb.substring(verb.indexOf("(") + 1, verb.indexOf(")")));

      result = typeAndLengthOrFormat[1].toLowerCase() === "epoch" ? "" + randomDate : format(randomDate, typeAndLengthOrFormat[1]);
    } else if (verb.startsWith("float(")) {
      // ToDo: Current format is only for number of decimals.  However in future could be precision,decimals if needed (IE. {random,float(4000,8000),3,4} precision 3 decimals 4...), defaulting
      //       to decimal places if only a single number given (then change would be non-breaking)....
      if (isNaN(parseInt(typeAndLengthOrFormat[1])))
        throw `Invalid Float format. Expect {{random.float(min;max),<number of decimals>}}. Format was: [${typeAndLengthOrFormat[1]}]`;
      const numberOfDecimalPlaces = parseInt(typeAndLengthOrFormat[1]);
      const powerDPs = Math.pow(10, numberOfDecimalPlaces);
      result = (Math.trunc(this.doRandomFloat(verb.substring(verb.indexOf("(") + 1, verb.indexOf(")"))) * powerDPs) / powerDPs).toFixed(numberOfDecimalPlaces);
    } else {
      if (verb.startsWith("from(")) {
        select = this.parseParenContent(typeAndLengthOrFormat[0]);
      } else {
        switch (verb) {
          case "letters":
            select = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            break;
          case "lowercaseletters":
            select = "abcdefghijklmnopqrstuvwxyz";
            break;
          case "uppercaseletters":
            select = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            break;
          case "digits":
            select = "0123456789";
            break;
          case "alphanumerics":
            select = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890";
            break;
          default:
            throw `Unrecognised random Type [${typeAndLengthOrFormat[0]}] - Expect letters, lowercaseletters, uppercaseletters digits or alphanumerics`;
        }
      }
      if (isNaN(parseInt(typeAndLengthOrFormat[1])) || parseInt(typeAndLengthOrFormat[1]) < 0)
        throw `Invalid length part in Random token {{random;<type>;<length>}}. Length was: [${typeAndLengthOrFormat[1]}]`;
      for (let count = 0; count < parseInt(typeAndLengthOrFormat[1]); count++) {
        result += select[Utils.getRandomInt(0, select.length - 1)];
      }
    }
    return result;
  }

  private static doDateTokenPreamble(date: number, state: string, tokenBody: string): DoTokenPreambleReturn {
    const offsetAndFormat = StringUtils.splitRemaining(tokenBody, this._delimiter, 2);
    const stateIANAZone = state ? PublicHolidays.getIANAZone(state) : undefined;

    Log.writeLine(LogLevels.FrameworkInformation, `Time now is [${date}] (Epoch) and we are in [${stateIANAZone ?? "<No state defined>"}]`);

    if (offsetAndFormat.length != 2 && !(offsetAndFormat.length == 1 && offsetAndFormat[0] == "timezoneoffset"))
      throw "Date token does not have a format parameter; example: {date;today;dd-MM-yyyy}";

    return {
      offsetAndFormat: offsetAndFormat,
      verb: (offsetAndFormat[0].includes("(") && offsetAndFormat[0].endsWith(")") ? offsetAndFormat[0].split("(")[0] : offsetAndFormat[0]).toLowerCase().trim(),
      params:
        offsetAndFormat[0].includes("(") && offsetAndFormat[0].endsWith(")")
          ? ((x: string) => {
            return x.substring(0, x.length - 1);
          })(offsetAndFormat[0].split("(")[1])
          : undefined,

      errParseDateOffset: "Invalid Active Date offset.  Expect AddYears(n) AddMonths(n) or AddDays(n)",
      errInvalidEpoch: "Invalid Epoch offset.  Expect number of milliseconds since 1/1/1970",
      errRandomParams: `Invalid Random params ([${offsetAndFormat[0]}]).  Expect Random(<start date>,<end date>).  Example: {date;random(1708990784000,1701360784000);yyy-MM-dd}`,
      errFollowingDayParams: `FollowingDay requires epoch and day name.  IE. FollowingDay(123456,wednesday)  Got ${offsetAndFormat[0]}`,
      errNextPublicHoldayParams: `Invalid Next Public Holiday Params.  Expect nextPublicHoliday(searchFromDateEpoch,maxDaysInFuture).  Got ${offsetAndFormat[0]}`,
      errAddWorkingDaysParams: `Invalid Add Working Days Params.  Expect addWorkingDays(numberOfDaysToAdd,[state/s]). Got Got ${offsetAndFormat[0]}`,
      errInvalidDateVerb: `Invalid date verb [${offsetAndFormat[0]}].  Need: Random, Today, Now, Yesterday, Tomorrow, AddYears(n) etc... EG {date;AddDays(5);yyyy-MM-dd}`,
      stateIANAZone: stateIANAZone,
    };
  }

  private static doDateTokenPostamble(offsetAndFormat: string[], date: number, stateIANAZone: PublicHolidays.IANATimeZone | undefined): string {
    if (offsetAndFormat[1].toLowerCase() === "epoch") {
      return date.toString();
    }

    if (offsetAndFormat[1].toLowerCase() === "second-epoch") {
      return Math.floor(date / 1000).toString();
    }

    try {
      //date += await getEpochOffset(state);
      const processedDate = stateIANAZone ? formatInTimeZone(date, stateIANAZone, offsetAndFormat[1]) : format(date, offsetAndFormat[1]);
      Log.writeLine(LogLevels.FrameworkDebug, `Formatted [${offsetAndFormat[0]}] date [${date}] (Epoch) with [${offsetAndFormat[1]}] to: [${processedDate}]`);
      return processedDate;
    } catch (err) {
      const errorText = `Error formatting date [${date}] with format string[${offsetAndFormat[1]}]: ${(err as Error)?.message ?? "<Unknown error>"}}`;
      throw new Error(errorText + "/r" + ((err as Error)?.stack ?? ""));
    }
  }

  private static doDateTokenNonAsyncVerbs(date: number, dateTokenPrep: DoTokenPreambleReturn): number {
    let returnDate: number = date;
    switch (dateTokenPrep.verb) {
      case "random": {
        if (Utils.isNullOrUndefined(dateTokenPrep.params)) {
          throw new Error(dateTokenPrep.errRandomParams);
        } else {
          returnDate = this.doRandomDate(dateTokenPrep.params as string);
        }
        break;
      }
      case "today":
      case "now":
        break;
      case "yesterday":
        returnDate = addDays(date, -1).getTime();
        break;
      case "tomorrow":
        returnDate = addDays(date, 1).getTime();
        break;
      case "addyears":
        returnDate = addYears(date, this.getParsedDateOffset(dateTokenPrep.params, dateTokenPrep.errParseDateOffset)).getTime();
        break;
      case "addmonths":
        returnDate = addMonths(date, this.getParsedDateOffset(dateTokenPrep.params, dateTokenPrep.errParseDateOffset)).getTime();
        break;
      case "adddays":
        returnDate = addDays(date, this.getParsedDateOffset(dateTokenPrep.params, dateTokenPrep.errParseDateOffset)).getTime();
        break;
      case "addhours":
        returnDate = addHours(date, this.getParsedDateOffset(dateTokenPrep.params, dateTokenPrep.errParseDateOffset)).getTime();
        break;
      case "addminutes":
        returnDate = addMinutes(date, this.getParsedDateOffset(dateTokenPrep.params, dateTokenPrep.errParseDateOffset)).getTime();
        break;
      case "followingday": {
        if (Utils.isNullOrUndefined(dateTokenPrep.params)) {
          throw new Error(dateTokenPrep.errFollowingDayParams);
        } else {
          const currentAndDay = (dateTokenPrep.params as string).split(",");
          if (currentAndDay.length != 2) throw new Error(dateTokenPrep.errFollowingDayParams);
          returnDate = this.getFollowingDay(
            this.getParsedDateOffset(currentAndDay[0], dateTokenPrep.errInvalidEpoch),
            currentAndDay[1].toLowerCase(),
            dateTokenPrep.errFollowingDayParams
          ).getTime();
        }
        break;
      }
      default:
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateTokenPrep.verb)) {
          // we have a fixed date.  User must be wanted to just format a date....
          const date = dateTokenPrep.verb.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
          const year = Number((date as Array<string>)[1]) ?? 0;
          const month = (Number((date as Array<string>)[2]) ?? 0) - 1;
          const day = Number((date as Array<string>)[3]) ?? 0;
          Log.writeLine(LogLevels.FrameworkInformation, `Date got fixed date:- >>${year}<<>>${month}<<>>${day}<<`);
          const fullEpoch = new Date(Date.UTC(year, month, day, 0, 0, 0));
          Log.writeLine(LogLevels.FrameworkInformation, `... which is:- >>${fullEpoch}<<`);

          returnDate = fullEpoch.getTime();
        } else {
          throw dateTokenPrep.errInvalidDateVerb;
        }
    }
    return returnDate;
  }

  private static doDateToken(state: string, tokenBody: string): string {
    let date = new Date().getTime();
    const dateTokenPrep = this.doDateTokenPreamble(date, state, tokenBody);

    switch (dateTokenPrep.verb) {
      case "timezoneoffset": {
        return this.getOffset(state, date);
      }
      case "addworkingdays":
      case "followingworkingday":
      case "nextpublicholiday": {
        const errorString = `${dateTokenPrep.verb} uses asynchoronous calls.  Use Detokenise.asyncDo`;
        Log.writeLine(LogLevels.Error, errorString);
        throw `Detokeniser: ${errorString}`;
      }
      default:
        date = this.doDateTokenNonAsyncVerbs(date, dateTokenPrep);
    }

    return this.doDateTokenPostamble(dateTokenPrep.offsetAndFormat, date, dateTokenPrep.stateIANAZone);
  }

  private static async asyncDoDateToken(state: string, tokenBody: string): Promise<string> {
    let date = new Date().getTime();
    Log.writeLine(LogLevels.FrameworkDebug, `asyncDoDateToken - Calling preAmble: Dates [${date}], State [${state}], Token Body [${tokenBody}]`);
    const dateTokenPrep = this.doDateTokenPreamble(date, state, tokenBody);
    Log.writeLine(LogLevels.FrameworkDebug, `asyncDoDateToken - Back from doDateTokenPreamble.  Verb ${dateTokenPrep.verb}`);
    switch (dateTokenPrep.verb) {
      case "timezoneoffset": {
        return this.getOffset(state, date);
      }
      case "addworkingdays": {
        // Adds days to current date not counting public holidays or weekends
        try {
          if (Utils.isNullOrUndefined(dateTokenPrep.params)) {
            throw new Error(dateTokenPrep.errAddWorkingDaysParams);
          }
          const paramArray = (dateTokenPrep.params as string).split(",");
          if (paramArray.length < 1) {
            throw new Error(dateTokenPrep.errAddWorkingDaysParams);
          }
          const numberOfDays = Number(paramArray[0]);
          const ascending = !(numberOfDays < 0);

          // Get the date not counting weekends
          const startDate = date;
          let endDate = startDate;
          let daysRemaining = numberOfDays;

          while (daysRemaining != 0) {
            endDate = addDays(endDate, ascending ? +1 : -1).getTime();
            while (
              (await PublicHolidays.isDatePublicHoliday(endDate, state)) ||
              Number(dateTokenPrep.stateIANAZone ? formatInTimeZone(endDate, dateTokenPrep.stateIANAZone, "e") : format(endDate, "e")) == 1 ||
              Number(dateTokenPrep.stateIANAZone ? formatInTimeZone(endDate, dateTokenPrep.stateIANAZone, "e") : format(endDate, "e")) == 7
            ) {
              endDate = addDays(endDate, ascending ? +1 : -1).getTime();
            }
            daysRemaining += ascending ? -1 : 1;
          }
          date = endDate;
        } catch (err) {
          Log.writeLine(LogLevels.Error, `Error processing addworkingdays: ${(err as Error)?.message ?? "<Unknown error>"}`);
        }
        break;
      }
      case "followingworkingday": {
        if (Utils.isNullOrUndefined(dateTokenPrep.params)) {
          throw new Error(dateTokenPrep.errFollowingDayParams);
        } else {
          // So, first get the followingday...
          const body = `followingDay(${dateTokenPrep.params});epoch`;
          Log.writeLine(LogLevels.FrameworkDebug, `asyncDoDateToken - Calling doDateToken for followingDay.  State = [${state}]. Body = [${body}]`);
          let workingDate = Number(this.doDateToken(state, body));
          Log.writeLine(LogLevels.FrameworkDebug, `got from doDateToken followingDay.  workingDate = ${workingDate}`);
          // Then, check it is not a weekend or public holiday anywhere.  Move forward if it is...
          while (
            Number(dateTokenPrep.stateIANAZone ? formatInTimeZone(workingDate, dateTokenPrep.stateIANAZone, "e") : format(workingDate, "e")) == 7 ||
            Number(dateTokenPrep.stateIANAZone ? formatInTimeZone(workingDate, dateTokenPrep.stateIANAZone, "e") : format(workingDate, "e")) == 1 ||
            (await PublicHolidays.isDatePublicHoliday(workingDate, state))
          ) {
            workingDate = addDays(workingDate, 1).getTime();
          }
          date = workingDate;
        }
        break;
      }
      case "nextpublicholiday": {
        if (Utils.isNullOrUndefined(dateTokenPrep.params)) {
          throw new Error(dateTokenPrep.errNextPublicHoldayParams);
        } else {
          const paramArray = (dateTokenPrep.params as string).split(",");
          if (paramArray.length != 2) {
            throw new Error(dateTokenPrep.errNextPublicHoldayParams);
          } else {
            date = (await this.getNextPublicHoliday(Number(paramArray[0]), state, Number(paramArray[1]))).getTime();
          }
        }
        break;
      }
      default:
        date = this.doDateTokenNonAsyncVerbs(date, dateTokenPrep);
    }

    return this.doDateTokenPostamble(dateTokenPrep.offsetAndFormat, date, dateTokenPrep.stateIANAZone);
  }

  private static async getNextPublicHoliday(dateEpoch: number, state: string, maxDaysAway: number): Promise<Date> {
    // So, to do this we get all public holidays upto maxDaysAway; first holiday is day we want!  easy!!!
    if (state == undefined) {
      const errMsg = "Cannot get next public holiday, State not defined (Use {Date(<state>);......})";
      Log.writeLine(LogLevels.Error, errMsg);
      throw new Error(errMsg);
    }
    const startDate = new Date(dateEpoch).getTime();
    const endDate = addDays(startDate, maxDaysAway).getTime();
    const stateIANAZone = PublicHolidays.getIANAZone(state);
    const nextPublicHoliday = await PublicHolidays.getFirstPublicHolidayBetweenDates(startDate, endDate, state);
    if (Utils.isNullOrUndefined(nextPublicHoliday)) {
      throw new Error(
        `No public holiday found between ${formatInTimeZone(startDate, stateIANAZone, "YYYY-MM-dd")} and ${formatInTimeZone(
          startDate,
          stateIANAZone,
          "YYYY-MM-dd"
        )} for State: ${state} (${stateIANAZone})`
      );
    }
    Log.writeLine(
      LogLevels.FrameworkInformation,
      `Found Public holiday: ${formatInTimeZone(
        (nextPublicHoliday as PublicHolidays.PublicHoliday).date,
        stateIANAZone,
        "yyyy-MM-dd"
      )} State: ${state} (${stateIANAZone})`
    );
    return (nextPublicHoliday as PublicHolidays.PublicHoliday).date;
  }

  private static getFollowingDay(currentDateEpoch: number, requiredDayOfTheWeek: string, errorString: string): Date {
    const dayName = requiredDayOfTheWeek.toLowerCase();
    const requiredDayOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].findIndex((item) => {
      if (item == dayName) return true;
      return false;
    });
    if (requiredDayOfWeek == -1) throw new Error(errorString);
    const actualDayOfWeek = new Date(currentDateEpoch).getUTCDay() - 1;
    if (actualDayOfWeek < requiredDayOfWeek) {
      return addDays(currentDateEpoch, requiredDayOfWeek - actualDayOfWeek);
    } else {
      return addDays(currentDateEpoch, requiredDayOfWeek + 7 - actualDayOfWeek);
    }
  }

  private static getParsedDateOffset(numString: string | undefined, errorMessage: string): number {
    if (Utils.isNullOrUndefined(numString)) {
      throw `${errorMessage} Got [No Params!]`;
    } else {
      const offsetValue = parseInt(numString?.trim() as string);
      if (isNaN(offsetValue)) throw `${errorMessage} Got [${numString?.trim() as string}]`;
      return offsetValue;
    }
  }

  private static doRandomDate(maxAndMinDates: string): number {
    const maxAndMin: string[] = maxAndMinDates.split(",");

    if (maxAndMin.length != 2 || Number.isNaN(+maxAndMin[0]) || Number.isNaN(+maxAndMin[1]))
      throw new Error(`Invalid Maximum and Minimum dates. Expect {random;date(fromEpoch,toEpoch);<format>}. Max/min was: [${maxAndMinDates}]`);
    const minDate = Number(maxAndMin[0]);
    const maxDate = Number(maxAndMin[1]);
    if (minDate > maxDate) throw new Error(`Minimum date greater than maximum!! Max/min was: [${maxAndMinDates}]`);
    return minDate + Math.abs(Utils.getRandomInt(0, this.numberOfDays(minDate, maxDate) - 1)) * 1000 * 60 * 60 * 24;
  }

  private static getOffset(state: string, dateOfOffset: Date | number): string {
    if (state == undefined) {
      const errMsg = "Unable to get timezone offset as no state provided.  Expect {Date(<state>);TimezoneOffset}";
      Log.writeLine(LogLevels.Error, errMsg);
      throw new Error(errMsg);
    }

    const offsetMilliseconds = getTimezoneOffset(PublicHolidays.getIANAZone(state), dateOfOffset);
    const offsetSeconds = Math.floor(offsetMilliseconds / 1000);
    const offsetHours = secondsToHours(offsetSeconds);
    const offsetMinutes = secondsToMinutes(offsetSeconds - offsetHours * 3600);
    const offset = (offsetSeconds < 0 ? "-" : "+") + Utils.pad(offsetHours, 2) + Utils.pad(offsetMinutes, 2);
    Log.writeLine(LogLevels.FrameworkInformation, `Got current offset (${offset}) from UTC for [${state}]`);
    return offset;
  }

  private static numberOfDays(minDate: number, maxDate: number): number {
    Log.writeLine(LogLevels.FrameworkDebug, `Min date [${minDate}], Max date[${maxDate}]`);
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const numberOfDays = Math.floor(Math.abs((minDate - maxDate) / MS_PER_DAY)) + 1;
    Log.writeLine(LogLevels.FrameworkDebug, `Min date [${minDate}], Max date[${maxDate}].  Number of days [${numberOfDays}]`);
    return numberOfDays;
  }

  private static doRandomFloat(limits: string): number {
    const minimumAndMaximum: string[] = limits.split(",");

    if (minimumAndMaximum.length != 2)
      throw new Error(`Invalid Maximum and Minimum floats. Expect {{random.float(min;max),<format>}}. Max/min was: [${limits}]`);
    const min = parseFloat(minimumAndMaximum[0]);
    const max = parseFloat(minimumAndMaximum[1]);

    if (isNaN(min)) throw new Error(`Invalid Minimum float. Expect {{random.float(min;max),<format>}}. Max/min was: [${limits}]`);
    if (isNaN(max)) throw new Error(`Invalid Maximum float. Expect {{random.float(min;max),<format>}}. Max/min was: [${limits}]`);

    return Utils.getRandomFloat(min, max);
  }
}

class InnermostToken {
  private tokenPreamble: string;
  private tokenPostamble: string;
  private _childToken: string;
  private foundToken: boolean;
  private escapeChar: string;

  constructor(inputString: string, StartTokenChar: string, EndTokenChar: string, EscapeChar: string) {
    let startIndex = -1;
    let endIndex = -1;

    this.escapeChar = EscapeChar;
    // Find the first (leftmost) non-escaped end token sequence. Because we search left-to-right this naturally
    // gives us the innermost token when tokens are nested.
    for (let index = 0; index <= inputString.length - EndTokenChar.length; index++) {
      if (inputString.startsWith(EndTokenChar, index) && !this.isEscaped(inputString, index)) {
        endIndex = index;
        break;
      }
    }

    // Now scan right-to-left from just before the end sequence to find the matching non-escaped start sequence.
    if (endIndex !== -1) {
      for (let index = endIndex - 1; index >= 0; index--) {
        if (inputString.startsWith(StartTokenChar, index) && !this.isEscaped(inputString, index)) {
          startIndex = index;
          break;
        }
      }
    }

    if (startIndex !== -1 && endIndex !== -1) {
      this.tokenPreamble = inputString.substring(0, startIndex);
      this.tokenPostamble = inputString.substring(endIndex + EndTokenChar.length);
      this._childToken = inputString.substring(startIndex, endIndex); // includes StartTokenChar, excludes EndTokenChar
    } else {
      this.tokenPreamble = inputString;
      this.tokenPostamble = "";
      this._childToken = "";
    }
    this.foundToken = startIndex !== -1 && endIndex !== -1;
  }

  public get preamble(): string {
    return this.tokenPreamble;
  }

  public get postamble(): string {
    return this.tokenPostamble;
  }

  public get childToken(): string {
    return this._childToken;
  }

  public get hasToken(): boolean {
    return this.foundToken;
  }

  private isEscaped(fullString: string, positionToTest: number): boolean {
    let index: number;
    let escapeCharCount = 0;
    let returnIsEscaped = false;

    if (positionToTest > 0) {
      index = positionToTest;
      while (!(--index < 0)) {
        if (fullString[index] == this.escapeChar) {
          escapeCharCount++;
        } else {
          break;
        }
      }
      if (escapeCharCount % 2 == 1) {
        returnIsEscaped = true;
      }
    }
    return returnIsEscaped;
  }
}

// ─── Detokeniser types ────────────────────────────────────────────────────────

/**
 * Signature for a custom token handler registered via {@link Detokeniser.addCallback}.
 *
 * May be synchronous or asynchronous. Async callbacks (returning a `Promise`) are silently skipped
 * by {@link Detokeniser.do} and only invoked by {@link Detokeniser.doAsync}.
 *
 * @param token - Full token body without `[[` / `]]` endstops, e.g. `"mytype|arg1|arg2"` (delimiter is always `|`)
 * @returns The replacement string, a Promise resolving to it, or `undefined` to pass to the next handler
 */
export interface Detokeniser_Callback {
  (token: string): string | undefined | Promise<string | undefined>;
}

/**
 * Options passed to {@link Detokeniser.do} and {@link Detokeniser.doAsync}.
 */
export interface Detokeniser_DoOptions {
  /**
   * Key/value pairs made available to `[[setting|profileParameterName: "key"]]` tokens.
   * Typically populated from Cucumber world parameters or a test profile configuration object.
   * @example { username: 'alice', environment: 'staging' }
   */
  contextParameters?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Detokeniser {
  export type Callback = Detokeniser_Callback;
  export type DoOptions = Detokeniser_DoOptions;
}
