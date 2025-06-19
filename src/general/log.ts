import { existsSync, readFileSync, truncateSync } from "fs";

/**
 * Controls logging related to testing
 */
export class Log {

    // Stack tracer uses this to identify first item on stack NOT to be in log.ts
    // so report accuratly identifies source of logging.
    private static defaultLogPath = 'controlium-utils/src/general/log.ts';
    private static defaultLogToConsole = true;
    private static defaultStepEndScreenshot = false;
    private static logPath = this.defaultLogPath;
    private static defaulVideoWidth = 320;
    private static defaultVideoHeight = 180;
    private static defaultThrowErrorIfLogOutputFails = false;


    /** Keep track of time first call to logger made NOT resetable...*/
    private static startTime = new Date().getTime();

    private static _loggingCurrentLevel: Log.LogLevels;
    private static _logToConsole = this.defaultLogToConsole;
    private static _stepEndScreenshot = this.defaultStepEndScreenshot;

    private static _logOutputCallback: Log.LogOutputCallbackSignature | undefined = undefined;

    private static _videoWidth = this.defaulVideoWidth;
    private static _videoHeight = this.defaultVideoHeight;

    private static _throwErrorIfLogOutputFails = this.defaultThrowErrorIfLogOutputFails;

    public static reset() {
        this.logPath = this.defaultLogPath;
        this._logToConsole = this.defaultLogToConsole;
        this._stepEndScreenshot = this.defaultStepEndScreenshot;
        this._videoWidth = this.defaulVideoWidth;
        this._videoHeight = this.defaultVideoHeight;
        this._throwErrorIfLogOutputFails = this.defaultThrowErrorIfLogOutputFails
    }


    /**
     * Gets current logging level text.
     * @remarks
     * Lowest is Error (5) with minimum logging, Highest is FrameworkDebug (1) with most verbose output
     * @returns
     * Current logging level
     */
    public static get loggingCurrentLevelText(): string {
        if (this._loggingCurrentLevel != Log.LogLevels.NoOutput && this._loggingCurrentLevel > Log.LogLevels.FrameworkDebug) {
            return `Special Level - (${this._loggingCurrentLevel})]`
        }
        switch (this._loggingCurrentLevel) {
            case Log.LogLevels.FrameworkDebug:
                return 'Framework debug (FKDBG)';
            case Log.LogLevels.FrameworkInformation:
                return 'Framework information (FKINF)';
            case Log.LogLevels.TestDebug:
                return 'Test debug (TSDBG)';
            case Log.LogLevels.TestInformation:
                return 'Test information (TSINF)';
            case Log.LogLevels.Error:
                return 'Errors only (ERROR)';
            case Log.LogLevels.NoOutput:
                return 'No output from Log (NOOUT)'
            default:
                return 'Unknown!';
        }
    }

    /**
     * Gets current logging level.
     *
     * @remarks
     * Lowest is Error (1) with minimum logging, Highest is FrameworkDebug (5) with most verbose output
     * @returns {@link Log.LogLevels | Current loggin level}
     */
    public static get loggingCurrentLevel(): Log.LogLevels {
        return this._loggingCurrentLevel;
    }

