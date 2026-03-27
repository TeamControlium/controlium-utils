/**
 * Options controlling how attached video content is encoded and sized.
 */
export interface VideoOptions {
  /**
   * Video codec string embedded in the `<video>` tag and MIME type.
   * Example: "webm", "mp4".
   */
  videoCodec?: string;

  /**
   * Output video width in pixels. Must be within internal min/max resolution limits.
   */
  width?: number;

  /**
   * Output video height in pixels. Must be within internal min/max resolution limits.
   */
  height?: number;
}

/**
 * Controls how `writeLine()` formats its output.
 */
export interface WriteLineOptions {
  /**
   * Maximum number of lines allowed from a multi-line input.
   * Excess lines are replaced with a summary message.
   */
  maxLines?: number;

  /**
   * If true, the preamble is suppressed for all lines.
   * A preamble normally contains timestamp, elapsed time, and caller details.
   */
  suppressMultilinePreamble?: boolean;

  /**
   * If true, the preamble is suppressed for every line (single-line or multi-line).
   */
  suppressAllPreamble?: boolean;

  /**
   * If true, timestamps are omitted from the preamble.
   */
  suppressTimeStamp?: boolean;

  /**
   * If true, elapsed time is omitted from the preamble.
   */
  suppressElapsed?: boolean;

  /**
   * Format string for timestamps (date-fns format).
   */
  timeFormat?: string;

  /**
   * Format string for elapsed time (date-fns format).
   */
  elapsedFormat?: string;

  /**
   * Optional override for the call-site string shown in the preamble.
   */
  callSite?: string;
}

/**
 * General logging behaviour configuration.
 */
export type Options = {
  /**
   *
   */
  loggingCurrentLevel: number;

  /**
   *
   */
  filterMinCurrentLevel: number;

  /**
   *
   */
  filterMaxCurrentLevel: number;
  /**
   * If true, log lines are also written to the console.
   * If false, output is written only to the callback (if provided).
   */
  logToConsole: boolean;

  /**
   * If true, any error thrown inside the output callback
   * will be re-thrown. If false, the error is logged but not thrown.
   */
  throwErrorIfLogOutputFails: boolean;

  /**
   * Panic mode.  If true, ALL output is written. Current Loglevel is
   * ignored and all output performed.  Effectivelly setting Current
   * LogLevel to MAX_SAFE_INTEGER.
   */
  panicMode: boolean;

  /**
   *
   */
  panicCodePreamble: string;

  /**
   *
   */
  panicDescriptorPreamble: string;

  /**
   *
   */
  writeLine: WriteLineOptions;

  /**
   *
   */
  video: VideoOptions;
};

/**
 * Signature of the callback invoked for every log output line
 * when a custom output handler is provided.
 *
 * @param message The fully formatted log line or attached data.
 * @param mediaType Optional content type (e.g. "text/html", "base64:image/png").
 */
export interface LogOutputCallbackSignature {
  (message: string, mediaType?: string): void;
}
