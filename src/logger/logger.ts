import { readFileSync } from "fs";
import { format } from "date-fns";
import {
  VideoOptions,
  WriteLineOptions,
  Options,
  LogOutputCallbackSignature
} from "./types";

// ----------------------------
// Module-level defaults
// ----------------------------
const DEFAULT_VIDEO_CODEC = "webm";
const DEFAULT_VIDEO_WIDTH = 320;
const DEFAULT_VIDEO_HEIGHT = 180;
const DEFAULT_WRITELINE_MAX_LINES = 55;
const DEFAULT_WRITELINE_SUPPRESS_ELAPSED = false;
const DEFAULT_WRITELINE_SUPPRESS_TIME = false;
const DEFAULT_WRITELINE_SUPPRESS_ALL = false;
const DEFAULT_WRITELINE_SUPPRESS_MULTI = false;
const DEFAULT_WRITELINE_FORMAT_TIME = "HH:mm:ss";
const DEFAULT_WRITELINE_FORMAT_ELAPSED = "mm:ss.SSS";
const DEFAULT_LOG_LEVEL = 6; // Framework debug
const DEFAULT_LOG_TO_CONSOLE = false;
const DEFAULT_THROW_ERROR_LOG_FAIL = false;
const DEFAULT_PANIC_MODE = false;
const DEFAULT_PANIC_CODE = "P";
const DEFAULT_PANIC_DESCRIPTOR = "P: ";

// ----------------------------
// Internal constants
// ----------------------------

/** Maximum length of a data/mediaType string shown in error messages before truncation. */
const ERROR_DISPLAY_STRING_MAX_LENGTH = 30;

/** Number of characters kept from the start of a truncated error-display string. */
const ERROR_DISPLAY_STRING_HEAD_LENGTH = 25;

/** Number of characters kept from the end of a truncated error-display string. */
const ERROR_DISPLAY_STRING_TAIL_LENGTH = 3;

/** Minimum character-width used when zero-padding the write-type label. */
const WRITE_TYPE_PAD_WIDTH = 5;

/** Stack-frame substring used to identify internal Logger frames and skip them. */
const LOGGER_STACK_FRAME_MARKER = "logger.ts";

export class Logger {
  /**
   * Numeric log level constants used to control and filter log output.
   *
   * Levels are ordered from highest verbosity to lowest:
   * - `Maximum` / `Verbose` — log everything
   * - `FrameworkDebug` — internal framework debug messages
   * - `FrameworkInformation` — internal framework info messages
   * - `TestDebug` — test-level debug messages
   * - `TestInformation` — test-level info messages
   * - `Warning` — warnings and errors
   * - `Error` — errors only
   * - `NoOutput` — suppress all output
   *
   * @example
   * Logger.loggingLevel = Logger.Levels.TestInformation;
   */
  public static readonly Levels = {
    /** Maximum verbosity. Same numeric value as `Verbose`. */
    Maximum: Number.MAX_SAFE_INTEGER,

    /** Verbose logging. Same numeric value as `Maximum`. */
    Verbose: Number.MAX_SAFE_INTEGER,

    /** Framework-level debug logs. */
    FrameworkDebug: 6,

    /** Framework-level informational logs. */
    FrameworkInformation: 5,

    /** Test-level debug logs. */
    TestDebug: 4,

    /** Test-level informational logs. */
    TestInformation: 3,

    /** Warnings (and errors). */
    Warning: 2,

    /** Errors only. */
    Error: 1,

    /** No log output is allowed at this level. */
    NoOutput: 0
  } as const;

  // ----------------------------
  // Private Static Properties
  // ----------------------------
  private static readonly videoResolutionLimits = {
    minHeight: 180,
    maxHeight: 4320,
    minWidth: 320,
    maxWidth: 7680
  };

  private static options: Options = Logger.buildDefaultOptions();
  private static startTime: number = Date.now();

  // ----------------------------
  // Public Static Properties
  // ----------------------------

  /**
   * Callback invoked for every log output (after formatting and preamble generation).
   *
   * If defined, the logger calls this function with:
   *  - `message`: The final formatted log line or attached payload.
   *  - `mediaType`: Optional MIME-type-style string.
   *      Examples:
   *        - `"text/plain"` for normal log lines
   *        - `"text/html"` for HTML attachments
   *        - `"base64:image/png"` for screenshots
   *
   * If the callback throws, the logger catches the error and processes it,
   * reporting to the test suite if required.
   *
   * Set this to `undefined` (or call `Logger.clearOutputCallback()`) to disable callback output.
   *
   * @example
   * Logger.logOutputCallback = (message, mediaType) => {
   *   myReporter.attach(message, mediaType ?? "text/plain");
   * };
   */
  public static logOutputCallback: LogOutputCallbackSignature | undefined =
    undefined;