    /**
     * Sets current logging level.
     *
     * @remarks
     * Lowest is Error (1) with minimum logging, Highest is FrameworkDebug (0) with most verbose output
     * Zero is special-case and NOT ALLOWED to be set (all Log generated messages are level zero and always
     * written to output).
     */
    public static set loggingCurrentLevel(requiredLevel: Log.LogLevels | string) {
        if (typeof requiredLevel == 'string') {
            switch ((requiredLevel as string).toLowerCase().replace(' ', '')) {
                case 'frameworkdebug':
                case 'fkdbg': {
                    this._loggingCurrentLevel = Log.LogLevels.FrameworkDebug;
                    break;
                }
                case 'frameworkinformation':
                case 'fkinf': {
                    this._loggingCurrentLevel = Log.LogLevels.FrameworkInformation;
                    break;
                }
                case 'testdebug':
                case 'tsdbg': {
                    this._loggingCurrentLevel = Log.LogLevels.TestDebug;
                    break;
                }
                case 'testinformation':
                case 'tsinf': {
                    this._loggingCurrentLevel = Log.LogLevels.TestInformation;
                    break;
                }
                case 'error': {
                    this._loggingCurrentLevel = Log.LogLevels.Error;
                    break;
                }
                case 'nooutput':
                case 'noout': {
                    this._loggingCurrentLevel = Log.LogLevels.NoOutput;
                    break;
                }
                default: {
                    this._loggingCurrentLevel = Log.LogLevels.FrameworkDebug;
                    Log.writeLine(0, `Unknown Log Level [${requiredLevel}]. Defaulting to Framework Debug!`);
                }
            }
        } else {
            if (typeof requiredLevel === 'number' && requiredLevel > 0 && Number.isInteger(requiredLevel)) {
                this._loggingCurrentLevel = requiredLevel;
            }
            else {
                this._loggingCurrentLevel = Log.LogLevels.FrameworkDebug;
                Log.writeLine(0, `Invalid Log Level [${Number(requiredLevel)}] (Must be integer greater than zero). Defaulting to Framework Debug!`);
            }
        }
    }

    /**
     * Sets Test Step screenshot indicator.
     * 
     * Note. Log does NOTHING with given flag.  It is just a global
     * flag that consumers can use to discover if THEY shouldf take
     * screenshots ot not. 
     */
    public static set screenshotSteps(setting: boolean) {
        this._stepEndScreenshot = setting;
    }

    /**
     * Returns whether screenshot should be taken at end of every test step
     * 
     * Consumer must have already set {@link Log.screenshotSteps | flag} (defaults
     * to false) as required. 
     */
    public static get screenshotSteps(): boolean {
        return this._stepEndScreenshot;
    }

    /**
     * Indicates if logging to console
     *
     * @remarks
     * true - log data is being written to STDOUT (Console)
     * false - no log data is written to STDOUT (Console) unless no callback defined where setting
     *         is ignored and log is written to STDOUT.
     * 
     * If no console logging is required, logToConsole must be false AND logOutputCallback callback defined
     */
    public static get logToConsole(): boolean {
        return this._logToConsole;
    }

    /**
     * Indicate if logging to console is required
     *
     * @remarks
     * true - log data is written to STDOUT (Console)
     * false - no log data is written to STDOUT (Console) unless no callback defined where setting
     *         is ignored and log is written to STDOUT.
     * 
     * If no console logging is required, logToConsole must be false AND logOutputCallback callback defined
     */
    public static set logToConsole(consoleLogging: boolean) {
        this._logToConsole = consoleLogging;
    }

    /**
     * Indicate if an error should be thrown if an error is returned from log output
     * callback.
     *
     * @remarks
     * true - if log output callback throws an error Log will propagate that error and throw error
     *        from Log method called.
     * false - if log output callback throws an error, Log will ensure error is reported but consume
     *         the error allowing testing to continue.
     * 
     */
    public static set throwErrorIfLogOutputFails(throwError: boolean) {
        this._throwErrorIfLogOutputFails = throwError;
    }

    /**
     * Indicates if an error should be thrown if an error is returned from log output
     * callback.
     *
     * @remarks
     * true - if log output callback throws an error Log will propagate that error and throw error
     *        from Log method called.
     * false - if log output callback throws an error, Log will ensure error is reported but consume
     *         the error allowing testing to continue.
     * 
     */
    public static get throwErrorIfLogOutputFails(): boolean {
        return this._throwErrorIfLogOutputFails;
    }

    /**
     * Sets callback log messages are written to
     */
    public static set logOutputCallback(callback: Log.LogOutputCallbackSignature) {
        this._logOutputCallback = callback;
    }

