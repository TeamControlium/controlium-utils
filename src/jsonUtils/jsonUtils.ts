import json5 from "json5";
import * as JSONPath from "jsonpath-plus";
import JSONPointer from "jsonpointer";

import { Log, LogLevels } from "../index";
import { StringUtils } from "./StringUtils";
import { Utils } from "./Utils";

/**
 * JSON utility methods for querying, manipulating, parsing and validating JSON objects.
 * All methods are static — no instantiation required.
 */
export class JsonUtils {
  /**
   * Returns the JSONPath path to the parent of the node addressed by the given path.
   *
   * @param pathToChild - A valid JSONPath path to a JSON node.
   * @returns The JSONPath path to the parent of the given node.
   * @throws {Error} If the node has no parent (i.e. it is a top-level node).
   *
   * @example
   * JsonUtils.getParentPath("$.a.b.c"); // returns "$.a.b"
   */
  static getParentPath(pathToChild: string): string {
    const pathArray = JSONPath.JSONPath.toPathArray((pathToChild.startsWith(".") ? "" : ".") + pathToChild);
    if (pathArray.length < 2) {
      const errText = `Unable to get Parent as child [${pathToChild}] has no parent (it is top level)!`;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    }
    pathArray.pop();
    return JSONPath.JSONPath.toPathString(pathArray);
  }

  /**
   * Returns a deep copy of the given object with the property identified by the
   * given JSONPath renamed. The original object is not mutated.
   *
   * The JSONPath must match exactly one property — zero or multiple matches will throw.
   *
   * @param jsonObject - The source object containing the property to rename.
   * @param pathToPropertyToRename - A valid JSONPath identifying the property to rename.
   * @param newName - The new name for the property.
   * @returns A new deep-copied object with the property renamed.
   * @throws {Error} If the JSONPath matches zero or more than one property.
   *
   * @example
   * const result = JsonUtils.withRenamedProperty({ a: { b: 1 } }, "$.a.b", "c");
   * // result => { a: { c: 1 } }
   */
  static withRenamedProperty(jsonObject: object, pathToPropertyToRename: string, newName: string): object {
    const normalizedNewName = newName.trim();
    const parentPath = this.getParentPath(pathToPropertyToRename);
    const objectBeingRenamed = this.getPropertiesMatchingPath(jsonObject, pathToPropertyToRename);
    if (objectBeingRenamed.length === 0) {
      const errText = `renameJsonObjectProperty: cannot rename - JSON Path [${pathToPropertyToRename}] matches nothing`;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    } else if (objectBeingRenamed.length > 1) {
      const errText = `renameJsonObjectProperty: cannot rename - JSON Path [${pathToPropertyToRename}] matches ${objectBeingRenamed.length} fields/objects!! Expected exactly 1 match`;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    } else {
      const objectBeingRenamedParent = this.getPropertiesMatchingPath(jsonObject, parentPath);
      let pathToNewObject = StringUtils.replaceAll(objectBeingRenamedParent[0].pointer, "/", ".") as string;
      pathToNewObject = StringUtils.isBlank(pathToNewObject) ? normalizedNewName : ((normalizedNewName.startsWith("['") && normalizedNewName.endsWith("']")) ? pathToNewObject.substring(1) + normalizedNewName : pathToNewObject.substring(1) + "." + normalizedNewName);
      let updatedObject = JSON.parse(JSON.stringify(jsonObject));
      // We rename the property by adding the property using the new name...
      updatedObject = this.updateJSONObject(updatedObject, pathToNewObject, objectBeingRenamed[0].value as string | number | boolean | object | null);
      // ... then deleting the property with the old name
      updatedObject = this.updateJSONObject(updatedObject, pathToPropertyToRename, "_undefined");
      return updatedObject;
    }
  }

