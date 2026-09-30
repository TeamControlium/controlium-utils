import { Agent, Headers, ProxyAgent, fetch } from 'undici';
import net from 'node:net';
import tls from 'node:tls';
import type { Duplex } from 'node:stream';

import { Log, LogLevels, Utils } from '../index.js';

/**
 * Idle-quiet window (ms) used by {@link APIUtils.performRawHTTPOperation} to decide a
 * response is complete when the server doesn't proactively close the connection. Only
 * applies after the first byte of a response has arrived — see that method for why.
 */
const RAW_RESPONSE_IDLE_MS = 300;

export class APIUtils {

  /**
   * Verify if HTTP server listening
   * @param url
   * Protocol and domain of HTTP Server (IE. http://localhost:4200)
   * @param timeoutMS
   * Maximum time (in Milliseconds to wait for response)
   * @returns boolean
   * true if Server alive and responding
   * false if no response with timeout
   * @abstract
   * A fetch 'HEAD' request is used to obtain a header from the server.  If no
   * response then it is assumed nothing listening
   */
  public static async isWebServerListening(url: string, timeoutMS: number): Promise<boolean> {
    Utils.assertType(url, "string", "APIUtils.isWebServerListening", "url");
    Utils.assertType(timeoutMS, "number", "APIUtils.isWebServerListening", "timeoutMS");
    try {
      await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMS) });
      return true;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (err && typeof err === 'object' && 'errors' in err && Array.isArray((err as any).errors)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agg = err as { errors: any[] };
        for (const e of agg.errors) {
          const message = Utils.errorMessage(e);
          Log.writeLine(LogLevels.FrameworkInformation, `Error:\n${e?.code ?? 'no code'} (${message})`);
          if (message.includes('ECONNREFUSED')) {
            return false;
          }
        }
      } else {
        const message = Utils.errorMessage(err);
        const code = (err as { code?: unknown } | null)?.code;
        Log.writeLine(LogLevels.FrameworkInformation, `Error:\n${code ?? 'no code'} (${message})`);
        if (message.includes('ECONNREFUSED')) {
          return false;
        }
      }
      // We are only interested in if ECONNREFUSED.  All else means there be _something_ listening...
      return true;
    }
  }

  /**
   * Waits for coherent response from given HTTP url
   * @param url
   * Protocol and domain of HTTP Server (IE. http://localhost:4200)
   * @param maxSecondsToWait
   * Maximum time to wait (in seconds) for a coherent response from given url
   * @param maxResponseTimeMS (optional, default 1000)
   * Maximum time for a response (in milliseconds) to a http HEAD request
   * @returns
   * Promise of boolean
   * true - Webserver on given url is alive and responding
   * false - No response from given url within timeout.
   * @abstract
   * URL is polled
   */
  public static async waitForWebServerListening(url: string, maxSecondsToWait: number, { maxResponseTimeMS = 1000 }: { maxResponseTimeMS?: number } = {}): Promise<boolean> {
    Utils.assertType(url, "string", "APIUtils.waitForWebServerListening", "url");
    Utils.assertType(maxSecondsToWait, "number", "APIUtils.waitForWebServerListening", "maxSecondsToWait");
    Utils.assertType(maxResponseTimeMS, "number", "APIUtils.waitForWebServerListening", "maxResponseTimeMS");
    const pollIntervalMs = 500;
    Log.writeLine(LogLevels.TestInformation, `Waiting for AUT at ${url} to become available (overall timeout: ${maxSecondsToWait} seconds)...`);
    const startTime = Date.now();
    let elapsed = 0;
    while (!await this.isWebServerListening(url, maxResponseTimeMS)) {
      const oldElapsed = elapsed;
      elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed >= maxSecondsToWait) {
        Log.writeLine(LogLevels.Error, `Timeout reached: Server did not respond within ${maxSecondsToWait} seconds.`);
        return false;
      }
      // Stick a confidence message out every 4 seconds
      if ((oldElapsed != elapsed) && (elapsed % 4 == 0)) {
        Log.writeLine(LogLevels.TestInformation, `Waiting for AUT: Waited ${elapsed} seconds so far (Max wait ${maxSecondsToWait} seconds)`);
      }
      await Utils.sleep(pollIntervalMs, false);
    }
    return true;
  }

  /**
   * Perform a single HTTP/HTTPS operation based on the details of the Request envelope
   * @param httpRequest - Details of Request to be performed
   * @returns Full response
   * @throws Error if there is any fail that results in a Response not being received.
   * The caller-supplied timeout (or the default 10s) is enforced as a hard failsafe via AbortSignal.
   */
  public static async performHTTPOperation(
    httpRequest: APIUtils.HTTPRequest
  ): Promise<APIUtils.HTTPResponse> {
    const API_DEFAULT_TIMEOUT = 10000;
    let dispatcher: Agent | ProxyAgent | undefined;

    if (Utils.isNullOrUndefined(httpRequest) || typeof httpRequest !== 'object') {
      const errText = `Cannot APIUtils.performHTTPOperation as [httpRequest] must be a non-null object. Is [${Utils.describeValue(httpRequest)}]`;
      Log.logErrorAndThrow(errText);
    }
    Utils.assertType(httpRequest.method, "string", "APIUtils.performHTTPOperation", "httpRequest.method");
    Utils.assertType(httpRequest.protocol, "string", "APIUtils.performHTTPOperation", "httpRequest.protocol");
    if (httpRequest.protocol !== 'http' && httpRequest.protocol !== 'https') {
      const errText = `Cannot APIUtils.performHTTPOperation as [httpRequest.protocol] must be 'http' or 'https'. Is [${Utils.describeValue(httpRequest.protocol)}]`;
      Log.logErrorAndThrow(errText);
    }
    Utils.assertType(httpRequest.host, "string", "APIUtils.performHTTPOperation", "httpRequest.host");
    Utils.assertType(httpRequest.resourcePath, "string", "APIUtils.performHTTPOperation", "httpRequest.resourcePath");
    if (Utils.isNullOrUndefined(httpRequest.headers) || typeof httpRequest.headers !== 'object') {
      const errText = `Cannot APIUtils.performHTTPOperation as [httpRequest.headers] must be a non-null object. Is [${Utils.describeValue(httpRequest.headers)}]`;
      Log.logErrorAndThrow(errText);
    }

    try {
      if (Utils.isNullOrUndefined(httpRequest.timeout)) {
        Log.writeLine(
          LogLevels.FrameworkDebug,
          `No API Timeout defined.  Setting to ${Utils.msToHMS(API_DEFAULT_TIMEOUT)}`
        );
        httpRequest.timeout = API_DEFAULT_TIMEOUT;
      }

      const builtUrl = this.buildURL(httpRequest);
      Log.writeLine(LogLevels.FrameworkInformation, `Built URL: [${builtUrl}]`);

      dispatcher = this.buildDispatcher(httpRequest);
      const headers = this.buildHeaders(httpRequest.headers);

      this.doRequestLogging(httpRequest.method, builtUrl, headers, httpRequest.body);

      const body = Utils.isNullOrUndefined(httpRequest.body)
        ? undefined
        : typeof httpRequest.body === 'string'
          ? httpRequest.body
          : Buffer.isBuffer(httpRequest.body)
            ? httpRequest.body
            : JSON.stringify(httpRequest.body);

      const fetchResponse = await fetch(builtUrl, {
        method: httpRequest.method,
        headers,
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(httpRequest.timeout),
        dispatcher,
      });

      // Read the body once as raw bytes — a Response's body stream can only be consumed
      // once, so .text() and .arrayBuffer() can't both be called. The text form is derived
      // from the same bytes rather than requested separately, keeping both in sync and
      // avoiding a second (impossible) read.
      const responseBodyBuffer = Buffer.from(await fetchResponse.arrayBuffer());
      const responseBody = responseBodyBuffer.toString('utf-8');
      const responseHeaders = Object.fromEntries(fetchResponse.headers.entries());

      this.doResponseLogging(fetchResponse.status, fetchResponse.statusText, responseHeaders, responseBody);

      return {
        status: fetchResponse.status,
        statusMessage: fetchResponse.statusText,
        headers: responseHeaders,
        body: responseBody,
        bodyBuffer: responseBodyBuffer,
      };
    } catch (err) {
      Log.writeLine(LogLevels.Error, `HTTP OPERATION ERROR: ${Utils.errorMessage(err)}`);
      throw err;
    } finally {
      await dispatcher?.close();
    }
  }

  /**
   * Sends a raw HTTP request exactly as specified — no validation, no automatic header
   * injection (no `Content-Length`, no `Host`, nothing added that isn't in `httpRequest.headers`),
   * and the response is returned as raw, unparsed bytes exactly as received. For deliberately
   * testing malformed/inconsistent framing (e.g. a `Content-Length` that doesn't match the
   * real body length) that {@link performHTTPOperation} can't express — `fetch`/`undici`
   * validate request framing and refuse to send anything inconsistent.
   *
   * Every call uses a brand-new, single-use connection — never pooled, never reused,
   * regardless of what (if anything) `httpRequest.headers` says about `Connection`. This
   * mirrors {@link performHTTPOperation}'s own atomicity: one call, one connection, always
   * torn down afterward (success, failure, or timeout), so one test's failure — however
   * catastrophic — can never leave a connection for a later test to inherit.
   *
   * Deliberately does no interpretation of the response: no status-line/header extraction,
   * no chunked-encoding decoding. A structured parser throws the raw bytes away the moment a
   * response doesn't conform to HTTP framing — exactly the case that matters most when the
   * AUT itself may be broken. This returns whatever bytes actually arrived, unconditionally,
   * reading until the connection closes or the timeout is reached — it is the caller's job
   * to decide what a "good" or "bad" response looks like, not this method's.
   *
   * URL construction (protocol/host/resourcePath/queryString → origin + path) still goes
   * through {@link buildURL}'s existing percent-encoding/normalisation — the deliberately
   * "raw" part of this method is the headers and body, not the request path.
   *
   * @param httpRequest - Details of the raw request. `headers` is sent byte-for-byte as
   *   given, in the order provided — set a header's value to `null` to omit it entirely
   *   (same convention as {@link performHTTPOperation}'s `buildHeaders`). `body` is sent
   *   as-is (`Buffer`/`string`) or JSON-stringified (`object`) — never validated against
   *   any `Content-Length` given in `headers`.
   * @returns The exact raw request bytes sent and the exact raw response bytes received
   *   (empty if the connection closed, or the timeout was reached, before any bytes arrived).
   * @throws {Error} If the connection itself cannot be established (e.g. connection refused,
   *   DNS failure, proxy tunnel rejected) or `httpRequest.timeout` is exceeded before any
   *   connection could be made at all.
   */
  public static async performRawHTTPOperation(
    httpRequest: APIUtils.HTTPRequest
  ): Promise<APIUtils.RawHTTPResult> {
    const API_DEFAULT_TIMEOUT = 10000;

    if (Utils.isNullOrUndefined(httpRequest) || typeof httpRequest !== 'object') {
      const errText = `Cannot APIUtils.performRawHTTPOperation as [httpRequest] must be a non-null object. Is [${Utils.describeValue(httpRequest)}]`;
      Log.logErrorAndThrow(errText);
    }
    if (Utils.isNullOrUndefined(httpRequest.headers) || typeof httpRequest.headers !== 'object') {
      const errText = `Cannot APIUtils.performRawHTTPOperation as [httpRequest.headers] must be a non-null object. Is [${Utils.describeValue(httpRequest.headers)}]`;
      Log.logErrorAndThrow(errText);
    }
    // Required to be *a string*, not a *valid* method — a caller deliberately testing a
    // malformed/unusual method is still free to pass any string (e.g. '', 'GE T'). This
    // only stops the case where method is omitted entirely and would otherwise be sent
    // as the literal text "undefined" — an accident, not a deliberate test.
    Utils.assertType(httpRequest.method, "string", "APIUtils.performRawHTTPOperation", "httpRequest.method");
    if (Utils.isNullOrUndefined(httpRequest.timeout)) {
      httpRequest.timeout = API_DEFAULT_TIMEOUT;
    }

    let dispatcher: Agent | ProxyAgent | undefined;
    let socket: Duplex | undefined;

    try {
      return await Utils.timeoutPromise(
        (async (): Promise<APIUtils.RawHTTPResult> => {
          const url = new URL(this.buildURL(httpRequest));
          const pathWithQuery = url.pathname + url.search;

          if (!Utils.isNullOrUndefined(httpRequest.proxy)) {
            // Going through a real proxy — undici's Agent.connect() frames connection
            // establishment as an HTTP CONNECT request, which a proxy legitimately
            // understands (that's what CONNECT tunnelling is for).
            dispatcher = this.buildDispatcher(httpRequest);
            const connectData = await dispatcher.connect({ origin: url.origin, path: pathWithQuery });
            socket = connectData.socket;
          } else {
            // Direct to the AUT — no proxy in the loop, so no CONNECT dance. This matters:
            // undici's Agent.connect() *always* sends a real CONNECT request to whatever
            // it's targeting, even with no proxy configured. An ordinary AUT (Express,
            // Fastify, NestJS, anything without explicit CONNECT support) doesn't
            // understand that — Node's documented default is to close the socket on an
            // unhandled CONNECT, so Agent.connect() would simply fail against any normal
            // AUT. A plain net/tls connection needs no such handshake at all.
            const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
            socket = url.protocol === 'https:'
              ? tls.connect({ host: url.hostname, port, rejectUnauthorized: false })
              : net.connect({ host: url.hostname, port });
            await new Promise<void>((resolve, reject) => {
              socket!.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () => resolve());
              socket!.once('error', reject);
            });
          }

          const requestBytes = this.buildRawRequestBytes(httpRequest.method, pathWithQuery, httpRequest.headers, httpRequest.body);
          this.doRawLogging('request', requestBytes);
          socket.write(requestBytes);

          const responseChunks: Buffer[] = [];
          await new Promise<void>((resolve) => {
            // "Read until close" alone breaks silently whenever the caller doesn't set
            // Connection: close themselves (which we never inject — see below) — a server's
            // default keep-alive behaviour means it may not close for many seconds, and we'd
            // just sit there waiting on ITS idle timer instead of ours. So: once the first
            // byte of a response arrives, a short idle-quiet window applies — no further data
            // for RAW_RESPONSE_IDLE_MS means the response is treated as complete. Before any
            // data has arrived at all, there's no idle cutoff — a legitimately slow response
            // is still governed purely by the overall `timeout` (via Utils.timeoutPromise),
            // not cut off early just because the first byte took a while to show up.
            let idleTimer: NodeJS.Timeout | undefined;
            const finish = () => {
              if (idleTimer) clearTimeout(idleTimer);
              resolve();
            };
            socket!.on('data', (chunk: Buffer) => {
              responseChunks.push(chunk);
              if (idleTimer) clearTimeout(idleTimer);
              idleTimer = setTimeout(finish, RAW_RESPONSE_IDLE_MS);
            });
            socket!.on('close', finish);
            socket!.on('error', (err) => {
              // A connection error *while reading the response* (e.g. ECONNRESET) still
              // ends the response — resolve with whatever bytes arrived rather than
              // discarding them. Only a failure to *establish* the connection (above,
              // at dispatcher.connect()/net.connect()) should actually throw.
              Log.writeLine(LogLevels.Error, `APIUtils.performRawHTTPOperation: connection error while reading response (returning partial bytes received so far): ${Utils.errorMessage(err)}`);
              finish();
            });
          });

          const responseBytes = Buffer.concat(responseChunks);
          this.doRawLogging('response', responseBytes);
          return { requestBytes, responseBytes };
        })(),
        { timeoutMS: httpRequest.timeout, friendlyName: 'APIUtils.performRawHTTPOperation' }
      );
    } catch (err) {
      Log.writeLine(LogLevels.Error, `RAW HTTP OPERATION ERROR: ${Utils.errorMessage(err)}`);
      throw err;
    } finally {
      socket?.destroy();
      await dispatcher?.close();
    }
  }

  private static buildRawRequestBytes(method: string, pathWithQuery: string, headers: APIUtils.HTTPHeaders, body?: string | object | Buffer): Buffer {
    const headerLines: string[] = [];
    for (const [key, value] of Object.entries(headers)) {
      if (Utils.isNull(value)) continue; // null = omit this header entirely
      for (const singleValue of Array.isArray(value) ? value : [value]) {
        headerLines.push(`${key}: ${singleValue}`);
      }
    }

    const bodyBuffer = Utils.isNullOrUndefined(body)
      ? Buffer.alloc(0)
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf-8');

    const head = `${method} ${pathWithQuery} HTTP/1.1\r\n${headerLines.map((line) => line + '\r\n').join('')}\r\n`;
    return Buffer.concat([Buffer.from(head, 'utf-8'), bodyBuffer]);
  }

  private static doRawLogging(direction: 'request' | 'response', bytes: Buffer): void {
    Log.writeLine(LogLevels.FrameworkInformation, `RAW HTTP ${direction} (${bytes.length} bytes):-`);
    // latin1 maps each byte 1:1 to a code unit — an exact, lossless view of what was
    // actually sent/received, unlike a UTF-8 decode which would corrupt non-UTF-8 bytes.
    // Wrapped in safeStringify for the usual reasons: bounded length, and control/escape
    // characters (\r\n etc.) rendered visibly rather than interpreted by the terminal.
    Log.writeLine(LogLevels.FrameworkInformation, Utils.safeStringify(bytes.toString('latin1'), { maxLength: 2000 }), { suppressMultilinePreamble: true });
  }

  private static buildURL(httpRequest: APIUtils.HTTPRequest): string {
    // Strip ALL leading slashes (not just one) before resolving as a relative reference.
    // A resourcePath starting with "//" would otherwise be parsed by URL as a network-path
    // reference (RFC 3986) — silently replacing the *host* rather than staying a literal
    // path. resourcePath is always meant to be a path fragment, never host-changing.
    const normalizedResourcePath = httpRequest.resourcePath.replace(/^\/+/, '');
    const url = new URL(normalizedResourcePath, `${httpRequest.protocol}://${httpRequest.host}`);
    if (!Utils.isNullOrUndefined(httpRequest.queryString)) {
      const queryString = httpRequest.queryString as string;
      url.search = queryString.startsWith('?') ? queryString.substring(1) : queryString;
    }
    return url.toString();
  }

  private static buildDispatcher(httpRequest: APIUtils.HTTPRequest): Agent | ProxyAgent {
    if (!Utils.isNullOrUndefined(httpRequest.proxy)) {
      const proxyAgent = new ProxyAgent({
        uri: httpRequest.proxy as string,
        connect: { timeout: httpRequest.timeout, rejectUnauthorized: false },
      });
      Log.writeLine(LogLevels.FrameworkInformation, `Proxy configured: [${httpRequest.proxy}]`);
      return proxyAgent;
    }
    // rejectUnauthorized: false consistently on both paths — test AUTs routinely use
    // self-signed/internal-CA certs, and validating against a public CA isn't a meaningful
    // threat model here (the caller already knows exactly what it's connecting to).
    // Previously only the proxied path disabled this, so an identical test would pass
    // through a proxy and fail without one, for reasons unrelated to the test itself.
    return new Agent({ connect: { timeout: httpRequest.timeout, rejectUnauthorized: false } });
  }

  private static buildHeaders(httpHeaders: APIUtils.HTTPHeaders): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(httpHeaders)) {
      if (!Utils.isNull(value)) {
        headers.append(key, String(value));
      }
    }
    return headers;
  }

  private static doRequestLogging(method: string, url: string, headers: Headers, body?: string | object | Buffer): void {
    Log.writeLine(LogLevels.FrameworkInformation, `HTTP [${method}] to [${url}]:-`);
    Log.writeLine(LogLevels.FrameworkInformation, '  Headers;');

    let headersStr = '';
    headers.forEach((value, key) => {
      headersStr += `${headersStr === '' ? '' : '\n'}    "${key}": "${value}"`;
    });
    Log.writeLine(LogLevels.FrameworkInformation, headersStr === '' ? '    <No headers!>' : headersStr);

    // A Buffer body is deliberately never dumped byte-by-byte — JSON.stringify(buffer)
    // renders it as {"type":"Buffer","data":[...]}, one array entry per byte: unreadable
    // and, for a large payload, a straight violation of "don't dump unbounded content into
    // a log line". A compact size description is what a reader actually needs here.
    if (Log.loggingLevel >= LogLevels.FrameworkDebug) {
      Log.writeLine(LogLevels.FrameworkDebug, '  Request (full body);');
      const bodyStr = Utils.isNullOrUndefined(body)
        ? '    <No body!>'
        : typeof body === 'string' ? body
        : Buffer.isBuffer(body) ? `<Buffer, ${body.length} bytes>`
        : JSON.stringify(body, null, 2);
      Log.writeLine(LogLevels.FrameworkDebug, bodyStr, { maxLines: 1024, suppressMultilinePreamble: true });
    } else {
      Log.writeLine(LogLevels.FrameworkInformation, '  Body;');
      const bodyStr = Utils.isNullOrUndefined(body)
        ? ''
        : typeof body === 'string' ? body
        : Buffer.isBuffer(body) ? `<Buffer, ${body.length} bytes>`
        : JSON.stringify(body);
      if (!bodyStr) {
        Log.writeLine(LogLevels.FrameworkInformation, '    <No body!>');
      } else {
        let indented = '';
        bodyStr.split(/\r?\n/).forEach((line) => {
          indented += `${indented === '' ? '' : '\n'}    ${line}`;
        });
        Log.writeLine(LogLevels.FrameworkInformation, indented);
      }
    }
  }

  private static doResponseLogging(status: number, statusText: string, headers: Record<string, string>, body: string): void {
    Log.writeLine(LogLevels.FrameworkInformation, 'HTTP Response:-');
    Log.writeLine(LogLevels.FrameworkInformation, `  Status [${status}] - [${statusText}]`);
    Log.writeLine(LogLevels.FrameworkInformation, '  Headers;');
    const headerEntries = Object.entries(headers);
    if (headerEntries.length === 0) {
      Log.writeLine(LogLevels.FrameworkInformation, '    <No headers!>');
    } else {
      let headersStr = '';
      headerEntries.forEach(([key, value]) => {
        headersStr += `${headersStr === '' ? '' : '\n'}    "${key}": "${value}"`;
      });
      Log.writeLine(LogLevels.FrameworkInformation, headersStr);
    }
    Log.writeLine(LogLevels.FrameworkInformation, '  Body;');

    let indented = '';
    if (body) {
      body.split(/\r?\n/).forEach((line) => {
        indented += `${indented === '' ? '' : '\n'}    ${line}`;
      });
    }
    Log.writeLine(LogLevels.FrameworkInformation, indented === '' ? '    <No body!>' : indented);
    Log.writeLine(LogLevels.FrameworkInformation, 'HTTP Response end');
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace APIUtils {
  /**
   * Generic HTTP call Header items
   */
  export type HTTPHeaders = {
    [key: string]: string | string[] | number | boolean | null;
  };
  /**
   * Generic HTTP call Request envelope
   */
  export type HTTPRequest = {
    proxy?: string;
    method: string;
    protocol: 'http' | 'https';
    host: string;
    resourcePath: string;
    queryString?: string;
    headers: HTTPHeaders;
    /** A `Buffer` is sent as raw bytes (binary-safe); an `object` is JSON-serialised. */
    body?: string | object | Buffer;
    timeout?: number;
  };
  /**
   * Generic Http call methods
   */
  export enum HttpMethods {
    POST = 'POST',
    GET = 'GET',
    PUT = 'PUT',
  }
  export const APPLICATION_JSON = 'application/json';
  /**
   * Generic HTTP call Response envelope
   */
  export type HTTPResponse = {
    status: number;
    statusMessage: string;
    headers: Record<string, string>;
    /** Best-effort UTF-8 decode of the response body — lossy for genuinely binary
     * responses (invalid byte sequences become U+FFFD). Use {@link bodyBuffer} for
     * byte-exact access. */
    body: string;
    /** Raw response body bytes, exactly as received — always populated, regardless
     * of content type. The byte-safe counterpart to {@link body}. */
    bodyBuffer: Buffer;
  };

  export type HTTPInteraction = {
    request: HTTPRequest;
    response: HTTPResponse;
  };

  /**
   * Result of {@link APIUtils.performRawHTTPOperation} — the exact raw bytes sent and
   * received, with no structured interpretation of either.
   */
  export type RawHTTPResult = {
    requestBytes: Buffer;
    responseBytes: Buffer;
  };
}