  /**
   * Resets the logger to its default configuration.
   *
   * Clears the output callback and restores all options to their default values.
   * Optionally resets the elapsed-time start point to the current moment.
   *
   * @param resetStartTime - When `true`, the start time used for elapsed-time
   *   calculation is reset to now. When `false` (the default), the existing
   *   start time is preserved so elapsed time continues from the original baseline.
   *
   * @example
   * Logger.reset();       // Reset options only, keep elapsed-time baseline
   * Logger.reset(true);   // Reset options and restart the elapsed timer
   */
  public static reset(resetStartTime: boolean = false): void {
    if (resetStartTime) {
      this.startTime = Date.now();
    }

    this.clearOutputCallback();
    this.options = Logger.buildDefaultOptions();
  }

  // ----------------------------
  // Public Getters/Setters
  // ----------------------------

  /**
   * Controls whether log output is written to the console.
   *
   * When `true`, every log line is written to `console.log()` in addition
   * to any configured {@link logOutputCallback}.
   * When `false`, output is sent only to the callback (if defined).
   *
   * @example
   * Logger.logToConsole = true;
   */
  public static set logToConsole(value: boolean) {
    this.options.logToConsole = value;
  }

  /**
   * Returns whether log output is currently being written to the console.
   *
   * @returns `true` if console logging is enabled; otherwise `false`.
   */
  public static get logToConsole(): boolean {
    return this.options.logToConsole;
  }

  /**
   * Enables or disables Panic Mode.
   *
   * When `true`, the current log level is ignored and all log calls produce
   * output — equivalent to setting the log level to `Verbose`.
   * When `false`, normal log-level filtering applies.
   *
   * @example
   * Logger.panicMode = true; // Force all output regardless of log level
   */
  public static set panicMode(value: boolean) {
    this.options.panicMode = value;
  }

  /**
   * Returns whether Panic Mode is currently active.
   *
   * When `true`, all log output is written regardless of the configured log level.
   *
   * @returns `true` if Panic Mode is enabled; otherwise `false`.
   */
  public static get panicMode(): boolean {
    return this.options.panicMode;
  }

  /**
   * Controls whether an exception is thrown when a log-output operation fails.
   *
   * When `true`, any error raised while executing the configured
   * {@link logOutputCallback} is re-thrown to the caller.
   * When `false`, such errors are suppressed and logged internally instead.
   *
   * @example
   * Logger.throwErrorIfLogOutputFails = true;
   */
  public static set throwErrorIfLogOutputFails(value: boolean) {
    this.options.throwErrorIfLogOutputFails = value;
  }

  /**
   * Returns whether log-output failures are re-thrown as exceptions.
   *
   * @returns `true` if logging errors are propagated to the caller;
   *   `false` if they are suppressed and logged internally.
   */
  public static get throwErrorIfLogOutputFails(): boolean {
    return this.options.throwErrorIfLogOutputFails;
  }

  /**
   * Returns the current global logging level.
   *
   * Only messages with a level less than or equal to this value
   * (or within the configured {@link loggingFilter} range) will be output.
   *
   * @returns The current numeric log level.
   *
   * @see {@link Levels} for named level constants.
   */
  public static get loggingLevel(): number {
    return this.options.loggingCurrentLevel;
  }

  /**
   * Sets the global logging level.
   *
   * Accepts a named level string (case-insensitive, spaces ignored),
   * or a non-negative integer. Unknown strings and invalid numbers
   * fall back to `FrameworkDebug` and emit a warning.
   *
   * @param requiredLevel - The desired level as a `Levels` constant, number, or string.
   *
   * @example
   * Logger.loggingLevel = Logger.Levels.Warning;
   * Logger.loggingLevel = 3;
   * Logger.loggingLevel = "TestInformation";
   */
  public static set loggingLevel(requiredLevel: string | number) {
    if (typeof requiredLevel === "string") {
      this.options.loggingCurrentLevel = this.levelFromText(requiredLevel);
    } else {
      if (Number.isInteger(requiredLevel) && requiredLevel >= 0) {
        this.options.loggingCurrentLevel = requiredLevel;
      } else {
        this.options.loggingCurrentLevel = this.Levels.FrameworkDebug;
        Logger.writeLine(
          this.Levels.Warning,
          `Invalid Log Level [${requiredLevel}] (Must be integer greater than zero). Defaulting to Framework Debug!`
        );
      }
    }
  }

