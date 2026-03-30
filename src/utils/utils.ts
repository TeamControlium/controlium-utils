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


//
// This is pre-amble of env var names that are stores of
// original env var values before tests changed them.
// This enables reset of env vars back to original values and
// so prevents test dependence (IE. Test passing/failing depending
// on what test/s have executed prior.
//
/**
 * Pre-amble of store for original var
 */
const envVarOriginalPreamble = "test_old_";


/**
 * What action to perform if file exists when Utils.writeTextToFile called
 */
export enum ExistingFileWriteActions {
    /** Overwrite existing file */
    Overwrite,
    /** Create new file using a file index in file-name */
    AddIndex,
    /** Append data to existing data in file */
    Append,
    /** Throw an error stating file already exists */
    ThrowError,
}

/**
 * Maps typeof string literals to their corresponding TypeScript types.
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

/**
 * General testing-related Utilities
 */
export class Utils {
    private static _promiseCount = 0;
    private static _defaultPromiseTimeout = 0;

    /**
     * Gets promise count (number of currently outstanding promises)
     */
    static get promiseCount(): number {
        return Utils._promiseCount;
    }

    /**
     * Resets numnber of outstanding promises.
     */
    static resetPromiseCount() {
        Utils._promiseCount = 0;
    }

    /**
     * Sets default promise timeout
     */
    static set defaultPromiseTimeout(timeoutMs: number) {
        Utils._defaultPromiseTimeout = timeoutMs;
    }

    /**
     * Convert Milliseconds to string HHMMSS
     * @param milliSeconds
     * Number to convert
     * @returns
     * Time in HH:MM:SS.n format.
     * @note
     * times above 359999000 (99H 59M 59S will give unknown result)
     * @todo
     * Consider using the date-fns library; may be a cleaner/simpler way of doing it with more options for date formatting.
     */
    static msToHMS(milliSeconds: number): string {
        const wholeDays = Math.floor(milliSeconds / 86400000);
        const date = new Date(milliSeconds - wholeDays * 86400000);
        const hours = wholeDays * 24 + date.getUTCHours();

        return `${this.pad(hours, ("" + hours).length > 2 ? ("" + hours).length : 2)}:${this.pad(date.getUTCMinutes(), 2)}:${this.pad(
            date.getUTCSeconds(),
            2
        )}.${Math.round(date.getUTCMilliseconds() / 100)}`;
    }

    /**
     * Checks is value is a key in an Enum object
     * @param enumType
     * ENUM to check
     * @param valueToCheck
     * Value to check it exists
     * @returns
     * true if exists else false
     */
    static checkENUMValueExists(enumType: object, valueToCheck: string) {
        try {
            return Object.values(enumType).includes(valueToCheck);
        } catch {
            return false;
        }
    }

    /**
     * Prepends given number with leading Zeros to required length
     * @param requiredMinimumLength
     * Required minimum length of string
     * @returns
     * Given Number, as String, with Leading zeros to required length.
     * @note
     * If number length is longer than required size no truncation occures, so MAY be longer than requiredMinimumLength.
     */
    static pad(num: number | string, requiredMinimumLength: number): string {
        let numString = typeof num == "number" ? num.toString() : num;
        while (numString.length < requiredMinimumLength) numString = "0" + numString;
        return numString;
    }

