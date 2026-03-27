import { Logger } from "./logger";
import { readFileSync } from "fs";

// Unit tests for Log utility
describe("Log", () => {
  afterEach(() => {
    Logger.reset();
  });
  describe("Basic Log stuff (Non-Panic)", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Logger.loggingLevel = Logger.Levels.Error;
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });
    it("Log line preamble correctly shows Line levels", () => {
      Logger.loggingLevel = Logger.Levels.Verbose;
      Logger.writeLine(Logger.Levels.Error, "error test");
      Logger.writeLine(Logger.Levels.Warning, "warn test");
      Logger.writeLine(Logger.Levels.FrameworkDebug, "framework debug test");
      Logger.writeLine(
        Logger.Levels.FrameworkInformation,
        "framework information test"
      );
      Logger.writeLine(Logger.Levels.TestDebug, "test debug test");
      Logger.writeLine(Logger.Levels.TestInformation, "test information test");
      Logger.writeLine(20, "special stuff");

      expect(logOutput.length).toStrictEqual(7);
      expect(logOutput[0]).toMatch(/Message: \[ERROR - .*$/);
      expect(logOutput[1]).toMatch(/Message: \[WARNG - .*$/);
      expect(logOutput[2]).toMatch(/Message: \[FKDBG - .*$/);
      expect(logOutput[3]).toMatch(/Message: \[FKINF - .*$/);
      expect(logOutput[4]).toMatch(/Message: \[TSDBG - .*$/);
      expect(logOutput[5]).toMatch(/Message: \[TSINF - .*$/);
      expect(logOutput[6]).toMatch(/Message: \[00020 - .*$/);
    });
    it("Custom line preamble", () => {
      //
      // We set time to be JUST the year and elapsed to just month short-name
      // Test by checking year starts 20 (to test will work up to 2099) and month
      // is Jan (elapsed says time since 1/1/1970).
      //
      Logger.loggingLevel = Logger.Levels.Verbose;

      Logger.writeLineOptions.timeFormat = ">>'TIME:' yyyy<<";
      Logger.writeLineOptions.elapsedFormat = ">>'TIME:' MMM<<";
      Logger.writeLine(Logger.Levels.Error, "error test");

      expect(logOutput.length).toStrictEqual(1);
      expect(logOutput[0]).toMatch(
        /Message: \[ERROR - \[>>TIME: 20\d{2}<<\]\[>>TIME: Jan<<\].*$/
      );
    });
    it("Verify correct filtering", () => {
      //
      // This test sets current logging level at TestDebug.  So, TestDebug, TestInformation, Warning
      // and Errors should come through
      //
      Logger.loggingLevel = Logger.Levels.TestDebug;
      //
      // It also sets a filter.  So, errors between 20 and 25 (inclusive) should come through
      //
      Logger.loggingFilter = { minLevel: 20, maxLevel: 25 };

      Logger.writeLine(Logger.Levels.TestInformation, "test information test");
      Logger.writeLine(Logger.Levels.TestDebug, "test debug test");
      Logger.writeLine(
        Logger.Levels.FrameworkInformation,
        "framework information test"
      ); // This one should not come thru
      Logger.writeLine(19, "test information test 19"); // This one should not come thru
      Logger.writeLine(20, "test information test 20");
      Logger.writeLine(25, "test information test 25");
      Logger.writeLine(26, "test information test 26"); // This one should not come thru

      expect(logOutput.length).toStrictEqual(4);
      expect(logOutput[0]).toMatch(/Message: \[TSINF - .*$/);
      expect(logOutput[1]).toMatch(/Message: \[TSDBG - .*$/);
      expect(logOutput[2]).toMatch(/Message: \[00020 - .*$/);
      expect(logOutput[3]).toMatch(/Message: \[00025 - .*$/);
    });
    it("Log line preamble correctly shows Line levels", () => {
      Logger.loggingLevel = Logger.Levels.Verbose;
      Logger.writeLine(Logger.Levels.Error, "error test");
      Logger.writeLine(Logger.Levels.Warning, "warn test");
      Logger.writeLine(Logger.Levels.FrameworkDebug, "framework debug test");
      Logger.writeLine(
        Logger.Levels.FrameworkInformation,
        "framework information test"
      );
      Logger.writeLine(Logger.Levels.TestDebug, "test debug test");
      Logger.writeLine(Logger.Levels.TestInformation, "test information test");
      Logger.writeLine(20, "special stuff");

      expect(logOutput.length).toStrictEqual(7);
      expect(logOutput[0]).toMatch(/Message: \[ERROR - .*$/);
      expect(logOutput[1]).toMatch(/Message: \[WARNG - .*$/);
      expect(logOutput[2]).toMatch(/Message: \[FKDBG - .*$/);
      expect(logOutput[3]).toMatch(/Message: \[FKINF - .*$/);
      expect(logOutput[4]).toMatch(/Message: \[TSDBG - .*$/);
      expect(logOutput[5]).toMatch(/Message: \[TSINF - .*$/);
      expect(logOutput[6]).toMatch(/Message: \[00020 - .*$/);
    });
    it("Log line preamble correctly shows actual time (actual time not checked) and time since test start (not really checked..)", () => {
      Logger.writeLine(Logger.Levels.Error, "Basic test");
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(
        /^.*- \[\d{2}:\d{2}:\d{2}\]\[00:00\.\d{3}\] \[.*$/
      );
    });
    it("Log line preamble correctly shows file/line/position of caller (actual line/position not checked as it could change!", () => {
      Logger.writeLine(Logger.Levels.Error, "Basic test");
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(
        /^.*\[Object\.<anonymous>\(logger\.spec\.ts:\d{1,3}:\d{1,2}\)\]:.*$/
      );
    });
    it("Log line correctly shows log text", () => {
      Logger.writeLine(Logger.Levels.Error, "Basic test");
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*: Basic test]$/);
    });
    it("Log Level NoOutput", () => {
      Logger.writeLine(Logger.Levels.NoOutput, "Basic test");
      expect(logOutput.length).toStrictEqual(0);
    });
    it("Check Error throwning if our output is bad stores", () => {
      Logger.throwErrorIfLogOutputFails = true;
      expect(Logger.throwErrorIfLogOutputFails).toEqual(true);
      Logger.throwErrorIfLogOutputFails = false;
      expect(Logger.throwErrorIfLogOutputFails).toEqual(false);
    });
  });
  describe("Basic Log stuff (Panic mode)", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Logger.loggingLevel = Logger.Levels.Error;
      Logger.PANIC_MODE = true;
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });
    it("Log line preamble correctly shows Line levels", () => {
      Logger.loggingLevel = Logger.Levels.Verbose;
      Logger.writeLine(Logger.Levels.Error, "error test");
      Logger.writeLine(Logger.Levels.Warning, "warn test");
      Logger.writeLine(Logger.Levels.FrameworkDebug, "framework debug test");
      Logger.writeLine(
        Logger.Levels.FrameworkInformation,
        "framework information test"
      );
      Logger.writeLine(Logger.Levels.TestDebug, "test debug test");
      Logger.writeLine(Logger.Levels.TestInformation, "test information test");
      Logger.writeLine(20, "special stuff");

      expect(logOutput.length).toStrictEqual(7);
      expect(logOutput[0]).toMatch(/Message: \[PERROR - .*$/);
      expect(logOutput[1]).toMatch(/Message: \[PWARNG - .*$/);
      expect(logOutput[2]).toMatch(/Message: \[PFKDBG - .*$/);
      expect(logOutput[3]).toMatch(/Message: \[PFKINF - .*$/);
      expect(logOutput[4]).toMatch(/Message: \[PTSDBG - .*$/);
      expect(logOutput[5]).toMatch(/Message: \[PTSINF - .*$/);
      expect(logOutput[6]).toMatch(/Message: \[P00020 - .*$/);
    });
    it("Custom line preamble", () => {
      //
      // We set time to be JUST the year and elapsed to just month short-name
      // Test by checking year starts 20 (to test will work up to 2099) and month
      // is Jan (elapsed says time since 1/1/1970).
      //
      Logger.loggingLevel = Logger.Levels.Verbose;

      Logger.writeLineOptions.timeFormat = ">>'TIME:' yyyy<<";
      Logger.writeLineOptions.elapsedFormat = ">>'TIME:' MMM<<";
      Logger.writeLine(Logger.Levels.Error, "error test");

      expect(logOutput.length).toStrictEqual(1);
      expect(logOutput[0]).toMatch(
        /Message: \[PERROR - \[>>TIME: 20\d{2}<<\]\[>>TIME: Jan<<\].*$/
      );
    });
    it("Verify correct filtering", () => {
      //
      // This test sets current logging level at TestDebug.  So, TestDebug, TestInformation, Warning
      // and Errors should come through
      //
      Logger.loggingLevel = Logger.Levels.TestDebug;
      //
      // It also sets a filter.  So, errors between 20 and 25 (inclusive) should come through
      //
      Logger.loggingFilter = { minLevel: 20, maxLevel: 25 };

      Logger.writeLine(Logger.Levels.TestInformation, "test information test");
      Logger.writeLine(Logger.Levels.TestDebug, "test debug test");
      Logger.writeLine(
        Logger.Levels.FrameworkInformation,
        "framework information test"
      ); // This one will come through as well - Panic Mode!
      Logger.writeLine(19, "test information test 19"); // This one will come through as well - Panic Mode!
      Logger.writeLine(20, "test information test 20");
      Logger.writeLine(25, "test information test 25");
      Logger.writeLine(26, "test information test 26"); // This one will come through as well - Panic Mode!

      expect(logOutput.length).toStrictEqual(7);
      expect(logOutput[0]).toMatch(/Message: \[PTSINF - .*$/);
      expect(logOutput[1]).toMatch(/Message: \[PTSDBG - .*$/);
      expect(logOutput[2]).toMatch(/Message: \[PFKINF - .*$/);
      expect(logOutput[3]).toMatch(/Message: \[P00019 - .*$/);
      expect(logOutput[4]).toMatch(/Message: \[P00020 - .*$/);
      expect(logOutput[5]).toMatch(/Message: \[P00025 - .*$/);
      expect(logOutput[6]).toMatch(/Message: \[P00026 - .*$/);
    });
    it("Log line preamble correctly shows Line levels", () => {
      Logger.loggingLevel = Logger.Levels.Verbose;
      Logger.writeLine(Logger.Levels.Error, "error test");
      Logger.writeLine(Logger.Levels.Warning, "warn test");
      Logger.writeLine(Logger.Levels.FrameworkDebug, "framework debug test");
      Logger.writeLine(
        Logger.Levels.FrameworkInformation,
        "framework information test"
      );
      Logger.writeLine(Logger.Levels.TestDebug, "test debug test");
      Logger.writeLine(Logger.Levels.TestInformation, "test information test");
      Logger.writeLine(20, "special stuff");

      expect(logOutput.length).toStrictEqual(7);
      expect(logOutput[0]).toMatch(/Message: \[PERROR - .*$/);
      expect(logOutput[1]).toMatch(/Message: \[PWARNG - .*$/);
      expect(logOutput[2]).toMatch(/Message: \[PFKDBG - .*$/);
      expect(logOutput[3]).toMatch(/Message: \[PFKINF - .*$/);
      expect(logOutput[4]).toMatch(/Message: \[PTSDBG - .*$/);
      expect(logOutput[5]).toMatch(/Message: \[PTSINF - .*$/);
      expect(logOutput[6]).toMatch(/Message: \[P00020 - .*$/);
    });
    it("Log line preamble correctly shows actual time (actual time not checked) and time since test start (not really checked..)", () => {
      Logger.writeLine(Logger.Levels.Error, "Basic test");
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(
        /^.*- \[\d{2}:\d{2}:\d{2}\]\[00:00\.\d{3}\] \[.*$/
      );
    });
    it("Log line preamble correctly shows file/line/position of caller (actual line/position not checked as it could change!", () => {
      Logger.writeLine(Logger.Levels.Error, "Basic test");
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(
        /^.*\[Object\.<anonymous>\(logger\.spec\.ts:\d{1,3}:\d{1,2}\)\]:.*$/
      );
    });
    it("Log line correctly shows log text", () => {
      Logger.writeLine(Logger.Levels.Error, "Basic test");
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*: Basic test]$/);
    });
    it("Log Level NoOutput - Panic mode so NoOutputs should work", () => {
      Logger.writeLine(Logger.Levels.NoOutput, "Basic test");
      expect(logOutput.length).toStrictEqual(1);
    });
    it("Check Error throwning if our output is bad stores", () => {
      Logger.throwErrorIfLogOutputFails = true;
      expect(Logger.throwErrorIfLogOutputFails).toEqual(true);
      Logger.throwErrorIfLogOutputFails = false;
      expect(Logger.throwErrorIfLogOutputFails).toEqual(false);
    });
  });

  describe("Multiline logging", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Logger.loggingLevel = Logger.Levels.Error;
      Logger.logOutputCallback = (message) => {
        logOutput.push(message);
      };
    });
    it("Log correctly splits multiline logging", () => {
      Logger.writeLine(Logger.Levels.Error, "Basic test line 1\nTest line 2");
      expect(logOutput.length).toStrictEqual(2);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*: Basic test line 1$/);
      expect(logOutput[1]).toMatch(/^.*: Test line 2$/);
    });
    it("Multiline limits honoured", () => {
      Logger.writeLine(
        Logger.Levels.Error,
        "Basic test line 1\nTest line 2\nTest line 3\nTest line 4\nTest line 5\nTest line 6",
        { maxLines: 4 }
      );
      expect(logOutput.length).toStrictEqual(4);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*: Basic test line 1$/);
      expect(logOutput[1]).toMatch(/^.*: Test line 2$/);
      expect(logOutput[2]).toMatch(
        /^.*: ... \(Skipping some lines as total length \(6\) > 4!!\)$/
      );
      expect(logOutput[3]).toMatch(/^.*: Test line 6$/);
    });
  });
  describe("Preamble Supression", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Logger.loggingLevel = Logger.Levels.Error;
      Logger.logOutputCallback = (message) => {
        logOutput.push(message);
      };
    });
    it("Full supression for single line", () => {
      Logger.writeLine(Logger.Levels.Error, "Suppress test line 1", {
        suppressAllPreamble: true,
      });
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
    });
    it("Full supression for multiple lines", () => {
      Logger.writeLine(
        Logger.Levels.Error,
        "Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6",
        { suppressAllPreamble: true }
      );
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^Suppress test line 3$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 4$/);
      expect(logOutput[4]).toMatch(/^Suppress test line 5$/);
      expect(logOutput[5]).toMatch(/^Suppress test line 6$/);
    });
    it("Full supression overides for multiple lines with no limit", () => {
      Logger.writeLine(
        Logger.Levels.Error,
        "Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6",
        { suppressMultilinePreamble: true, suppressAllPreamble: true }
      );
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^Suppress test line 3$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 4$/);
      expect(logOutput[4]).toMatch(/^Suppress test line 5$/);
      expect(logOutput[5]).toMatch(/^Suppress test line 6$/);
    });
    it("Full multiline suppression only", () => {
      Logger.writeLine(
        Logger.Levels.Error,
        "Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6",
        { suppressMultilinePreamble: true }
      );
      expect(logOutput[0]).toMatch(/^.*: Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^Suppress test line 3$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 4$/);
      expect(logOutput[4]).toMatch(/^Suppress test line 5$/);
      expect(logOutput[5]).toMatch(/^Suppress test line 6$/);
    });
    it("Full multiline suppression with length limit", () => {
      Logger.writeLine(
        Logger.Levels.Error,
        "Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6",
        { maxLines: 4, suppressMultilinePreamble: true }
      );
      expect(logOutput[0]).toMatch(/^.*: Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(
        /^\.\.\. \(Skipping some lines as total length \(6\) > 4!!\)$/
      );
      expect(logOutput[3]).toMatch(/^Suppress test line 6$/);
    });
    it("Full suppression with length limit", () => {
      Logger.writeLine(
        Logger.Levels.Error,
        "Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6",
        { maxLines: 4, suppressAllPreamble: true }
      );
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(
        /^\.\.\. \(Skipping some lines as total length \(6\) > 4!!\)$/
      );
      expect(logOutput[3]).toMatch(/^Suppress test line 6$/);
    });
    it("Full suppression AND multiline with length limit", () => {
      Logger.writeLine(
        Logger.Levels.Error,
        "Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6",
        {
          maxLines: 4,
          suppressMultilinePreamble: true,
          suppressAllPreamble: true,
        }
      );
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(
        /^\.\.\. \(Skipping some lines as total length \(6\) > 4!!\)$/
      );
      expect(logOutput[3]).toMatch(/^Suppress test line 6$/);
    });

    it("Multiline limits honoured", () => {
      Logger.writeLine(
        Logger.Levels.Error,
        "Suppress test line 1\nTest line 2\nTest line 3\nTest line 4\nTest line 5\nTest line 6",
        { maxLines: 4 }
      );
      expect(logOutput.length).toStrictEqual(4);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Suppress test
      expect(logOutput[0]).toMatch(/^.*: Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^.*: Test line 2$/);
      expect(logOutput[2]).toMatch(
        /^.*: ... \(Skipping some lines as total length \(6\) > 4!!\)$/
      );
      expect(logOutput[3]).toMatch(/^.*: Test line 6$/);
    });
  });
  describe("Get Current Logging Level after setting", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });
    it.each([
      [Logger.Levels.FrameworkDebug],
      [Logger.Levels.FrameworkInformation],
      [Logger.Levels.TestDebug],
      [Logger.Levels.TestInformation],
      [Logger.Levels.Error],
      [Logger.Levels.NoOutput],
      [7],
    ])("Level %p returns %p", (level) => {
      Logger.loggingLevel = level;
      expect(Logger.loggingLevel).toEqual(level);
    });
  });
  describe("Get Current Logging Level texts", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });
    it.each([
      [Logger.Levels.FrameworkDebug, "Framework debug (FKDBG)"],
      [Logger.Levels.FrameworkInformation, "Framework information (FKINF)"],
      [Logger.Levels.TestDebug, "Test debug (TSDBG)"],
      [Logger.Levels.TestInformation, "Test information (TSINF)"],
      [Logger.Levels.Error, "Errors only (ERROR)"],
      [Logger.Levels.NoOutput, "No output from Log (NOOUT)"],
      [7, "Special Level - (7)"],
    ])(
      "Level %p returns %p when set using Log.LogLevels enum or number",
      (level, expectedText) => {
        Logger.loggingLevel = level;
        const actual = Logger.loggingLevelText;
        expect(actual).toMatch(expectedText);
      }
    );
    it("Level is unknown (Should be impossible!)", () => {
      (Logger as any)["options"]["loggingCurrentLevel"] = -10;
      expect(Logger.loggingLevelText).toMatch("Unknown!");
    });
    it.each([
      ["Framework debug", "Framework debug (FKDBG)"],
      ["Framework information", "Framework information (FKINF)"],
      ["TEST DEBUG", "Test debug (TSDBG)"],
      ["test information", "Test information (TSINF)"],
      ["Error", "Errors only (ERROR)"],
      ["No Output", "No output from Log (NOOUT)"],
    ])(
      "Level text %p returns %p when set using Log.LogLevels enum or number",
      (level, expectedText) => {
        Logger.loggingLevel = level;
        expect(Logger.loggingLevelText).toMatch(expectedText);
      }
    );
    it.each([
      ["fkdbg", "Framework debug (FKDBG)"],
      ["fkINF", "Framework information (FKINF)"],
      ["ts dbg", "Test debug (TSDBG)"],
      ["TSINF", "Test information (TSINF)"],
      ["noout", "No output from Log (NOOUT)"],
    ])(
      "Level text %p returns %p when set using Log.LogLevels enum or number",
      (level, expectedText) => {
        Logger.loggingLevel = level;
        expect(Logger.loggingLevelText).toMatch(expectedText);
      }
    );
  });

  describe("Ensure incorrect Log Level setting correctly caught and handled", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });
    it("Setting log level with invalid text logs correct error error and defaults to Framework Debug", () => {
      Logger.loggingLevel = Logger.Levels.NoOutput;
      // Now we set using invalid text
      Logger.loggingLevel = "wibble";
      // Should default to Framework debug
      expect(Logger.loggingLevel).toEqual(Logger.Levels.FrameworkDebug);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(
        /\[WARNG.*Unknown Log Level \[wibble\]\. Defaulting to Framework Debug!/
      );
    });
    it("Setting log level with a negative logs correct error and defaults to Framework Debug", () => {
      Logger.loggingLevel = Logger.Levels.NoOutput;
      // Now we set using invalid text
      Logger.loggingLevel = -1;
      // Should default to Framework debug
      expect(Logger.loggingLevel).toEqual(Logger.Levels.FrameworkDebug);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(
        /\[WARNG.*Invalid Log Level \[-1\] \(Must be integer greater than zero\)\. Defaulting to Framework Debug!/
      );
    });
    it("Setting log level with a decimal logs correct error and defaults to Framework Debug", () => {
      Logger.loggingLevel = Logger.Levels.NoOutput;
      // Now we set using invalid text
      Logger.loggingLevel = 3.7;
      // Should default to Framework debug
      expect(Logger.loggingLevel).toEqual(Logger.Levels.FrameworkDebug);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(
        /\[WARNG.*Invalid Log Level \[3\.7\] \(Must be integer greater than zero\)\. Defaulting to Framework Debug!/
      );
    });
  });

  describe("General Attach test steps", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });
    it("Verify a bad type is detected in error message", () => {
      Logger.logOutputCallback = (message, mediaType) => {
        if (mediaType === "base64:image/png") throw new Error("My Error");
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
      (
        Logger.attach as (
          logLevel: number,
          badParam: any,
          mediaType: string
        ) => void
      )(Logger.Levels.Error, 24, "base64:image/png");
      expect(logOutput.length).toEqual(6);
      expect(logOutput[3]).toMatch(/Not a string! Is type number/);
    });
    it("Verify a very long attach is truncated to avoid results overruns", () => {
      Logger.logOutputCallback = (message, mediaType) => {
        if (mediaType === "base64:image/png") throw new Error("My Error");
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
      Logger.attach(
        Logger.Levels.Error,
        "A very long text that will have to be truncated so that it doesnt overrun",
        "base64:image/png"
      );
      expect(logOutput.length).toEqual(6);
      expect(logOutput[3]).toMatch(/A very long text that wil.\.\.run/);
    });
  });

  describe("Screenshot test steps", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });
    it("Check screen buffer attachment", () => {
      const testString = "Test string";
      const testBuffer = Buffer.from("Test string", "utf8");
      const base64 = testBuffer.toString("base64");
      Logger.attachScreenshot(Logger.Levels.Error, testBuffer);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(
        new RegExp(
          `MediaType\: \[base64\:image\/png\]\, Message\: \[${base64}\]`.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )
        )
      );
    });

    it("Check screen string attachment", () => {
      const testString = "Test string";
      const testBuffer = Buffer.from("Test string", "utf8");
      const base64 = testBuffer.toString("base64");
      Logger.attachScreenshot(Logger.Levels.Error, testString);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(
        new RegExp(
          `MediaType\: \[base64\:image\/png\]\, Message\: \[${base64}\]`.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )
        )
      );
    });

    it("Check if Reporter doesnt like it", () => {
      const testText = "No Like";
      const screenShot = "test";
      Logger.logOutputCallback = (message, mediaType) => {
        if (mediaType === "base64:image/png") throw new Error(testText);
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
      Logger.attachScreenshot(Logger.Levels.Error, screenShot);
      expect(logOutput.length).toEqual(6);
      expect(logOutput[0]).toMatch(/\[ERROR/); // First is the error description
      expect(logOutput[1]).toMatch(new RegExp(`\[${testText}\]`)); // Then the error the Callback threw
      expect(logOutput[3]) // Forth line is the attachment text
        .toMatch(
          new RegExp(
            `\[${Buffer.from(screenShot, "utf8") // In our case base64 encoded screenshot
              .toString("base64")}\]`
          )
        );
      expect(logOutput[5]).toMatch(/\[base64:image\/png\]/); // Last line is the media type
    });

    it("Check if Reporter doesnt like it but throwing an error", () => {
      const testText = "No Like";
      const screenShot = "test";
      Logger.throwErrorIfLogOutputFails = true;
      Logger.logOutputCallback = (message, mediaType) => {
        if (mediaType === "base64:image/png") throw new Error(testText);
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
      let errorText = "";
      try {
        Logger.attachScreenshot(Logger.Levels.Error, screenShot);
      } catch (err) {
        errorText = (err as Error).message;
      }
      logOutput = errorText.split("\n");
      expect(logOutput.length).toEqual(6);
      expect(logOutput[0]).toMatch(/Error thrown from Log Output Callback/); // First is the error description
      expect(logOutput[1]).toMatch(new RegExp(`${testText}`)); // Then the error the Callback threw
      expect(logOutput[3]) // Forth line is the attachment text
        .toMatch(
          new RegExp(
            `${Buffer.from(screenShot, "utf8") // In our case base64 encoded screenshot
              .toString("base64")}`
          )
        );
      expect(logOutput[5]).toMatch(/base64:image\/png/); // Last line is the media type
    });
  });

  describe("Video test steps", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
      Logger.loggingLevel = Logger.Levels.Error;
    });
    afterEach(() => {
      Logger.reset();
    });

    it("Check video buffer attachment", () => {
      const testString = "Test string";
      const testBuffer = Buffer.from(testString, "utf8");
      const base64TestBuffer = testBuffer.toString("base64");

      Logger.attachVideo(Logger.Levels.Error, testBuffer);

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="320" height="180"><source src="data:video/webm;base64,${base64TestBuffer}" type="video/webm">Video (Codec webm) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(
        new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
    });

    it("Check video buffer attachment using options", () => {
      const testString = "Test string";
      const width = 340;
      const height = 200;
      const codec = "Mats_Own";
      const testBuffer = Buffer.from(testString, "utf8");
      const base64 = testBuffer.toString("base64");

      Logger.attachVideo(Logger.Levels.Error, testBuffer, {
        width: width,
        height: height,
        videoCodec: codec,
      });

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="${width}" height="${height}"><source src="data:video/${codec};base64,${base64}" type="video/${codec}">Video (Codec ${codec}) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(
        new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
    });

    it("Check video buffer attachment with only height modified", () => {
      const testString = "Test string";
      const width = 320;
      const height = 200;
      const codec = "webm";
      const testBuffer = Buffer.from(testString, "utf8");
      const base64 = testBuffer.toString("base64");

      Logger.videoOptions = { height: height };

      Logger.attachVideo(Logger.Levels.Error, testBuffer);

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="${width}" height="${height}"><source src="data:video/${codec};base64,${base64}" type="video/${codec}">Video (Codec ${codec}) not supported by browser</video>`;
      //      const expected = `MediaType: [text/html], Message: [${videoHTML}]`; //.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expected = `MediaType: [text/html], Message: [${videoHTML}`.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      expect(logOutput[0]).toMatch(new RegExp(expected));
    });

    it("Check video buffer attachment with only width modified", () => {
      const testString = "Test string";
      const width = 320;
      const height = 180;
      const codec = "webm";
      const testBuffer = Buffer.from(testString, "utf8");
      const base64 = testBuffer.toString("base64");

      Logger.videoOptions = { width: width };

      Logger.attachVideo(Logger.Levels.Error, testBuffer);

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="${width}" height="${height}"><source src="data:video/${codec};base64,${base64}" type="video/${codec}">Video (Codec ${codec}) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(
        new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
    });

    it("Check video buffer attachment as file", () => {
      const fileName = "testData/testData.txt";
      const testBuffer = readFileSync(fileName);
      const testString = testBuffer.toString("utf8");
      const base64 = testBuffer.toString("base64");

      Logger.attachVideoFile(Logger.Levels.Error, fileName);

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="320" height="180"><source src="data:video/webm;base64,${base64}" type="video/webm">Video (Codec webm) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(
        new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
    });

    it("Check video buffer attachment as file but bad file", () => {
      const fileName = "testData/testData.txt";
      const testBuffer = Buffer.from("", "utf8");
      const testString = testBuffer.toString("utf8");
      const base64 = testBuffer.toString("base64");

      Logger.attachVideoFile(Logger.Levels.Error, "nothere/" + fileName);

      expect(logOutput.length).toEqual(2);
      expect(logOutput[0]).toMatch(/\[ERROR.*Error thrown reading video data/);
      expect(logOutput[1]).toMatch(/\[ENOENT.*no such file or directory/);
    });
  });

  describe("HTML test steps", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });

    it("Check HTML attachment", () => {
      const testHTML = "<div>hello</div>";
      Logger.attachHTML(Logger.Levels.Error, testHTML);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(
        new RegExp(
          `MediaType\: \[text\/html\]\, Message\: \[${testHTML}\]`.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )
        )
      );
    });
  });

  describe("Validate console logging", () => {
    let logOutput = new Array<string>();
    let logSpy: jest.SpyInstance;
    let callBack: unknown;
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      logSpy = jest.spyOn(console, "log").mockImplementation();
      callBack = (message: string, mediaType: string): void => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
    });
    afterEach(() => {
      logSpy.mockRestore(); // resets the spy to the original implementation
    });
    it("When writing to Logoutput Callback and logToConsole set true, Log writes to console", () => {
      Logger.logOutputCallback = callBack as typeof Logger.logOutputCallback;
      Logger.logToConsole = true;

      Logger.loggingLevel = Logger.Levels.FrameworkDebug;
      Logger.writeLine(Logger.Levels.TestInformation, "test information test");
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/TSINF - \[.*test information/)
      );
    });
    it("When writing to Logoutput Callback and logToConsole set false, Log does not write to console", () => {
      Logger.logOutputCallback = callBack as typeof Logger.logOutputCallback;
      Logger.logToConsole = false;

      Logger.loggingLevel = Logger.Levels.FrameworkDebug;
      Logger.writeLine(Logger.Levels.TestInformation, "test eeeenformation test");
      expect(logSpy).toHaveBeenCalledTimes(0);
    });
    it("When NOT writing to Logoutput Callback and logToConsole set false, Log still writes to console", () => {
      Logger.clearOutputCallback();
      Logger.logToConsole = false;

      Logger.loggingLevel = Logger.Levels.FrameworkDebug;
      Logger.writeLine(Logger.Levels.TestInformation, "test meformation test");
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/TSINF - \[.*test meformation test/)
      );
    });
    it("When not writing to Logoutput Callback AND logToConsole set true, Log only writes once to console", () => {
      Logger.clearOutputCallback();
      Logger.logToConsole = true;

      Logger.loggingLevel = Logger.Levels.FrameworkDebug;
      Logger.writeLine(Logger.Levels.TestInformation, "test meformation test");
      expect(logSpy).toHaveBeenCalledTimes(1);
    });
    it("Veg", () => {
      (Logger.logOutputCallback as any) = "asdf";
      Logger.attach(Logger.Levels.Error, "Test text", "base64:image/png");
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Log Output callback is type \[string\]/)
      );
    });
  });

  describe("Validate setting of video window dimensions", () => {
    let logOutput = new Array<string>();
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Logger.loggingLevel = Logger.Levels.Warning;
      Logger.logOutputCallback = (message, mediaType) => {
        logOutput.push(
          `MediaType: [${mediaType ?? "Not Defined"}], Message: [${message}]`
        );
      };
      Logger.videoOptions = { height: 180, width: 320 };
    });
    it("Sets valid dimensions, width minimum", () => {
      Logger.videoOptions = { height: 181, width: 320 };
      const actual = Logger.videoOptions;

      expect(logOutput.length).toStrictEqual(0);
      expect(actual).toEqual({ videoCodec: "webm", height: 181, width: 320 });
    });

    it("Width and Height too low. Correct error messages and dimensions both untouched", () => {
      Logger.videoOptions = { height: 179, width: 319 };
      const actual = Logger.videoOptions;

      expect(logOutput.length).toStrictEqual(2);
      expect(logOutput[0]).toMatch(
        /Message: \[WARNG - .*Invalid video window height \[179\]: must be number equal or between 180 and 4320\. Height \(and width if set\) ignored/
      );
      expect(logOutput[1]).toMatch(
        /Message: \[WARNG - .*Invalid video window width \[319\]: must be number equal or between 320 and 7680\. Width \(and height if set\) ignored/
      );
      expect(actual).toEqual({ videoCodec: "webm", height: 180, width: 320 });
    });
    it("Width and Height too high. Correct error message", () => {
      Logger.videoOptions = { height: 4321, width: 7681 };

      expect(logOutput.length).toStrictEqual(2);
      expect(logOutput[0]).toMatch(
        /Message: \[WARNG - .*Invalid video window height \[4321\]: must be number equal or between 180 and 4320\. Height \(and width if set\) ignored/
      );
      expect(logOutput[1]).toMatch(
        /Message: \[WARNG - .*Invalid video window width \[7681\]: must be number equal or between 320 and 7680\. Width \(and height if set\) ignored/
      );
    });
    it("Width incorrect. Correct error message and dimensions both untouched", () => {
      Logger.videoOptions = { videoCodec: "webm", height: 1000, width: 3 };
      const actual = Logger.videoOptions;

      expect(logOutput.length).toStrictEqual(1);
      expect(logOutput[0]).toMatch(
        /Message: \[WARNG - .*Invalid video window width \[3\]: must be number equal or between 320 and 7680\. Width \(and height if set\) ignored/
      );
      expect(actual).toEqual({ videoCodec: "webm", height: 180, width: 320 });
    });
    it("Height incorrect. Correct error message and dimensions both untouched", () => {
      Logger.videoOptions = { height: 2, width: 1000 };
      const actual = Logger.videoOptions;

      expect(logOutput.length).toStrictEqual(1);
      expect(logOutput[0]).toMatch(
        /Message: \[WARNG - .*Invalid video window height \[2\]: must be number equal or between 180 and 4320\. Height \(and width if set\) ignored/
      );
      expect(actual).toEqual({ videoCodec: "webm", height: 180, width: 320 });
    });
  });
});