  /**
   * Returns the current logging level as a human-readable string.
   *
   * @returns A descriptive string for the current log level,
   *   e.g. `"Test information (TSINF)"`.
   */
  public static get loggingLevelText(): string {
    return this.levelToText(this.loggingLevel);
  }

  /**
   * Builds a human-readable description of the active logging configuration,
   * combining the current level with any active filter range.
   *
   * Includes a Panic Mode preamble prefix when {@link panicMode} is active.
   *
   * @param level - The current logging level.
   * @param minLevel - The minimum level of the active filter range (`NoOutput` if no filter).
   * @param maxLevel - The maximum level of the active filter range (`NoOutput` if no filter).
   * @returns A descriptive string. Returns the plain level name when no valid
   *   filter range is active.
   *
   * @example
   * Logger.loggingLevelDescription(Logger.Levels.FrameworkDebug, Logger.Levels.NoOutput, Logger.Levels.NoOutput);
   * // => "Framework debug (FKDBG)"
   */
  public static loggingLevelDescription(
    level: number,
    minLevel: number,
    maxLevel: number
  ): string {
    const currentLevelText = this.levelToText(level);
    const preamble = this.options.panicMode
      ? this.options.panicDescriptorPreamble
      : "";

    // If a valid min/max range is set (neither is NoOutput AND min <= max)
    if (minLevel !== this.Levels.NoOutput && maxLevel !== this.Levels.NoOutput) {
      if (minLevel === maxLevel) {
        return (
          preamble +
          `Levels [${this.levelToText(minLevel)}] and [${currentLevelText}]`
        );
      } else if (minLevel <= maxLevel) {
        return (
          preamble +
          `Between levels [${this.levelToText(minLevel)} and ${this.levelToText(maxLevel)}] and level ${currentLevelText}`
        );
      }
    }

    // Fallback: no filter range active, or inverted range — return plain level name
    return preamble + currentLevelText;
  }

  /**
   * Returns the current log-level filter range.
   *
   * When both `min` and `max` are `NoOutput` (i.e. `0`), no filter is active
   * and only {@link loggingLevel} controls output.
   * When a valid range is set, messages whose level falls within
   * `[min, max]` are also output regardless of the current logging level.
   *
   * @returns An object with `min` and `max` numeric level values.
   */
  public static get loggingFilter(): { min: number; max: number } {
    return {
      min: this.options.filterMinCurrentLevel,
      max: this.options.filterMaxCurrentLevel
    };
  }

  /**
   * Sets a log-level filter range for additional output inclusion.
   *
   * Messages whose level falls within `[min, max]` will be output even if
   * they fall outside the current {@link loggingLevel}. Pass `NoOutput` (or
   * omit) for either bound to disable that side of the filter.
   *
   * Both bounds accept a named level string or a non-negative integer.
   * Invalid values fall back to `NoOutput` and emit a warning.
   *
   * @param min - Lower bound of the filter range (inclusive).
   * @param max - Upper bound of the filter range (inclusive).
   *
   * @example
   * Logger.loggingFilter = { min: Logger.Levels.Error, max: Logger.Levels.Warning };
   */
  public static set loggingFilter({
    min,
    max
  }: {
    min?: string | number;
    max?: string | number;
  }) {
    if (typeof min === "string") {
      this.options.filterMinCurrentLevel = this.levelFromText(min);
    } else {
      if (Number.isInteger(min) && Number(min) >= 0) {
        this.options.filterMinCurrentLevel = min!;
      } else {
        this.options.filterMinCurrentLevel = this.Levels.NoOutput;
        Logger.writeLine(
          this.Levels.Warning,
          `Invalid Log Level [${min}] (Must be integer greater than zero). Defaulting to NoOutput!`
        );
      }
    }

    if (typeof max === "string") {
      this.options.filterMaxCurrentLevel = this.levelFromText(max);
    } else {
      if (Number.isInteger(max) && Number(max) >= 0) {
        this.options.filterMaxCurrentLevel = max!;
      } else {
        this.options.filterMaxCurrentLevel = this.Levels.NoOutput;
        Logger.writeLine(
          this.Levels.Warning,
          `Invalid Log Level [${max}] (Must be integer greater than zero). Defaulting to NoOutput!`
        );
      }
    }
  }

  /**
   * Returns the current `writeLine` formatting options.
   *
   * These control preamble suppression, max lines, timestamp format,
   * and elapsed time format for log lines written via {@link writeLine}.
   *
   * @returns The active {@link WriteLineOptions} configuration object.
   */
  public static get writeLineOptions(): WriteLineOptions {
    return this.options.writeLine;
  }

