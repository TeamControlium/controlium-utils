import { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio, exec, spawn } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import { decodeHTML } from "entities";
import { decode as jwtDecode, sign as jwtSign } from "jsonwebtoken";
import psTree from "ps-tree";

// import { Detokeniser } from "./Detokeniser"; Claude, just masking this out for now...
import { JsonUtils } from "../index";
import { Log, LogLevel, LogLevels } from "../index";
import { StringUtils } from "../index";

// ─── Module-level constants ───────────────────────────────────────────────────

/** Milliseconds in one second. */
const MS_PER_SECOND = 1000;

/** Milliseconds in one day. */
const MS_PER_DAY = 86400000;

/**
 * Prefix used when storing the original value of a modified environment variable.
 * Allows {@link Utils.resetProcessEnvs} to restore variables to their pre-test values.
 */
const ENV_VAR_ORIGINAL_PREAMBLE = "test_old_";

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * What action to perform if a file already exists when {@link Utils.writeTextToFile} is called.
 */
export enum ExistingFileWriteActions {
    /** Overwrite existing file */
    Overwrite,
    /** Create a new file using an incrementing index in the file name */
    AddIndex,
    /** Append data to the existing file contents */
    Append,
    /** Throw an error indicating the file already exists */
    ThrowError,
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Maps `typeof` string literals to their corresponding TypeScript types.
 * Used by {@link Utils.assertType} to provide type narrowing after assertion.
 */
export interface AssertTypeMap {
    string: string;
    number: number;
    boolean: boolean;
    object: object;
    bigint: bigint;
    symbol: symbol;
    function: (...args: unknown[]) => unknown;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

/**
 * General testing-related utilities. All methods are static — no instantiation required.
 */
export class Utils {

    // ── Private state ────────────────────────────────────────────────────────

    private static _promiseCount = 0;
    private static _defaultPromiseTimeout = 0;

    // ── Promise tracking ─────────────────────────────────────────────────────

    /**
     * Number of currently outstanding promises wrapped by {@link timeoutPromise}.
     * Check this at the end of a test to verify all promises have settled.
     * @see {@link resetPromiseCount}
     */
    static get promiseCount(): number {
        return Utils._promiseCount;
    }

    /**
     * Resets the outstanding promise count to zero.
     * @see {@link promiseCount}
     */
    static resetPromiseCount() {
        Utils._promiseCount = 0;
    }

    /**
     * Sets the default timeout in milliseconds applied by {@link timeoutPromise}
     * when no per-call `timeoutMS` is supplied.
     * @param timeoutMs - Timeout in milliseconds. Must be greater than zero.
     */
    static set defaultPromiseTimeout(timeoutMs: number) {
        Utils._defaultPromiseTimeout = timeoutMs;
    }

    // ── Type checking ─────────────────────────────────────────────────────────

    /**
     * Asserts that a value is of the expected type, throwing a logged error if not.
     * After a successful call, TypeScript narrows `value` to the corresponding type.
     *
     * @param value - Value to check.
     * @param expectedType - Expected `typeof` string (e.g. `"string"`, `"number"`).
     * @param funcName - Name of the calling function, used in the error message.
     * @param paramName - Name of the parameter being checked, used in the error message.
     * @throws {Error} If `typeof value` does not match `expectedType`.
     *
     * @example
     * Utils.assertType(name, "string", "greet", "name");
     * // name is now narrowed to string
     */
    public static assertType<K extends keyof AssertTypeMap>(value: unknown, expectedType: K, funcName: string, paramName: string): asserts value is AssertTypeMap[K] {
        if (typeof value !== expectedType) {
            const errorText = `Cannot ${funcName} as [${paramName}] not '${expectedType}' type. Is [${typeof value}]`;
            Log.writeLine(LogLevels.Error, errorText);
            throw new Error(errorText);
        }
    }

    /**
     * Safely checks if a value is `null` or `undefined`.
     *
     * @param obj - Value to check.
     * @returns `true` if `null` or `undefined`, otherwise `false`.
     */
    static isNullOrUndefined(obj?: unknown): boolean {
        try {
            return obj === null || obj === undefined;
        } catch {
            return true;
        }
    }

    /**
     * Safely checks if a value is `null`.
     *
     * @param obj - Value to check.
     * @returns `true` if `null`, otherwise `false`.
     */
    static isNull(obj?: unknown): boolean {
        return obj === null;
    }

    /**
     * Safely checks if a value is `undefined`.
     *
     * @param obj - Value to check.
     * @returns `true` if `undefined`, otherwise `false`.
     */
    static isUndefined(obj?: unknown): boolean {
        return obj === undefined;
    }

    /**
     * Checks whether a value evaluates to `true` according to common conventions.
     *
     * Returns `true` for:
     * - A boolean `true`
     * - The strings `"y"`, `"1"`, `"yes"`, `"positive"`, or `"true"` (case-insensitive, trimmed)
     * - A number greater than zero
     *
     * @param valueToCheck - Value to evaluate.
     * @returns `true` if the value is considered truthy, otherwise `false`.
     */
    static isTrue(valueToCheck: boolean | string | number | undefined): boolean {
        switch (typeof valueToCheck) {
            case "boolean":
                return valueToCheck;
            case "string": {
                const normalizedValue = valueToCheck.toLowerCase().trim();
                return (
                    normalizedValue === "y" ||
                    normalizedValue === "1" ||
                    normalizedValue === "yes" ||
                    normalizedValue === "positive" ||
                    normalizedValue === "true"
                );
            }
            case "number":
                return valueToCheck > 0;
            default:
                return false;
        }
    }

    /**
     * Verifies whether a value is a valid `Date` object.
     *
     * @param dateToCheck - Value to validate.
     * @returns `true` if the value is a `Date` instance with a valid time, otherwise `false`.
     */
    static isValidDate(dateToCheck: unknown): dateToCheck is Date {
        try {
            return dateToCheck instanceof Date && !isNaN(dateToCheck.getTime());
        } catch {
            return false;
        }
    }

