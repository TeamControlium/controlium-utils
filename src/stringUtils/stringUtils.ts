import { JsonUtils, Log, LogLevels } from "../index";
import { Utils } from "../utils/utils";

/**
 * General String related test-related utilities.
 * @note
 * Originally written as String extensions, re-written as static functions for broader compatibility.
 */
export class StringUtils {
  /**
   * Removes leading and trailing instances of given character from a string
   * @param originalString
   * String to be trimmed
   * @param characterToTrim
   * Character to be removed from start and end of string, if present
   */
  public static trimChar(originalString: string, characterToTrim: string): string {
    Utils.assertType(originalString, "string", "trimChar", "originalString");
    Utils.assertType(characterToTrim, "string", "trimChar", "characterToTrim");

    // Check we have only been given a single char to trim.  Bomb if not.
    if (characterToTrim.length !== 1) {
      const error = `characterToTrim (${characterToTrim}) must be a single character!`;
      Log.writeLine(LogLevels.Error, ` ${error}`);
      throw new Error(error);
    }
    let normalizedCharToTrim = characterToTrim === "]" ? "\\]" : characterToTrim;
    normalizedCharToTrim = normalizedCharToTrim === "^" ? "\\^" : normalizedCharToTrim;
    normalizedCharToTrim = normalizedCharToTrim === "\\" ? "\\\\" : normalizedCharToTrim;

    return originalString.replace(new RegExp("^[" + normalizedCharToTrim + "]+|[" + normalizedCharToTrim + "]+$", "g"), "");
  }

  /**
   * Trims single or double quotes from string if string starts AND ends in same quote character
   * @param originalString
   * String to be trimmed
   */
  public static trimQuotes(originalString: string): string {
    Utils.assertType(originalString, "string", "trimQuotes", "originalString");

    let trimmedString = originalString;

    if ((trimmedString.startsWith("'") && trimmedString.endsWith("'")) || (trimmedString.startsWith('"') && trimmedString.endsWith('"'))) {
      trimmedString = trimmedString.substring(1, trimmedString.length - 1);
    }
    return trimmedString;
  }

  /**
   * Checks if character at index is an Alpha character
   * @param stringToCheck
   * String containing character to check
   * @param indexZeroBased - default 0
   * Index of character to check
   * @returns
   * Boolean true is alpha, otherwise false
   */
  public static isAlpha(stringToCheck: string, indexZeroBased = 0) {
    Utils.assertType(stringToCheck, "string", "isAlpha", "stringToCheck");
    Utils.assertType(indexZeroBased, "number", "isAlpha", "indexZeroBased");

    if (stringToCheck.length - 1 < indexZeroBased) {
      const errorText = `Cannot check if char [${indexZeroBased} (Zero based)] isAlpha as length of stringToCheck is only ${stringToCheck.length} characters long!`;
      Log.writeLine(LogLevels.Error, errorText);
      throw new Error(errorText);
    }
    return stringToCheck.charAt(indexZeroBased).toLowerCase() !== stringToCheck.charAt(indexZeroBased).toUpperCase();
  }

  /**
   * Set first character of string to Capital (if Alpha)
   * @param originalString
   * String to set first character
   * @returns
   * originalString with first character capitalised
   */
  public static capitaliseFirstCharacter(originalString: string, searchFirstAlpha = false): string {
    Utils.assertType(originalString, "string", "capitaliseFirstCharacter", "originalString");

    if (searchFirstAlpha) {
      const asArray = originalString.split("");
      asArray.find((item, index) => {
        if (this.isAlpha(item)) {
          asArray[index] = item.toUpperCase();
          return true;
        } else {
          return false;
        }
      });
      return asArray.join("");
    } else {
      return originalString.charAt(0).toUpperCase() + originalString.slice(1);
    }
  }