  /**
   * Returns the current video attachment options.
   *
   * These defaults are used by {@link attachVideo} and {@link attachVideoFile}
   * when no explicit options are provided.
   *
   * @returns The active {@link VideoOptions} configuration object.
   */
  public static get videoOptions(): VideoOptions {
    return this.options.video;
  }

  /**
   * Sets the video attachment options used when attaching video to log output.
   *
   * Provided values are merged with the current options. If `height` or `width`
   * fall outside the valid resolution limits, both dimensions are ignored and
   * the existing values are retained.
   *
   * @param options - Partial or full {@link VideoOptions} to apply.
   *
   * @example
   * Logger.videoOptions = { videoCodec: "mp4", width: 1280, height: 720 };
   */
  public static set videoOptions(options: VideoOptions) {
    this.options.video = {
      videoCodec: options.videoCodec ?? this.options.video.videoCodec,
      ...this.checkAndGetVideoResolution(options)
    };
  }

  /**
   * Clears the {@link logOutputCallback}, disabling callback-based log output.
   *
   * After calling this, log output will only go to the console
   * (if {@link logToConsole} is `true`), or be silently dropped.
   *
   * @example
   * Logger.clearOutputCallback();
   */
  public static clearOutputCallback(): void {
    this.logOutputCallback = undefined;
  }

  // ----------------------------
  // Public Attach Methods
  // ----------------------------

  /**
   * Attaches a screenshot to the log output at the specified log level.
   *
   * The screenshot is base64-encoded and passed to {@link logOutputCallback}
   * with a media type of `"base64:image/png"`. Accepts either a raw `Buffer`
   * or an existing base64 string.
   *
   * Has no effect if the given `logLevel` does not pass the current level filter.
   *
   * @param logLevel - The log level at which to attach the screenshot.
   * @param screenshot - A `Buffer` containing raw PNG data, or a base64-encoded string.
   *
   * @example
   * Logger.attachScreenshot(Logger.Levels.TestDebug, screenshotBuffer);
   */
  public static attachScreenshot(
    logLevel: number,
    screenshot: Buffer | string
  ): void {
    if (this.logLevelOk(logLevel)) {
      if (typeof screenshot === "string") {
        screenshot = Buffer.from(screenshot).toString("base64");
      } else {
        screenshot = screenshot.toString("base64");
      }
      this.attach(logLevel, screenshot, "base64:image/png");
    }
  }

  /**
   * Attaches an HTML string to the log output at the specified log level.
   *
   * The HTML is passed to {@link logOutputCallback} with a media type of `"text/html"`.
   * Useful for attaching rich content such as tables or styled reports.
   *
   * Has no effect if the given `logLevel` does not pass the current level filter.
   *
   * @param logLevel - The log level at which to attach the HTML.
   * @param htmlString - A valid HTML string to attach.
   *
   * @example
   * Logger.attachHTML(Logger.Levels.TestInformation, "<b>Test passed</b>");
   */
  public static attachHTML(logLevel: number, htmlString: string): void {
    this.attach(logLevel, htmlString, "text/html");
  }

  /**
   * Reads a video file from disk and attaches it to the log output.
   *
   * The file at `videoFilePath` is read as a `Buffer` and passed to
   * {@link attachVideo}. If the file cannot be read, an error is processed
   * via {@link throwErrorIfLogOutputFails}.
   *
   * Has no effect if the given `logLevel` does not pass the current level filter.
   *
   * @param logLevel - The log level at which to attach the video.
   * @param videoFilePath - Absolute or relative path to the video file.
   * @param options - Optional {@link VideoOptions} overriding the current defaults.
   *
   * @example
   * Logger.attachVideoFile(Logger.Levels.TestDebug, "./recordings/run.webm");
   */
  public static attachVideoFile(
    logLevel: number,
    videoFilePath: string,
    options: VideoOptions = this.videoOptions
  ): void {
    if (this.logLevelOk(logLevel)) {
      let videoBuffer: Buffer;
      try {
        videoBuffer = readFileSync(videoFilePath);
      } catch (err) {
        const errText = `Error thrown reading video data from given file path:-\n${(err as Error).message}`;
        this.processError(errText);
        return;
      }
      this.attachVideo(logLevel, videoBuffer, options);
    }
  }

