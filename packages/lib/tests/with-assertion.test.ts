// tests/with-assertion.test.ts
import { assertEquals } from "@std/assert";
import { withAssertion } from "../src/with-assertion.ts";
import { AssertionErrorCode } from "../src/errors.ts";
import { generateSyntheticAssertion } from "./fixtures/generate-assertion.ts";
import {
  DEFAULT_ASSERTION_HEADER,
  DEFAULT_DEVICE_ID_HEADER,
} from "../src/with-assertion.ts";
import { encodeBase64 } from "@std/encoding/base64";
import { exportKeyToPem } from "../src/utils.ts";

const TEST_APP_ID = "TEAMID1234.com.example.testapp";

// Helper: create a valid attested request
async function buildAttestedRequest(
  url: string,
  body: object,
  opts: { appId: string; signCount: number; keyPair?: CryptoKeyPair },
) {
  const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
  const fixture = await generateSyntheticAssertion({
    appId: opts.appId,
    clientData: bodyBytes,
    signCount: opts.signCount,
    keyPair: opts.keyPair,
  });
  const req = new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [DEFAULT_ASSERTION_HEADER]: encodeBase64(fixture.assertion),
      [DEFAULT_DEVICE_ID_HEADER]: "test-device-123",
    },
    body: bodyBytes,
  });
  return { req, fixture };
}

// Shared mock storage helpers
function createMockStorage(fixture: {
  publicKeyPem: string;
  signCount: number;
}) {
  let storedSignCount = fixture.signCount - 1; // previous sign count
  return {
    getDeviceKey: (_deviceId: string) =>
      Promise.resolve({
        publicKeyPem: fixture.publicKeyPem,
        signCount: storedSignCount,
      }),
    commitSignCount: (_deviceId: string, newSignCount: number) => {
      // CAS semantics: only advance if strictly greater.
      if (storedSignCount < newSignCount) {
        storedSignCount = newSignCount;
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    },
    getStoredSignCount: () => storedSignCount,
  };
}

// --- Happy Path ---

Deno.test("withAssertion: valid assertion → handler runs and returns response", async () => {
  const { req, fixture } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );
  const storage = createMockStorage(fixture);

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: storage.getDeviceKey,
      commitSignCount: storage.commitSignCount,
    },
    (_req, { deviceId, signCount, rawBody }) => {
      const body = JSON.parse(new TextDecoder().decode(rawBody));
      return new Response(
        JSON.stringify({ echo: body.text, deviceId, signCount }),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  );

  const res = await handler(req);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.echo, "hello");
  assertEquals(json.deviceId, "test-device-123");
  assertEquals(json.signCount, 1);
});

Deno.test("withAssertion: sign count updated before handler runs", async () => {
  const { req, fixture } = await buildAttestedRequest(
    "http://localhost/test",
    { action: "order" },
    { appId: TEST_APP_ID, signCount: 5 },
  );
  const storage = createMockStorage(fixture);

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: storage.getDeviceKey,
      commitSignCount: storage.commitSignCount,
    },
    () => {
      // By the time the handler runs, sign count should already be updated
      assertEquals(storage.getStoredSignCount(), 5);
      return new Response("ok");
    },
  );

  await handler(req);
});

// --- Extraction Errors ---

Deno.test("withAssertion: missing assertion header → 400", async () => {
  const req = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      [DEFAULT_DEVICE_ID_HEADER]: "device-123",
    },
    body: "{}",
  });

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () => Promise.resolve(null),
      commitSignCount: () => Promise.resolve(true),
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, AssertionErrorCode.INVALID_FORMAT);
});

Deno.test("withAssertion: missing device ID header → 400", async () => {
  const req = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      [DEFAULT_ASSERTION_HEADER]: "some-assertion",
    },
    body: "{}",
  });

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () => Promise.resolve(null),
      commitSignCount: () => Promise.resolve(true),
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, AssertionErrorCode.INVALID_FORMAT);
});

// --- Device Not Found ---

Deno.test("withAssertion: unknown device → 401 DEVICE_NOT_FOUND", async () => {
  const { req } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () => Promise.resolve(null),
      commitSignCount: () => Promise.resolve(true),
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.code, AssertionErrorCode.DEVICE_NOT_FOUND);
});