  /**
   * Shallow-merges the given object into the property identified by the given JSONPath
   * within the source object. Properties in `objectToMerge` overwrite same-named
   * properties in the target. The JSONPath must match exactly one property.
   *
   * Use `"$"` as the path to merge directly into the root object.
   *
   * @param jsonObject - The source object containing the property to merge into.
   * @param pathToPropertyToMergeInto - A valid JSONPath identifying the target property.
   * @param objectToMerge - The object whose properties will be merged into the target.
   * @returns The updated source object with the merge applied.
   * @throws {Error} If the JSONPath matches zero or more than one property.
   *
   * @example
   * const result = JsonUtils.mergeObjectIntoProperty({ a: { x: 1 } }, "$.a", { y: 2 });
   * // result => { a: { x: 1, y: 2 } }
   */
  static mergeObjectIntoProperty(jsonObject: object, pathToPropertyToMergeInto: string, objectToMerge: object): object {
    const objectToMergeWith = this.getPropertiesMatchingPath(jsonObject, pathToPropertyToMergeInto);
    if (objectToMergeWith.length === 0) {
      const errText = `mergeJsonObjects: cannot merge - JSON Path [${pathToPropertyToMergeInto}] matches nothing`;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    } else if (objectToMergeWith.length > 1) {
      const errText = `mergeJsonObjects: cannot merge - JSON Path [${pathToPropertyToMergeInto}] matches ${objectToMergeWith.length} fields/objects!! Expected exactly 1 match`;
      Log.writeLine(LogLevels.Error, errText);
      throw new Error(errText);
    } else {
      const targetObject = objectToMergeWith[0].value as object;
      let mergedOriginalObject = jsonObject;
      if (pathToPropertyToMergeInto === "$") {
        mergedOriginalObject = { ...targetObject, ...objectToMerge };
      } else {
        mergedOriginalObject = this.updateJSONObject(mergedOriginalObject, pathToPropertyToMergeInto, { ...targetObject, ...objectToMerge });
      }
      return mergedOriginalObject;
    }
  }

  /**
   * Reads a file from disk and parses its contents as JSON, returning the result as an object.
   * Returns an empty object `{}` if the file contents are not valid JSON.
   *
   * @param pathAndFilename - Path to the JSON file to read.
   * @param options - Optional settings:
   *   - `encoding` — File encoding to use when reading (default: `"utf-8"`).
   *   - `detokeniseFileContents` — When `true`, passes file contents through the
   *     detokeniser before parsing (default: `false`).
   * @returns The parsed JSON as an object, or `{}` if the file contains invalid JSON.
   * @throws {Error} If the file cannot be read.
   */
  static getObjectFromFile(pathAndFilename: string, options?: { encoding?: BufferEncoding; detokeniseFileContents?: boolean }): object {
    const processedJson = Utils.getFileContents(pathAndFilename, { encoding: options?.encoding, detokeniseFileContents: options?.detokeniseFileContents });
    if (this.isJson(processedJson)) {
      const jsonObject = JSON.parse(processedJson);
      return jsonObject;
    } else {
      Log.writeLine(LogLevels.Error, `File [${pathAndFilename}] does not contain valid JSON.  Returning empty object`);
      return {};
    }
  }

