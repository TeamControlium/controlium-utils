import { Mock } from "./mock";
import { Logger } from "../logger/logger";

beforeAll(() => {
  Logger.logToConsole = false;
});

describe("Mocking fulfill", () => {
  beforeEach(() => {
    Mock.reset();
  });

  describe("Simple status 200 no headers or data", () => {
    it("Only status (200) returned", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      Mock.addListener("Just Status", [`$[?(@.method == '${methodToListenFor}')]`], { status: statusReturned });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf', method: 'POST', headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
      const fulfulledResponse = (intercepted as { response: Mock.Response })?.response;
      expect(fulfulledResponse.status).toBe(statusReturned);
      expect(fulfulledResponse.statusText).toBe('OK');
      expect(fulfulledResponse.headers).toBeUndefined();
      expect(fulfulledResponse.body).toBeUndefined();
    });

    it("Only status (200) returned - statusText overidden", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      Mock.addListener("Just Status and text", [`$[?(@.method == '${methodToListenFor}')]`], { status: statusReturned, statusText: 'Test OK' });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf', method: 'POST', headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
      const fulfulledResponse = (intercepted as { response: Mock.Response })?.response;
      expect(fulfulledResponse.status).toBe(statusReturned);
      expect(fulfulledResponse.statusText).toBe('Test OK');
      expect(fulfulledResponse.headers).toBeUndefined();
      expect(fulfulledResponse.body).toBeUndefined();
    });

    it("Only status (200) returned - statusText overidden with undefined", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      Mock.addListener("Just Status and undefined text", [`$[?(@.method == '${methodToListenFor}')]`], { status: statusReturned, statusText: '_undefined' });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf', method: methodToListenFor, headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
      const fulfulledResponse = (intercepted as { response: Mock.Response })?.response;
      expect(fulfulledResponse.status).toBe(statusReturned);
      expect(fulfulledResponse.statusText).toBeUndefined();
      expect(fulfulledResponse.headers).toBeUndefined();
      expect(fulfulledResponse.body).toBeUndefined();
    });
  });

  describe("Status 200 with headers and text data", () => {
    it("Status and headers returned", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      const testHeader = { "xyzzy": "abc123", "test1": "value1" };
      const testData = 'Hello world';
      Mock.addListener("Just Status", [`$[?(@.method == '${methodToListenFor}')]`], { status: statusReturned, headers: testHeader, body: testData });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf', method: "POST", headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
      const fulfulledResponse = (intercepted as { response: Mock.Response })?.response;
      expect(fulfulledResponse.status).toBe(statusReturned);
      expect(fulfulledResponse.statusText).toBe('OK');
      expect(fulfulledResponse.headers).toMatchObject(testHeader);
      expect(fulfulledResponse.body).toBe(testData);
    });
    it("Data as an object", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      const testData = { "xyzzy": "abc123", "test1": "value1" };
      Mock.addListener("Just Status", [`$[?(@.method == '${methodToListenFor}')]`], { status: statusReturned, headers: {}, body: testData });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf', method: "POST", headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
      const fulfulledResponse = (intercepted as { response: Mock.Response })?.response;
      expect(fulfulledResponse.body).toMatchObject(testData);
    });
  });

  describe("Intercept combinations", () => {
    it("Status and headers returned", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      const testHeader = { "xyzzy": "abc123", "test1": "value1" };
      const testData = 'Hello world';
      Mock.addListener("Just Status", [`$[?(@.method == '${methodToListenFor}')]`], { status: statusReturned, headers: testHeader, body: testData });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf.my.ending', method: "POST", headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
      const fulfulledResponse = (intercepted as { response: Mock.Response })?.response;
      expect(fulfulledResponse.status).toBe(statusReturned);
      expect(fulfulledResponse.statusText).toBe('OK');
      expect(fulfulledResponse.headers).toMatchObject(testHeader);
      expect(fulfulledResponse.body).toBe(testData);
    });
    it("Match on partial url", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      const testData = { "xyzzy": "abc123", "test1": "value1" };
      Mock.addListener("Just Status", ['$[?(@.url.match("my\.ending$"))]'], { status: statusReturned, headers: {}, body: testData });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf.my.ending', method: "POST", headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
    });
     it("Dont match on partial url not matching", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      const testData = { "xyzzy": "abc123", "test1": "value1" };
      Mock.addListener("Just Status", ['$[?(@.url.match("my\.end$"))]'], { status: statusReturned, headers: {}, body: testData });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf.my.ending', method: "POST", headers: {}, body: '' });
      expect(intercepted.action).toBe('block');
    });
     it("Match on 2 partial url matchers", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      const testData = { "xyzzy": "abc123", "test1": "value1" };
      Mock.addListener("Just Status", ['$[?(@.url.match("my\.ending$"))]','$[?(@.url.match("^https"))]'], { status: statusReturned, headers: {}, body: testData });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf.my.ending', method: "POST", headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
    });
     it("Match on 2 partial url matchers and a method", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      const testData = { "xyzzy": "abc123", "test1": "value1" };
      Mock.addListener("Just Status", ['$[?(@.url.match("my\.ending$"))]','$[?(@.url.match("^https"))]', `$[?(@.method == '${methodToListenFor}')]`], { status: statusReturned, headers: {}, body: testData });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf.my.ending', method: "POST", headers: {}, body: '' });
      expect(intercepted.action).toBe('fulfill');
    });
    it("Match on partial url matcher and a body property", async () => {
      const methodToListenFor = 'POST';
      const statusReturned = 200;
      const testData = { "xyzzy": "abc123", "test1": "value1" };
      Mock.addListener("Just Status", ['$[?(@.url.match("my\.ending$"))]','$[?(@.body.xyzzy == "abc123")]'], { status: statusReturned, headers: {}, body: testData });
      const intercepted = await Mock.processInterceptedRequest({ url: 'https://asdf.my.ending', method: "POST", headers: {}, body: testData });
      expect(intercepted.action).toBe('fulfill');
    });
  });  
});
