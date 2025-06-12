import { Log } from "./log";

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
});