    /**
     * Clears Log output callback.  Any further Log output is
     * directed to stdout
     */
    public static clearOutputCallback() {
        this._logOutputCallback = undefined;
    }

    /**
     * Sets dimensions of any video window in results rendering.
     * 
     * Both `height` and `width` are optional.
     * - If **both** are provided, both must be valid numbers within allowed ranges; otherwise, neither is set.
     * - If only one is provided and valid, only that dimension is updated.
     * 
     * Valid ranges:
     * - `height`: 180 to 4320 pixels
     * - `width`: 320 to 7680 pixels
     * 
     * Invalid values are ignored and logged as errors.
     * 
     * Default is (width/height) 320x180
     * 
     * @param res Object containing optional `height` and/or `width` properties.
     * @param [res.height] Video height in pixels (optional).
     * @param [res.width] Video width in pixels (optional).
     */
    public static get videoResolution(): { height: number, width: number } {
        return { height: this._videoHeight, width: this._videoWidth };
    }
    public static set videoResolution(res: { height?: number, width?: number }) {

        const isValidNumber = (val: unknown, min: number, max: number): boolean =>
            (val === undefined) || (typeof val === "number" && Number.isFinite(val) && val >= min && val <= max);

        const heightGood = isValidNumber(res.height, 180, 4320);
        const widthGood = isValidNumber(res.width, 320, 7680);


        if (!heightGood) {
            Log.writeLine(Log.LogLevels.Error, `Invalid video window height [${res.height}]: must be number between 180 and 4320. Height (& Width if set) ignored`);
        }

        if (!widthGood) {
            Log.writeLine(Log.LogLevels.Error, `Invalid video window width [${res.width}]: must be number between 320 and 7680. Width (& Height if set) ignored`);
        }

        // Only set height/width if both valid.  If either invalid ignore and dont set
        if (heightGood && widthGood) {
            this._videoHeight = res.height ?? this._videoHeight;
            this._videoWidth = res.width ?? this._videoWidth;
        }
    }
    /**
     * Sends screenshot to log output callback encoded as base64 PNG image.
     *
     * If `screenshot` is string, it is assumed to be raw data and converted to base64 string.
     * If it is Buffer, it is directly converted to base64.
     *
     * Screenshot only written if specified log level is enabled and log output callback is configured.
     * Any errors thrown by callback are caught and logged internally.
     *
     * @param logLevel - logging level required to emit this output.
     * @param screenshot - screenshot data, either as Buffer or raw string.
     *
     * @example
     * // Using Buffer
     * Log.attachScreenshot(Log.LogLevels.FrameworkDebug, bufferContainingScreenshot);
     *
     * // Using string
     * Log.attachScreenshot(Log.LogLevels.FrameworkDebug, rawScreenshotString);
     *
     * @since 1.0.0
     */
    public static attachScreenshot(logLevel: Log.LogLevels, screenshot: Buffer | string) {
        if (this.logLevelOk(logLevel)) {
            if (typeof screenshot == 'string') {
                screenshot = Buffer.from(screenshot).toString("base64");
            } else {
                screenshot = screenshot.toString("base64");
            }
            this.attach(logLevel, screenshot, 'base64:image/png');
        }
    }


    /**
     * Writes HTML string to log output if specified log level is enabled and log output callback is configured.
     *
     * This method first validates HTML string using parser. If HTML is invalid,
     * an error is logged.
     * 
     * If valid, it passes given HTML string to configured log output callback.
     *
     * Any error thrown by callback is caught and logged.
     *
     * @param logLevel - logging level required to emit this output.
     * @param htmlString - HTML string to log. Will only be used if it is valid and log level is sufficient.
     *
     * @example
     * Log.attachHTML(Log.LogLevels.TestDebug, "<div><b>Hello!</b></div>");
     *
     * @since 1.0.0
     */
    public static attachHTML(logLevel: Log.LogLevels, htmlString: string) {
        this.attach(logLevel, htmlString, 'text/html');
    }