  /**
   * Attaches a video buffer to the log output at the specified log level.
   *
   * The video is base64-encoded and wrapped in an HTML `<video>` element,
   * then passed to {@link logOutputCallback} with a media type of `"text/html"`.
   * When {@link panicMode} is active, the video element is given a
   * `title="PANIC_MODE"` attribute.
   *
   * Has no effect if the given `logLevel` does not pass the current level filter.
   *
   * @param logLevel - The log level at which to attach the video.
   * @param video - A `Buffer` containing the raw video data.
   * @param options - Optional {@link VideoOptions} overriding the current defaults.
   *
   * @example
   * Logger.attachVideo(Logger.Levels.TestDebug, videoBuffer, { width: 640, height: 360 });
   */
  public static attachVideo(
    logLevel: number,
    video: Buffer,
    options?: VideoOptions
  ): void {
    const actualOptions =
      options == null
        ? this.options.video
        : {
          videoCodec: options.videoCodec ?? this.options.video.videoCodec,
          ...this.checkAndGetVideoResolution(options)
        };

    const videoSourceString =
      `data:video/${actualOptions.videoCodec};base64,` +
      video.toString("base64");

    const videoStringNoData = `<video controls width="${actualOptions.width}" height="${actualOptions.height}"${this.panicMode ? ` title="PANIC_MODE"` : ""}><source src="<Video Data>" type="video/${actualOptions.videoCodec}">Video (Codec ${actualOptions.videoCodec}) not supported by browser</video>`;

    const videoString = videoStringNoData.replace(
      "<Video Data>",
      videoSourceString
    );
    this.attach(logLevel, videoString, "text/html");
  }

  /**
   * Passes arbitrary data to the {@link logOutputCallback} at the specified log level.
   *
   * If the callback is not set, an error is logged instead. If the callback throws,
   * the error is processed via {@link throwErrorIfLogOutputFails}.
   *
   * Has no effect if the given `logLevel` does not pass the current level filter.
   *
   * @param logLevel - The log level at which to attach the data.
   * @param dataString - The data payload to pass to the callback.
   * @param mediaType - A MIME-type-style string describing the data
   *   (e.g. `"text/html"`, `"base64:image/png"`).
   *
   * @example
   * Logger.attach(Logger.Levels.TestDebug, myPayload, "text/plain");
   */
  public static attach(
    logLevel: number,
    dataString: string,
    mediaType: string
  ): void {
    if (this.logLevelOk(logLevel)) {
      if (typeof this.logOutputCallback === "function") {
        try {
          this.logOutputCallback(dataString, mediaType);
        } catch (err) {
          const errText = `Error thrown from Log Output Callback:-\n${(err as Error).message}\nwhen called with data string:-\n${this.truncateForDisplay(dataString)}\nand mediaType:-\n${this.truncateForDisplay(mediaType)}`;
          this.processError(errText);
        }
      } else {
        Logger.writeLine(
          this.Levels.Error,
          `Log Output callback is type [${typeof this.logOutputCallback}].  Must be type [function].  No attach performed.`
        );
      }
    }
  }

  // ----------------------------
  // Public writeLine
  // ----------------------------