  /**
   * Splits a string upto substrings a maximum number of times using the specified separator and return then as an array
   * @param originalString
   * String to be split
   * @param separator
   * Character to use as seperator.  If more than one character, function will error.
   * @param limit
   * A value used to limit the number of elements returned in the array. Last element contains rest of string.
   */
  public static splitRemaining(originalString: string, separator: string, limit: number,doNotSeparateInQuotes = false): string[] {
    Utils.assertType(originalString, "string", "splitRemaining", "originalString");
    Utils.assertType(separator, "string", "splitRemaining", "separator");
    Utils.assertType(limit, "number", "splitRemaining", "limit");

    if (separator.length === 1 && limit > 0) {
      const allParts = StringUtils.split(originalString,separator,doNotSeparateInQuotes);
      const partsToMax = allParts.slice(0, limit - 1);
      const partsAfterMax = allParts.slice(limit - 1);
      return partsAfterMax.length > 0 ? partsToMax.concat([partsAfterMax.join(separator)]) : partsToMax;
    } else {
      const error = `Seperator [Length was ${separator.length}] must be single character and limit [Limit was ${limit}] greater than 0.`;
      Log.writeLine(LogLevels.Error, error);
      throw new Error(error);
    }
  }

  /**
   * Splits a string upto substrings a maximum number of times using the specified separator and return then as an array
   * @param originalString
   * String to be split
   * @param separator
   * A string that identifies character or characters to use in separating the string.
   * @param limit
   * A value used to limit the number of elements returned in the array. First element contains start of string.
   */
  public static splitLeading(originalString: string, separator: string, limit: number,doNotSeparateInQuotes = false): string[] {
    Utils.assertType(originalString, "string", "splitLeading", "originalString");
    Utils.assertType(separator, "string", "splitLeading", "separator");
    Utils.assertType(limit, "number", "splitLeading", "limit");

    const realLimit = limit > originalString.length ? originalString.length : limit;
    if (separator.length === 1 && limit > 0) {
      const allParts = StringUtils.split(originalString,separator,doNotSeparateInQuotes);
      const partsToMax = allParts.slice(0, allParts.length - realLimit + 1);
      const partsAfterMax = allParts.slice(allParts.length - realLimit + 1, allParts.length);
      return partsToMax.length > 0 ? [partsToMax.join(separator)].concat(partsAfterMax) : partsAfterMax;
    } else {
      const error = `Seperator [Length was ${separator.length}] must be single character and limit [Limit was ${limit}] greater than 0.`;
      Log.writeLine(LogLevels.Error, error);
      throw new Error(error);
    }
  }

  /**
   * Splits a string into parts, optionally ignoring slips with quotes
   * @param originalString
   * String to be split
   * @param separator
   * Character to use as seperator.  If more than one character, function will error.
   * @param doNotSeparateInQuotes (default true)
   * If true, separator char is ignored within single or double quotes (matching)
   * @returns
   * Array of original string
   */
  public static split(originalString: string, separator: string, doNotSeparateInQuotes = true):Array<string> {
    Utils.assertType(originalString, "string", "split", "originalString");
    Utils.assertType(separator, "string", "split", "separator");

    if (separator.length === 1) {
      if (doNotSeparateInQuotes) {
        const result = originalString.match(/\\?.|^$/g)?.reduce(
          (workingObject, currentChar) => {
            if (['"', "'"].includes(currentChar)) {
              if (workingObject.inQuote === "") {
                workingObject.inQuote = currentChar;
              } else if (workingObject.inQuote === currentChar) {
                workingObject.inQuote = "";
              }
            }
            if (workingObject.inQuote === "" && currentChar === separator) {
                workingObject.array[workingObject.array.length - 1] = StringUtils.trimQuotes(workingObject.array[workingObject.array.length - 1]);
              workingObject.array.push("");
            } else {
              workingObject.array[workingObject.array.length - 1] += currentChar.replace(/\\(.)/, "$1");
            }
            return workingObject;
          },
          { array: [""], inQuote: "" }
        ).array??[originalString];
        result[result.length - 1] = StringUtils.trimQuotes(result[result.length - 1])
        return result;
      } else {
        return originalString.split(separator);
      }
    } else {
      const error = `Seperator [Length was ${separator.length}] must be single character.`;
      Log.writeLine(LogLevels.Error, error);
      throw new Error(error);
    }
  }

