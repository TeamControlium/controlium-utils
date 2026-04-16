import { Agent, Headers, ProxyAgent, fetch } from 'undici';

import { Log, LogLevels, Utils } from '../index';

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
    try {
      await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMS) });
      return true;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (err && typeof err === 'object' && 'errors' in err && Array.isArray((err as any).errors)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agg = err as { errors: any[] };
        for (const e of agg.errors) {
          Log.writeLine(LogLevels.FrameworkInformation, `Error:\n${e.code} (${e.message})`);
          if (e.message.includes('ECONNREFUSED')) {
            return false;
          }
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Log.writeLine(LogLevels.FrameworkInformation, `Error:\n${(err as any)['code'] ?? 'no code'} (${(err as Error).message})`);
        if ((err as Error).message.includes('ECONNREFUSED')) {
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

      this.doRequestLogging(httpRequest.method ?? 'GET', builtUrl, headers, httpRequest.body);

      const body = Utils.isNullOrUndefined(httpRequest.body)
        ? undefined
        : typeof httpRequest.body === 'string'
          ? httpRequest.body
          : JSON.stringify(httpRequest.body);

      const fetchResponse = await fetch(builtUrl, {
        method: httpRequest.method ?? 'GET',
        headers,
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(httpRequest.timeout),
        dispatcher,
      });

      const responseBody = await fetchResponse.text();
      const responseHeaders = Object.fromEntries(fetchResponse.headers.entries());

      this.doResponseLogging(fetchResponse.status, fetchResponse.statusText, responseHeaders, responseBody);

      return {
        status: fetchResponse.status,
        statusMessage: fetchResponse.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    } catch (err) {
      Log.writeLine(LogLevels.Error, `HTTP OPERATION ERROR: ${err}`);
      throw err;
    } finally {
      await dispatcher?.close();
    }
  }

  private static buildURL(httpRequest: APIUtils.HTTPRequest): string {
    let builtUrl = httpRequest.protocol;
    builtUrl += '://';
    builtUrl += httpRequest.host.endsWith('/')
      ? httpRequest.host.substring(0, httpRequest.host.length - 1)
      : httpRequest.host;
    builtUrl += '/';
    builtUrl += httpRequest.resourcePath.startsWith('/')
      ? httpRequest.resourcePath.substring(1, httpRequest.resourcePath.length)
      : httpRequest.resourcePath;
    if (!Utils.isNullOrUndefined(httpRequest.queryString)) {
      const queryString = httpRequest.queryString as string;
      builtUrl += '?';
      builtUrl += queryString.startsWith('?')
        ? queryString.substring(1, queryString.length)
        : queryString;
    }
    return builtUrl;
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
    return new Agent({ connect: { timeout: httpRequest.timeout } });
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

  private static doRequestLogging(method: string, url: string, headers: Headers, body?: string | object): void {
    Log.writeLine(LogLevels.FrameworkInformation, `HTTP [${method}] to [${url}]:-`);
    Log.writeLine(LogLevels.FrameworkInformation, '  Headers;');

    let headersStr = '';
    headers.forEach((value, key) => {
      headersStr += `${headersStr === '' ? '' : '\n'}    "${key}": "${value}"`;
    });
    Log.writeLine(LogLevels.FrameworkInformation, headersStr === '' ? '    <No headers!>' : headersStr);

    if (Log.loggingLevel >= LogLevels.FrameworkDebug) {
      Log.writeLine(LogLevels.FrameworkDebug, '  Request (full body);');
      const bodyStr = Utils.isNullOrUndefined(body)
        ? '    <No body!>'
        : typeof body === 'string' ? body : JSON.stringify(body, null, 2);
      Log.writeLine(LogLevels.FrameworkDebug, bodyStr, { maxLines: 1024, suppressMultilinePreamble: true });
    } else {
      Log.writeLine(LogLevels.FrameworkInformation, '  Body;');
      const bodyStr = Utils.isNullOrUndefined(body)
        ? ''
        : typeof body === 'string' ? body : JSON.stringify(body);
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
    method?: string;
    protocol: 'http' | 'https';
    host: string;
    resourcePath: string;
    queryString?: string;
    headers: HTTPHeaders;
    body?: string | object;
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
    body: string;
  };

  export type HTTPInteraction = {
    request: HTTPRequest;
    response: HTTPResponse;
  };
}