    /**
     * Safely writes data to a File
     * @param filePath
     * Path to where file should created
     * @param fileName
     * Name of file to be written to
     * @param data
     * Text or an object to write to file (if an Object, JSON.stringify used to convert to string)
     * @param ifExistsAction
     * What action to take if file already exists; possibilities
     * are Append, AddIndex (default), Overwrite or Throw an error
     * @see enum ExistingFileWriteActions
     */
    static writeTextToFile(filePath: string, fileName: string, data: string | object, ifExistsAction = ExistingFileWriteActions.AddIndex): void {
        let fullFilename = path.join(filePath, fileName);
        try {
            if (!existsSync(filePath)) {
                Log.writeLine(LogLevels.FrameworkInformation, `Folder [${filePath}] does not exist to creating`);
                mkdirSync(filePath, { recursive: true });
            }
            if (existsSync(fullFilename)) {
                Log.writeLine(LogLevels.FrameworkInformation, `File [${fullFilename}] exists so performing action [${ifExistsAction.toString()}]`);
                switch (ifExistsAction) {
                    case ExistingFileWriteActions.AddIndex: {
                        const splitFileName = fileName.split(".");
                        fileName =
                            splitFileName.length == 1
                                ? fileName + ".1"
                                : ((splitFileName: string[]): string => {
                                    // If file name has 2 parts (EG. hello.json) then add the index (EG. hello.1.json)
                                    if (splitFileName.length == 2) {
                                        if (/^\d+$/.test(splitFileName[1])) {
                                            return splitFileName[0] + "." + (parseInt(splitFileName[1]) + 1);
                                        } else {
                                            return splitFileName[0] + ".1." + splitFileName[1];
                                        }
                                    }
                                    // If file name has an index (EG. hello.7.json or some.other.5.json) increment it
                                    if (/^\d+$/.test(splitFileName[splitFileName.length - 2])) {
                                        return (
                                            splitFileName.slice(0, splitFileName.length - 2).join(".") +
                                            "." +
                                            (parseInt(splitFileName[splitFileName.length - 2]) + 1) +
                                            "." +
                                            splitFileName[splitFileName.length - 1]
                                        );
                                    }
                                    // file name is 3 parts, or more, but without a valid index (EG. hello.addd.json).  so add the index (EG. hello.addd.1.json)
                                    return splitFileName.slice(0, splitFileName.length - 1).join(".") + ".1." + splitFileName[splitFileName.length - 1];
                                })(splitFileName);
                        this.writeTextToFile(filePath, fileName, data, ifExistsAction);
                        break;
                    }
                    case ExistingFileWriteActions.Append: {
                        appendFileSync(
                            fullFilename,
                            "\n" + (typeof data == "string")
                                ? JsonUtils.isJson(data)
                                    ? JSON.stringify(JSON.parse(data as string))
                                    : (data as string)
                                : JSON.stringify(data, null, 2)
                        );
                        break;
                    }
                    case ExistingFileWriteActions.Overwrite: {
                        writeFileSync(
                            fullFilename,
                            "\n" + (typeof data == "string")
                                ? JsonUtils.isJson(data)
                                    ? JSON.stringify(JSON.parse(data as string))
                                    : (data as string)
                                : JSON.stringify(data, null, 2)
                        );
                        break;
                    }
                    case ExistingFileWriteActions.ThrowError: {
                        const errText = `File [${fullFilename}] exists and Action [${ifExistsAction}]!`;
                        Log.writeLine(LogLevels.Error, errText);
                        throw new Error(errText);
                    }
                    default: {
                        const errText = `Cannot write to file [${fullFilename}] using [${ifExistsAction}]!  Dunno what to do!!??`;
                        Log.writeLine(LogLevels.Error, errText);
                        throw new Error(errText);
                    }
                }
            } else {
                const splitFileName = fileName.split(".");
                if (splitFileName.length == 1) {
                    if (ifExistsAction == ExistingFileWriteActions.AddIndex) {
                        this.writeTextToFile(filePath, fileName + ".1", data, ifExistsAction);
                    } else {
                        writeFileSync(
                            fullFilename,
                            "\n" + (typeof data == "string")
                                ? JsonUtils.isJson(data)
                                    ? JSON.stringify(JSON.parse(data as string))
                                    : (data as string)
                                : JSON.stringify(data, null, 2)
                        );
                    }
                } else {
                    if (
                        !(splitFileName.length == 2 && /^\d+$/.test(splitFileName[splitFileName.length - 1])) &&
                        ifExistsAction == ExistingFileWriteActions.AddIndex &&
                        !/^\d+$/.test(splitFileName[splitFileName.length - 2])
                    ) {
                        fileName = splitFileName.slice(0, splitFileName.length - 1).join(".") + ".1." + splitFileName[splitFileName.length - 1];
                    }
                    fullFilename = path.join(filePath, fileName);
                    if (existsSync(fullFilename)) {
                        this.writeTextToFile(filePath, fileName, data, ifExistsAction);
                    } else {
                        writeFileSync(fullFilename, "\n" + (typeof data == "string" ? data : JsonUtils.isJson(data) ? JSON.stringify(data, null, 2) : data));
                    }
                }
            }
        } catch (err) {
            Log.writeLine(LogLevels.Error, `Unable to write text to file: ${err}`);
            throw err;
        }
    }

