import { readFileSync } from "fs";
import { format } from "date-fns";
import {
  VideoOptions,
  WriteLineOptions,
  Options,
  LogOutputCallbackSignature
} from "./types";

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
const DEFAULT_PANIC_DISCRIPTOR = "P: ";

export class Logger {
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
  private static videoResolutionLimits = {
    minHeight: 180,
    maxHeight: 4320,
    minWidth: 320,
    maxWidth: 7680
  };
  private static options: Options;
  private static startTime: number;

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
   * If the callback throws, the logger catches the error and processes it.  Reporting to
   * test suite if required
   *
   * Set this to `undefined` (or call `Logger.clearOutputCallback()`) to disable callback output.
   */
  public static logOutputCallback: LogOutputCallbackSignature | undefined =
    undefined;

  public static reset(resetStartTime: boolean = false): void {
    this.startTime = resetStartTime ? new Date().getTime() : this.startTime;

    this.clearOutputCallback();

    this.options = {
      loggingCurrentLevel: DEFAULT_LOG_LEVEL,
      filterMinCurrentLevel: this.Levels.NoOutput,
      filterMaxCurrentLevel: this.Levels.NoOutput,
      logToConsole: DEFAULT_LOG_TO_CONSOLE,
      throwErrorIfLogOutputFails: DEFAULT_THROW_ERROR_LOG_FAIL,
      panicMode: DEFAULT_PANIC_MODE,
      panicCodePreamble: DEFAULT_PANIC_CODE,
      panicDescriptorPreamble: DEFAULT_PANIC_DISCRIPTOR,
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

  // ----------------------------
  // Public Getters/Setters
  // ----------------------------
  
  /**
   * Enables or disables writing log output to the console.
   *
   * When `true`, every log line (after preamble formatting) is written to
   * `console.log()` in addition to any configured output callback.
   * When `false`, log output is sent only to the callback (if defined).
   */
  public static set logToConsole(value: boolean) {
    this.options.logToConsole = value;
  }

  /**
   * Returns whether logger is in PANIC MODE
   *
   * @returns `true` if logger in Panic Mode
   *
   * @description When in Panic Mode mode, no filtering is peformed based on Current Log Level
   */
  public static get logToConsole(): boolean {
    return this.options.logToConsole;
  }

  /**
   * Controls whether an exception is thrown when a log-output operation fails.
   *
   * When set to `true`, any error raised while executing the configured
   * `logOutputCallback` (or other log-output mechanism) is re-thrown to the caller.
   * When set to `false`, such errors are suppressed and logging continues.
   */
  public static set PANIC_MODE(value: boolean) {
    this.options.panicMode = value;
  }
  /**
   * Indicates whether log-output failures should be re-thrown as exceptions.
   *
   * @returns `true` if logging errors are propagated; otherwise `false`
   *          if logging errors are suppressed.
   */
  public static get PANIC_MODE(): boolean {
    return this.options.panicMode;
  }

  /**
   * Runs in PANIC mode.  Hit PANIC MODE when all output MUST written.
   *
   * When set to `true`, Current Log Level is ignored and all output calls
   * are used and output logging.  Equivalent of setting current log level to
   * VERBOSE.
   * When set to `false`, such errors are suppressed and logging continues.
   */
  public static set throwErrorIfLogOutputFails(value: boolean) {
    this.options.throwErrorIfLogOutputFails = value;
  }

  /**
   * Indicates whether log-output failures should be re-thrown as exceptions.
   *
   * @returns `true` if logging errors are propagated; otherwise `false`
   *          if logging errors are suppressed.
   */
  public static get throwErrorIfLogOutputFails(): boolean {
    return this.options.throwErrorIfLogOutputFails;
  }

  /**
   * Gets the current global logging level.
   *
   * Only log messages with a level less than or equal to this value
   * (or within the configured filter range) will be output.
   *
   * @returns The current `LogLevels` value controlling log verbosity.
   */
  public static get loggingLevel(): number {
    return this.options.loggingCurrentLevel;
  }

  /**
   * Sets the global logging level.
   *
   * Accepts a `LogLevels` enum value, a numeric level, or a string
   * (case-insensitive, spaces ignored) matching known level names.
   *
   * - If a string is unrecognized, defaults to `FrameworkDebug` and logs a warning.
   * - If a number is not an integer ≥ 0, defaults to `FrameworkDebug` and logs a warning.
   *
   * @param requiredLevel The desired logging level as `LogLevels`, number, or string.
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

  public static get loggingLevelText(): string {
    return this.levelToText(this.loggingLevel);
  }

  public static loggingLevelDescription(
    level: number,
    minLevel: number,
    maxLevel: number
  ) {
    const currentLevelText = this.levelToText(level);
    const preamble = this.options.panicMode
      ? this.options.panicDescriptorPreamble
      : "";

    // If we have a min/max range (IE. neither is NoOutput AND min less than max)
    if (minLevel != this.Levels.NoOutput && maxLevel != this.Levels.NoOutput) {
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
      } else {
        return preamble + `${currentLevelText}`;
      }
    }
  }

  public static get loggingFilter(): { min: number; max: number } {
    return {
      min: this.options.filterMinCurrentLevel,
      max: this.options.filterMaxCurrentLevel
    };
  }

  public static set loggingFilter({
    minLevel,
    maxLevel
  }: {
    minLevel?: string | number;
    maxLevel?: string | number;
  }) {
    if (typeof minLevel === "string") {
      this.options.filterMinCurrentLevel = this.levelFromText(minLevel);
    } else {
      if (Number.isInteger(minLevel) && Number(minLevel) >= 0) {
        this.options.filterMinCurrentLevel = minLevel!;
      } else {
        this.options.filterMinCurrentLevel = this.Levels.NoOutput;
        Logger.writeLine(
          this.Levels.Warning,
          `Invalid Log Level [${minLevel}] (Must be integer greater than zero). Defaulting to Framework Debug!`
        );
      }
    }

    if (typeof maxLevel === "string") {
      this.options.filterMaxCurrentLevel = this.levelFromText(maxLevel);
    } else {
      if (Number.isInteger(maxLevel) && Number(maxLevel) >= 0) {
        this.options.filterMaxCurrentLevel = maxLevel!;
      } else {
        this.options.filterMaxCurrentLevel = this.Levels.NoOutput;
        Logger.writeLine(
          this.Levels.Warning,
          `Invalid Log Level [${maxLevel}] (Must be integer greater than zero). Defaulting to Framework Debug!`
        );
      }
    }
  }

  public static get writeLineOptions(): WriteLineOptions {
    return this.options.writeLine;
  }

  public static get videoOptions(): VideoOptions {
    return this.options.video;
  }

  public static set videoOptions(options: VideoOptions) {
    this.options.video = {
      videoCodec: options.videoCodec ?? this.options.video.videoCodec,
      ...this.checkAndGetVideoResolution(options)
    };
  }

  public static clearOutputCallback() {
    this.logOutputCallback = undefined;
  }

  // ----------------------------
  // Public Attach Methods
  // ----------------------------

  public static attachScreenshot(
    logLevel: number,
    screenshot: Buffer | string
  ) {
    if (this.logLevelOk(logLevel)) {
      if (typeof screenshot == "string") {
        screenshot = Buffer.from(screenshot).toString("base64");
      } else {
        screenshot = screenshot.toString("base64");
      }
      this.attach(logLevel, screenshot, "base64:image/png");
    }
  }

  public static attachHTML(logLevel: number, htmlString: string) {
    this.attach(logLevel, htmlString, "text/html");
  }

  public static attachVideoFile(
    logLevel: number,
    videoFilePath: string,
    options: VideoOptions = this.videoOptions
  ) {
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

  public static attachVideo(
    logLevel: number,
    video: Buffer,
    options?: VideoOptions
  ) {
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

    const videoStringNoData = `<video controls width="${actualOptions.width}" height="${actualOptions.height}"${this.PANIC_MODE ? ` title="PANIC_MODE"` : ""}><source src="<Video Data>" type="video/${actualOptions.videoCodec}">Video (Codec ${actualOptions.videoCodec}) not supported by browser</video>`;

    const videoString = videoStringNoData.replace(
      "<Video Data>",
      videoSourceString
    );
    this.attach(logLevel, videoString, "text/html");
  }

  public static attach(
    logLevel: number,
    dataString: string,
    mediaType: string
  ) {
    if (this.logLevelOk(logLevel)) {
      if (typeof this.logOutputCallback === "function") {
        try {
          this.logOutputCallback(dataString, mediaType);
        } catch (err) {
          const processString = (stringToProcess: string): string => {
            if (typeof stringToProcess !== "string")
              return `<Not a string! Is type ${typeof stringToProcess}>`;
            if (stringToProcess.length > 30)
              return (
                stringToProcess.slice(0, 25) + "..." + stringToProcess.slice(-3)
              );
            return stringToProcess;
          };
          const errText = `Error thrown from Log Output Callback:-\n${(err as Error).message}\nwhen called with data string:-\n${processString(dataString)}\nand mediaType:-\n${processString(mediaType)}`;
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
  public static writeLine(
    logLevel: number,
    textString: string,
    options?: WriteLineOptions
  ) {
    const stackObj: unknown = {};
    Error.captureStackTrace(stackObj as object, this.writeLine);
    const stack = (stackObj as Error)?.stack ?? "[Unknown]";
    const callingMethodDetails = this.callingMethodDetails(stack);

    const maxLines =
      options?.maxLines ?? (this.options.writeLine.maxLines as number);
    const suppressAllPreamble =
      options?.suppressAllPreamble ??
      this.options.writeLine.suppressAllPreamble;
    const suppressMultilinePreamble =
      options?.suppressMultilinePreamble ??
      this.options.writeLine.suppressMultilinePreamble;
    const timeFormat = options?.timeFormat ?? this.options.writeLine.timeFormat;
    const elapsedFormat =
      options?.elapsedFormat ?? this.options.writeLine.elapsedFormat;

    if (!stack.includes(".doWriteLine")) {
      const normalizedMaxLines = maxLines < 1 ? 1 : maxLines;
      const textArray = textString.split(/\r?\n/);
      let isFirstLine = true;

      textArray.forEach((line: string, index: number) => {
        if (
          textArray.length <= normalizedMaxLines ||
          index < normalizedMaxLines - 2 ||
          index == textArray.length - 1
        ) {
          this.doWriteLine(
            !(
              suppressAllPreamble ||
              (suppressMultilinePreamble && !isFirstLine)
            ),
            callingMethodDetails,
            logLevel,
            line,
            { time: timeFormat, elapsed: elapsedFormat }
          );
        } else if (index == normalizedMaxLines - 2) {
          this.doWriteLine(
            !(
              suppressAllPreamble ||
              (suppressMultilinePreamble && !isFirstLine)
            ),
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
    switch ((text as string).toLowerCase().replace(" ", "")) {
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
        resolution.height ?? -1,
        this.videoResolutionLimits.minHeight,
        this.videoResolutionLimits.maxHeight,
        `Invalid video window height [${resolution.height}]: must be number equal or between ${this.videoResolutionLimits.minHeight} and ${this.videoResolutionLimits.maxHeight}. Height (and width if set) ignored`
      );
    const widthValid =
      resolution.width == null ||
      this.isValidVideoResolutionNumber(
        resolution.width ?? -1,
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
    format: { time?: string; elapsed?: string }
  ): void {
    if (this.logLevelOk(logLevel)) {
      const callBackGood = typeof this.logOutputCallback === "function";
      const preAmble = doPreamble
        ? this.getPreAmble(callingMethodDetails, logLevel, format)
        : "";
      const textToWrite = preAmble + textString;
      let doneConsoleWrite = false;
      let doneCallbackWrite = false;

      if (this.options.logToConsole) {
        console.log(textToWrite);
        doneConsoleWrite = true;
      }

      if (callBackGood) {
        this.logOutputCallback!(textToWrite);
        doneCallbackWrite = true;
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
  ) {
    const writeType =
      (this.options.panicMode ? this.options.panicCodePreamble : "") +
      this.getWriteTypeString(typeOfWrite);
    const timeStamp =
      typeof timeFormat.time === "undefined"
        ? ""
        : `[${format(Date.now(), timeFormat.time ?? this.writeLineOptions.timeFormat)}]`;
    const diff = Date.now() - this.startTime;
    const utcDate = new Date(diff);
    utcDate.setMinutes(utcDate.getMinutes() + utcDate.getTimezoneOffset());
    const elapsedTime =
      typeof timeFormat.elapsed === "undefined"
        ? ""
        : `[${format(utcDate, timeFormat.elapsed ?? this.writeLineOptions.elapsedFormat)}]`;
    return `${writeType} - ${timeStamp}${elapsedTime} [${methodBase}]: `;
  }

  private static pad(
    num: number | string,
    requiredMinimumLength: number
  ): string {
    let numString = typeof num == "number" ? num.toString() : num;
    while (numString.length < requiredMinimumLength)
      numString = "0" + numString;
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
        return this.pad(levelOfWrite, 5);
    }
  }

  private static callingMethodDetails(methodBase: string) {
    let methodName = "<Unknown>";
    let typeName = "";
    if (methodBase) {
      const methodBaseLines = methodBase.split("\n");
      if (methodBaseLines.length > 1) {
        let indexOfFirstNonLogLine = methodBaseLines
          .slice(1)
          .findIndex((item) => !item.includes("scrotum"));
        indexOfFirstNonLogLine =
          indexOfFirstNonLogLine === -1 ? 1 : indexOfFirstNonLogLine + 1;
        methodName = methodBaseLines[indexOfFirstNonLogLine]
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
    return `${methodName}${typeName == "" ? "" : `(${typeName})`}`;
  }

  private static isValidVideoResolutionNumber(
    val: number,
    min: number,
    max: number,
    errorMessage: string
  ): boolean {
    if (typeof val === "number") {
      if (Number.isInteger(val) && val >= min && val <= max) return true;
      else {
        Logger.writeLine(this.Levels.Warning, errorMessage);
        return false;
      }
    } else {
      Logger.writeLine(this.Levels.Error, errorMessage);
      throw new Error(
        `Resolution number given was a <${typeof val}>!  Must only be a number!`
      );
    }
  }

  private static logLevelOk(passedInLogLevel: number): boolean {
    if (this.PANIC_MODE === true) return true;
    if (passedInLogLevel === this.Levels.NoOutput) return false;
    const withinCurrentLevel =
      passedInLogLevel <= this.options.loggingCurrentLevel;
    const withinFilterRange =
      passedInLogLevel >= this.options.filterMinCurrentLevel &&
      passedInLogLevel <= this.options.filterMaxCurrentLevel;
    return withinCurrentLevel || withinFilterRange;
  }

  private static processError(errorText: string) {
    if (this.options.throwErrorIfLogOutputFails) {
      throw new Error(errorText);
    } else {
      Logger.writeLine(this.Levels.Error, errorText, {
        suppressMultilinePreamble: true
      });
    }
  }
}

// ----------------------------
// Initialize
// ----------------------------
Logger.reset(true);
