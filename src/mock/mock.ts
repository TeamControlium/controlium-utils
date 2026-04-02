import { JSONPath } from 'jsonpath-plus';
import { Utils } from '../utils/utils';
import { Log, LogLevels } from '..';

/**
 * Static HTTP request interception and mocking utility for test suites.
 *
 * `Mock` is designed to sit between a test framework's network interceptor
 * (e.g. Playwright's `page.route`) and the application under test. Every
 * outgoing request from the AUT is forwarded to {@link Mock.intercept}, which
 * decides how to handle it based on the registered listeners.
 *
 * **Default-deny**: any request that does not match a listener is blocked and
 * recorded as an `unmatched` transaction. The test suite has full control —
 * nothing reaches the network unless explicitly permitted.
 *
 * **All transactions are stored** regardless of outcome, so test steps can
 * later inspect real and mocked traffic via {@link Mock.getTransactions}.
 *
 * All methods are static — no instantiation is required. Call {@link Mock.reset}
 * in `beforeEach` / `afterEach` hooks to start each test with a clean slate.
 *
 * @example
 * ```typescript
 * // In a beforeEach hook
 * Mock.reset();
 * Mock.addListener('static-assets',
 *   ['$[?(@.url =~ /\\.(css|js)$/)]'],
 *   'passthrough'
 * );
 * Mock.addListener('get-users',
 *   ['$[?(@.url =~ /api\\/users/)]', '$[?(@.method == "GET")]'],
 *   { status: 200, body: [{ id: 1, name: 'Alice' }] }
 * );
 *
 * // Wire into Playwright
 * await page.route('**\/*', async (route) => {
 *   const req = route.request();
 *   const result = await Mock.intercept({
 *     url: req.url(), method: req.method(),
 *     headers: await req.allHeaders(), body: req.postDataJSON(),
 *   });
 *   result
 *     ? await route.fulfill({ status: result.status, body: JSON.stringify(result.body) })
 *     : await route.abort();
 * });
 * ```
 */
export class Mock {
  private static listeners = new Map<string, Mock.Listener>();
  private static transactions: Mock.Transaction[] = [];
  private static transactionCounter = 0;

  private static throwError(funcName: string, message: string): never {
    const errorText = `Mock.${funcName}: ${message}`;
    Log.writeLine(LogLevels.Error, errorText, { stackOffset: 1 });
    throw new Error(errorText);
  }

  /**
   * Registers a named listener that matches intercepted requests and defines
   * how `Mock` should respond to them.
   *
   * Listeners are evaluated in registration order. The first listener whose
   * every matcher returns a result wins. If a listener with the same `name`
   * already exists it is replaced and a warning is logged.
   *
   * @param name - Unique name for this listener. Used as the key in the
   *   listener store and appears in transaction records and log output.
   *   Must be a non-empty string.
   *
   * @param matchers - One or more JSONPath expressions evaluated against the
   *   {@link Mock.Request} object. All expressions must return at least one
   *   result for the listener to match (AND logic). Each expression is
   *   validated for syntactic correctness at registration time — an invalid
   *   expression throws immediately rather than silently failing at intercept
   *   time. Must be a non-empty array of non-empty strings.
   *
   * @param action - What to do when this listener matches:
   *   - `'block'` — abort the request and return `null` to the caller.
   *   - `'passthrough'` — forward the request to the real endpoint, store the
   *     real response, and return it to the caller.
   *   - {@link Mock.Response} — return the supplied response object directly
   *     without touching the network. `status` must be a valid HTTP status
   *     code (100–599).
   *
   * @param delayMs - Optional delay in milliseconds applied before the
   *   response is returned, whether mocked, real, or blocked. Useful for
   *   simulating slow networks. Must be a non-negative finite number.
   *   Defaults to `0` (no delay).
   *
   * @throws {Error} If any argument fails validation.
   *
   * @example
   * // Block all requests to an analytics endpoint
   * Mock.addListener('block-analytics', ['$[?(@.url =~ /analytics/)]'], 'block');
   *
   * @example
   * // Return a mock response with a 2-second simulated delay
   * Mock.addListener('slow-login',
   *   ['$[?(@.url =~ /api\\/login/)]'],
   *   { status: 200, headers: { 'content-type': 'application/json' }, body: { token: 'abc' } },
   *   2000
   * );
   */
  static addListener(name: string, matchers: string[], action: Mock.ListenerAction, delayMs = 0): void {
    // Validate name
    Utils.assertType(name, 'string', 'addListener', 'name');
    if (name.trim().length === 0) Mock.throwError('addListener', '[name] must not be empty');

    // Validate matchers
    if (!Array.isArray(matchers)) {
      Mock.throwError('addListener', `[matchers] must be a string array, got [${typeof matchers}]`);
    }
    if (matchers.length === 0) {
      Mock.throwError('addListener', '[matchers] array must not be empty');
    }
    matchers.forEach((matcher, index) => {
      if (typeof matcher !== 'string') {
        Mock.throwError('addListener', `[matchers[${index}]] must be a string, got [${typeof matcher}]`);
      }
      if (matcher.trim().length === 0) {
        Mock.throwError('addListener', `[matchers[${index}]] must not be empty`);
      }
      try {
        JSONPath({ path: matcher, json: {}, wrap: true });
      } catch (e) {
        Mock.throwError('addListener', `[matchers[${index}]] is not valid JSONPath syntax: "${matcher}". ${(e as Error).message}`);
      }
    });

    // Validate action
    if (action !== 'block' && action !== 'passthrough') {
      if (action === null || typeof action !== 'object' || Array.isArray(action)) {
        Mock.throwError('addListener', `[action] must be 'block', 'passthrough', or a Mock.Response object, got [${action === null ? 'null' : typeof action}]`);
      }
      const response = action as Mock.Response;
      if (typeof response.status !== 'number' || !Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
        Mock.throwError('addListener', `[action.status] must be a valid HTTP status code (100-599), got [${response.status}]`);
      }
      if (response.headers !== undefined && (typeof response.headers !== 'object' || response.headers === null || Array.isArray(response.headers))) {
        Mock.throwError('addListener', `[action.headers] must be a plain object if provided`);
      }
    }

    // Validate delayMs
    Utils.assertType(delayMs, 'number', 'addListener', 'delayMs');
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      Mock.throwError('addListener', `[delayMs] must be a non-negative finite number, got [${delayMs}]`);
    }

