// tests/with-attestation.test.ts
import { assertEquals } from "@std/assert";
import { encodeBase64 } from "@std/encoding/base64";
import { withAttestation } from "../src/with-attestation.ts";
import { AttestationError, AttestationErrorCode } from "../src/errors.ts";

const TEST_APP_ID = "TEAMID1234.com.example.testapp";

function buildBody(obj: unknown): BodyInit {
  return JSON.stringify(obj);
}

function buildReq(body: unknown): Request {
  return new Request("http://localhost/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : buildBody(body),
  });
}

// --- Body extraction errors ---

Deno.test("withAttestation: non-JSON body → 400 INVALID_FORMAT", async () => {
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.resolve(true),
      storeDeviceKey: () => Promise.resolve(),
    },
    () => new Response("should not run"),
  );

  const req = new Request("http://localhost/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json at all",
  });

  const res = await handler(req);
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, AttestationErrorCode.INVALID_FORMAT);
});

Deno.test("withAttestation: missing keyId → 400 INVALID_FORMAT", async () => {
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.resolve(true),
      storeDeviceKey: () => Promise.resolve(),
    },
    () => new Response("should not run"),
  );

  const res = await handler(
    buildReq({
      challenge: encodeBase64(new Uint8Array([1, 2, 3])),
      attestation: encodeBase64(new Uint8Array([4, 5, 6])),
    }),
  );
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, AttestationErrorCode.INVALID_FORMAT);
});

Deno.test("withAttestation: non-base64 challenge → 400 INVALID_FORMAT", async () => {
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.resolve(true),
      storeDeviceKey: () => Promise.resolve(),
    },
    () => new Response("should not run"),
  );

  const res = await handler(
    buildReq({
      keyId: "anything",
      challenge: "!!!not base64!!!",
      attestation: encodeBase64(new Uint8Array([4, 5, 6])),
    }),
  );
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, AttestationErrorCode.INVALID_FORMAT);
});

// --- Challenge consumption failures ---

Deno.test("withAttestation: consumeChallenge returns false → 401 CHALLENGE_INVALID", async () => {
  let handlerRan = false;
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.resolve(false),
      storeDeviceKey: () => Promise.resolve(),
    },
    () => {
      handlerRan = true;
      return new Response("should not run");
    },
  );

  const res = await handler(
    buildReq({
      keyId: "fake-key-id",
      challenge: encodeBase64(new Uint8Array([1, 2, 3])),
      attestation: encodeBase64(new Uint8Array([4, 5, 6])),
    }),
  );
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.code, AttestationErrorCode.CHALLENGE_INVALID);
  assertEquals(handlerRan, false);
});

Deno.test("withAttestation: consumeChallenge throws → 400 INVALID_FORMAT", async () => {
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.reject(new Error("db exploded")),
      storeDeviceKey: () => Promise.resolve(),
    },
    () => new Response("should not run"),
  );

  const res = await handler(
    buildReq({
      keyId: "fake-key-id",
      challenge: encodeBase64(new Uint8Array([1, 2, 3])),
      attestation: encodeBase64(new Uint8Array([4, 5, 6])),
    }),
  );
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, AttestationErrorCode.INVALID_FORMAT);
});

// --- Verification reaches crypto layer ---

// The attestation bytes below are intentionally junk — the test asserts
// that the pipeline reaches the crypto verify step (extractor + consume
// ran first) and returns the crypto layer's AttestationError. The default
// extractor, challenge consume, and verifyAttestation all run in order;
// the failure mode is verifyAttestation throwing INVALID_FORMAT from the
// CBOR decode step.
Deno.test("withAttestation: invalid attestation bytes → verify layer INVALID_FORMAT", async () => {
  let handlerRan = false;
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.resolve(true),
      storeDeviceKey: () => Promise.resolve(),
    },
    () => {
      handlerRan = true;
      return new Response("should not run");
    },
  );

  const res = await handler(
    buildReq({
      keyId: "aW52YWxpZC1rZXktaWQ=",
      challenge: encodeBase64(new Uint8Array(16)),
      attestation: encodeBase64(new Uint8Array([0xde, 0xad, 0xbe, 0xef])),
    }),
  );
  // INVALID_FORMAT from the CBOR decoder → 400 per the middleware's
  // defaultErrorResponse mapping.
  assertEquals(res.status, 400);
  assertEquals(handlerRan, false);
  const json = await res.json();
  assertEquals(json.code, AttestationErrorCode.INVALID_FORMAT);
});

// --- Custom extractor ---

Deno.test("withAttestation: custom extractAttestation is used", async () => {
  let extractCalled = false;
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.resolve(false), // short-circuit before crypto
      storeDeviceKey: () => Promise.resolve(),
      extractAttestation: (_req) => {
        extractCalled = true;
        return Promise.resolve({
          deviceId: "from-custom-extractor",
          challenge: new Uint8Array([1, 2, 3]),
          attestation: new Uint8Array([4, 5, 6]),
        });
      },
    },
    () => new Response("should not run"),
  );

  const res = await handler(
    new Request("http://localhost/attest", { method: "POST" }),
  );
  assertEquals(extractCalled, true);
  // Custom extractor succeeded, then consumeChallenge rejected it.
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.code, AttestationErrorCode.CHALLENGE_INVALID);
});

// --- Custom onError ---

Deno.test("withAttestation: custom onError overrides default response", async () => {
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.resolve(false),
      storeDeviceKey: () => Promise.resolve(),
      onError: (error, _req) => {
        return new Response(
          JSON.stringify({ custom: true, code: error.code }),
          { status: 418, headers: { "Content-Type": "application/json" } },
        );
      },
    },
    () => new Response("should not run"),
  );

  const res = await handler(
    buildReq({
      keyId: "anything",
      challenge: encodeBase64(new Uint8Array([1, 2, 3])),
      attestation: encodeBase64(new Uint8Array([4, 5, 6])),
    }),
  );
  assertEquals(res.status, 418);
  const json = await res.json();
  assertEquals(json.custom, true);
  assertEquals(json.code, AttestationErrorCode.CHALLENGE_INVALID);
});

// --- Error types are real ---

Deno.test("withAttestation: onError receives AttestationError instance", async () => {
  let capturedError: AttestationError | null = null;
  const handler = withAttestation(
    {
      appId: TEST_APP_ID,
      consumeChallenge: () => Promise.resolve(false),
      storeDeviceKey: () => Promise.resolve(),
      onError: (error, _req) => {
        capturedError = error;
        return new Response("handled", { status: 401 });
      },
    },
    () => new Response("should not run"),
  );

  await handler(
    buildReq({
      keyId: "anything",
      challenge: encodeBase64(new Uint8Array([1, 2, 3])),
      attestation: encodeBase64(new Uint8Array([4, 5, 6])),
    }),
  );

  if (!capturedError) throw new Error("onError was not called");
  const err = capturedError as AttestationError;
  assertEquals(err instanceof AttestationError, true);
  assertEquals(err.code, AttestationErrorCode.CHALLENGE_INVALID);
});
