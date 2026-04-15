import { addDays, addMonths, addYears, format } from "date-fns";

import { Detokeniser } from "./detokeniser";

describe("Detokeniser", () => {
  afterEach(() => {
    Detokeniser.reset();
  });

  // ─── Basic string manipulation ───────────────────────────────────────────────

  describe("Basic string manipulation with no tokens", () => {
    it("no token in string", () => {
      expect(Detokeniser.do("No token here")).toStrictEqual("No token here");
    });

    it("empty string", () => {
      expect(Detokeniser.do("")).toStrictEqual("");
    });

    it("no token but with an opener", () => {
      expect(Detokeniser.do("No token [[here")).toStrictEqual("No token [[here");
    });

    it("no token but with a closer", () => {
      expect(Detokeniser.do("No token ]]here")).toStrictEqual("No token ]]here");
    });

    it("string with unknown token throws", () => {
      expect(() => Detokeniser.do("[[unknown]]")).toThrow(
        "Error processing [[[unknown]]]: Unsupported token [unknown]"
      );
    });

    it("string with escaped token opener and closer", () => {
      expect(Detokeniser.do("No /[[token/]] here")).toStrictEqual("No [[token]] here");
    });

    it("string with escaped escape then escaped token opener and closer", () => {
      expect(Detokeniser.do("No ///[[token/]] here")).toStrictEqual("No /[[token]] here");
    });

    it("non-token text preserved around a resolved token", () => {
      expect(Detokeniser.do("PREFIX-[[random|digits|4]]-SUFFIX")).toMatch(/^PREFIX-\d{4}-SUFFIX$/);
    });
  });

  // ─── Random token ────────────────────────────────────────────────────────────

  describe("Random token", () => {
    it("float - 1 decimal place, no rounding", () => {
      expect(Detokeniser.do("[[random|float(100.4999,100.4999)|1]]")).toMatch(/^100\.4$/);
      expect(Detokeniser.do("[[random|float(100.5,100.5)|2]]")).toMatch(/^100\.50$/);
    });

    it("float - 2 decimal places", () => {
      expect(Detokeniser.do("[[random|float(100.3,100.4999)|2]]")).toMatch(/^100\.[34]\d$/);
    });

    it("from - single char from numeric set", () => {
      expect(Detokeniser.do("[[random|from(1234567890)|1]]")).toMatch(/^\d$/);
    });

    it("from - 5 chars from alpha set", () => {
      expect(Detokeniser.do("[[random|from(abcd)|5]]")).toMatch(/^[abcd]{5}$/);
    });

    it("from - with escaped token opener inside paren content", () => {
      // /[[ inside from() is a literal [[ — result chars should include [
      expect(Detokeniser.do("[[random|from(ab/[[)|3]]")).toMatch(/^[ab[]{3}$/);
    });

    it("digits - 1 character", () => {
      expect(Detokeniser.do("[[random|digits|1]]")).toMatch(/^[0-9]$/);
    });

    it("digits - 4 characters", () => {
      expect(Detokeniser.do("[[random|digits|4]]")).toMatch(/^[0-9]{4}$/);
    });

    it("letters - 1 character", () => {
      expect(Detokeniser.do("[[random|letters|1]]")).toMatch(/^[a-zA-Z]$/);
    });

    it("letters - 5 characters", () => {
      expect(Detokeniser.do("[[random|letters|5]]")).toMatch(/^[a-zA-Z]{5}$/);
    });

    it("lowercaseletters - 6 characters", () => {
      expect(Detokeniser.do("[[random|lowercaseletters|6]]")).toMatch(/^[a-z]{6}$/);
    });

    it("uppercaseletters - 10 characters", () => {
      expect(Detokeniser.do("[[random|uppercaseletters|10]]")).toMatch(/^[A-Z]{10}$/);
    });

    it("alphanumerics - 10 characters", () => {
      expect(Detokeniser.do("[[random|alphanumerics|10]]")).toMatch(/^[0-9a-zA-Z]{10}$/);
    });

    it("date - fixed range, formatted", () => {
      // 21600000–21660000 ms epoch is entirely within 1970-01-01
      expect(Detokeniser.do("[[random|date(21600000,21660000)|dd-MM-yyyy]]")).toMatch(/^01-01-1970$/);
    });

    it("date - range returned as epoch within bounds", () => {
      const result = parseInt(Detokeniser.do("[[random|date(21600000,108000000)|epoch]]"));
      expect(result).toBeGreaterThanOrEqual(21600000);
      expect(result).toBeLessThanOrEqual(108000000);
    });
  });

  // ─── Date token (sync) ───────────────────────────────────────────────────────

  describe("Date token (sync)", () => {
    it("fixed date as epoch", () => {
      expect(Detokeniser.do("[[date|2013-4-5|epoch]]")).toBe("1365120000000");
    });

    it("fixed date as second-epoch", () => {
      expect(Detokeniser.do("[[date|2013-4-5|second-epoch]]")).toBe("1365120000");
    });

    it("fixed date formatted", () => {
      expect(Detokeniser.do("[[date|2013-4-5|MM=dd=yyyy]]")).toBe("04=05=2013");
    });

    it("today returns today", () => {
      const result = Detokeniser.do("[[date|today|yyyy-MM-dd]]");
      expect(result).toBe(format(new Date(), "yyyy-MM-dd"));
    });

    it("now returns today", () => {
      const result = Detokeniser.do("[[date|now|yyyy-MM-dd]]");
      expect(result).toBe(format(new Date(), "yyyy-MM-dd"));
    });

    it("yesterday", () => {
      const result = Detokeniser.do("[[date|yesterday|yyyy-MM-dd]]");
      expect(result).toBe(format(addDays(new Date(), -1), "yyyy-MM-dd"));
    });

    it("tomorrow", () => {
      const result = Detokeniser.do("[[date|tomorrow|yyyy-MM-dd]]");
      expect(result).toBe(format(addDays(new Date(), 1), "yyyy-MM-dd"));
    });

    it("addYears", () => {
      const result = Detokeniser.do("[[date|AddYears(3)|EEE MMM dd yyyy]]");
      expect(result).toBe(format(addYears(new Date(), 3), "EEE MMM dd yyyy"));
    });

    it("addMonths", () => {
      const result = Detokeniser.do("[[date|AddMonths(3)|EEE MMM dd yyyy]]");
      expect(result).toBe(format(addMonths(new Date(), 3), "EEE MMM dd yyyy"));
    });

    it("addDays", () => {
      const result = Detokeniser.do("[[date|AddDays(3)|EEE MMM dd yyyy]]");
      expect(result).toBe(format(addDays(new Date(), 3), "EEE MMM dd yyyy"));
    });

    it("addHours", () => {
      // 0 hours → same date
      const result = Detokeniser.do("[[date|AddHours(0)|yyyy-MM-dd]]");
      expect(result).toBe(format(new Date(), "yyyy-MM-dd"));
    });

    it("addMinutes", () => {
      // 0 minutes → same date
      const result = Detokeniser.do("[[date|AddMinutes(0)|yyyy-MM-dd]]");
      expect(result).toBe(format(new Date(), "yyyy-MM-dd"));
    });

    it("random date within a fixed epoch range", () => {
      // 946684800000 = 2000-01-01 UTC, 946771200000 = 2000-01-02 UTC
      const result = Detokeniser.do("[[date|random(946684800000,946771200000)|yyyy-MM-dd]]");
      expect(result).toMatch(/^2000-01-0[12]$/);
    });

    it("followingDay - following Friday after Sunday 2013-04-07 is 2013-04-12", () => {
      // 1365292800000 = 2013-04-07 00:00:00 UTC
      expect(Detokeniser.do("[[date|followingDay(1365292800000,friday)|yyyy-MM-dd]]")).toBe("2013-04-12");
    });

    it("addWorkingDays throws - requires doAsync", () => {
      expect(() => Detokeniser.do("[[date|addWorkingDays(5)|dd-MM-yyyy]]")).toThrow(
        "addworkingdays uses asynchoronous calls"
      );
    });

    it("followingWorkingDay throws - requires doAsync", () => {
      expect(() => Detokeniser.do("[[date|followingWorkingDay(1234567890,wednesday)|dd-MM-yyyy]]")).toThrow(
        "followingworkingday uses asynchoronous calls"
      );
    });

    it("nextPublicHoliday throws - requires doAsync", () => {
      expect(() => Detokeniser.do("[[date|nextPublicHoliday(1234567890,90)|dd-MM-yyyy]]")).toThrow(
        "nextpublicholiday uses asynchoronous calls"
      );
    });
  });

  // ─── Date token (async) ──────────────────────────────────────────────────────

  describe("Date token (async)", () => {
    it("fixed date as epoch", async () => {
      expect(await Detokeniser.doAsync("[[date|2013-4-5|epoch]]")).toBe("1365120000000");
    });

    it("fixed date formatted", async () => {
      expect(await Detokeniser.doAsync("[[date|2013-4-5|MM=dd=yyyy]]")).toBe("04=05=2013");
    });

    it("today", async () => {
      const result = await Detokeniser.doAsync("[[date|today|yyyy-MM-dd]]");
      expect(result).toBe(format(new Date(), "yyyy-MM-dd"));
    });

    it("addDays", async () => {
      const result = await Detokeniser.doAsync("[[date|AddDays(5)|EEE MMM dd yyyy]]");
      expect(result).toBe(format(addDays(new Date(), 5), "EEE MMM dd yyyy"));
    });
  });

  // ─── Nested tokens ───────────────────────────────────────────────────────────

  describe("Nested tokens", () => {
    it("random digit nested inside date addDays", () => {
      const result = Detokeniser.do("[[date|addDays([[random|digits|1]])|yyyy-MM-dd]]");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("nested date epoch inside date random", () => {
      // Innermost [[date|...]] tokens resolve to epoch strings first, then outer random picks between them
      const result = Detokeniser.do(
        "[[date|random([[date|2000-01-01|epoch]],[[date|2000-01-02|epoch]])|yyyy-MM-dd]]"
      );
      expect(result).toMatch(/^2000-01-0[12]$/);
    });

    it("async: nested tokens resolve innermost first", async () => {
      const result = await Detokeniser.doAsync(
        "[[date|random([[date|2000-01-01|epoch]],[[date|2000-01-02|epoch]])|yyyy-MM-dd]]"
      );
      expect(result).toMatch(/^2000-01-0[12]$/);
    });
  });

  // ─── BASE64 token ────────────────────────────────────────────────────────────

  describe("BASE64 token", () => {
    it("encode", () => {
      const value = "Hello World";
      const encoded = Detokeniser.do(`[[base64|encode|${value}]]`);
      expect(Buffer.from(encoded, "base64").toString()).toBe(value);
    });

    it("encode value containing pipe character", () => {
      // pipe is the 3rd segment so splitRemaining handles it correctly
      const value = "Hello|World";
      const encoded = Detokeniser.do(`[[base64|encode|${value}]]`);
      expect(Buffer.from(encoded, "base64").toString()).toBe(value);
    });

    it("decode", () => {
      const value = "Hello World";
      const encoded = Buffer.from(value).toString("base64");
      expect(Detokeniser.do(`[[base64|decode|${encoded}]]`)).toBe(value);
    });

    it("decode value containing pipe character in original", () => {
      const value = "Hello|World";
      const encoded = Buffer.from(value).toString("base64");
      expect(Detokeniser.do(`[[base64|decode|${encoded}]]`)).toBe(value);
    });

    it("encode/decode roundtrip via nested tokens", () => {
      const value = "roundtrip test 123";
      const encoded = Detokeniser.do(`[[base64|encode|${value}]]`);
      const decoded = Detokeniser.do(`[[base64|decode|${encoded}]]`);
      expect(decoded).toBe(value);
    });

    it("invalid direction throws", () => {
      expect(() => Detokeniser.do("[[base64|baddir|something]]")).toThrow();
    });
  });

  // ─── JWT token ───────────────────────────────────────────────────────────────

  describe("JWT token", () => {
    it("full JWT with payload, signature and options", () => {
      const result = Detokeniser.do('[[jwt|{"sub":"1234","name":"Test"}|MySecret|{"algorithm":"HS256"}]]');
      expect(result).toBeDefined();
      expect(result.split(".").length).toBe(3);
    });

    it("JWT with payload and signature, no options", () => {
      const result = Detokeniser.do('[[jwt|{"sub":"1234"}|MySecret]]');
      expect(result).toBeDefined();
      expect(result.split(".").length).toBe(3);
    });

    it("JWT with payload only, no signature or options", () => {
      const result = Detokeniser.do('[[jwt|{"sub":"1234","name":"Test"}]]');
      expect(result).toBeDefined();
      expect(result.split(".").length).toBe(3);
    });
  });

  // ─── Setting token ───────────────────────────────────────────────────────────

  describe("Setting token", () => {
    it("invalid postamble (not key:value JSON) throws", () => {
      expect(() => Detokeniser.do("[[setting|invalid]]")).toThrow();
    });

    it("reads from process env", () => {
      const envName = "DETOKENISER_SPEC_TEST_VAR";
      const envValue = "hello from env";
      process.env[envName] = envValue;
      try {
        expect(Detokeniser.do(`[[setting|processEnvName: "${envName}"]]`)).toBe(envValue);
      } finally {
        delete process.env[envName];
      }
    });

    it("reads from contextParameters", () => {
      const result = Detokeniser.do('[[setting|profileParameterName: "myParam"]]', {
        contextParameters: { myParam: "contextValue" },
      });
      expect(result).toBe("contextValue");
    });

    it("uses defaultValue when env var not set", () => {
      const result = Detokeniser.do(
        '[[setting|processEnvName: "DETOKENISER_SPEC_DEFINITELY_NOT_SET_XYZ", defaultValue: "fallback"]]'
      );
      expect(result).toBe("fallback");
    });
  });

  // ─── mockintercepts token ────────────────────────────────────────────────────

  describe("mockintercepts token", () => {
    it("throws when no intercepted requests are available", () => {
      expect(() => Detokeniser.do("[[mockintercepts|$.requests[0].body.id]]")).toThrow(
        "No Mock Intercepted requests to harvest from!?"
      );
    });
  });

  // ─── Callbacks ───────────────────────────────────────────────────────────────

  describe("Callbacks", () => {
    afterEach(() => {
      Detokeniser.resetCallbacks();
    });

    it("sync callback receives full token body and its return value is used", () => {
      let capturedToken: string | undefined;
      Detokeniser.addCallback((token: string) => {
        capturedToken = token;
        return "syncResult";
      });
      const result = Detokeniser.do("[[mytoken]]");
      expect(capturedToken).toBe("mytoken");
      expect(result).toBe("syncResult");
    });

    it("sync callback receives token with multiple pipe-separated parts", () => {
      let capturedToken: string | undefined;
      Detokeniser.addCallback((token: string) => {
        capturedToken = token;
        return "ok";
      });
      Detokeniser.do("[[mytype|arg1|arg2]]");
      expect(capturedToken).toBe("mytype|arg1|arg2");
    });

    it("first callback returning undefined passes to second", () => {
      Detokeniser.addCallback((token: string) => (token === "first" ? "one" : undefined));
      Detokeniser.addCallback((token: string) => (token === "second" ? "two" : undefined));
      expect(Detokeniser.do("[[first]]")).toBe("one");
      expect(Detokeniser.do("[[second]]")).toBe("two");
    });

    it("all callbacks returning undefined throws unsupported token", () => {
      Detokeniser.addCallback(() => undefined);
      expect(() => Detokeniser.do("[[anything]]")).toThrow("Unsupported token");
    });

    it("async callback is skipped by do() and throws unsupported token", () => {
      Detokeniser.addCallback(async () => "asyncResult");
      expect(() => Detokeniser.do("[[anything]]")).toThrow("Unsupported token");
    });

    it("async callback receives full token body and its return value is used by doAsync", async () => {
      let capturedToken: string | undefined;
      Detokeniser.addCallback(async (token: string) => {
        capturedToken = token;
        return "asyncResult";
      });
      const result = await Detokeniser.doAsync("[[asynctoken]]");
      expect(capturedToken).toBe("asynctoken");
      expect(result).toBe("asyncResult");
    });

    it("async callback receives token with multiple pipe-separated parts via doAsync", async () => {
      let capturedToken: string | undefined;
      Detokeniser.addCallback(async (token: string) => {
        capturedToken = token;
        return "ok";
      });
      await Detokeniser.doAsync("[[asynctype|arg1|arg2]]");
      expect(capturedToken).toBe("asynctype|arg1|arg2");
    });

    it("sync callback also works via doAsync", async () => {
      Detokeniser.addCallback((token: string) => (token === "mytoken" ? "syncResult" : undefined));
      const result = await Detokeniser.doAsync("[[mytoken]]");
      expect(result).toBe("syncResult");
    });

    it("resetCallbacks clears all callbacks", async () => {
      Detokeniser.addCallback(() => "sync");
      Detokeniser.addCallback(async () => "async");
      Detokeniser.resetCallbacks();
      expect(() => Detokeniser.do("[[anything]]")).toThrow("Unsupported token");
      await expect(Detokeniser.doAsync("[[anything]]")).rejects.toThrow("Unsupported token");
    });

    it("reset clears all callbacks", async () => {
      Detokeniser.addCallback(() => "sync");
      Detokeniser.addCallback(async () => "async");
      Detokeniser.reset();
      expect(() => Detokeniser.do("[[anything]]")).toThrow("Unsupported token");
      await expect(Detokeniser.doAsync("[[anything]]")).rejects.toThrow("Unsupported token");
    });
  });
});