  /**
   * Writes a log line (or multiple lines) at the specified log level.
   *
   * Multi-line strings are split and each line is written individually.
   * If the total number of lines exceeds `maxLines`, intermediate lines
   * are replaced with a single truncation notice.
   *
   * Each line is prefixed with a preamble (timestamp, elapsed time, calling method,
   * and level label) unless suppressed via `options` or the global
   * {@link writeLineOptions} configuration.
   *
   * Has no effect if the given `logLevel` does not pass the current level filter
   * (unless {@link panicMode} is active).
   *
   * @param logLevel - The log level at which to write the message.
   * @param textString - The message to log. May contain newlines.
   * @param options - Optional per-call overrides for {@link WriteLineOptions}.
   *
   * @example
   * Logger.writeLine(Logger.Levels.TestInformation, "Test started");
   * Logger.writeLine(Logger.Levels.Warning, "Something looks off", { suppressAllPreamble: true });
   */
  public static writeLine(
    logLevel: number,
    textString: string,
    options?: WriteLineOptions
  ): void {
    const stackObj: unknown = {};
    Error.captureStackTrace(stackObj as object, this.writeLine);
    const stack = (stackObj as Error)?.stack ?? "[Unknown]";
    const callingMethodDetails = this.callingMethodDetails(stack, options?.stackOffset ?? 0);

    const maxLines =
      options?.maxLines ?? (this.options.writeLine.maxLines as number);
    const suppressAllPreamble =
      options?.suppressAllPreamble ??
      this.options.writeLine.suppressAllPreamble;
    const suppressMultilinePreamble =
      options?.suppressMultilinePreamble ??
      this.options.writeLine.suppressMultilinePreamble;
    const suppressTimeStamp =
      options?.suppressTimeStamp ?? this.options.writeLine.suppressTimeStamp;
    const suppressElapsed =
      options?.suppressElapsed ?? this.options.writeLine.suppressElapsed;
    const timeFormat = suppressTimeStamp
      ? undefined
      : (options?.timeFormat ?? this.options.writeLine.timeFormat);
    const elapsedFormat = suppressElapsed
      ? undefined
      : (options?.elapsedFormat ?? this.options.writeLine.elapsedFormat);

    if (!stack.includes(".doWriteLine")) {
      const normalizedMaxLines = maxLines < 1 ? 1 : maxLines;
      const textArray = textString.split(/\r?\n/);
      let isFirstLine = true;

      if (normalizedMaxLines < 3) {
        const errorMessage = `maxLines must be 3 or greater!  Number given was <${maxLines}>`
        Logger.writeLine(this.Levels.Error, errorMessage);
        throw new Error(errorMessage);
      }

      textArray.forEach((line: string, index: number) => {
        if (
          textArray.length <= normalizedMaxLines ||
          index < normalizedMaxLines - 2 ||
          index === textArray.length - 1
        ) {
          this.doWriteLine(
            !(suppressAllPreamble || (suppressMultilinePreamble && !isFirstLine)),
            callingMethodDetails,
            logLevel,
            line,
            { time: timeFormat, elapsed: elapsedFormat }
          );
        } else if (index === normalizedMaxLines - 2) {
          this.doWriteLine(
            !(suppressAllPreamble || (suppressMultilinePreamble && !isFirstLine)),
            callingMethodDetails,
            logLevel,
            `... (Skipping some lines as total length (${textArray.length}) > ${normalizedMaxLines}!!)`,
            { time: timeFormat, elapsed: elapsedFormat }
          );
        }

        isFirstLine = false;
      });
    }
  }

  // ----------------------------
  // Private Utilities
  // ----------------------------

  /** Builds a fresh default options object. Extracted so both the field initialiser and reset() share one source of truth. */
  private static buildDefaultOptions(): Options {
    return {
      loggingCurrentLevel: DEFAULT_LOG_LEVEL,
      filterMinCurrentLevel: Logger.Levels.NoOutput,
      filterMaxCurrentLevel: Logger.Levels.NoOutput,
      logToConsole: DEFAULT_LOG_TO_CONSOLE,
      throwErrorIfLogOutputFails: DEFAULT_THROW_ERROR_LOG_FAIL,
      panicMode: DEFAULT_PANIC_MODE,
      panicCodePreamble: DEFAULT_PANIC_CODE,
      panicDescriptorPreamble: DEFAULT_PANIC_DESCRIPTOR,
      writeLine: {
        maxLines: DEFAULT_WRITELINE_MAX_LINES,
        suppressTimeStamp: DEFAULT_WRITELINE_SUPPRESS_TIME,
        suppressElapsed: DEFAULT_WRITELINE_SUPPRESS_ELAPSED,
        suppressAllPreamble: DEFAULT_WRITELINE_SUPPRESS_ALL,
        suppressMultilinePreamble: DEFAULT_WRITELINE_SUPPRESS_MULTI,
        timeFormat: DEFAULT_WRITELINE_FORMAT_TIME,
        elapsedFormat: DEFAULT_WRITELINE_FORMAT_ELAPSED
      },
      video: {
        videoCodec: DEFAULT_VIDEO_CODEC,
        width: DEFAULT_VIDEO_WIDTH,
        height: DEFAULT_VIDEO_HEIGHT
      }
    };
  }

  private static levelToText(level: number): string {
    switch (level) {
      case this.Levels.FrameworkDebug:
        return "Framework debug (FKDBG)";
      case this.Levels.FrameworkInformation:
        return "Framework information (FKINF)";
      case this.Levels.TestDebug:
        return "Test debug (TSDBG)";
      case this.Levels.TestInformation:
        return "Test information (TSINF)";
      case this.Levels.Warning:
        return "Errors (ERROR) & Warnings (WARNING) only";
      case this.Levels.Error:
        return "Errors only (ERROR)";
      case this.Levels.NoOutput:
        return "No output from Log (NOOUT)";
      default:
        return level < 0
          ? "Unknown!"
          : `Special Level - (${this.options.loggingCurrentLevel})`;
    }
  }