  /**
   * Parses a JSON (or optionally JSON5) string into an object.
   * If `item` is `null`, an empty object `{}` is returned.
   *
   * @param item - The JSON string to parse, or `null` (returns `{}`).
   * @param useJson5 - When `true`, parses using JSON5 rules, allowing comments,
   *   trailing commas, unquoted keys, etc. Defaults to `false` (strict JSON).
   * @returns The parsed object.
   * @throws {Error} If `item` is not a string or null, or if parsing fails.
   *
   * @example
   * JsonUtils.parse('{"a":1}');           // => { a: 1 }
   * JsonUtils.parse(null);                // => {}
   * JsonUtils.parse("{a:1}", true);       // => { a: 1 }  (JSON5)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static parse(item: string | null, useJson5 = false): any {
    if (Utils.isNull(item)) {
      item = "{}";
    }
    if (typeof item !== "string") {
      const errMsg = `Cannot parse item [${typeof item}] as not null or string!`;
      Log.writeLine(LogLevels.Error, errMsg);
      throw new Error(errMsg);
    }
    try {
      return useJson5 ? json5.parse(item) : JSON.parse(item);
    } catch (err) {
      const errTxt = `Cannot parse item [${item.length < 50 ? item : `Length ${item.length}`}]: ${(err as Error).message}`;
      Log.writeLine(LogLevels.Error, errTxt);
      throw new Error(errTxt);
    }
  }

  /**
   * Checks whether the given item is valid JSON.
   *
   * Returns `true` if:
   * - `item` is a string that parses as a JSON object (not a primitive), or
   * - `item` is an object that can be `JSON.stringify`-ed and parsed back as an object.
   *
   * Returns `false` for `undefined`, unparseable strings, or values that parse
   * to a primitive (e.g. `"true"`, `"42"`).
   *
   * @param item - The value to check.
   * @param allowJson5 - When `true`, accepts JSON5 syntax (comments, trailing commas,
   *   unquoted keys, etc.). Defaults to `false` (strict JSON only).
   * @returns `true` if the item represents a valid JSON object, `false` otherwise.
   *
   * @example
   * JsonUtils.isJson('{"a":1}');        // true
   * JsonUtils.isJson('42');             // false  (primitive)
   * JsonUtils.isJson(undefined);        // false
   * JsonUtils.isJson("{a:1}", true);    // true   (JSON5)
   */
  static isJson(item: string | object | undefined | null, allowJson5 = false): boolean {
    if (Utils.isUndefined(item)) {
      return false;
    }
    try {
      item = typeof item === "object" ? JSON.stringify(item) : item;
      item = allowJson5 ? json5.parse(item as string) : JSON.parse(item as string);
      if (typeof item === "object" && item !== null) {
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  /**
   * Returns all properties within a JSON object that match the given JSONPath expression.
   * Each result includes the matched value, its JSON Pointer path, and its parent object.
   *
   * @param jsonObject - The object (or JSON string) to query.
   * @param pathToJSONProperties - A valid JSONPath expression identifying the properties to retrieve.
   * @returns An array of matches, each with `value`, `pointer` (JSON Pointer string), and `parent`.
   *   Returns an empty array if no properties match.
   * @throws {Error} If `jsonObject` is not a valid JSON object, or if the JSONPath query fails.
   *
   * @see https://jsonpath-plus.github.io/JSONPath/docs/ts/
   *
   * @example
   * JsonUtils.getPropertiesMatchingPath({ a: { b: 1 } }, "$.a.b");
   * // => [{ value: 1, pointer: "/a/b", parent: { b: 1 } }]
   */
  static getPropertiesMatchingPath(
    jsonObject: object | string,
    pathToJSONProperties: string
  ): Array<{ value: unknown; pointer: string; parent: object }> {
    try {
      if (!this.isJson(jsonObject)) {
        throw new Error("Passed object is not a valid Json Object");
      }

      if (typeof jsonObject === "string") {
        jsonObject = JSON.parse(jsonObject);
      }

      const jsonPropertys = JSONPath.JSONPath({
        path: pathToJSONProperties,
        json: jsonObject,
        resultType: "all",
      });
      Log.writeLine(LogLevels.FrameworkDebug, `JSON:\n${JSON.stringify(jsonObject, null, 2)}`, { maxLines: 512 });
      Log.writeLine(LogLevels.FrameworkInformation, `For path [${pathToJSONProperties}], got ${jsonPropertys.length} matches`);

      return jsonPropertys;
    } catch (err) {
      Log.writeLine(LogLevels.Error, `Error getting Json properties with path [${pathToJSONProperties}] from object:\n${err}`);
      throw new Error(`Error getting Json properties with path [${pathToJSONProperties}] from object:\n${err}`);
    }
  }

  /**
   * Sets, adds, or deletes a property within a JSON object identified by a JSONPath expression.
   * Operates on a deep copy of `currentObject` — the original is not mutated.
   *
   * - If the property **exists**, its value is updated.
   * - If the property **does not exist**, it is added with the given value.
   * - To **delete** a property, pass the string `"_undefined"` as the value.
   *   Note: deleting a property that does not exist will throw.
   *
   * The JSONPath must match zero or one property — multiple matches will throw.
   *
   * When `Log.loggingLevel` is below `LogLevels.TestInformation`, a detailed error
   * including the full object and value is written to the log before throwing.
   *
   * @param currentObject - The source object to update (not mutated).
   * @param pathString - A valid JSONPath expression identifying the property to set/add/delete.
   * @param value - The value to set. Pass the string `"_undefined"` to delete the property.
   * @returns A new deep-copied object with the change applied.
   * @throws {Error} If `currentObject` is not a valid JSON object, if the JSONPath matches
   *   more than one property, if deletion is attempted on a non-existent property, or if
   *   the value could not be verified after being set.
   *
   * @example
   * JsonUtils.updateJSONObject({ a: 1 }, "$.a", 2);           // => { a: 2 }
   * JsonUtils.updateJSONObject({ a: 1 }, "$.b", "hello");     // => { a: 1, b: "hello" }
   * JsonUtils.updateJSONObject({ a: 1 }, "$.a", "_undefined"); // => {}
   */
  static updateJSONObject(currentObject: object, pathString: string, value: string | object | boolean | number | null): object {
    let jsonPointer: string;
    Log.writeLine(LogLevels.FrameworkInformation, `Setting [${pathString}] of object to [${typeof value !== "object" ? value : "an object value"}]`);

    try {
      let modifiedObject: object;
      if (JsonUtils.isJson(currentObject)) {
        modifiedObject = JsonUtils.parse(JSON.stringify(currentObject));
      } else {
        const errMsg = "Object is not a JSON object.  Cannot update!";
        Log.writeLine(LogLevels.Error, errMsg);
        throw new Error(errMsg);
      }
      const matchingProperties = this.getPropertiesMatchingPath(modifiedObject, pathString);
      if (matchingProperties.length === 0) {
        Log.writeLine(LogLevels.FrameworkDebug, "no matching properties found - will ADD property");
        // No matches.  So work out what the Json pointer is and add it.  We prepend a period to denote path from the top unless
        // it is a Top level with special chars
        const jsonPathArray = JSONPath.JSONPath.toPathArray(pathString.startsWith('[') ? pathString : '.' + pathString);
        jsonPointer = JSONPath.JSONPath.toPointer(jsonPathArray);
      } else if (matchingProperties.length > 1) {
        Log.writeLine(LogLevels.FrameworkDebug, `[${matchingProperties.length}] matching properties found!!  Will throw error`);
        throw new Error(`JSON Path [${pathString}] matched [${matchingProperties.length}]!  Expected zero or one match.`);
      } else {
        // Yippee exactly one property
        Log.writeLine(LogLevels.FrameworkDebug, "One matching property found - will update/delete property");
        jsonPointer = matchingProperties[0].pointer;
      }
      if (value === "_undefined") {
        const deadProperty = jsonPointer.split("/").pop() as string;
        Log.writeLine(LogLevels.FrameworkDebug, `value is _undefined so will delete property [${jsonPointer}]`);
        if (Array.isArray(matchingProperties[0].parent)) {
          Log.writeLine(LogLevels.FrameworkDebug, `Deleting [${matchingProperties[0].parent}] is an array.  So remove by index....`);
          matchingProperties[0].parent.splice(Number(deadProperty), 1);
        } else {
          Log.writeLine(LogLevels.FrameworkDebug, `Deleting [${matchingProperties[0].parent}] is an NOT array.  So remove by deletion...`);
          // Caller wants to delete property...
          // http://perfectionkills.com/understanding-delete/
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (matchingProperties[0].parent as any)[deadProperty]; // How can I do this WITHOUT going via any?
        }
      } else {
        Log.writeLine(
          LogLevels.FrameworkDebug,
          `Updating or adding property [${jsonPointer}] with value: ${typeof value === "object" ? "\n" + JSON.stringify(value as object, null, 2) : value}`
        );
        JSONPointer.set(modifiedObject, jsonPointer, value);
        const setValue = JSONPointer.get(modifiedObject, jsonPointer);
        if (setValue !== value) {
          const errMessage = `After setting [${pathString}] to value: ${typeof value === "object" ? "\n" + JSON.stringify(value as object, null, 2) : `[${value}]`}\nCheck showed it was now:  ${typeof setValue === "object" ? "\n" + JSON.stringify(setValue as object, null, 2) : `[${setValue}]`}`;
          Log.writeLine(LogLevels.Error, errMessage);
          throw new Error(errMessage);
        }
      }
      return modifiedObject;
    } catch (err) {
      const errText = `Error adding/updating/deleting property [${pathString}]: ${err}`;
      // Only write error out if we are Test Debug or lower.  No need for Test Information)
      if (Log.loggingLevel < LogLevels.TestInformation) {
        Log.writeLine(
          LogLevels.Error,
          `${errText}\nValue:${typeof value === "object" ? JSON.stringify(value as object, null, 2) : value}\nObject:\n${JSON.stringify(
            currentObject,
            null,
            2
          )}`,
          { maxLines: 1024 }
        );
      }
      throw new Error(errText);
    }
  }

  /**
   * Returns the number of properties within a JSON object that match the given JSONPath expression.
   *
   * @param jsonObject - The object to query.
   * @param pathString - A valid JSONPath expression identifying the properties to count.
   * @returns The number of matching properties, or `0` if none match.
   * @throws {Error} If `jsonObject` is not a valid JSON object.
   *
   * @example
   * JsonUtils.getMatchingJSONPropertyCount({ a: 1, b: 2 }, "$.a"); // => 1
   * JsonUtils.getMatchingJSONPropertyCount({ a: 1, b: 2 }, "$.*"); // => 2
   */
  static getMatchingJSONPropertyCount(jsonObject: object, pathString: string): number {
    if (!this.isJson(jsonObject)) {
      Log.writeLine(LogLevels.Error, "Passed object is not a valid Json Object. Aborting");
      throw new Error("Passed object is not a valid Json Object");
    }

    const jsonProperties = this.getPropertiesMatchingPath(jsonObject, pathString);

    Log.writeLine(LogLevels.FrameworkInformation, `[${pathString}] has [${jsonProperties.length}] matches`);
    return jsonProperties?.length ?? 0;
  }

  /**
   * Removes all properties matching the given key names from a JSON object, including
   * those nested within child objects or arrays. Operates directly on the passed object
   * (mutates in place).
   *
   * @param jsonObject - The object (or array of objects) to remove properties from.
   * @param removeKeys - One or more property names to remove at any depth.
   * @param throwError - When `true`, any error encountered during removal is re-thrown.
   *   When `false` (default), errors are logged and silently swallowed.
   *
   * @example
   * const obj = { a: 1, b: { a: 2, c: 3 } };
   * JsonUtils.removeJsonPropertyByKey(obj, ["a"]);
   * // obj => { b: { c: 3 } }
   */
  public static removeJsonPropertyByKey(jsonObject: object | Array<object>, removeKeys: string[], throwError = false) {
    try {
      if (Array.isArray(jsonObject)) {
        Log.writeLine(LogLevels.FrameworkDebug, "JSON Object is an array, itterating through array and removing required key/s from each item");
        for (const arrayItem of jsonObject) {
          this.removeJsonPropertyByKey(arrayItem, removeKeys);
        }
      } else if (typeof jsonObject === "object") {
        Log.writeLine(LogLevels.FrameworkDebug, `JSON Object is an object, removing key/s [${removeKeys.join(",")}]`);
        for (const removeKey of removeKeys) {
          for (const key of Object.keys(jsonObject)) {
            if (key === removeKey) {
              delete jsonObject[removeKey as keyof typeof jsonObject];
            } else {
              this.removeJsonPropertyByKey(jsonObject[key as keyof typeof jsonObject], removeKeys);
            }
          }
        }
      } else {
        Log.writeLine(
          LogLevels.Error,
          `Unable to remove Keys [${removeKeys.join(",")}] as json object is ${typeof jsonObject}.  Expected object or Array<object>`
        );
      }
    } catch (err) {
      const errText = `Error in removing the property from JSON ${err}`;
      Log.writeLine(LogLevels.Error, errText);
      if (throwError) throw new Error(errText);
    }
  }

  /**
   * Escapes all RegExp special characters in a string so it can be safely used
   * as a literal pattern in a `RegExp` constructor.
   *
   * @param toBeEscaped - The string to escape.
   * @returns The input string with all RegExp special characters escaped.
   *
   * @example
   * JsonUtils.escapeRegExp("a.b+c"); // => "a\\.b\\+c"
   * new RegExp(JsonUtils.escapeRegExp("1+1=2")); // matches literal "1+1=2"
   */
  public static escapeRegExp(toBeEscaped: string): string {
    return toBeEscaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}