    /**
     * Attaches video to log output, reading from given file path.
     * 
     * If given `logLevel` is enabled for output, attempts to read file at `videoFilePath` into buffer
     * and passes it to {@link Log.attachVideo}. If file read fails, logs error and returns without attaching.
     * 
     * @param logLevel - log level to use for determining whether video should be attached.
     * @param videoFilePath - path to video file to read and attach.
     * @param options - Optional settings for how video should be rendered in output (codec, dimensions, etc.).
     * 
     * @since 1.0.0
     */
    public static attachVideoFile(logLevel: Log.LogLevels, videoFilePath: string, options: Log.VideoOptions = {}) {
        if (this.logLevelOk(logLevel)) {
            let videoBuffer: Buffer;
            try {
                videoBuffer = readFileSync(videoFilePath);
            }
            catch (err) {
                const errText = `Error thrown reading video data from given file path:-\n${(err as Error).message}`;
                this.processError(errText);
                return;
            }
            this.attachVideo(logLevel, videoBuffer, options);
        }
    }

    /**
     * Attaches video to log output if log level at or below current logging
     *
     * Encodes video buffer as base64 data URL and outputs it as an HTML5 video element.
     *
     * 
     * @param logLevel - log level to check if video output should be written.
     * @param video - video data buffer to be encoded and attached.
     * @param options - Optional parameters to customize video output.
     * @param options.videoCodec - codec of video, used in MIME type (default = webm).
     * @param options.videoWidth - Width of video element in pixels (default = {@link Log.videoResolution | videoWidth set or 320}).
     * @param options.videoHeight - Height of video element in pixels (default = {@link Log.videoResolution | videoHeight set or 180}).
     * 
     * @since 1.0.0
     */
    public static attachVideo(logLevel: Log.LogLevels, video: Buffer, options: Log.VideoOptions = {}) {
        const {
            videoCodec = "webm",
            width = this._videoWidth,
            height = this._videoHeight
        } = options;

        const videoSourceString = `data:video/${videoCodec};base64,` + video.toString("base64");
        const videoStringNoData = `<video controls width="${width}" height="${height}"><source src=` + '"<Video Data>"' + ` type="video/${videoCodec}">Video (Codec ${videoCodec}) not supported by browser</video>`;
        const videoString = videoStringNoData.replace('<Video Data>', videoSourceString);
        this.attach(logLevel, videoString, `text/html`);
    }

    /**
     * Writes data string and mediaType to log output if specified log level is enabled and log output callback is configured.
     *
     * If valid, it passes given HTML string to configured log output callback.
     *
     * Any error thrown by callback is caught and logged
     *
     * @param logLevel - logging level required to emit this output.
     * @param htmlString - HTML string to log. Will only be used if it is valid and log level is sufficient.
     *
     * @example
     * Log.attachHTML(Log.LogLevels.TestDebug, "<div><b>Hello!</b></div>");
     *
     * @since 1.0.0
     */
    public static attach(logLevel: Log.LogLevels, dataString: string, mediaType: string) {
        const processString = (stringToProcess: string): string => {
            if (typeof stringToProcess !== 'string') {
                return `<Not a string! Is type ${typeof stringToProcess}>`
            }
            if (stringToProcess.length > 30) {
                return stringToProcess.slice(0, 25) + '...' + stringToProcess.slice(-3);
            } else {
                return stringToProcess;
            }
        };
        if (this.logLevelOk(logLevel)) {
            if (typeof this._logOutputCallback === 'function') {
                try {
                    this._logOutputCallback(dataString, mediaType);
                }
                catch (err) {
                    const errText = `Error thrown from Log Output Callback:-\n${(err as Error).message}\nwhen called with data string:-\n${processString(dataString)}\nand mediaType:-\n${processString(mediaType)}`;
                    this.processError(errText);
                }
            } else {
                Log.writeLine(0, `Log Output callback is type [${typeof this._logOutputCallback}].  Must be type [function].  No attach performed.`);
            }
        }
    }