  private static levelFromText(text: string): number {
    // Strip all whitespace so e.g. "Framework Debug", "frameworkdebug", "framework debug" all match
    switch (text.toLowerCase().replace(/\s+/g, "")) {
      case "special":
      case "verbose":
      case "maximum":
      case "max":
        return Number.MAX_SAFE_INTEGER;
      case "frameworkdebug":
      case "fkdbg":
        return this.Levels.FrameworkDebug;
      case "frameworkinformation":
      case "fkinf":
        return this.Levels.FrameworkInformation;
      case "testdebug":
      case "tsdbg":
        return this.Levels.TestDebug;
      case "testinformation":
      case "tsinf":
        return this.Levels.TestInformation;
      case "warn":
      case "warng":
      case "warning":
        return this.Levels.Warning;
      case "error":
        return this.Levels.Error;
      case "nooutput":
      case "noout":
        return this.Levels.NoOutput;
      default: {
        const actualLevel = this.options.loggingCurrentLevel;
        this.options.loggingCurrentLevel = this.Levels.FrameworkDebug;
        Logger.writeLine(
          this.Levels.Warning,
          `Unknown Log Level [${text}]. Defaulting to Framework Debug!`
        );
        this.options.loggingCurrentLevel = actualLevel;
        return this.Levels.FrameworkDebug;
      }
    }
  }

  private static checkAndGetVideoResolution(resolution: {
    height?: number;
    width?: number;
  }): { height: number; width: number } {
    const heightValid =
      resolution.height == null ||
      this.isValidVideoResolutionNumber(
        resolution.height,
        this.videoResolutionLimits.minHeight,
        this.videoResolutionLimits.maxHeight,
        `Invalid video window height [${resolution.height}]: must be number equal or between ${this.videoResolutionLimits.minHeight} and ${this.videoResolutionLimits.maxHeight}. Height (and width if set) ignored`
      );
    const widthValid =
      resolution.width == null ||
      this.isValidVideoResolutionNumber(
        resolution.width,
        this.videoResolutionLimits.minWidth,
        this.videoResolutionLimits.maxWidth,
        `Invalid video window width [${resolution.width}]: must be number equal or between ${this.videoResolutionLimits.minWidth} and ${this.videoResolutionLimits.maxWidth}. Width (and height if set) ignored`
      );

    const height = (
      resolution.height == null
        ? this.options.video.height
        : heightValid && widthValid
          ? resolution.height
          : this.options.video.height
    ) as number;
    const width = (
      resolution.width == null
        ? this.options.video.width
        : heightValid && widthValid
          ? resolution.width
          : this.options.video.width
    ) as number;
    return { height, width };
  }

  private static doWriteLine(
    doPreamble: boolean,
    callingMethodDetails: string,
    logLevel: number,
    textString: string,
    formatOptions: { time?: string; elapsed?: string }
  ): void {
    if (this.logLevelOk(logLevel)) {
      const callBackGood = typeof this.logOutputCallback === "function";
      const preAmble = doPreamble
        ? this.getPreAmble(callingMethodDetails, logLevel, formatOptions)
        : "";
      const textToWrite = preAmble + textString;
      let doneConsoleWrite = false;
      let doneCallbackWrite = false;

      if (this.options.logToConsole) {
        console.log(textToWrite);
        doneConsoleWrite = true;
      }

      if (callBackGood) {
        try {
          this.logOutputCallback!(textToWrite);
          doneCallbackWrite = true;
        } catch (err) {
          const errText = `Error thrown from Log Output Callback during writeLine:-\n${(err as Error).message}`;
          // Avoid infinite recursion: log directly to console rather than calling processError -> writeLine
          console.error(errText);
          if (this.options.throwErrorIfLogOutputFails) {
            throw new Error(errText);
          }
        }
      }

      if (!doneConsoleWrite && !doneCallbackWrite) {
        console.log(textToWrite);
      }
    }
  }

  private static getPreAmble(
    methodBase: string,
    typeOfWrite: number,
    timeFormat: { time?: string; elapsed?: string }
  ): string {
    const writeType =
      (this.options.panicMode ? this.options.panicCodePreamble : "") +
      this.getWriteTypeString(typeOfWrite);

    // timeFormat.time is undefined when suppressTimeStamp is active
    const timeStamp =
      timeFormat.time === undefined
        ? ""
        : `[${format(Date.now(), timeFormat.time)}]`;

    // timeFormat.elapsed is undefined when suppressElapsed is active
    const diff = Date.now() - this.startTime;
    const utcDate = new Date(diff);
    utcDate.setMinutes(utcDate.getMinutes() + utcDate.getTimezoneOffset());
    const elapsedTime =
      timeFormat.elapsed === undefined
        ? ""
        : `[${format(utcDate, timeFormat.elapsed)}]`;

    return `${writeType} - ${timeStamp}${elapsedTime} [${methodBase}]: `;
  }