    // ── Math / string helpers ─────────────────────────────────────────────────

    /**
     * Pads a number or string with leading zeros to reach a required minimum length.
     *
     * @param num - The number or string to pad.
     * @param requiredMinimumLength - The minimum length of the returned string.
     * @returns The value as a string, left-padded with `"0"` to at least `requiredMinimumLength` characters.
     * @note If the value is already longer than `requiredMinimumLength`, no truncation occurs.
     *
     * @example
     * Utils.pad(7, 3);    // => "007"
     * Utils.pad("42", 5); // => "00042"
     */
    static pad(num: number | string, requiredMinimumLength: number): string {
        let numString = typeof num === "number" ? num.toString() : num;
        while (numString.length < requiredMinimumLength) numString = "0" + numString;
        return numString;
    }

    /**
     * Converts a millisecond duration to a `HH:MM:SS.t` formatted string,
     * where `t` is tenths of a second.
     *
     * @param milliSeconds - Duration in milliseconds.
     * @returns Time string formatted as `HH:MM:SS.t`.
     * @note Durations above 359,999,000 ms (99h 59m 59s) will give unexpected results.
     */
    static msToHMS(milliSeconds: number): string {
        const wholeDays = Math.floor(milliSeconds / MS_PER_DAY);
        const date = new Date(milliSeconds - wholeDays * MS_PER_DAY);
        const hours = wholeDays * 24 + date.getUTCHours();
        return `${this.pad(hours, ("" + hours).length > 2 ? ("" + hours).length : 2)}:${this.pad(date.getUTCMinutes(), 2)}:${this.pad(date.getUTCSeconds(), 2)}.${Math.round(date.getUTCMilliseconds() / 100)}`;
    }

    /**
     * Returns a random integer between `min` and `max` inclusive.
     * If `max` is less than `min`, the values are swapped.
     *
     * @param min - Lower bound.
     * @param max - Upper bound.
     * @returns A random integer inclusively between `min` and `max`.
     */
    static getRandomInt(min: number, max: number): number {
        const minMax = min < max ? Math.ceil(min) : Math.ceil(max);
        const maxMin = min < max ? Math.floor(max) : Math.floor(min);
        return Math.floor(Math.random() * (maxMin - minMax + 1)) + minMax;
    }