  /**
   * Splits a string into verb and paremeters.  Parameters are part enclosed in trailing brackets.
   * @param rawCommand
   * String containing command verb and, optionally, braces enclosing parameters
   * @returns
   * Object with verb and parameters properties
   * @example
   * "hello"
   * results in verb: "hello", parameters: ''
   * "hello(this is, good)"
   * results in verb: "hello", parameters: 'this is, good'
   * @throws
   * Error if badly formed (no trailing close braces etc....)
   */
  public static splitVerbAndParameters(rawCommand: string): { verb: string; parameters: string } {
    Log.writeLine(LogLevels.FrameworkDebug,`Got string [${rawCommand}]`);
    if (rawCommand.includes("(")) {
      if (rawCommand.endsWith(")")) {
        let paramsPart = StringUtils.splitRemaining(rawCommand,'(',2)[1];
        paramsPart = paramsPart.substring(0, paramsPart.length - 1);
        Log.writeLine(LogLevels.FrameworkDebug,`Parameters are: [${paramsPart}]`);

        return {
          verb: rawCommand.split("(")[0],
          parameters: paramsPart,
        };
      } else {
        const errText = `Object <${rawCommand}> has no closing brackets! If has opening brackets then must have closing brackets`;
        Log.writeLine(LogLevels.Error, errText);
        throw new Error(errText);
      }
    } else {
      return {
        verb: rawCommand,
        parameters: "",
      };
    }
  }

  /**
   * Removes all non-alphanumerics from string
   * @param originalString
   * String to remove non-alphanumerics from
   */
  public static removeNonAlphaNumeric(originalString: string): string {
    Utils.assertType(originalString, "string", "removeNonAlphaNumeric", "originalString");
    return originalString.replace(/[^a-zA-Z0-9]+/g, "");
  }

  /**
   * Removes all whitespace from string
   * @param originalString
   * String to remove whitespace from
   */
  public static removeWhitespace(originalString: string): string {
    Utils.assertType(originalString, "string", "removeWhitespace", "originalString");
    return originalString.replace(/\s+/g, "");
  }

  /**
   * Encode given string to enable use within HTML
   * @param originalString
   * Non-encoded string to be HTML encoded
   * @returns
   * Original string HTML encoded.
   */
  static encodeHTML(originalString: string): string {
    Utils.assertType(originalString, "string", "encodeHTML", "originalString");
    return originalString.replace(
      /[&<>'"]/g,
      (tag) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        }[tag] ?? "")
    );
  }

  /**
   * Replace all matching instances with replacement
   * @param original
   * String to replace values in
   * @param searchValue
   * Value to replace
   * @param replaceValue
   * Value to replace mathes with
   * @returns
   * Original string with all matching occuranced replaced
   */
  static replaceAll(original: string, searchValue: string, replaceValue: string): string {
    if (Utils.isNullOrUndefined(original)) {
      const errText = `Cannot replace [${searchValue}] with [${replaceValue}] Original is null or undefined!`;
      Log.writeLine(LogLevels.Error,errText);
      throw new Error(errText);
    }
    const escapedRegExp = new RegExp(JsonUtils.escapeRegExp(searchValue),'g');
    return original.replace(escapedRegExp, replaceValue);
  }

  /**
   * Checks if a string is blank
   * @param text
   * String to be verified for blank
   * @returns
   * Boolean true is empty or with blankspaces, otherwise false
   */
  static isBlank(text:string):boolean{
    return Utils.isNullOrUndefined(text) || text.trim().length === 0;
  }

}