// --- Verification Failures → 401 ---

Deno.test("withAssertion: invalid assertion signature → 401", async () => {
  const { req } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  // Return a different key than what signed the assertion
  const otherKeyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const wrongPem = await exportKeyToPem(otherKeyPair.publicKey);

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () =>
        Promise.resolve({
          publicKeyPem: wrongPem,
          signCount: 0,
        }),
      commitSignCount: () => Promise.resolve(true),
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 401);
});

// --- Callback Errors → INTERNAL_ERROR ---

Deno.test("withAssertion: getDeviceKey throws → 500 INTERNAL_ERROR", async () => {
  const { req } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () => Promise.reject(new Error("db connection failed")),
      commitSignCount: () => Promise.resolve(true),
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 500);
  const json = await res.json();
  assertEquals(json.code, AssertionErrorCode.INTERNAL_ERROR);
});

Deno.test("withAssertion: commitSignCount throws → 500 INTERNAL_ERROR", async () => {
  const { req, fixture } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () =>
        Promise.resolve({
          publicKeyPem: fixture.publicKeyPem,
          signCount: 0,
        }),
      commitSignCount: () => Promise.reject(new Error("db write failed")),
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 500);
  const json = await res.json();
  assertEquals(json.code, AssertionErrorCode.INTERNAL_ERROR);
});

// --- Handler Error Boundary ---

Deno.test("withAssertion: handler throw bubbles up, not caught by wrapper", async () => {
  const { req, fixture } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );
  const storage = createMockStorage(fixture);

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: storage.getDeviceKey,
      commitSignCount: storage.commitSignCount,
    },
    () => {
      throw new Error("handler exploded");
    },
  );

  let threw = false;
  try {
    await handler(req);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "handler exploded");
  }
  assertEquals(threw, true);
});

// --- Custom onError ---

Deno.test("withAssertion: custom onError overrides default response", async () => {
  const { req } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () => Promise.resolve(null),
      commitSignCount: () => Promise.resolve(true),
      onError: (error, _req) => {
        return new Response(
          JSON.stringify({ custom: true, code: error.code }),
          { status: 418, headers: { "Content-Type": "application/json" } },
        );
      },
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 418);
  const json = await res.json();
  assertEquals(json.custom, true);
  assertEquals(json.code, AssertionErrorCode.DEVICE_NOT_FOUND);
});

Deno.test("withAssertion: throwing onError falls back to default response", async () => {
  const { req } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () => Promise.resolve(null),
      commitSignCount: () => Promise.resolve(true),
      onError: () => {
        throw new Error("onError callback bug");
      },
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.code, AssertionErrorCode.DEVICE_NOT_FOUND);
});

Deno.test("withAssertion: async-rejecting onError falls back to default response", async () => {
  const { req } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () => Promise.resolve(null),
      commitSignCount: () => Promise.resolve(true),
      onError: () => Promise.reject(new Error("async onError bug")),
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.code, AssertionErrorCode.DEVICE_NOT_FOUND);
});

// --- Custom Extractor ---

Deno.test("withAssertion: custom extractAssertion is used", async () => {
  const bodyBytes = new TextEncoder().encode(
    JSON.stringify({ text: "hello" }),
  );
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: bodyBytes,
    signCount: 1,
  });
  const storage = createMockStorage(fixture);

  // Put assertion in a custom header
  const req = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Custom-Assertion": encodeBase64(fixture.assertion),
      "X-Custom-Device": "custom-device",
    },
    body: bodyBytes,
  });

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: storage.getDeviceKey,
      commitSignCount: storage.commitSignCount,
      extractAssertion: async (req) => {
        const assertion = req.headers.get("X-Custom-Assertion")!;
        const deviceId = req.headers.get("X-Custom-Device")!;
        const clientData = new Uint8Array(await req.arrayBuffer());
        return { assertion, deviceId, clientData };
      },
    },
    (_req, { deviceId }) => {
      return new Response(JSON.stringify({ deviceId }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  const res = await handler(req);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.deviceId, "custom-device");
});