    if (Mock.listeners.has(name)) {
      Log.writeLine(LogLevels.Warning, `Mock.addListener: replacing existing listener <${name}>`);
    }

    const isBlockOrPassthrough = action === 'block' || action === 'passthrough';
    const actionText = (() => {
      if (action === 'block') return 'Block';
      if (action === 'passthrough') return 'Passthrough';
      return JSON.stringify(action, null, 2);
    })();
    Log.writeLine(LogLevels.FrameworkInformation, `Add mock listener <${name}${delayMs > 0 ? ` (Delay by ${delayMs}mS)` : ''}>:\nMatcher: ${matchers.join('\nMatcher: ')}\nAction:${isBlockOrPassthrough ? ` ${actionText}` : `\n${actionText}`}`, { suppressMultilinePreamble: true });
    Mock.listeners.set(name, { name, matchers, action, delayMs });
  }

  /**
   * Removes a previously registered listener by name.
   *
   * If no listener with the given name exists, a warning is logged and the
   * call is a no-op.
   *
   * @param name - Name of the listener to remove. Must be a non-empty string.
   *
   * @throws {Error} If `name` is not a non-empty string.
   *
   * @example
   * Mock.removeListener('get-users');
   */
  static removeListener(name: string): void {
    Utils.assertType(name, 'string', 'removeListener', 'name');
    if (name.trim().length === 0) Mock.throwError('removeListener', '[name] must not be empty');
    if (!Mock.listeners.has(name)) {
      Log.writeLine(LogLevels.Warning, `Mock.removeListener: no listener named <${name}> exists — nothing removed`);
      return;
    }
    Log.writeLine(LogLevels.FrameworkInformation, `Mock: Remove listener <${name}>`);
    Mock.listeners.delete(name);
  }

  /**
   * Removes all registered listeners.
   *
   * Transaction history is unaffected. Use {@link Mock.reset} to clear both
   * listeners and transactions in a single call.
   *
   * @example
   * Mock.clearListeners();
   */
  static clearListeners(): void {
    Log.writeLine(LogLevels.FrameworkInformation, `Mock: Clear all listeners (${Mock.listeners.size} removed)`);
    Mock.listeners.clear();
  }

  /**
   * Returns all recorded transactions in chronological order.
   *
   * The returned array is read-only. Each entry records the request, the
   * response (if any), which listener matched, and the outcome type. Entries
   * accumulate across calls until {@link Mock.clearTransactions} or
   * {@link Mock.reset} is called.
   *
   * @returns A read-only array of {@link Mock.Transaction} objects.
   *
   * @example
   * const blocked = Mock.getTransactions().filter(t => t.type === 'blocked');
   */
  static getTransactions(): readonly Mock.Transaction[] {
    return Mock.transactions;
  }

  /**
   * Clears all recorded transactions and resets the transaction counter.
   *
   * Registered listeners are unaffected. Use {@link Mock.reset} to clear both
   * listeners and transactions in a single call.
   *
   * @example
   * Mock.clearTransactions();
   */
  static clearTransactions(): void {
    Log.writeLine(LogLevels.FrameworkInformation, `Mock: Clear transaction history (${Mock.transactions.length} removed)`);
    Mock.transactions = [];
    Mock.transactionCounter = 0;
  }

  /**
   * Clears all registered listeners and all recorded transactions.
   *
   * Call this in `beforeEach` or `afterEach` hooks to ensure each test starts
   * with a completely clean state.
   *
   * @example
   * beforeEach(() => {
   *   Mock.reset();
   *   Mock.addListener('static-assets', [...], 'passthrough');
   * });
   */
  static reset(): void {
    Log.writeLine(LogLevels.FrameworkInformation, `Mock: Reset (${Mock.listeners.size} listeners, ${Mock.transactions.length} transactions cleared)`);
    Mock.listeners.clear();
    Mock.transactions = [];
    Mock.transactionCounter = 0;
  }

  /**
   * Processes an intercepted HTTP request and returns the appropriate response.
   *
   * This is the method your framework adapter calls for every request
   * intercepted from the AUT. `Mock` evaluates the request against registered
   * listeners in order and acts on the first match:
   *
   * | Outcome | Return value |
   * |---|---|
   * | Matched → mock response | The configured {@link Mock.Response} |
   * | Matched → passthrough | The real response fetched from the endpoint |
   * | Matched → block | `null` |
   * | No match (unmatched) | `null` |
   *
   * Every request is recorded in the transaction history regardless of outcome.
   * If a `delayMs` was set on the matching listener, the delay is applied
   * before the response is returned.
   *
   * @param request - The intercepted request. Must be a non-null object with
   *   non-empty `url` and `method` string properties.
   *
   * @returns A promise resolving to a {@link Mock.Response} to return to the
   *   AUT, or `null` to abort/block the request.
   *
   * @throws {Error} If `request` fails validation.
   *
   * @example
   * // Playwright adapter
   * await page.route('**\/*', async (route) => {
   *   const result = await Mock.intercept({
   *     url: route.request().url(),
   *     method: route.request().method(),
   *     headers: await route.request().allHeaders(),
   *   });
   *   result ? await route.fulfill({ status: result.status }) : await route.abort();
   * });
   */
  static async intercept(request: Mock.Request): Promise<Mock.Response | null> {
    if (request === null || request === undefined || typeof request !== 'object' || Array.isArray(request)) {
      Mock.throwError('intercept', `[request] must be a non-null object, got [${request === null ? 'null' : typeof request}]`);
    }
    if (typeof request.url !== 'string' || request.url.trim().length === 0) {
      Mock.throwError('intercept', `[request.url] must be a non-empty string, got [${typeof request.url}]`);
    }
    if (typeof request.method !== 'string' || request.method.trim().length === 0) {
      Mock.throwError('intercept', `[request.method] must be a non-empty string, got [${typeof request.method}]`);
    }
    if (request.headers !== undefined && request.headers !== null && (typeof request.headers !== 'object' || Array.isArray(request.headers))) {
      Mock.throwError('intercept', `[request.headers] must be a plain object if provided`);
    }

    Log.writeLine(LogLevels.FrameworkDebug, `Mock.intercept: ${request.method} ${request.url}`);

    const listener = Mock.findMatch(request);

    if (!listener) {
      Log.writeLine(LogLevels.FrameworkDebug, `Mock.intercept: no listener matched — blocking`);
      Mock.record({ type: 'unmatched', request });
      return null;
    }

    Log.writeLine(LogLevels.FrameworkDebug, `Mock.intercept: matched listener <${listener.name}>`);

    if (listener.delayMs > 0) {
      Log.writeLine(LogLevels.FrameworkDebug, `Mock.intercept: delaying ${listener.delayMs}ms`);
      await Utils.sleep(listener.delayMs);
    }

    if (listener.action === 'block') {
      Log.writeLine(LogLevels.FrameworkDebug, `Mock.intercept: blocking request`);
      Mock.record({ type: 'blocked', listenerName: listener.name, request });
      return null;
    }

    if (listener.action === 'passthrough') {
      Log.writeLine(LogLevels.FrameworkDebug, `Mock.intercept: passing through to real endpoint`);
      const response = await Mock.fetchReal(request);
      Mock.record({ type: 'passthrough', listenerName: listener.name, request, response });
      return response;
    }

    const response = listener.action as Mock.Response;
    Log.writeLine(LogLevels.FrameworkDebug, `Mock.intercept: returning mocked response (status ${response.status})`);
    Mock.record({ type: 'mocked', listenerName: listener.name, request, response });
    return response;
  }

  private static findMatch(request: Mock.Request): Mock.Listener | undefined {
    for (const listener of Mock.listeners.values()) {
      try {
        const allMatch = listener.matchers.every((path) => {
          try {
            const results = JSONPath({ path, json: request, wrap: true });
            return Array.isArray(results) && results.length > 0;
          } catch (e) {
            Log.writeLine(LogLevels.Warning, `Mock: JSONPath evaluation error in listener <${listener.name}> for path "${path}": ${(e as Error).message} — treating as non-match`);
            return false;
          }
        });
        if (allMatch) return listener;
      } catch (e) {
        Log.writeLine(LogLevels.Warning, `Mock: Unexpected error evaluating listener <${listener.name}>: ${(e as Error).message} — skipping`);
      }
    }
    return undefined;
  }

  private static async fetchReal(request: Mock.Request): Promise<Mock.Response> {
    Log.writeLine(LogLevels.FrameworkDebug, `Mock.fetchReal: ${request.method} ${request.url}`);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body != null ? JSON.stringify(request.body) : undefined,
      });

      const body = await response.text().then((text) => {
        try { return JSON.parse(text); } catch { return text; }
      });

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key] = value; });

      Log.writeLine(LogLevels.FrameworkDebug, `Mock.fetchReal: received ${response.status} from ${request.url}`);
      return { status: response.status, headers, body };
    } catch (e) {
      const message = (e as Error).message;
      Log.writeLine(LogLevels.Error, `Mock.fetchReal: network error fetching ${request.url}: ${message}`);
      return { status: 502, headers: {}, body: `Mock passthrough network error: ${message}` };
    }
  }

  private static record(entry: Omit<Mock.Transaction, 'id' | 'timestamp'>): void {
    Mock.transactions.push({
      id: `txn-${++Mock.transactionCounter}`,
      timestamp: new Date(),
      ...entry,
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Mock {
  /**
   * Represents an HTTP request as seen by the interceptor.
   *
   * The `url`, `method`, and `headers` fields are required. Additional
   * properties (e.g. framework-specific metadata) may be included and are
   * available to JSONPath matchers.
   */
  export interface Request {
    /** The fully-qualified request URL. */
    url: string;
    /** HTTP method in uppercase, e.g. `'GET'`, `'POST'`. */
    method: string;
    /** Request headers as a plain key/value object. */
    headers: Record<string, string>;
    /** Parsed request body, if present. */
    body?: unknown;
    /** Any additional properties provided by the framework adapter. */
    [key: string]: unknown;
  }

  /**
   * Represents an HTTP response returned to the AUT, whether real or mocked.
   */
  export interface Response {
    /** HTTP status code, e.g. `200`, `404`. */
    status: number;
    /** Response headers as a plain key/value object. */
    headers?: Record<string, string>;
    /** Response body. Objects are serialised to JSON by the framework adapter. */
    body?: unknown;
  }

  /**
   * Defines what a listener does when it matches a request.
   *
   * - `'block'` — abort the request; the AUT receives no response.
   * - `'passthrough'` — forward to the real endpoint and return the actual response.
   * - {@link Response} — return the supplied mock response without hitting the network.
   */
  export type ListenerAction = 'block' | 'passthrough' | Response;

  /**
   * Describes the outcome of a single intercepted request.
   *
   * - `'mocked'` — a mock {@link Response} was returned.
   * - `'passthrough'` — the request was forwarded and the real response returned.
   * - `'blocked'` — the request was explicitly blocked by a listener.
   * - `'unmatched'` — no listener matched; the request was blocked by default.
   */
  export type TransactionType = 'mocked' | 'passthrough' | 'blocked' | 'unmatched';

  /**
   * A record of a single intercepted request and its outcome.
   *
   * Every call to {@link Mock.intercept} produces one transaction, regardless
   * of outcome. Use {@link Mock.getTransactions} to retrieve the full history.
   */
  export interface Transaction {
    /** Auto-incremented identifier, e.g. `'txn-1'`. Resets on {@link Mock.reset}. */
    id: string;
    /** Wall-clock time at which the request was intercepted. */
    timestamp: Date;
    /** Name of the listener that matched, if any. Absent for `'unmatched'` transactions. */
    listenerName?: string;
    /** How the request was handled. */
    type: TransactionType;
    /** The intercepted request. */
    request: Request;
    /** The response returned to the AUT. Absent for `'blocked'` and `'unmatched'` transactions. */
    response?: Response;
  }

  /** @internal */
  export interface Listener {
    name: string;
    matchers: string[];
    action: ListenerAction;
    delayMs: number;
  }
}