  /**
   * Left-pads a number (or numeric string) with zeroes to reach the required minimum length.
   * Kept private and self-contained so `logger.ts` has no external utility dependencies.
   */
  private static pad(num: number, requiredMinimumLength: number): string {
    let numString = num.toString();
    while (numString.length < requiredMinimumLength) {
      numString = "0" + numString;
    }
    return numString;
  }

  private static getWriteTypeString(levelOfWrite: number): string {
    switch (levelOfWrite) {
      case this.Levels.Error:
        return "ERROR";
      case this.Levels.Warning:
        return "WARNG";
      case this.Levels.FrameworkDebug:
        return "FKDBG";
      case this.Levels.FrameworkInformation:
        return "FKINF";
      case this.Levels.TestDebug:
        return "TSDBG";
      case this.Levels.TestInformation:
        return "TSINF";
      default:
        return this.pad(levelOfWrite, WRITE_TYPE_PAD_WIDTH);
    }
  }

  private static callingMethodDetails(methodBase: string, stackOffset = 0): string {
    let methodName = "<Unknown>";
    let typeName = "";
    if (methodBase) {
      const methodBaseLines = methodBase.split("\n");
      if (methodBaseLines.length > 1) {
        // Skip past internal Logger stack frames to find the real caller
        let indexOfFirstNonLogLine = methodBaseLines
          .slice(1)
          .findIndex((item) => !item.includes(LOGGER_STACK_FRAME_MARKER));
        indexOfFirstNonLogLine =
          indexOfFirstNonLogLine === -1 ? 1 : indexOfFirstNonLogLine + 1;
        const safeOffset = Math.max(0, stackOffset);
        const targetIndex = Math.min(indexOfFirstNonLogLine + safeOffset, methodBaseLines.length - 1);
        methodName = methodBaseLines[targetIndex]
          .replace(/\s\s+/g, " ")
          .trim();
        if (methodName.startsWith("at ")) {
          const tempA = methodName.split(" ");
          methodName = tempA.slice(0, 1).concat([tempA.slice(1).join(" ")])[1];
          if (
            methodName.includes("/") &&
            methodName.includes(":") &&
            methodName.includes(")")
          ) {
            typeName = methodName
              .split("/")[methodName.split("/").length - 1].split(")")[0];
          }
          methodName = methodName.split(" ")[0];
        }
      }
    }
    return `${methodName}${typeName === "" ? "" : `(${typeName})`}`;
  }

  private static isValidVideoResolutionNumber(
    val: number,
    min: number,
    max: number,
    errorMessage: string
  ): boolean {
    if (typeof val === "number") {
      if (Number.isInteger(val) && val >= min && val <= max) return true;
      Logger.writeLine(this.Levels.Warning, errorMessage);
      return false;
    } else {
      Logger.writeLine(this.Levels.Error, errorMessage);
      throw new Error(
        `Resolution number given was a <${typeof val}>!  Must only be a number!`
      );
    }
  }

  private static logLevelOk(passedInLogLevel: number): boolean {
    if (this.panicMode === true) return true;
    if (passedInLogLevel === this.Levels.NoOutput) return false;
    const withinCurrentLevel =
      passedInLogLevel <= this.options.loggingCurrentLevel;
    const withinFilterRange =
      passedInLogLevel >= this.options.filterMinCurrentLevel &&
      passedInLogLevel <= this.options.filterMaxCurrentLevel;
    return withinCurrentLevel || withinFilterRange;
  }

  private static processError(errorText: string): void {
    if (this.options.throwErrorIfLogOutputFails) {
      throw new Error(errorText);
    } else {
      Logger.writeLine(this.Levels.Error, errorText, {
        suppressMultilinePreamble: true
      });
    }
  }

  /**
   * Truncates a string for safe display in error messages.
   * Shows the first {@link ERROR_DISPLAY_STRING_HEAD_LENGTH} characters, an ellipsis,
   * and the last {@link ERROR_DISPLAY_STRING_TAIL_LENGTH} characters when the string
   * exceeds {@link ERROR_DISPLAY_STRING_MAX_LENGTH}.
   */
  private static truncateForDisplay(value: unknown): string {
    if (typeof value !== "string") {
      return `<Not a string! Is type ${typeof value}>`;
    }
    if (value.length > ERROR_DISPLAY_STRING_MAX_LENGTH) {
      return (
        value.slice(0, ERROR_DISPLAY_STRING_HEAD_LENGTH) +
        "..." +
        value.slice(-ERROR_DISPLAY_STRING_TAIL_LENGTH)
      );
    }
    return value;
  }
}