// --- appInfo closure ---

Deno.test("withAssertion: appInfo constructed once, reused across calls", async () => {
  const body = { text: "hello" };
  const bodyBytes = new TextEncoder().encode(JSON.stringify(body));

  const fixture1 = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: bodyBytes,
    signCount: 1,
  });

  let currentSignCount = 0;
  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () =>
        Promise.resolve({
          publicKeyPem: fixture1.publicKeyPem,
          signCount: currentSignCount,
        }),
      commitSignCount: (_deviceId, newSignCount) => {
        if (currentSignCount < newSignCount) {
          currentSignCount = newSignCount;
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      },
    },
    (_req, { signCount }) => {
      return new Response(JSON.stringify({ signCount }));
    },
  );

  // First call
  const req1 = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      [DEFAULT_ASSERTION_HEADER]: encodeBase64(fixture1.assertion),
      [DEFAULT_DEVICE_ID_HEADER]: "device-1",
    },
    body: bodyBytes,
  });
  const res1 = await handler(req1);
  assertEquals(res1.status, 200);
  assertEquals(currentSignCount, 1);

  // Second call with incremented sign count
  const fixture2 = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: bodyBytes,
    signCount: 2,
    keyPair: fixture1.keyPair,
  });
  const req2 = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      [DEFAULT_ASSERTION_HEADER]: encodeBase64(fixture2.assertion),
      [DEFAULT_DEVICE_ID_HEADER]: "device-1",
    },
    body: bodyBytes,
  });
  const res2 = await handler(req2);
  assertEquals(res2.status, 200);
  assertEquals(currentSignCount, 2);
});

// --- TOCTOU fix: commitSignCount CAS semantics ---

Deno.test("withAssertion: commitSignCount returns false → 401 SIGN_COUNT_STALE", async () => {
  const { req, fixture } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () =>
        Promise.resolve({
          publicKeyPem: fixture.publicKeyPem,
          signCount: 0,
        }),
      commitSignCount: () => Promise.resolve(false),
    },
    () => new Response("should not run"),
  );

  const res = await handler(req);
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.code, AssertionErrorCode.SIGN_COUNT_STALE);
});

Deno.test("withAssertion: commitSignCount returns true → handler runs", async () => {
  const { req, fixture } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );

  let handlerRan = false;
  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: () =>
        Promise.resolve({
          publicKeyPem: fixture.publicKeyPem,
          signCount: 0,
        }),
      commitSignCount: () => Promise.resolve(true),
    },
    () => {
      handlerRan = true;
      return new Response("ok");
    },
  );

  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(handlerRan, true);
});

// --- Timings are populated on the context ---

Deno.test("withAssertion: ctx.timings has all four spans populated", async () => {
  const { req, fixture } = await buildAttestedRequest(
    "http://localhost/test",
    { text: "hello" },
    { appId: TEST_APP_ID, signCount: 1 },
  );
  const storage = createMockStorage(fixture);

  let capturedTimings: Record<string, number> | null = null;
  const handler = withAssertion(
    {
      appId: TEST_APP_ID,
      getDeviceKey: storage.getDeviceKey,
      commitSignCount: storage.commitSignCount,
    },
    (_req, ctx) => {
      capturedTimings = ctx.timings as unknown as Record<string, number>;
      return new Response("ok");
    },
  );

  await handler(req);
  if (!capturedTimings) throw new Error("timings not captured");
  const t = capturedTimings as unknown as {
    extractMs: number;
    getDeviceKeyMs: number;
    verifyMs: number;
    commitMs: number;
  };
  // All four fields must exist and be non-negative numbers.
  assertEquals(typeof t.extractMs, "number");
  assertEquals(typeof t.getDeviceKeyMs, "number");
  assertEquals(typeof t.verifyMs, "number");
  assertEquals(typeof t.commitMs, "number");
  assertEquals(t.extractMs >= 0, true);
  assertEquals(t.getDeviceKeyMs >= 0, true);
  assertEquals(t.verifyMs >= 0, true);
  assertEquals(t.commitMs >= 0, true);
});