    public static writeLine(
        logLevel: Log.LogLevels,
        textString: string,
        options: Log.WriteLineOptions = {}
    ) {
        const {
            maxLines = 55,
            suppressMultilinePreamble = false,
            suppressAllPreamble = false
        } = options;
        const stackObj: unknown = {};

        // Get the stack trace (before this was called) so we can tell reader who called us if needed 
        Error.captureStackTrace(stackObj as object, this.writeLine);
        const stack = (stackObj as Error)?.stack ?? '[Unknown]';
        const callingMethodDetails = this.callingMethodDetails(stack);

        if (!stack.includes('.doWriteLine')) {
            const normalizedMaxLines = maxLines < 1 ? 1 : maxLines;
            const textArray = textString.split(/\r?\n/);
            let isFirstLine = true;
            textArray.forEach((line: string, index: number) => {
                if (textArray.length <= normalizedMaxLines
                    || (index < normalizedMaxLines - 2)
                    || (index == textArray.length - 1)
                ) {
                    this.doWriteLine(!(suppressAllPreamble || (suppressMultilinePreamble && !isFirstLine)), callingMethodDetails, logLevel, line);
                } else if (index == normalizedMaxLines - 2) {
                    this.doWriteLine(!(suppressAllPreamble || (suppressMultilinePreamble && !isFirstLine)), callingMethodDetails, logLevel,
                        `... (Skipping some lines as total length (${textArray.length}) > ${normalizedMaxLines}!!)`,
                    );
                }
                isFirstLine = false;
            });
        }
    }

    private static doWriteLine(
        doPreamble: boolean,
        callingMethodDetails: string,
        logLevel: Log.LogLevels,
        textString: string,
    ): void {
        if (this.logLevelOk(logLevel)) {

            const callBackGood = typeof this._logOutputCallback === 'function';
            const preAmble = doPreamble ? this.getPreAmble(callingMethodDetails, logLevel) : "";
            const textToWrite = preAmble + textString;
            let doneConsoleWrite = false;
            let doneCallbackWrite = false;

            // If user wants to write to console do it
            if (this.logToConsole) {
                console.log(textToWrite);
                doneConsoleWrite = true;
            }

            if (callBackGood) {
                // Note.  We know 
                this._logOutputCallback!(textToWrite);
                doneCallbackWrite = true;
            }

            if (!doneConsoleWrite && !doneCallbackWrite) {
                console.log(textToWrite);
            }
        }
    }

    private static getPreAmble(methodBase: string, typeOfWrite: Log.LogLevels) {
        const writeType = this.getWriteTypeString(typeOfWrite);
        const date = new Date();
        const timeStamp = date.toTimeString().split(' ')[0];
        const elapsedTime = this.msToHMS(new Date().getTime() - this.startTime);
        const preAmble = `${writeType} - [${timeStamp}][${elapsedTime}] [${methodBase}]: `;
        return preAmble;
    }

    private static pad(num: number | string, requiredMinimumLength: number): string {
        let numString = typeof num == "number" ? num.toString() : num;
        while (numString.length < requiredMinimumLength) numString = "0" + numString;
        return numString;
    }
    private static msToHMS(milliSeconds: number): string {
        const wholeDays = Math.floor(milliSeconds / 86400000);
        const date = new Date(milliSeconds - wholeDays * 86400000);
        const hours = wholeDays * 24 + date.getUTCHours();

        return `${this.pad(hours, ("" + hours).length > 2 ? ("" + hours).length : 2)}:${this.pad(date.getUTCMinutes(), 2)}:${this.pad(
            date.getUTCSeconds(),
            2
        )}.${Math.round(date.getUTCMilliseconds() / 100)}`;
    }