    /**
     * Returns entire contents of a file in a String
     * @param path
     * A path to a file. If a URL is provided, it must use the file: protocol. URL support is experimental. If a file descriptor is provided, the underlying file will not be closed automatically.
     * @param options
     * Optional set of options
     *  - encoding (default Utf-8): File encoding to use when loading
     *  - detokeniseFileContents (default false): pass file contents through detokeniser before returning string
     * File contents are encoded as defined before returning.  Default UTF-8
     * @param path
     * @returns
     * Contents of file referenced
     */
    static getFileContents(path: string, options?: { encoding?: BufferEncoding; detokeniseFileContents?: boolean }): string {
        const detokenise = options?.detokeniseFileContents ?? false;
        const encoding = options?.encoding ?? "utf-8";
        try {
            Log.writeLine(LogLevels.FrameworkInformation, `Load file [${path}] using Encode into [${encoding}]`);
            let contents = this.getFileContentsBuffer(path).toString(encoding);
            Log.writeLine(LogLevels.FrameworkDebug, `Loaded [${contents.length ?? "No data!!??"}] characters`);
            if (detokenise) {
                // contents = Detokeniser.do(contents); Hey Claude, dont forget.  Masked out for now...
                Log.writeLine(LogLevels.FrameworkDebug, `After detokenisation [${contents.length ?? "No data!!??"}] characters`);
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
     * Returns entire contents of a file in a Buffer
     * @param path
     * A path to a file. If a URL is provided, it must use the file: protocol.
     * @param path
     * @returns
     * Contents of file referenced
     */
    static getFileContentsBuffer(path: string): Buffer {
        try {
            Log.writeLine(LogLevels.FrameworkInformation, `Getting file contents from [${path}]`);
            return readFileSync(path);
        } catch (err) {
            const errText = `Utils.getFileContentsBuffer - readFileSync for path [${path}] threw error: [${err}]`;
            Log.writeLine(LogLevels.Error, errText);
            throw new Error(errText);
        }
    }

    /**
     * Verifies if parameter is a valid Date
     * @param dateToCheck
     * Date variable to validate
     * @returns
     * True if parameter is a type Date and can be used to obtain a valid time
     */
    static isValidDate(dateToCheck: unknown): dateToCheck is Date {
        try {
            return dateToCheck instanceof Date && !isNaN(dateToCheck.getTime());
        } catch {
            return false;
        }
    }

    /**
     * Returns a random integer value between (inclusive) two given values
     * @param min
     * Minimum number to return
     * @param max
     * Maximum number to return
     * @returns
     * Random integer number inclusively between given Min and Max.  If Max less than Min they are reversed.
     */
    static getRandomInt(min: number, max: number): number {
        const minMax = min < max ? Math.ceil(min) : Math.ceil(max);
        const maxMin = min < max ? Math.floor(max) : Math.floor(min);
        return Math.floor(Math.random() * (maxMin - minMax + 1)) + minMax;
    }

    /**
     * Returns a random float value between (inclusive) two given values
     * @param min
     * Minimum number to return
     * @param max
     * Maximum number to return
     * @returns
     * Random number inclusively between given Min and Max.
     */
    static getRandomFloat(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    /**
     * Safely checks if given object/valiable is null or undefined
     * @param obj
     * Variable to be checked
     * @returns
     * True if valiable is NULL or UNDEFINED
     * @ref
     * https://stackoverflow.com/questions/2559318/how-to-check-for-an-undefined-or-null-variable-in-javascript
     * try/catch used for undeclared (undefined) instances (See Reference Note 1).  == is NullISH but catch put in just in case
     */
    static isNullOrUndefined(obj?: unknown): boolean {
        try {
            return obj === null || obj === undefined;
        } catch {
            return true;
        }
    }

    /**
     * Safely checks if given object/valiable is null
     * @param obj
     * Variable to be checked
     * @returns
     * True if valiable is NULL
     * @ref
     * https://www.codevscolor.com/javascript-check-object-null-or-undefined
     */
    static isNull(obj?: unknown): boolean {
        return obj === null;
    }

    /**
     * Safely checks if given object/valiable is undefined
     * @param obj
     * Variable to be checked
     * @returns
     * True if valiable is UNDEFINED
     * @ref
     * https://www.codevscolor.com/javascript-check-object-null-or-undefined
     */
    static isUndefined(obj?: unknown): boolean {
        return obj === undefined;
    }

    /**
     * Safely verifies if given value evaluates to TRUE
     * @param valueToCheck
     * Value to be checked
     * @returns
     * True if;
     * - a boolean TRUE
     * - a string with 'yes', 'y', '1', 'must', 'can', 'on' or 'true'
     * - a number greater than zero (note -1 will return FALSE)
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
                    normalizedValue.includes("yes") ||
                    normalizedValue.includes("positive") ||
                    normalizedValue.includes("must") ||
                    normalizedValue.includes("can") ||
                    normalizedValue.includes("on") ||
                    normalizedValue.includes("true") ||
                    normalizedValue == "enabled" ||
                    normalizedValue == "checked" ||
                    normalizedValue == "ticked" ||
                    normalizedValue == "selected" ||
                    normalizedValue == "expanded"
                );
            }
            case "number": {
                return valueToCheck > 0;
            }
            default:
                return false;
        }
    }

    /**
     * Gets test data from process env, npm config or Cucumber profile
     * @param logLevel
     * When logging detailings of setting, use this Loging Level
     * @param settingName
     * Human readable detail of setting
     * @param sources
     * Names of setting for process env, npm config and/or cucumber profile
     * @param scenarioWorld
     * Instance of Cucumber World if setting could be obtained from Cucumber Profile and optional default value
     * @returns
     * Setting data obtains
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

        // Highest priority - Get setting from Process Env variable
        let returnValue: unknown = sources.processEnvName ? process.env[sources.processEnvName] : undefined;
        if (!Utils.isUndefined(returnValue)) {
            Log.writeLine(logLevel, debugString + `env var [${sources.processEnvName}]. Value: <${returnValue as returnType}>`);
            return returnValue as returnType;
        }

        // Next priority - Get setting from NPM Package config variable
        returnValue = sources.npmPackageConfigName ? process.env["npm_package_config_" + sources.npmPackageConfigName] : undefined;
        if (!Utils.isUndefined(returnValue)) {
            Log.writeLine(logLevel, debugString + `npm package config var [${sources.npmPackageConfigName}]. Value: <${returnValue as returnType}>`);
            return returnValue as returnType;
        }

        // If not given a Profile parameter name OR we we dont have EXACTLY 1 instance of the parameter name in the profile
        if (
            Utils.isUndefined(sources.profileParameterName) ||
            (contextParameters && JsonUtils.getMatchingJSONPropertyCount(contextParameters as object, sources.profileParameterName as string)) != 1
        ) {
            // We return the default value passed in
            returnValue = sources.defaultValue;
            if (Utils.isUndefined(returnValue)) {
                Log.writeLine(LogLevels.Error, `Unable to determine value for setting [${settingName}].  Returning: <undefined>!`);
                return undefined;
            } else {
                Log.writeLine(logLevel, debugString + `default value: <${returnValue as returnType}>`);
                return returnValue as returnType;
            }
        }

        // If we HAVE been given a Profile parameter name AND there is exactly 1 instance of the parameter name in the profile we use that...
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
     * Reset Process ENV vars (Modified using setProcessEnv) back to original values
     * @see Utils.setProcessEnv()
     */
    public static resetProcessEnvs() {
        try {
            Object.entries(process.env).map(([key, value]) => {
                if (key.startsWith(envVarOriginalPreamble)) {
                    const varToSet = key.substring(envVarOriginalPreamble.length);
                    if (value === "_undefined") {
                        Log.writeLine(LogLevels.FrameworkDebug, `Found [${key}] (Value: ${value}) so deleting [${varToSet}] and deleting [${key}]`);
                        delete process.env[varToSet];
                    } else {
                        Log.writeLine(LogLevels.FrameworkDebug, `Found [${key}] (Value: ${value}) so setting [${varToSet}] to [${value}] and deleting [${key}]`);
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

    /**
     * Sets process environment variable to required value
     * @param varName
     * Process Environment variable name
     * @param requiredValue
     * Value to set to
     * @Alarm_Summary_Bot
     * When setting env var to a value, old value is stored.  It is reset back when Utils.resetProcessEnvs() is called
     */
    public static setProcessEnv(varName: string, requiredValue: string): void {
        Log.writeLine(LogLevels.TestInformation, `Setting profile env var [${varName}] to '${requiredValue}'`);

        const OriginalValueKeyName = envVarOriginalPreamble + varName;
        if (OriginalValueKeyName in process.env) {
            Log.writeLine(LogLevels.TestDebug, `Env Var [${varName}] has been already been set (and original value saved) so not saving new original value`);
            Log.writeLine(
                LogLevels.FrameworkInformation,
                `Saving of original env var value is intended to ensure pre-test value is saved\nand can be restored.  Therfore, when multiple settings are made only the FIRST causes\na save to be triggered.`
            );
        } else {
            const oldValue = process.env[varName];
            // Note.  If the env var didn't exist in the first place, store as _undefined so that we can delete the env var when resetting env vars back...
            process.env[envVarOriginalPreamble + varName] = Utils.isUndefined(oldValue) ? "_undefined" : oldValue;
        }
        process.env[varName] = String(requiredValue);
    }

    /**
     * Pauses execution for the required number of miliseconds
     * @param periodMS
     * Number if miliseconds to wait
     * @returns Promise that resolves when wait expires
     */
    static async sleep(periodMS: number, logIt?: boolean) {
        periodMS = Number(periodMS);
        if (logIt === true) Log.writeLine(LogLevels.FrameworkDebug, `Sleeping for [${periodMS}] miliseconds`);
        return new Promise((resolve) => {
            setTimeout(resolve, periodMS);
        });
    }

    /**
     * Pauses nodejs execution, but allows message loop to continue, until a keybaord key is pressed.
     * Use: await Utils.pause();
     * WARNING: This will hang the nodejs execution indefinately!!  If used in pipeline for example it could kill Pipeline!!!
     * @param logOutput
     * Optional string to write to Log.  If not used no Log data is created
     * @returns Promise
     */
    static async pause(logOutput?: string): Promise<void> {
        if (logOutput) {
            Log.writeLine(LogLevels.TestInformation, logOutput);
        }
        const stdin = process.stdin;

        if (!stdin.isTTY) {
            Log.writeLine(LogLevels.Error, "Stdin is not a TTY. Cannot pause for key press!! Ignoring.....");
            return;
        }

        return new Promise<void>((resolve) => {
            const cleanup = () => {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener("data", onData);
            };

            const onData = (chunk: Buffer) => {
                Log.writeLine(
                    LogLevels.TestDebug,
                    `Input received: ${JSON.stringify(chunk.toString(), null, 2)}`
                );
                cleanup();
                resolve();
            };

            // Flush any buffered input first
            stdin.resume();
            while (stdin.read() !== null) {
                // Empty as draining
            }
            stdin.pause();

            // Attach listener BEFORE enabling flow
            stdin.once("data", onData);

            stdin.setRawMode(true);
            stdin.resume();
        });

    }

    /**
     * Converts a glob pattern to a regexp
     * @param glob
     * URL glob pattern
     * @returns
     * Equivalent pattern in regexp...
     */
    static globToRegex(glob: string, options?: { startOfLine: boolean; endOfLine: boolean }): RegExp {
        // Set of characters to escape in a regexp
        const startOfLine = options?.startOfLine ?? true;
        const endOfLine = options?.endOfLine ?? true;
        const charsToEscape = new Set(["$", "^", "+", ".", "*", "(", ")", "|", "\\", "?", "{", "}", "[", "]"]);
        const regexExpression = startOfLine ? ["^"] : ["^.*"];
        let inRegexpGroup = false;
        for (let globCharIndex = 0; globCharIndex < glob.length; ++globCharIndex) {
            const currentGlobChar = glob[globCharIndex];

            // If current glob character is a backslash and we are not at the end of the glob
            // then; if next is a normal char add it to expression with the next char othwise
            // ignore it and just add the next char
            if (currentGlobChar === "\\" && globCharIndex + 1 < glob.length) {
                const nextGlobChar = glob[++globCharIndex];
                regexExpression.push(charsToEscape.has(nextGlobChar) ? "\\" + nextGlobChar : nextGlobChar);
                continue;
            }

            // if current glob character is a star..
            if (currentGlobChar === "*") {
                const previousGlobChar = glob[globCharIndex - 1];

                // Count the stars we have...
                let starCount = 1;
                while (glob[globCharIndex + 1] === "*") {
                    starCount++;
                    globCharIndex++;
                }
                const nextGlobChar = glob[globCharIndex + 1];

                // If we have multiple stars and  at start/end of a URI part
                // encapsulate in a regexp group.  Otherwise not.
                if (starCount > 1 && (previousGlobChar === "/" || previousGlobChar === undefined) && (nextGlobChar === "/" || nextGlobChar === undefined)) {
                    // Not so sure a forward slash in regexp shouldn't be escaped.  So overruling
                    // eslint here....
                    // eslint-disable-next-line no-useless-escape
                    regexExpression.push("((?:[^/]*(?:/|$))*)");
                    globCharIndex++;
                } else {
                    regexExpression.push("([^/]*)");
                }
                continue;
            }

            switch (currentGlobChar) {
                // Single glob wildcard chart
                case "?":
                    regexExpression.push(".");
                    break;
                // square braces leave as is...
                case "[":
                    regexExpression.push("[");
                    break;
                case "]":
                    regexExpression.push("]");
                    break;
                // So, in a glob, curley braces equate to a regexp group....
                case "{":
                    inRegexpGroup = true;
                    regexExpression.push("(");
                    break;
                case "}":
                    inRegexpGroup = false;
                    regexExpression.push(")");
                    break;
                // A glob comma in a group is just ORing.  But
                // if outside, keep it but escape first
                case ",":
                    if (inRegexpGroup) {
                        regexExpression.push("|");
                        break;
                    }
                    regexExpression.push("\\" + currentGlobChar);
                    break;
                // Nothing special so use it, escaping if needed....
                default:
                    regexExpression.push(charsToEscape.has(currentGlobChar) ? "\\" + currentGlobChar : currentGlobChar);
            }
        }
        // End
        regexExpression.push(endOfLine ? "$" : ".*$");
        // Finally join it all up and hope for the best!
        return new RegExp(regexExpression.join(""));
    }

    /**
     * Clones an object if object can be cloned using JSON
     * @param original: object or valid JSON5 string
     * Object to be cloned
     * @returns
     * Clone of original Object
     * @throws
     * Error if original object cannot be cloned using JSON
     */
    public static clone(original: object | string): object {
        if (JsonUtils.isJson(original, true)) {
            return JsonUtils.parse(typeof original == "string" ? original : JSON.stringify(original as object), true);
        } else {
            const errText = "Object passed in is not valid JSON (JSON5 allowed) so cannot be cloned using JSON";
            Log.writeLine(LogLevels.Error, errText);
            throw new Error(errText);
        }
    }

    /**
     * Create a valid JWT token
     * @param payloadData
     * Payload data
     * @param signature
     * Signature to sign with
     * @param options
     *   - algorith (default HS256)
     *     Algorith to use in token generation
     *   - type (default JWT)
     *     Token type to create
     * @returns
     * Valid Base64 JWT token
     */
    static createJWT(
        payloadData: string | object,
        signature: string,
        options?: Partial<{ algorithm?: string }> | string
    ): string {
        let payload: object | string;

        let optionsJWT: unknown;

        if (typeof options == "string") {
            Log.writeLine(LogLevels.FrameworkDebug, `Options is a string: [${options}]`);
            optionsJWT = StringUtils.trimQuotes(options as string);
        } else {
            Log.writeLine(LogLevels.FrameworkDebug, `Options not a string:\n${JSON.stringify(options, null, 2)}`);
            optionsJWT = { algorithm: options?.algorithm ?? "HS256" };
        }

        if (JsonUtils.isJson(payloadData, true)) {
            Log.writeLine(LogLevels.FrameworkDebug, `Payload is JSON [${typeof payloadData == "string" ? "string" : "object"}]`);
            payload = typeof payloadData == "string" ? JsonUtils.parse(payloadData, true) : payloadData;
        } else {
            Log.writeLine(LogLevels.Error, `Payload is NOT JSON (May be intended by test): [${payloadData}]`);
            payload = payloadData;
        }

        const normalizedSignature = StringUtils.replaceAll(signature, '\\\\n', '\n');
        Log.writeLine(LogLevels.FrameworkDebug, `Signature: ${normalizedSignature}`);

        const jwtHeader = typeof options == "string" ? { header: JsonUtils.parse(optionsJWT as string, true) } : optionsJWT as object;
        Log.writeLine(LogLevels.FrameworkDebug, `JWT Sign options:\n${JSON.stringify(jwtHeader, null, 2)}`);
        try {
            return jwtSign(payload, normalizedSignature, jwtHeader);
        } catch (err) {
            const errText = `Error creating [${(typeof options == 'string') ?options: JSON.stringify(options as object)
        }] JWT token from[${ payloadData }](signature: [${StringUtils.replaceAll(signature, '\\\\n', '<NEWLINE>')}]): ${
            (err as Error).message
} `;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    }
  }

  /**
   * Determines if given JWT token is valid
   * @param jwtToken
   * JWT token to verify
   * @returns
   * true if values, false if invalid
   */
  static isValidJWT(jwtToken: string): boolean {
    try {
      return !Utils.isUndefined(jwtDecode(jwtToken));
    } catch {
      return false;
    }
  }

  /**
   * Returns payload of given JWT as object
   * @param jwtToken
   * Valid JWT token
   * @returns
   * Payload of JWT token
   */
  static getJWTPayload(jwtToken: string): object {
    try {
      let payload = jwtDecode(jwtToken, { json: true });
      payload = Utils.isNull(payload) ? {} : payload;
      if (typeof payload != "object") {
        throw new Error(`Not an object.Is[${ typeof payload }]. Expected JSON object.`);
      }
      return payload as object;
    } catch (err) {
      const errText = `Error getting payload from JWT[${ jwtToken ?? "<Undefined>" }]: ${ (err as Error).message } `;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    }
  }

  /**
   * Converts HTML entities in a string back to their corresponding characters.
   *
   * Specifically:
   * - Replaces named HTML entities like `& copy; `, ` & amp; `, ` & nbsp; `, etc.
   * - Handles numeric entities (`&#169; `, ` & #x1F44D; `) correctly.
   * - Replaces non-breaking space characters (Unicode U+00A0) with `& nbsp; `
   *   before decoding, for consistent handling.
   * - Replaces literal apostrophes (`'`) with ` & apos; ` to ensure they are
   *   interpreted as HTML-safe entities during decoding.
   *
   * @param str - The HTML-encoded string to unescape.
   * @returns The unescaped string with all recognized HTML entities decoded.
   * @throws {Error} If the input is not a string.
   */
  static unescapeHTML(str: string): string {
    Utils.assertType(str, "string", "unescapeHTML", "str");
    // Replace non-breaking space char (ASCII 160) with entity
    const preProcessed = str
      .replace(/'/g, "&apos;");       // replace apostrophe with entity

    return decodeHTML(preProcessed).replace(/\u00A0/g, " ");
  }

  /**
   * Executes given CLI command as a background process
   * @param command string
   * Command to execute
   * @param args string[]
   * Optional arguments to pass to command
   */
  static spawnBackgroundProcess(command: string, args: string[], { logStdout = false, logStderr = false, spawnOptions = undefined }: { logStdout?: boolean, logStderr?: boolean, spawnOptions?: SpawnOptionsWithoutStdio } = {}): ChildProcessWithoutNullStreams {
    Log.writeLine(LogLevels.TestInformation, `Executing: ${ command } ${ args.join(' ') } `);
    const childProcess = spawn(command, args, spawnOptions);
    if (childProcess?.pid === undefined) {
      const errText = `Unable(spawn returned undefined!) to spawn[${ command }]with args[${ args.join(', ') }]\nand options[${ spawnOptions === undefined ? '' : JSON.stringify(spawnOptions) }]`;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    }
    Log.writeLine(LogLevels.TestInformation, `Started process: PID ${ childProcess.pid } `);

    // Capture stdout (normal output)
    if (logStdout) {
      childProcess.stdout.on('data', (data) => {
        Log.writeLine(LogLevels.TestInformation, `Background(stdout): ${ data.toString() } `, { suppressAllPreamble: true });
      });
    }

    // Capture stderr (error output)
    if (logStderr) {
      childProcess.stderr.on('data', (data) => {
        Log.writeLine(LogLevels.TestInformation, `Background(stderr): ${ data.toString() } `, { suppressAllPreamble: true });
      });
    }

    // Catch any error
    if (logStderr) {
      childProcess.on('error', (err) => {
        Log.writeLine(LogLevels.Error, `Background process error: ${ (err as Error).message } `, { suppressAllPreamble: true });
      });
    }
    return childProcess;
  }

  static async spawnBackgroundProcessWithTimeout(command: string, args: string[], timeoutSeconds: number, { logStdout = false, logStderr = false, spawnOptions = undefined }: { logStdout?: boolean, logStderr?: boolean, spawnOptions?: SpawnOptionsWithoutStdio } = {}): Promise<number> {
    return new Promise((resolve) => {
      //const child = spawn(command, args, { stdio: "inherit" });
      const child = Utils.spawnBackgroundProcess(command, args, { logStdout: logStdout, logStderr: logStderr, spawnOptions: spawnOptions });
      let exited = false;

      // Handle process exit
      child.on('exit', (code) => {
        if (!exited) {
          Log.writeLine(
            LogLevels.TestInformation,
            `Process[${ child.pid ?? 'unknown' }]exited.Code: ${ code ?? 'undefined!' } `,
          );
          exited = true;
          clearTimeout(timeout);
          resolve(code ?? -1); // Return exit code or -1 if code is null
        }
      });

      // Handle process error
      child.on('error', (err) => {
        if (!exited) {
          Log.writeLine(
            LogLevels.Error,
            `Process[${ child.pid ?? 'unknown' }]errored: \n${ err ?? 'unknown error' } `,
          );
          exited = true;
          clearTimeout(timeout);
          resolve(-1);
        }
      });

      process.on('SIGINT', () => {
        Log.writeLine(
          LogLevels.Error, `Caught SIGINT(Ctrl + C), terminating child process[${ child.pid ?? 'unknown' }]...`);
        Utils.terminateBackgroundProcess(child, { signal: 'SIGINT' });
      });

      // Timeout logic
      const timeout = setTimeout(() => {
        if (!exited) {
          const errMessage = `Timeout executing child process[${ child.pid ?? 'unknown' }]!Waited ${ timeoutSeconds } seconds`;
          Log.writeLine(LogLevels.Error, errMessage);
          exited = true;
          Utils.terminateBackgroundProcess(child);
          resolve(-1);
        }
      }, (timeoutSeconds * 1000));
    });
  }

  static async execCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      Log.writeLine(LogLevels.FrameworkInformation, `Exec command: >> ${ command }<< `);
      exec(command, (error, stdout, stderr) => {
        if (error || stderr) {
          Log.writeLine(LogLevels.FrameworkDebug, `Error thrown so rejecting(${ stderr ?? ''}): \n${ error?.message ?? 'No error detail!' } `);
          reject(error || stderr);
        } else {
          Log.writeLine(LogLevels.FrameworkDebug, `Resolved: >> ${ stdout ?? '' }<< `)
          resolve(stdout);
        }
      });
    });
  }

  static isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0); // Check if the process exists
      return true;          // No error means the process is running
    } catch (err) {
      if (err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string') {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ESRCH') {
          return false;       // Process does not exist
        } else if (error.code === 'EPERM') {
          return true;        // Process exists, but no permission to signal
        }
      }
      throw err;              // Re-throw other unexpected errors
    }
  }

  static async killProcessAndDescendants(
    rootPid: number,
    signal: NodeJS.Signals = 'SIGKILL'
  ): Promise<void> {
    type PS = { PID: string; PPID: string; COMMAND: string };

    const children: PS[] = await new Promise((resolve, reject) => {
      psTree(rootPid, (err, result) => {
        if (err) return reject(err);

        // Copy into mutable array to satisfy TS
        resolve([...result]);
      });
    });

    // Build parent -> children map
    const tree = new Map<number, number[]>();

    for (const proc of children) {
      const pid = Number(proc.PID);
      const ppid = Number(proc.PPID);

      if (!tree.has(ppid)) tree.set(ppid, []);
      tree.get(ppid)!.push(pid);
    }

    // Post-order traversal (leaf first)
    const killRecursively = (pid: number) => {
      const childPids = tree.get(pid) ?? [];
      for (const childPid of childPids) killRecursively(childPid);

      try { process.kill(pid, signal); } catch (err) {
        Log.writeLine(LogLevels.Error, `Killing process[${ pid }]with [${ signal }] threw error(Ignoring): ${ (err as Error).message } `)
      }
    };

    killRecursively(rootPid);
  }

  static async terminateBackgroundProcess(backgroundProcess: ChildProcessWithoutNullStreams, options: { signal?: string | number } = {}): Promise<boolean> {
    const signal = (options.signal ?? 'SIGKILL') as NodeJS.Signals;

    if (Utils.isNullOrUndefined(backgroundProcess)) {
      Log.writeLine(LogLevels.TestInformation, `No background process executing so no teardown`);
      return false;
    }
    if (Utils.isNullOrUndefined(backgroundProcess.pid)) {
      Log.writeLine(LogLevels.Error, `Background process has no PID! Cannot terminate`);
      return false;
    }
    const processPid = backgroundProcess.pid!;
    const promise = new Promise<boolean>((resolve) => {
      backgroundProcess.on('close', (code, signal) => {
        Log.writeLine(
          LogLevels.TestInformation,
          `Process[${ processPid }]closed[Code: ${ code ?? '<No Code >' }], Signal ${ signal ?? 'No Signal' } `,
        );
        resolve(true);
      });
    });
    await this.killProcessAndDescendants(processPid, signal);
    return promise;
  }

  static splitActionAndParameters(rawAction: string): Utils.ActionAndParams {
    const actionAndParameters = StringUtils.splitVerbAndParameters(rawAction);
    const normalizedAction = actionAndParameters.verb.toLowerCase().trim();

    if (StringUtils.isBlank(actionAndParameters.parameters)) {
      return { action: actionAndParameters.verb, normalizedAction: normalizedAction, parameters: new Map() };
    } else {
      // We have parameters.  Parameters are always JSON (but without the outer {})
      const paramsJSON = "{" + actionAndParameters.parameters + "}";
      if (JsonUtils.isJson(paramsJSON, true)) {
        const paramsMap = new Map(Object.entries(JsonUtils.parse(paramsJSON, true)));
        return {
          action: actionAndParameters.verb,
          normalizedAction: normalizedAction,
          parameters: paramsMap,
        };
      } else {
        const errText = `Invalid action[${ actionAndParameters.verb }] parameter syntax.Expected(param1: <value>, param2: <value2>etc...).Got: (${ actionAndParameters.parameters })`;
        Log.writeLine(LogLevels.Error, errText);
        throw new Error(errText);
      }
    }
  }


  /**
   * Wrap a promise so it is counted and can have a timeout
   * @param promise
   * Promise to be wrapped
   * @param timeoutMS (optional)
   * Required timeout in mS (if not given settings defined defaultPromiseTimeout used)
   * @returns
   * Results of wrapped promise or rejection if timeout
   */
  static async timeoutPromise<T>(promise: Promise<T>, options: { timeoutMS?: number, friendlyName?: string } = {}): Promise<T> {
    Utils._promiseCount++;

    const operationName = options?.friendlyName ?? (this.inferCallerFunctionName() || "Unknown operation");

    try {
      if (Utils.isNullOrUndefined(options?.timeoutMS) && Utils._defaultPromiseTimeout == 0) {
        const errText = 'Utils.timeoutPromise: No timeout given and default not set (have you not initialised!?';
        throw new Error(errText);
      }
      const actualTimeout = (Utils.isNullOrUndefined(options?.timeoutMS) ? Utils._defaultPromiseTimeout : options?.timeoutMS) as number;
      if (actualTimeout < 0) {
        const errText = `Utils.timeoutPromise: Cannot have a negative timeout!!  Timeout was[${ actualTimeout }]`;
        throw new Error(errText);
      }
      return this.withTimeout<T>(promise, { timeoutMS: actualTimeout, friendlyName: operationName });
    }
    finally {
      Utils._promiseCount--;
    }

  }

  /**
   * @deprecated Use timeoutPromise instead
   */
  static async withTimeoutTracked<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return this.withTimeout<T>(promise, { timeoutMS: timeoutMs, friendlyName: this.inferCallerFunctionName() ?? undefined });
  }


  private static async withTimeout<T>(promise: Promise<T>, options: { timeoutMS?: number, friendlyName?: string } = {}): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${ Utils.isNullOrUndefined(options?.friendlyName) ? 'T' : `${options?.friendlyName}: T` }imeout after ${ options?.timeoutMS ?? '0' } ms`)), options?.timeoutMS ?? 0)
      ),
    ]);
  }


  /**
   * Asserts that a value is of the expected type, throwing a logged error if not
   * @param value
   * Value to check
   * @param expectedType
   * Expected typeof string (e.g. "string", "number")
   * @param funcName
   * Name of the calling function, used in the error message
   * @param paramName
   * Name of the parameter being checked, used in the error message
   * @throws
   * Error if typeof value does not match expectedType
   */
  public static assertType<K extends keyof AssertTypeMap>(value: unknown, expectedType: K, funcName: string, paramName: string): asserts value is AssertTypeMap[K] {
    if (typeof value !== expectedType) {
      const errorText = `Cannot ${funcName} as [${paramName}] not '${expectedType}' type. Is [${typeof value}]`;
      Log.writeLine(LogLevels.Error, errorText);
      throw new Error(errorText);
    }
  }

  private static inferCallerFunctionName(): string | null {
    const error = new Error();
    const stackLines = error.stack?.split("\n") || [];

    // The 3rd line typically contains the caller (adjust if needed)
    const callerLine = stackLines[3] || "";

    const match = callerLine.match(/at (.+?) \(/);
    return match ? match[1] : null;
  }

}

export namespace Utils {
  export interface ActionAndParams {
    /**
     * Original non-normaized action verb
     */
    action: string,
    /**
     * Lowercase and trimmer Action verb
     */
    normalizedAction: string,
    /**
     * All action parameters passed by caller
     */
    parameters: Map<string, unknown>
  }
}