    /**
     * Returns a random float between `min` and `max`.
     *
     * @param min - Lower bound.
     * @param max - Upper bound.
     * @returns A random float between `min` and `max`.
     */
    static getRandomFloat(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    // ── File operations ───────────────────────────────────────────────────────

    /**
     * Writes data to a file, with configurable behaviour when the file already exists.
     *
     * Data is serialised before writing:
     * - JSON strings are normalised (parsed then re-stringified).
     * - Non-JSON strings are written as-is.
     * - Objects are written as pretty-printed JSON.
     *
     * @param filePath - Directory path where the file should be created.
     * @param fileName - Name of the file to write.
     * @param data - Content to write — a string or an object.
     * @param ifExistsAction - Action to take if the file already exists (default: `AddIndex`).
     * @see {@link ExistingFileWriteActions}
     * @throws {Error} If the write fails, or if `ThrowError` is specified and the file exists.
     */
    static writeTextToFile(filePath: string, fileName: string, data: string | object, ifExistsAction = ExistingFileWriteActions.AddIndex): void {
        let fullFilename = path.join(filePath, fileName);
        try {
            if (!existsSync(filePath)) {
                Log.writeLine(LogLevels.FrameworkInformation, `Folder [${filePath}] does not exist so creating`);
                mkdirSync(filePath, { recursive: true });
            }
            if (existsSync(fullFilename)) {
                Log.writeLine(LogLevels.FrameworkInformation, `File [${fullFilename}] exists so performing action [${ifExistsAction.toString()}]`);
                switch (ifExistsAction) {
                    case ExistingFileWriteActions.AddIndex: {
                        const splitFileName = fileName.split(".");
                        fileName =
                            splitFileName.length === 1
                                ? fileName + ".1"
                                : ((splitFileName: string[]): string => {
                                    // If file name has 2 parts (e.g. hello.json) then add the index (e.g. hello.1.json)
                                    if (splitFileName.length === 2) {
                                        if (/^\d+$/.test(splitFileName[1])) {
                                            return splitFileName[0] + "." + (parseInt(splitFileName[1]) + 1);
                                        } else {
                                            return splitFileName[0] + ".1." + splitFileName[1];
                                        }
                                    }
                                    // If file name has an index (e.g. hello.7.json or some.other.5.json) increment it
                                    if (/^\d+$/.test(splitFileName[splitFileName.length - 2])) {
                                        return (
                                            splitFileName.slice(0, splitFileName.length - 2).join(".") +
                                            "." +
                                            (parseInt(splitFileName[splitFileName.length - 2]) + 1) +
                                            "." +
                                            splitFileName[splitFileName.length - 1]
                                        );
                                    }
                                    // 3+ part name without a numeric index (e.g. hello.addd.json) — add index (e.g. hello.addd.1.json)
                                    return splitFileName.slice(0, splitFileName.length - 1).join(".") + ".1." + splitFileName[splitFileName.length - 1];
                                })(splitFileName);
                        this.writeTextToFile(filePath, fileName, data, ifExistsAction);
                        break;
                    }
                    case ExistingFileWriteActions.Append: {
                        appendFileSync(fullFilename, "\n" + Utils.serialiseFileData(data));
                        break;
                    }
                    case ExistingFileWriteActions.Overwrite: {
                        writeFileSync(fullFilename, Utils.serialiseFileData(data));
                        break;
                    }
                    case ExistingFileWriteActions.ThrowError: {
                        const errText = `File [${fullFilename}] exists and action is ThrowError!`;
                        Log.writeLine(LogLevels.Error, errText);
                        throw new Error(errText);
                    }
                    default: {
                        const errText = `Cannot write to file [${fullFilename}] — unknown action [${ifExistsAction}]!`;
                        Log.writeLine(LogLevels.Error, errText);
                        throw new Error(errText);
                    }
                }
            } else {
                const splitFileName = fileName.split(".");
                if (splitFileName.length === 1) {
                    if (ifExistsAction === ExistingFileWriteActions.AddIndex) {
                        this.writeTextToFile(filePath, fileName + ".1", data, ifExistsAction);
                    } else {
                        writeFileSync(fullFilename, Utils.serialiseFileData(data));
                    }
                } else {
                    if (
                        !(splitFileName.length === 2 && /^\d+$/.test(splitFileName[splitFileName.length - 1])) &&
                        ifExistsAction === ExistingFileWriteActions.AddIndex &&
                        !/^\d+$/.test(splitFileName[splitFileName.length - 2])
                    ) {
                        fileName = splitFileName.slice(0, splitFileName.length - 1).join(".") + ".1." + splitFileName[splitFileName.length - 1];
                    }
                    fullFilename = path.join(filePath, fileName);
                    if (existsSync(fullFilename)) {
                        this.writeTextToFile(filePath, fileName, data, ifExistsAction);
                    } else {
                        writeFileSync(fullFilename, Utils.serialiseFileData(data));
                    }
                }
            }
        } catch (err) {
            Log.writeLine(LogLevels.Error, `Unable to write text to file: ${err}`);
            throw err;
        }
    }

    /**
     * Returns the entire contents of a file as a string.
     *
     * @param path - Path to the file.
     * @param options - Optional settings:
     *   - `encoding` — File encoding (default: `"utf-8"`).
     *   - `detokeniseFileContents` — When `true`, passes contents through the detokeniser before returning (default: `false`).
     * @returns Contents of the file as a string.
     * @throws {Error} If the file cannot be read.
     */
    static getFileContents(filePath: string, options?: { encoding?: BufferEncoding; detokeniseFileContents?: boolean }): string {
        const detokenise = options?.detokeniseFileContents ?? false;
        const encoding = options?.encoding ?? "utf-8";
        try {
            Log.writeLine(LogLevels.FrameworkInformation, `Load file [${filePath}] using encoding [${encoding}]`);
            let contents = this.getFileContentsBuffer(filePath).toString(encoding);
            Log.writeLine(LogLevels.FrameworkDebug, `Loaded [${contents.length}] characters`);
            if (detokenise) {
                // contents = Detokeniser.do(contents); Hey Claude, dont forget.  Masked out for now...
                Log.writeLine(LogLevels.FrameworkDebug, `After detokenisation [${contents.length}] characters`);
                return contents;
            }
            return contents;
        } catch (err) {
            const errText = `Utils.getFileContents - Reading file using ${encoding} (${detokenise ? "" : "not "}detokenised) threw error: [${err}]`;
            Log.writeLine(LogLevels.Error, errText);
            throw new Error(errText);
        }
    }

    /**
     * Returns the entire contents of a file as a `Buffer`.
     *
     * @param path - Path to the file.
     * @returns Raw file contents as a `Buffer`.
     * @throws {Error} If the file cannot be read.
     */
    static getFileContentsBuffer(filePath: string): Buffer {
        try {
            Log.writeLine(LogLevels.FrameworkInformation, `Getting file contents from [${filePath}]`);
            return readFileSync(filePath);
        } catch (err) {
            const errText = `Utils.getFileContentsBuffer - readFileSync for path [${filePath}] threw error: [${err}]`;
            Log.writeLine(LogLevels.Error, errText);
            throw new Error(errText);
        }
    }

    // ── Environment variables ─────────────────────────────────────────────────

    /**
     * Resolves a setting value from, in priority order:
     * 1. A process environment variable
     * 2. An npm package config variable
     * 3. A named property within `contextParameters`
     * 4. A supplied default value
     *
     * @param logLevel - Log level used when reporting where the setting was found.
     * @param settingName - Human-readable name for the setting, used in log messages.
     * @param sources - Named sources to check:
     *   - `processEnvName` — Environment variable name.
     *   - `npmPackageConfigName` — npm package config key.
     *   - `profileParameterName` — JSONPath into `contextParameters`.
     *   - `defaultValue` — Fallback if no other source resolves.
     * @param contextParameters - Optional context parameters used to resolve `profileParameterName`.
     * @returns The resolved setting value, or `undefined` if no source resolved.
     * @throws {Error} If `profileParameterName` is given but `contextParameters` is null.
     */
    public static getSetting<returnType>(
        logLevel: LogLevel,
        settingName: string,
        sources: {
            processEnvName?: string | undefined;
            npmPackageConfigName?: string | undefined;
            profileParameterName?: string | undefined;
            defaultValue?: returnType | undefined;
        },
        contextParameters?: Record<string, unknown>
    ): returnType | undefined {
        const debugString = `Got setting [${settingName}] from `;

        // Highest priority — process environment variable
        let returnValue: unknown = sources.processEnvName ? process.env[sources.processEnvName] : undefined;
        if (!Utils.isUndefined(returnValue)) {
            Log.writeLine(logLevel, debugString + `env var [${sources.processEnvName}]. Value: <${returnValue as returnType}>`);
            return returnValue as returnType;
        }

        // Next priority — npm package config variable
        returnValue = sources.npmPackageConfigName ? process.env["npm_package_config_" + sources.npmPackageConfigName] : undefined;
        if (!Utils.isUndefined(returnValue)) {
            Log.writeLine(logLevel, debugString + `npm package config var [${sources.npmPackageConfigName}]. Value: <${returnValue as returnType}>`);
            return returnValue as returnType;
        }

        // If no profile parameter name given, or it doesn't match exactly one property, fall back to default
        if (
            Utils.isUndefined(sources.profileParameterName) ||
            (contextParameters && JsonUtils.getMatchingJSONPropertyCount(contextParameters as object, sources.profileParameterName as string)) !== 1
        ) {
            returnValue = sources.defaultValue;
            if (Utils.isUndefined(returnValue)) {
                Log.writeLine(LogLevels.Error, `Unable to determine value for setting [${settingName}]. Returning: <undefined>!`);
                return undefined;
            } else {
                Log.writeLine(logLevel, debugString + `default value: <${returnValue as returnType}>`);
                return returnValue as returnType;
            }
        }

        // Profile parameter name given AND exactly one match exists — use it
        if (Utils.isNullOrUndefined(contextParameters)) {
            const errorTxt = `Caller defined Profile parameter [${sources.profileParameterName}] but contextParameters is null!`;
            Log.writeLine(LogLevels.Error, errorTxt);
            throw new Error("Settings: " + errorTxt);
        } else {
            returnValue = JsonUtils.getPropertiesMatchingPath(contextParameters as object, sources.profileParameterName as string)[0].value as returnType;
            Log.writeLine(logLevel, debugString + `profile property [${sources.profileParameterName}] value: <${returnValue as returnType}>`);
        }
        return returnValue as returnType;
    }

    /**
     * Sets a process environment variable and saves its original value for later restoration.
     *
     * The first time a variable is set, its original value is saved under a prefixed key.
     * Subsequent sets to the same variable do not overwrite the saved original.
     * Call {@link resetProcessEnvs} to restore all modified variables.
     *
     * @param varName - Name of the environment variable to set.
     * @param requiredValue - Value to assign.
     * @note If the variable did not previously exist, it is stored as `"_undefined"` so that
     *   {@link resetProcessEnvs} knows to delete it rather than restore a blank value.
     */
    public static setProcessEnv(varName: string, requiredValue: string): void {
        Log.writeLine(LogLevels.TestInformation, `Setting env var [${varName}] to '${requiredValue}'`);

        const originalValueKeyName = ENV_VAR_ORIGINAL_PREAMBLE + varName;
        if (originalValueKeyName in process.env) {
            Log.writeLine(LogLevels.TestDebug, `Env var [${varName}] has already been set (original value saved) — not overwriting saved original`);
            Log.writeLine(
                LogLevels.FrameworkInformation,
                `Original env var value is saved on first set only, to ensure the pre-test value can be restored.\nSubsequent sets do not overwrite the saved original.`
            );
        } else {
            const oldValue = process.env[varName];
            // Store "_undefined" if the var didn't previously exist, so resetProcessEnvs knows to delete it
            process.env[ENV_VAR_ORIGINAL_PREAMBLE + varName] = Utils.isUndefined(oldValue) ? "_undefined" : oldValue;
        }
        process.env[varName] = String(requiredValue);
    }

    /**
     * Restores all process environment variables that were modified by {@link setProcessEnv}
     * back to their original values. Variables that did not previously exist are deleted.
     *
     * @see {@link setProcessEnv}
     * @throws {Error} If an error occurs while resetting variables.
     */
    public static resetProcessEnvs() {
        try {
            Object.entries(process.env).forEach(([key, value]) => {
                if (key.startsWith(ENV_VAR_ORIGINAL_PREAMBLE)) {
                    const varToSet = key.substring(ENV_VAR_ORIGINAL_PREAMBLE.length);
                    if (value === "_undefined") {
                        Log.writeLine(LogLevels.FrameworkDebug, `Found [${key}] (Value: ${value}) so deleting [${varToSet}] and [${key}]`);
                        delete process.env[varToSet];
                    } else {
                        Log.writeLine(LogLevels.FrameworkDebug, `Found [${key}] (Value: ${value}) so restoring [${varToSet}] to [${value}] and deleting [${key}]`);
                        process.env[varToSet] = value;
                        delete process.env[key];
                    }
                }
            });
        } catch (err) {
            const errMess = `Error resetting environment variables: ${(err as Error).message}`;
            Log.writeLine(LogLevels.Error, errMess);
            throw new Error(errMess);
        }
    }

    // ── Object / JSON ─────────────────────────────────────────────────────────

    /**
     * Returns a deep clone of an object or JSON string.
     * Uses JSON parse/stringify — only JSON-serialisable values are supported.
     *
     * @param original - The object or JSON5 string to clone.
     * @returns A deep clone of `original`.
     * @throws {Error} If `original` is not valid JSON (JSON5 allowed).
     */
    public static clone(original: object | string): object {
        if (JsonUtils.isJson(original, true)) {
            return JsonUtils.parse(typeof original === "string" ? original : JSON.stringify(original as object), true);
        } else {
            const errText = "Object passed in is not valid JSON (JSON5 allowed) so cannot be cloned using JSON";
            Log.writeLine(LogLevels.Error, errText);
            throw new Error(errText);
        }
    }

    /**
     * Converts a URL glob pattern to an equivalent `RegExp`.
     *
     * Supported glob syntax:
     * - `*` — matches any sequence of non-`/` characters
     * - `**` — matches any path segment sequence (including `/`)
     * - `?` — matches any single character
     * - `{a,b}` — matches either `a` or `b`
     * - `[...]` — character class, passed through as-is
     *
     * @param glob - The glob pattern to convert.
     * @param options - Optional anchoring flags:
     *   - `startOfLine` — Anchors the pattern to the start of the string (default: `true`).
     *   - `endOfLine` — Anchors the pattern to the end of the string (default: `true`).
     * @returns A `RegExp` equivalent to the given glob.
     *
     * @example
     * Utils.globToRegex("src/**\/*.ts").test("src/foo/bar.ts"); // true
     */
    static globToRegex(glob: string, options?: { startOfLine: boolean; endOfLine: boolean }): RegExp {
        const startOfLine = options?.startOfLine ?? true;
        const endOfLine = options?.endOfLine ?? true;
        const charsToEscape = new Set(["$", "^", "+", ".", "*", "(", ")", "|", "\\", "?", "{", "}", "[", "]"]);
        const regexExpression = startOfLine ? ["^"] : ["^.*"];
        let inRegexpGroup = false;

        for (let globCharIndex = 0; globCharIndex < glob.length; ++globCharIndex) {
            const currentGlobChar = glob[globCharIndex];

            if (currentGlobChar === "\\" && globCharIndex + 1 < glob.length) {
                const nextGlobChar = glob[++globCharIndex];
                regexExpression.push(charsToEscape.has(nextGlobChar) ? "\\" + nextGlobChar : nextGlobChar);
                continue;
            }

            if (currentGlobChar === "*") {
                const previousGlobChar = glob[globCharIndex - 1];
                let starCount = 1;
                while (glob[globCharIndex + 1] === "*") {
                    starCount++;
                    globCharIndex++;
                }
                const nextGlobChar = glob[globCharIndex + 1];
                if (starCount > 1 && (previousGlobChar === "/" || previousGlobChar === undefined) && (nextGlobChar === "/" || nextGlobChar === undefined)) {
                    // eslint-disable-next-line no-useless-escape
                    regexExpression.push("((?:[^/]*(?:/|$))*)");
                    globCharIndex++;
                } else {
                    regexExpression.push("([^/]*)");
                }
                continue;
            }

            switch (currentGlobChar) {
                case "?":  regexExpression.push("."); break;
                case "[":  regexExpression.push("["); break;
                case "]":  regexExpression.push("]"); break;
                case "{":  inRegexpGroup = true;  regexExpression.push("("); break;
                case "}":  inRegexpGroup = false; regexExpression.push(")"); break;
                case ",":
                    regexExpression.push(inRegexpGroup ? "|" : "\\" + currentGlobChar);
                    break;
                default:
                    regexExpression.push(charsToEscape.has(currentGlobChar) ? "\\" + currentGlobChar : currentGlobChar);
            }
        }
        regexExpression.push(endOfLine ? "$" : ".*$");
        return new RegExp(regexExpression.join(""));
    }

    // ── HTML ──────────────────────────────────────────────────────────────────

    /**
     * Decodes HTML entities in a string back to their corresponding characters.
     *
     * - Named entities (e.g. `&amp;`, `&copy;`) and numeric entities (`&#169;`, `&#x1F44D;`) are decoded.
     * - Non-breaking space characters (U+00A0) are replaced with regular spaces.
     * - Literal apostrophes (`'`) are replaced with `&apos;` before decoding for consistent handling.
     *
     * @param str - The HTML-encoded string to decode.
     * @returns The decoded string.
     * @throws {Error} If `str` is not a string.
     */
    static unescapeHTML(str: string): string {
        Utils.assertType(str, "string", "unescapeHTML", "str");
        const preProcessed = str.replace(/'/g, "&apos;");
        return decodeHTML(preProcessed).replace(/\u00A0/g, " ");
    }

    // ── JWT ───────────────────────────────────────────────────────────────────

    /**
     * Creates a signed JWT token.
     *
     * @param payloadData - The JWT payload as an object or JSON string.
     * @param signature - The signing secret or private key.
     * @param options - Signing options: either a partial options object with an optional
     *   `algorithm` (default `"HS256"`), or a raw JSON string for the JWT header.
     * @returns A signed Base64 JWT token string.
     * @throws {Error} If signing fails.
     */
    static createJWT(
        payloadData: string | object,
        signature: string,
        options?: Partial<{ algorithm?: string }> | string
    ): string {
        let payload: object | string;
        let optionsJWT: unknown;

        if (typeof options === "string") {
            Log.writeLine(LogLevels.FrameworkDebug, `Options is a string: [${options}]`);
            optionsJWT = StringUtils.trimQuotes(options as string);
        } else {
            Log.writeLine(LogLevels.FrameworkDebug, `Options not a string:\n${JSON.stringify(options, null, 2)}`);
            optionsJWT = { algorithm: options?.algorithm ?? "HS256" };
        }

        if (JsonUtils.isJson(payloadData, true)) {
            Log.writeLine(LogLevels.FrameworkDebug, `Payload is JSON [${typeof payloadData === "string" ? "string" : "object"}]`);
            payload = typeof payloadData === "string" ? JsonUtils.parse(payloadData, true) : payloadData;
        } else {
            Log.writeLine(LogLevels.Error, `Payload is NOT JSON (may be intended by test): [${payloadData}]`);
            payload = payloadData;
        }

        const normalizedSignature = StringUtils.replaceAll(signature, '\\\\n', '\n');
        Log.writeLine(LogLevels.FrameworkDebug, `Signature: ${normalizedSignature}`);

        const jwtHeader = typeof options === "string" ? { header: JsonUtils.parse(optionsJWT as string, true) } : optionsJWT as object;
        Log.writeLine(LogLevels.FrameworkDebug, `JWT Sign options:\n${JSON.stringify(jwtHeader, null, 2)}`);
        try {
            return jwtSign(payload, normalizedSignature, jwtHeader);
        } catch (err) {
            const errText = `Error creating [${typeof options === 'string' ? options : JSON.stringify(options as object)}] JWT token from [${payloadData}] (signature: [${StringUtils.replaceAll(signature, '\\\\n', '<NEWLINE>')}]): ${(err as Error).message}`;
            Log.writeLine(LogLevels.Error, errText);
            throw new Error(errText);
        }
    }

    /**
     * Checks whether a string is a structurally valid JWT token.
     *
     * @param jwtToken - The token string to validate.
     * @returns `true` if the token can be decoded, `false` otherwise.
     */
    static isValidJWT(jwtToken: string): boolean {
        try {
            return !Utils.isUndefined(jwtDecode(jwtToken));
        } catch {
            return false;
        }
    }

    /**
     * Decodes and returns the payload of a JWT token as an object.
     *
     * @param jwtToken - A valid JWT token string.
     * @returns The decoded payload as an object.
     * @throws {Error} If the token cannot be decoded or the payload is not an object.
     */
    static getJWTPayload(jwtToken: string): object {
        try {
            let payload = jwtDecode(jwtToken, { json: true });
            payload = Utils.isNull(payload) ? {} : payload;
            if (typeof payload !== "object") {
                throw new Error(`Not an object. Is [${typeof payload}]. Expected JSON object.`);
            }
            return payload as object;
        } catch (err) {
            const errText = `Error getting payload from JWT [${jwtToken ?? "<Undefined>"}]: ${(err as Error).message}`;
            Log.writeLine(LogLevels.Error, errText);
            throw new Error(errText);
        }
    }

    // ── Process management ────────────────────────────────────────────────────

    /**
     * Spawns a command as a background process.
     *
     * @param command - The command to execute.
     * @param args - Arguments to pass to the command.
     * @param options - Optional settings:
     *   - `logStdout` — Logs stdout at `TestInformation` level (default: `false`).
     *   - `logStderr` — Logs stderr and process errors at `Error` level (default: `false`).
     *   - `spawnOptions` — Additional options passed to `child_process.spawn`.
     * @returns The spawned `ChildProcess`.
     * @throws {Error} If the process fails to start (PID is `undefined`).
     */
    static spawnBackgroundProcess(command: string, args: string[], { logStdout = false, logStderr = false, spawnOptions = undefined }: { logStdout?: boolean, logStderr?: boolean, spawnOptions?: SpawnOptionsWithoutStdio } = {}): ChildProcessWithoutNullStreams {
        Log.writeLine(LogLevels.TestInformation, `Executing: ${command} ${args.join(' ')}`);
        const childProcess = spawn(command, args, spawnOptions);
        if (childProcess?.pid === undefined) {
            const errText = `Unable to spawn [${command}] with args [${args.join(', ')}] and options [${spawnOptions === undefined ? '' : JSON.stringify(spawnOptions)}] — spawn returned undefined PID`;
            Log.writeLine(LogLevels.Error, errText);
            throw new Error(errText);
        }
        Log.writeLine(LogLevels.TestInformation, `Started process: PID ${childProcess.pid}`);

        if (logStdout) {
            childProcess.stdout.on('data', (data) => {
                Log.writeLine(LogLevels.TestInformation, `Background(stdout): ${data.toString()}`, { suppressAllPreamble: true });
            });
        }
        if (logStderr) {
            childProcess.stderr.on('data', (data) => {
                Log.writeLine(LogLevels.TestInformation, `Background(stderr): ${data.toString()}`, { suppressAllPreamble: true });
            });
            childProcess.on('error', (err) => {
                Log.writeLine(LogLevels.Error, `Background process error: ${(err as Error).message}`, { suppressAllPreamble: true });
            });
        }
        return childProcess;
    }

    /**
     * Spawns a command as a background process and waits for it to exit, with a timeout.
     *
     * @param command - The command to execute.
     * @param args - Arguments to pass to the command.
     * @param timeoutSeconds - Maximum time in seconds to wait before forcibly terminating the process.
     * @param options - Optional settings (same as {@link spawnBackgroundProcess}).
     * @returns A promise resolving to the process exit code, or `-1` on timeout or error.
     */
    static async spawnBackgroundProcessWithTimeout(command: string, args: string[], timeoutSeconds: number, { logStdout = false, logStderr = false, spawnOptions = undefined }: { logStdout?: boolean, logStderr?: boolean, spawnOptions?: SpawnOptionsWithoutStdio } = {}): Promise<number> {
        return new Promise((resolve) => {
            const child = Utils.spawnBackgroundProcess(command, args, { logStdout, logStderr, spawnOptions });
            let exited = false;

            child.on('exit', (code) => {
                if (!exited) {
                    Log.writeLine(LogLevels.TestInformation, `Process [${child.pid ?? 'unknown'}] exited. Code: ${code ?? 'undefined!'}`);
                    exited = true;
                    clearTimeout(timeout);
                    resolve(code ?? -1);
                }
            });

            child.on('error', (err) => {
                if (!exited) {
                    Log.writeLine(LogLevels.Error, `Process [${child.pid ?? 'unknown'}] errored:\n${err ?? 'unknown error'}`);
                    exited = true;
                    clearTimeout(timeout);
                    resolve(-1);
                }
            });

            process.on('SIGINT', () => {
                Log.writeLine(LogLevels.Error, `Caught SIGINT (Ctrl+C) — terminating child process [${child.pid ?? 'unknown'}]...`);
                Utils.terminateBackgroundProcess(child, { signal: 'SIGINT' });
            });

            const timeout = setTimeout(() => {
                if (!exited) {
                    const errMessage = `Timeout — child process [${child.pid ?? 'unknown'}] did not exit within ${timeoutSeconds} seconds`;
                    Log.writeLine(LogLevels.Error, errMessage);
                    exited = true;
                    Utils.terminateBackgroundProcess(child);
                    resolve(-1);
                }
            }, timeoutSeconds * MS_PER_SECOND);
        });
    }

    /**
     * Executes a shell command and returns its stdout output.
     *
     * @param command - The shell command to run.
     * @returns A promise resolving to the stdout string.
     * @throws The error or stderr string if the command fails.
     */
    static async execCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            Log.writeLine(LogLevels.FrameworkInformation, `Exec command: >> ${command} <<`);
            exec(command, (error, stdout, stderr) => {
                if (error || stderr) {
                    Log.writeLine(LogLevels.FrameworkDebug, `Error thrown so rejecting (${stderr ?? ''}): \n${error?.message ?? 'No error detail!'}`);
                    reject(error || stderr);
                } else {
                    Log.writeLine(LogLevels.FrameworkDebug, `Resolved: >> ${stdout ?? ''} <<`);
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * Checks whether a process with the given PID is currently running.
     *
     * @param pid - The process ID to check.
     * @returns `true` if the process is running (or exists but cannot be signalled), `false` if it does not exist.
     * @throws Any unexpected error from `process.kill`.
     */
    static isProcessRunning(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch (err) {
            if (err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string') {
                const error = err as NodeJS.ErrnoException;
                if (error.code === 'ESRCH') return false;
                if (error.code === 'EPERM')  return true;
            }
            throw err;
        }
    }

    /**
     * Sends a signal to a process and all of its descendants, leaf-first (post-order traversal).
     *
     * @param rootPid - PID of the root process to terminate.
     * @param signal - Signal to send (default: `"SIGKILL"`).
     */
    static async killProcessAndDescendants(rootPid: number, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
        type PS = { PID: string; PPID: string; COMMAND: string };

        const children: PS[] = await new Promise((resolve, reject) => {
            psTree(rootPid, (err, result) => {
                if (err) return reject(err);
                resolve([...result]);
            });
        });

        const tree = new Map<number, number[]>();
        for (const proc of children) {
            const pid = Number(proc.PID);
            const ppid = Number(proc.PPID);
            if (!tree.has(ppid)) tree.set(ppid, []);
            tree.get(ppid)!.push(pid);
        }

        const killRecursively = (pid: number) => {
            const childPids = tree.get(pid) ?? [];
            for (const childPid of childPids) killRecursively(childPid);
            try {
                process.kill(pid, signal);
            } catch (err) {
                Log.writeLine(LogLevels.Error, `Killing process [${pid}] with [${signal}] threw error (ignoring): ${(err as Error).message}`);
            }
        };

        killRecursively(rootPid);
    }

    /**
     * Terminates a background process and all its descendants, waiting for the process to close.
     *
     * @param backgroundProcess - The process to terminate.
     * @param options - Optional settings:
     *   - `signal` — Signal to use (default: `"SIGKILL"`).
     * @returns A promise resolving to `true` once the process closes, or `false` if no valid process was provided.
     */
    static async terminateBackgroundProcess(backgroundProcess: ChildProcessWithoutNullStreams, options: { signal?: string | number } = {}): Promise<boolean> {
        const signal = (options.signal ?? 'SIGKILL') as NodeJS.Signals;

        if (Utils.isNullOrUndefined(backgroundProcess)) {
            Log.writeLine(LogLevels.TestInformation, `No background process executing — nothing to terminate`);
            return false;
        }
        if (Utils.isNullOrUndefined(backgroundProcess.pid)) {
            Log.writeLine(LogLevels.Error, `Background process has no PID — cannot terminate`);
            return false;
        }

        const processPid = backgroundProcess.pid!;
        const promise = new Promise<boolean>((resolve) => {
            backgroundProcess.on('close', (code, signal) => {
                Log.writeLine(LogLevels.TestInformation, `Process [${processPid}] closed [Code: ${code ?? '<No Code>'}], Signal: ${signal ?? 'None'}`);
                resolve(true);
            });
        });
        await this.killProcessAndDescendants(processPid, signal);
        return promise;
    }

    // ── Promise utilities ─────────────────────────────────────────────────────

    /**
     * Pauses execution for the given number of milliseconds.
     *
     * @param periodMS - Duration to wait in milliseconds.
     * @param logIt - When `true`, logs the sleep duration at `FrameworkDebug` level (default: `false`).
     * @returns A promise that resolves after the given duration.
     */
    static async sleep(periodMS: number, logIt?: boolean) {
        periodMS = Number(periodMS);
        if (logIt === true) Log.writeLine(LogLevels.FrameworkDebug, `Sleeping for [${periodMS}] milliseconds`);
        return new Promise((resolve) => {
            setTimeout(resolve, periodMS);
        });
    }

    /**
     * Pauses Node.js execution until a keyboard key is pressed, while keeping the event loop running.
     *
     * @param logOutput - Optional message to write to the log before pausing.
     * @returns A promise that resolves when a key is pressed.
     * @warning This hangs indefinitely in non-TTY environments (e.g. CI pipelines).
     *   In such cases the call is logged and returns immediately.
     */
    static async pause(logOutput?: string): Promise<void> {
        if (logOutput) {
            Log.writeLine(LogLevels.TestInformation, logOutput);
        }
        const stdin = process.stdin;

        if (!stdin.isTTY) {
            Log.writeLine(LogLevels.Error, "Stdin is not a TTY — cannot pause for key press. Ignoring.");
            return;
        }

        return new Promise<void>((resolve) => {
            const cleanup = () => {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener("data", onData);
            };

            const onData = (chunk: Buffer) => {
                Log.writeLine(LogLevels.TestDebug, `Input received: ${JSON.stringify(chunk.toString(), null, 2)}`);
                cleanup();
                resolve();
            };

            // Drain any buffered input before attaching the listener
            stdin.resume();
            while (stdin.read() !== null) { /* draining */ }
            stdin.pause();

            stdin.once("data", onData);
            stdin.setRawMode(true);
            stdin.resume();
        });
    }

    /**
     * Wraps a promise with a timeout and tracks it in the outstanding promise count.
     *
     * The count is accessible via {@link promiseCount} and can be checked at the end of a
     * test to verify all promises have settled. Use {@link resetPromiseCount} to clear
     * the count between tests.
     *
     * @param promise - The promise to wrap.
     * @param options - Optional settings:
     *   - `timeoutMS` — Timeout in milliseconds. Falls back to {@link defaultPromiseTimeout} if not given.
     *   - `friendlyName` — Name shown in the timeout error message (defaults to the caller's function name).
     * @returns A promise that resolves/rejects with the original result, or rejects with a timeout error.
     * @throws {Error} If no timeout is configured (neither `timeoutMS` nor `defaultPromiseTimeout` is set).
     * @throws {Error} If `timeoutMS` is negative.
     */
    static async timeoutPromise<T>(promise: Promise<T>, options: { timeoutMS?: number, friendlyName?: string } = {}): Promise<T> {
        Utils._promiseCount++;
        const operationName = options?.friendlyName ?? (this.inferCallerFunctionName() || "Unknown operation");
        try {
            if (Utils.isNullOrUndefined(options?.timeoutMS) && Utils._defaultPromiseTimeout === 0) {
                const errText = 'Utils.timeoutPromise: No timeout given and default not set (have you initialised the default timeout?)';
                Log.writeLine(LogLevels.Error, errText);
                throw new Error(errText);
            }
            const actualTimeout = (Utils.isNullOrUndefined(options?.timeoutMS) ? Utils._defaultPromiseTimeout : options?.timeoutMS) as number;
            if (actualTimeout < 0) {
                const errText = `Utils.timeoutPromise: Timeout cannot be negative. Was [${actualTimeout}]`;
                Log.writeLine(LogLevels.Error, errText);
                throw new Error(errText);
            }
            return this.withTimeout<T>(promise, { timeoutMS: actualTimeout, friendlyName: operationName });
        } finally {
            Utils._promiseCount--;
        }
    }

    /**
     * @deprecated Use {@link timeoutPromise} instead.
     */
    static async withTimeoutTracked<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return this.withTimeout<T>(promise, { timeoutMS: timeoutMs, friendlyName: this.inferCallerFunctionName() ?? undefined });
    }

    // ── Action parsing ────────────────────────────────────────────────────────

    /**
     * Parses a raw action string into a verb and a parameter map.
     *
     * The expected format is `actionName(param1: value1, param2: value2)` where the
     * parameter block is valid JSON5 without the outer braces. If no parentheses are
     * present, `parameters` will be an empty map.
     *
     * @param rawAction - The raw action string to parse.
     * @returns A {@link Utils.ActionAndParams} object with `action`, `normalizedAction`, and `parameters`.
     * @throws {Error} If the parameter block is not valid JSON5.
     *
     * @example
     * Utils.splitActionAndParameters("click(target: '#btn', force: true)");
     * // => { action: "click", normalizedAction: "click", parameters: Map { "target" => "#btn", "force" => true } }
     */
    static splitActionAndParameters(rawAction: string): ActionAndParams {
        const actionAndParameters = StringUtils.splitVerbAndParameters(rawAction);
        const normalizedAction = actionAndParameters.verb.toLowerCase().trim();

        if (StringUtils.isBlank(actionAndParameters.parameters)) {
            return { action: actionAndParameters.verb, normalizedAction, parameters: new Map() };
        } else {
            const paramsJSON = "{" + actionAndParameters.parameters + "}";
            if (JsonUtils.isJson(paramsJSON, true)) {
                const paramsMap = new Map(Object.entries(JsonUtils.parse(paramsJSON, true)));
                return { action: actionAndParameters.verb, normalizedAction, parameters: paramsMap };
            } else {
                const errText = `Invalid action [${actionAndParameters.verb}] parameter syntax. Expected (param1: <value>, param2: <value2>, ...). Got: (${actionAndParameters.parameters})`;
                Log.writeLine(LogLevels.Error, errText);
                throw new Error(errText);
            }
        }
    }

    // ── Enum helpers ──────────────────────────────────────────────────────────

    /**
     * Checks whether a value exists as a member of the given enum.
     *
     * @param enumType - The enum object to check against.
     * @param valueToCheck - The value to look for.
     * @returns `true` if the value is a member of the enum, `false` otherwise.
     */
    static checkENUMValueExists(enumType: object, valueToCheck: string) {
        try {
            return Object.values(enumType).includes(valueToCheck);
        } catch {
            return false;
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Converts data to a string suitable for writing to a file:
     * - JSON strings are normalised (parsed then re-stringified)
     * - Non-JSON strings are used as-is
     * - Objects are pretty-printed as JSON
     */
    private static serialiseFileData(data: string | object): string {
        if (typeof data === "string") {
            return JsonUtils.isJson(data) ? JSON.stringify(JSON.parse(data)) : data;
        }
        return JSON.stringify(data, null, 2);
    }

    private static async withTimeout<T>(promise: Promise<T>, options: { timeoutMS?: number, friendlyName?: string } = {}): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`${Utils.isNullOrUndefined(options?.friendlyName) ? 'T' : `${options?.friendlyName}: T`}imeout after ${options?.timeoutMS ?? '0'} ms`)),
                    options?.timeoutMS ?? 0
                )
            ),
        ]);
    }

    private static inferCallerFunctionName(): string | null {
        const error = new Error();
        const stackLines = error.stack?.split("\n") || [];
        const callerLine = stackLines[3] || "";
        const match = callerLine.match(/at (.+?) \(/);
        return match ? match[1] : null;
    }
}

/**
 * The parsed result of a raw action string, as returned by {@link Utils.splitActionAndParameters}.
 */
export interface ActionAndParams {
    /** Original non-normalized action verb */
    action: string;
    /** Lowercase and trimmed action verb */
    normalizedAction: string;
    /** All action parameters passed by the caller */
    parameters: Map<string, unknown>;
}