    private static getWriteTypeString(levelOfWrite: Log.LogLevels): string {
        switch (levelOfWrite) {
            case Log.LogLevels.Error:
                return 'ERROR';
            case Log.LogLevels.FrameworkDebug:
                return 'FKDBG';
            case Log.LogLevels.FrameworkInformation:
                return 'FKINF';
            case Log.LogLevels.TestDebug:
                return 'TSDBG';
            case Log.LogLevels.TestInformation:
                return 'TSINF';
            default: {
                if (levelOfWrite === 0) return 'LOG  ';
                return this.pad(levelOfWrite, 5);
            }
        }
    }

    private static callingMethodDetails(methodBase: string) {
        let methodName = '<Unknown>';
        let typeName = '';

        if (methodBase) {
            const methodBaseLines = methodBase.split('\n');
            if (methodBaseLines.length > 1) {
                let indexOfFirstNonLogLine = methodBaseLines.slice(1).findIndex(item => !item.includes(this.logPath));
                indexOfFirstNonLogLine = indexOfFirstNonLogLine === -1 ? 1 : indexOfFirstNonLogLine + 1;
                methodName = methodBaseLines[indexOfFirstNonLogLine].replace(/\s\s+/g, ' ').trim();
                if (methodName.startsWith('at ')) {
                    const tempA = methodName.split(' ');
                    methodName = tempA.slice(0, 1).concat([tempA.slice(1).join(' ')])[1];
                    if (
                        methodName.includes('/') &&
                        methodName.includes(':') &&
                        methodName.includes(')')
                    ) {
                        typeName = methodName
                            .split('/')
                        [methodName.split('/').length - 1].split(')')[0];
                    }
                    methodName = methodName.split(' ')[0];
                }
            }
        }
        return `${methodName}${typeName == '' ? '' : `(${typeName})`}`;
    }

    /**
     * Determines if provided log level is sufficient to write output.
     *
     * Compares given log level against current logging level and
     * returns whether output should be logged.
     *
     * @param {Log.LogLevels | number} passedInLogLevel - log level to check.
     * @returns {boolean} True if output should be logged at this level; false to suppress output.
     */
    private static logLevelOk(passedInLogLevel: Log.LogLevels | number) {
        return passedInLogLevel === Log.LogLevels.NoOutput ? false : passedInLogLevel <= Log._loggingCurrentLevel;
    }

    private static processError(errorText: string) {
        if (this._throwErrorIfLogOutputFails) {
            throw new Error(errorText)
        } else {
            Log.writeLine(this.LogLevels.Error, errorText, { suppressMultilinePreamble: true });
        }
    }
}

export namespace Log {
    /**
     * Level for logging output
     * 
     * Ranges from {@link Log.LogLevels.NoOutput | NoOutput - All Logging out suppressed} to {@link Log.LogLevels.FrameworkDebug | FrameworkDebug - Maximum output}
     * 
     * @since 1.0.0
     * @see Log
     */
    export enum LogLevels {
        /** Data written to log if LoggingLevel is FrameworkDebug and LogException is FrameworkDebug or higher */
        FrameworkDebug = 5,
        /** Data written to log if LoggingLevel is FrameworkInformation and LogException is FrameworkInformation or higher */
        FrameworkInformation = 4,
        /** Data written to log if LoggingLevel is TestDebug and LogException is TestDebug or higher */
        TestDebug = 3,
        /** Data written to log if LoggingLevel is TestInformation and LogException is TestInformation or Error */
        TestInformation = 2,
        /** Data always written to results */
        Error = 1,
        /** No output to log even if an error occures */
        NoOutput = Number.MAX_SAFE_INTEGER,
    }

    export interface VideoOptions {
        videoCodec?: string;
        width?: number;
        height?: number;

    }
    export interface WriteLineOptions {
        maxLines?: number;
        suppressMultilinePreamble?: boolean;
        suppressAllPreamble?: boolean
    }

    export interface LogOutputCallbackSignature {
        (message: string, mediaType?: string): void;
    }
}

// Set the default Logging level.
Log['_loggingCurrentLevel'] = Log.LogLevels.FrameworkDebug;
