import { Log } from "./log";
import { readFileSync } from "fs";


// Unit tests for Log utility
describe('Log', () => {
  describe('Basic Log stuff', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Log.loggingCurrentLevel = Log.LogLevels.Error;
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });
    it('Log line preamble correctly shows Line levels', () => {
      Log.loggingCurrentLevel = Log.LogLevels.FrameworkDebug;
      Log.writeLine(Log.LogLevels.Error, 'error test');
      Log.writeLine(Log.LogLevels.FrameworkDebug, 'framework debug test');
      Log.writeLine(Log.LogLevels.FrameworkInformation, 'framework information test');
      Log.writeLine(Log.LogLevels.TestDebug, 'test debug test');
      Log.writeLine(Log.LogLevels.TestInformation, 'test information test');
      Log.writeLine(0, 'test information test');


      expect(logOutput.length).toStrictEqual(6);
      expect(logOutput[0]).toMatch(/Message: \[ERROR - .*$/);
      expect(logOutput[1]).toMatch(/Message: \[FKDBG - .*$/);
      expect(logOutput[2]).toMatch(/Message: \[FKINF - .*$/);
      expect(logOutput[3]).toMatch(/Message: \[TSDBG - .*$/);
      expect(logOutput[4]).toMatch(/Message: \[TSINF - .*$/);
      expect(logOutput[5]).toMatch(/Message: \[LOG   - .*$/);
    });
    it('Log line preamble correctly shows Special levels', () => {
      Log.loggingCurrentLevel = 123;

      Log.writeLine(Log.LogLevels.TestDebug, 'test debug test');
      Log.writeLine(122, 'test information test 122');
      Log.writeLine(123, 'test information test 122');
      Log.writeLine(124, 'test information test 124'); // This one should not come thru

      expect(logOutput.length).toStrictEqual(3);
      expect(logOutput[0]).toMatch(/Message: \[TSDBG - .*$/);
      expect(logOutput[1]).toMatch(/Message: \[00122 - .*$/);
      expect(logOutput[2]).toMatch(/Message: \[00123 - .*$/);
    });
    it('Log line preamble correctly shows actual time (actual time not checked) and time since test start (not really checked..)', () => {
      Log.writeLine(Log.LogLevels.Error, 'Basic test');
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*- \[\d{2}:\d{2}:\d{2}\]\[00:00:00\.\d\] \[.*$/);
    });
    it('Log line preamble correctly shows file/line/position of caller (actual line/position not checked as it could change!', () => {
      Log.writeLine(Log.LogLevels.Error, 'Basic test');
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*\[Object\.<anonymous>\(log\.spec\.ts:\d{1,2}:\d{1,2}\)\]:.*$/);
    });
    it('Log line correctly shows log text', () => {
      Log.writeLine(Log.LogLevels.Error, 'Basic test');
      expect(logOutput.length).toStrictEqual(1);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*: Basic test]$/);
    });
    it('Log Level NoOutput', () => {
      Log.writeLine(Log.LogLevels.NoOutput, 'Basic test');
      expect(logOutput.length).toStrictEqual(0);
    });
    it('Check Error throwning if our output is bad stores', () => {
      Log.throwErrorIfLogOutputFails = true;
      expect(Log.throwErrorIfLogOutputFails).toEqual(true);
      Log.throwErrorIfLogOutputFails = false;
      expect(Log.throwErrorIfLogOutputFails).toEqual(false);
    });
  });

  describe('Multiline logging', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Log.loggingCurrentLevel = Log.LogLevels.Error;
      Log.logOutputCallback = (message) => {
        logOutput.push(message);
      };
    });
    it('Log correctly splits multiline logging', () => {
      Log.writeLine(Log.LogLevels.Error, 'Basic test line 1\nTest line 2');
      expect(logOutput.length).toStrictEqual(2);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*: Basic test line 1$/);
      expect(logOutput[1]).toMatch(/^.*: Test line 2$/);
    });
    it('Multiline limits honoured', () => {
      Log.writeLine(Log.LogLevels.Error, 'Basic test line 1\nTest line 2\nTest line 3\nTest line 4\nTest line 5\nTest line 6', { maxLines: 4 });
      expect(logOutput.length).toStrictEqual(4);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Basic test
      expect(logOutput[0]).toMatch(/^.*: Basic test line 1$/);
      expect(logOutput[1]).toMatch(/^.*: Test line 2$/);
      expect(logOutput[2]).toMatch(/^.*: ... \(Skipping some lines as total length \(6\) > 4!!\)$/);
      expect(logOutput[3]).toMatch(/^.*: Test line 6$/);
    });
  });
  describe('Preamble Supression', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Log.loggingCurrentLevel = Log.LogLevels.Error;
      Log.logOutputCallback = (message) => {
        logOutput.push(message);
      };
    });
    it('Full supression for single line', () => {
      Log.writeLine(Log.LogLevels.Error, 'Suppress test line 1', { suppressAllPreamble: true });
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
    });
    it('Full supression for multiple lines', () => {
      Log.writeLine(Log.LogLevels.Error, 'Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6', { suppressAllPreamble: true });
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^Suppress test line 3$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 4$/);
      expect(logOutput[4]).toMatch(/^Suppress test line 5$/);
      expect(logOutput[5]).toMatch(/^Suppress test line 6$/);
    });
    it('Full supression overides for multiple lines with no limit', () => {
      Log.writeLine(Log.LogLevels.Error, 'Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6', { suppressMultilinePreamble: true, suppressAllPreamble: true });
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^Suppress test line 3$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 4$/);
      expect(logOutput[4]).toMatch(/^Suppress test line 5$/);
      expect(logOutput[5]).toMatch(/^Suppress test line 6$/);
    });
    it('Full multiline suppression only', () => {
      Log.writeLine(Log.LogLevels.Error, 'Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6', { suppressMultilinePreamble: true });
      expect(logOutput[0]).toMatch(/^.*: Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^Suppress test line 3$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 4$/);
      expect(logOutput[4]).toMatch(/^Suppress test line 5$/);
      expect(logOutput[5]).toMatch(/^Suppress test line 6$/);
    });
    it('Full multiline suppression with length limit', () => {
      Log.writeLine(Log.LogLevels.Error, 'Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6', { maxLines: 4, suppressMultilinePreamble: true });
      expect(logOutput[0]).toMatch(/^.*: Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^\.\.\. \(Skipping some lines as total length \(6\) > 4!!\)$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 6$/);
    });
    it('Full suppression with length limit', () => {
      Log.writeLine(Log.LogLevels.Error, 'Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6', { maxLines: 4, suppressAllPreamble: true });
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^\.\.\. \(Skipping some lines as total length \(6\) > 4!!\)$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 6$/);
    });
    it('Full suppression AND multiline with length limit', () => {
      Log.writeLine(Log.LogLevels.Error, 'Suppress test line 1\nSuppress test line 2\nSuppress test line 3\nSuppress test line 4\nSuppress test line 5\nSuppress test line 6', { maxLines: 4, suppressMultilinePreamble: true, suppressAllPreamble: true });
      expect(logOutput[0]).toMatch(/^Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^Suppress test line 2$/);
      expect(logOutput[2]).toMatch(/^\.\.\. \(Skipping some lines as total length \(6\) > 4!!\)$/);
      expect(logOutput[3]).toMatch(/^Suppress test line 6$/);
    });

    it('Multiline limits honoured', () => {
      Log.writeLine(Log.LogLevels.Error, 'Suppress test line 1\nTest line 2\nTest line 3\nTest line 4\nTest line 5\nTest line 6', { maxLines: 4 });
      expect(logOutput.length).toStrictEqual(4);
      // ERROR - [07:58:18][00:00:00.0] [Object.<anonymous>(Log.spec.ts:15:17)]: Suppress test
      expect(logOutput[0]).toMatch(/^.*: Suppress test line 1$/);
      expect(logOutput[1]).toMatch(/^.*: Test line 2$/);
      expect(logOutput[2]).toMatch(/^.*: ... \(Skipping some lines as total length \(6\) > 4!!\)$/);
      expect(logOutput[3]).toMatch(/^.*: Test line 6$/);
    });
  });
  describe('Get Current Logging Level after setting', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });
    it.each([
      [Log.LogLevels.FrameworkDebug],
      [Log.LogLevels.FrameworkInformation,],
      [Log.LogLevels.TestDebug],
      [Log.LogLevels.TestInformation],
      [Log.LogLevels.Error],
      [Log.LogLevels.NoOutput],
      [7]
    ])('Level %p returns %p', (level) => {
      Log.loggingCurrentLevel = level;
      expect(Log.loggingCurrentLevel).toEqual(level);
    });
  });
  describe('Get Current Logging Level texts', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });
    it.each([
      [Log.LogLevels.FrameworkDebug, "Framework debug (FKDBG)"],
      [Log.LogLevels.FrameworkInformation, "Framework information (FKINF)"],
      [Log.LogLevels.TestDebug, "Test debug (TSDBG)"],
      [Log.LogLevels.TestInformation, "Test information (TSINF)"],
      [Log.LogLevels.Error, "Errors only (ERROR)"],
      [Log.LogLevels.NoOutput, "No output from Log (NOOUT)"],
      [7, "Special Level - (7)"]
    ])('Level %p returns %p when set using Log.LogLevels enum or number', (level, expectedText) => {
      Log.loggingCurrentLevel = level;
      expect(Log.loggingCurrentLevelText).toMatch(expectedText);
    });
    it('Level is unknown (Should be impossible!)', () => {
      (Log as any)['_loggingCurrentLevel'] = -10;
      expect(Log.loggingCurrentLevelText).toMatch("Unknown!");
    });
    it.each([
      ["Framework debug", "Framework debug (FKDBG)"],
      ["Framework information", "Framework information (FKINF)"],
      ["TEST DEBUG", "Test debug (TSDBG)"],
      ["test information", "Test information (TSINF)"],
      ["Error", "Errors only (ERROR)"],
      ["No Output", "No output from Log (NOOUT)"]
    ])('Level text %p returns %p when set using Log.LogLevels enum or number', (level, expectedText) => {
      Log.loggingCurrentLevel = level;
      expect(Log.loggingCurrentLevelText).toMatch(expectedText);
    });
    it.each([
      ["fkdbg", "Framework debug (FKDBG)"],
      ["fkINF", "Framework information (FKINF)"],
      ["ts dbg", "Test debug (TSDBG)"],
      ["TSINF", "Test information (TSINF)"],
      ["noout", "No output from Log (NOOUT)"]
    ])('Level text %p returns %p when set using Log.LogLevels enum or number', (level, expectedText) => {
      Log.loggingCurrentLevel = level;
      expect(Log.loggingCurrentLevelText).toMatch(expectedText);
    });
  });

  describe('Ensure incorrect Log Level setting correctly caught and handled', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });
    it('Setting log level with invalid text logs correct error error and defaults to Framework Debug', () => {
      Log.loggingCurrentLevel = Log.LogLevels.NoOutput;
      // Now we set using invalid text
      Log.loggingCurrentLevel = "wibble";
      // Should default to Framework debug
      expect(Log.loggingCurrentLevel).toEqual(Log.LogLevels.FrameworkDebug);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(/\[LOG.*Unknown Log Level \[wibble\]\. Defaulting to Framework Debug!/);
    });
    it('Setting log level with a negative logs correct error and defaults to Framework Debug', () => {
      Log.loggingCurrentLevel = Log.LogLevels.NoOutput;
      // Now we set using invalid text
      Log.loggingCurrentLevel = -1;
      // Should default to Framework debug
      expect(Log.loggingCurrentLevel).toEqual(Log.LogLevels.FrameworkDebug);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(/\[LOG.*Invalid Log Level \[-1\] \(Must be integer greater than zero\)\. Defaulting to Framework Debug!/);
    });
    it('Setting log level with zero (a special Log-Only case) logs correct error and defaults to Framework Debug', () => {
      Log.loggingCurrentLevel = Log.LogLevels.NoOutput;
      // Now we set using invalid text
      Log.loggingCurrentLevel = 0;
      // Should default to Framework debug
      expect(Log.loggingCurrentLevel).toEqual(Log.LogLevels.FrameworkDebug);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(/\[LOG.*Invalid Log Level \[0\] \(Must be integer greater than zero\)\. Defaulting to Framework Debug!/);
    });
    it('Setting log level with a decimal logs correct error and defaults to Framework Debug', () => {
      Log.loggingCurrentLevel = Log.LogLevels.NoOutput;
      // Now we set using invalid text
      Log.loggingCurrentLevel = 3.7;
      // Should default to Framework debug
      expect(Log.loggingCurrentLevel).toEqual(Log.LogLevels.FrameworkDebug);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(/\[LOG.*Invalid Log Level \[3\.7\] \(Must be integer greater than zero\)\. Defaulting to Framework Debug!/);
    });

  });

  describe('General Attach test steps', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });
    it('Verify a bad type is detected in error message', () => {
      Log.logOutputCallback = (message, mediaType) => {
        if (mediaType === 'base64:image/png') throw new Error('My Error');
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
      (Log.attach as (logLevel: Log.LogLevels, badParam: any, mediaType: string) => void)(0, 24, "base64:image/png");
      expect(logOutput.length).toEqual(6);
      expect(logOutput[3]).toMatch(/Not a string! Is type number/);
    });
    it('Verify a very long attach is truncated to avoid results overruns', () => {
      Log.logOutputCallback = (message, mediaType) => {
        if (mediaType === 'base64:image/png') throw new Error('My Error');
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
      Log.attach(0, "A very long text that will have to be truncated so that it doesnt overrun", "base64:image/png")
      expect(logOutput.length).toEqual(6);
      expect(logOutput[3]).toMatch(/A very long text that wil.\.\.run/);
    });
  });

  describe('Screenshot test steps', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });
    it('Verify screenshot steps defaults to false and can be set/read ok', () => {
      expect(Log.screenshotSteps).toEqual(false);
      Log.screenshotSteps = true;
      expect(Log.screenshotSteps).toEqual(true);
      Log.screenshotSteps = false;
      expect(Log.screenshotSteps).toEqual(false);
      Log.screenshotSteps = true;
      expect(Log.screenshotSteps).toEqual(true);
    });

    it('Check screen buffer attachment', () => {
      const testString = "Test string";
      const testBuffer = Buffer.from("Test string", 'utf8');
      const base64 = testBuffer.toString('base64');
      Log.attachScreenshot(0, testBuffer);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(new RegExp(`MediaType\: \[base64\:image\/png\]\, Message\: \[${base64}\]`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('Check screen string attachment', () => {
      const testString = "Test string";
      const testBuffer = Buffer.from("Test string", 'utf8');
      const base64 = testBuffer.toString('base64');
      Log.attachScreenshot(0, testString);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(new RegExp(`MediaType\: \[base64\:image\/png\]\, Message\: \[${base64}\]`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('Check if Reporter doesnt like it', () => {
      const testText = 'No Like';
      const screenShot = 'test';
      Log.logOutputCallback = (message, mediaType) => {
        if (mediaType === 'base64:image/png') throw new Error(testText);
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
      Log.attachScreenshot(0, screenShot);
      expect(logOutput.length).toEqual(6);
      expect(logOutput[0]).toMatch(/\[ERROR/);  // First is the error description
      expect(logOutput[1]).toMatch(new RegExp(`\[${testText}\]`)); // Then the error the Callback threw
      expect(logOutput[3]) // Forth line is the attachment text
        .toMatch(new RegExp(`\[${Buffer // In our case base64 encoded screenshot
          .from(screenShot, 'utf8').toString('base64')}\]`));
      expect(logOutput[5]).toMatch(/\[base64:image\/png\]/); // Last line is the media type
    });

    it('Check if Reporter doesnt like it but throwing an error', () => {
      const testText = 'No Like';
      const screenShot = 'test';
      Log.throwErrorIfLogOutputFails = true;
      Log.logOutputCallback = (message, mediaType) => {
        if (mediaType === 'base64:image/png') throw new Error(testText);
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
      let errorText = "";
      try {
        Log.attachScreenshot(0, screenShot);
      }
      catch (err) {
        errorText = (err as Error).message;
      }
      logOutput = errorText.split('\n');
      expect(logOutput.length).toEqual(6);
      expect(logOutput[0]).toMatch(/Error thrown from Log Output Callback/);  // First is the error description
      expect(logOutput[1]).toMatch(new RegExp(`${testText}`)); // Then the error the Callback threw
      expect(logOutput[3]) // Forth line is the attachment text
        .toMatch(new RegExp(`${Buffer // In our case base64 encoded screenshot
          .from(screenShot, 'utf8').toString('base64')}`));
      expect(logOutput[5]).toMatch(/base64:image\/png/); // Last line is the media type
    });



  });

  describe('Video test steps', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });
    afterEach(() => {
      Log.reset();
    });

    it('Check video buffer attachment', () => {
      const testString = "Test string";
      const testBuffer = Buffer.from(testString, 'utf8');
      const base64 = testBuffer.toString('base64');

      Log.attachVideo(0, testBuffer);

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="320" height="180"><source src="data:video/webm;base64,${base64}" type="video/webm">Video (Codec webm) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('Check video buffer attachment using options', () => {
      const testString = "Test string";
      const width = 300;
      const height = 200;
      const codec = "Mats_Own";
      const testBuffer = Buffer.from(testString, 'utf8');
      const base64 = testBuffer.toString('base64');

      Log.attachVideo(0, testBuffer, { width: width, height: height, videoCodec: codec });

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="${width}" height="${height}"><source src="data:video/${codec};base64,${base64}" type="video/${codec}">Video (Codec ${codec}) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    });

    it('Check video buffer attachment with only hight modified', () => {
      const testString = "Test string";
      const width = 320;
      const height = 200;
      const codec = "webm";
      const testBuffer = Buffer.from(testString, 'utf8');
      const base64 = testBuffer.toString('base64');

      Log.videoResolution = { height: height };

      Log.attachVideo(0, testBuffer);

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="${width}" height="${height}"><source src="data:video/${codec};base64,${base64}" type="video/${codec}">Video (Codec ${codec}) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    });

    it('Check video buffer attachment with only width modified', () => {
      const testString = "Test string";
      const width = 320;
      const height = 180;
      const codec = "webm";
      const testBuffer = Buffer.from(testString, 'utf8');
      const base64 = testBuffer.toString('base64');

      Log.videoResolution = { width: width };

      Log.attachVideo(0, testBuffer);

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="${width}" height="${height}"><source src="data:video/${codec};base64,${base64}" type="video/${codec}">Video (Codec ${codec}) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('Check video buffer attachment as file', () => {
      const fileName = "testData/testData.txt";
      const testBuffer = readFileSync(fileName);
      const testString = testBuffer.toString('utf8');
      const base64 = testBuffer.toString('base64');

      Log.attachVideoFile(0, fileName);

      expect(logOutput.length).toEqual(1);
      const videoHTML = `<video controls width="320" height="180"><source src="data:video/webm;base64,${base64}" type="video/webm">Video (Codec webm) not supported by browser</video>`;
      const expected = `MediaType: [text/html], Message: [${videoHTML}]`;
      expect(logOutput[0]).toMatch(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    });

    it('Check video buffer attachment as file but bad file', () => {
      const fileName = "testData/testData.txt";
      const testBuffer = Buffer.from('', 'utf8');
      const testString = testBuffer.toString('utf8');
      const base64 = testBuffer.toString('base64');

      Log.attachVideoFile(0, 'nothere/' + fileName);

      expect(logOutput.length).toEqual(2);
      expect(logOutput[0]).toMatch(/\[ERROR.*Error thrown reading video data/);
      expect(logOutput[1]).toMatch(/\[ENOENT.*no such file or directory/);
    });

  });

  describe('HTML test steps', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });

    it('Check HTML attachment', () => {
      const testHTML = "<div>hello</div>"
      Log.attachHTML(Log.LogLevels.Error, testHTML);
      expect(logOutput.length).toEqual(1);
      expect(logOutput[0]).toMatch(new RegExp(`MediaType\: \[text\/html\]\, Message\: \[${testHTML}\]`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  });

  describe('Validate console logging', () => {
    let logOutput = new Array<string>;
    let logSpy: jest.SpyInstance;
    let callBack: unknown;
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      logSpy = jest.spyOn(console, 'log').mockImplementation();
      callBack = (message: string, mediaType: string): void => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
    });
    afterEach(() => {
      logSpy.mockRestore(); // resets the spy to the original implementation
    });
    it('When writing to Logoutput Callback and logToConsole set true, Log writes to console', () => {
      Log.logOutputCallback = callBack as typeof Log.logOutputCallback;
      Log.logToConsole = true;

      Log.loggingCurrentLevel = Log.LogLevels.FrameworkDebug;
      Log.writeLine(Log.LogLevels.TestInformation, 'test information test');
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/TSINF - \[.*test information/));
    });
    it('When writing to Logoutput Callback and logToConsole set false, Log does not write to console', () => {
      Log.logOutputCallback = callBack as typeof Log.logOutputCallback;
      Log.logToConsole = false;

      Log.loggingCurrentLevel = Log.LogLevels.FrameworkDebug;
      Log.writeLine(Log.LogLevels.TestInformation, 'test eeeenformation test');
      expect(logSpy).toHaveBeenCalledTimes(0);
    });
    it('When NOT writing to Logoutput Callback and logToConsole set false, Log still writes to console', () => {
      Log.clearOutputCallback();
      Log.logToConsole = false;

      Log.loggingCurrentLevel = Log.LogLevels.FrameworkDebug;
      Log.writeLine(Log.LogLevels.TestInformation, 'test meformation test');
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/TSINF - \[.*test meformation test/));
    });
    it('When not writing to Logoutput Callback AND logToConsole set true, Log only writes once to console', () => {
      Log.clearOutputCallback();
      Log.logToConsole = true;

      Log.loggingCurrentLevel = Log.LogLevels.FrameworkDebug;
      Log.writeLine(Log.LogLevels.TestInformation, 'test meformation test');
      expect(logSpy).toHaveBeenCalledTimes(1);
    });
     it('Veg', () => {
      (Log.logOutputCallback as any) = "asdf";
      Log.attach(0, "Test text", "base64:image/png")
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Log Output callback is type \[string\]/));
    });
  });

  describe('Validate setting of video window dimensions', () => {
    let logOutput = new Array<string>;
    beforeEach(() => {
      logOutput = [];
      // As default, set logging to Error (least amount of output) and wire up a callback so we can test the output...
      Log.loggingCurrentLevel = Log.LogLevels.Error;
      Log.logOutputCallback = (message, mediaType) => {
        logOutput.push(`MediaType: [${mediaType ?? 'Not Defined'}], Message: [${message}]`);
      };
      Log.videoResolution = { height: 180, width: 320 };
    });
    it('Sets valid dimensions, width minimum', () => {
      Log.videoResolution = { height: 181, width: 320 };
      const actual = Log.videoResolution;

      expect(logOutput.length).toStrictEqual(0);
      expect(actual).toEqual({ height: 181, width: 320 });
    });

    it('Width and Height too low. Correct error messages and dimensions both untouched', () => {
      Log.videoResolution = { height: 179, width: 319 };
      const actual = Log.videoResolution;

      expect(logOutput.length).toStrictEqual(2);
      expect(logOutput[0]).toMatch(/Message: \[ERROR - .*Invalid video window height \[179\]: must be number between 180 and 4320\. Height \(& Width if set\) ignored/);
      expect(logOutput[1]).toMatch(/Message: \[ERROR - .*Invalid video window width \[319\]: must be number between 320 and 7680\. Width \(& Height if set\) ignored/);
      expect(actual).toEqual({ height: 180, width: 320 });
    });
    it('Width and Height too high. Correct error message', () => {
      Log.videoResolution = { height: 4321, width: 7681 };

      expect(logOutput.length).toStrictEqual(2);
      expect(logOutput[0]).toMatch(/Message: \[ERROR - .*Invalid video window height \[4321\]: must be number between 180 and 4320\. Height \(& Width if set\) ignored/);
      expect(logOutput[1]).toMatch(/Message: \[ERROR - .*Invalid video window width \[7681\]: must be number between 320 and 7680\. Width \(& Height if set\) ignored/);
    });
    it('Width incorrect. Correct error message and dimensions both untouched', () => {
      Log.videoResolution = { height: 1000, width: 3 };
      const actual = Log.videoResolution;

      expect(logOutput.length).toStrictEqual(1);
      expect(logOutput[0]).toMatch(/Message: \[ERROR - .*Invalid video window width \[3\]: must be number between 320 and 7680\. Width \(& Height if set\) ignored/);
      expect(actual).toEqual({ height: 180, width: 320 });
    });
    it('Height incorrect. Correct error message and dimensions both untouched', () => {
      Log.videoResolution = { height: 2, width: 1000 };
      const actual = Log.videoResolution;

      expect(logOutput.length).toStrictEqual(1);
      expect(logOutput[0]).toMatch(/Message: \[ERROR - .*Invalid video window height \[2\]: must be number between 180 and 4320\. Height \(& Width if set\) ignored/);
      expect(actual).toEqual({ height: 180, width: 320 });
    });
  });
});