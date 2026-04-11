// supabase/tests/integration.test.ts
//
// End-to-end integration test for Phase B. Exercises all five edge
// functions against a running `supabase start` instance. No iPhone
// required — uses the library's synthetic assertion generator to
// produce structurally-valid assertions signed by a WebCrypto keypair
// we control. A device row is seeded directly into app_attest_devices
// via supabase-js + service role so we can test protected-event
// without going through verify-attestation (which needs an unexpired
// Apple attestation that doesn't exist for the test fixtures).
//
// Run from demo/supabase-expo-demo/supabase/:
//
//     supabase start
//     supabase db reset
//     deno run --allow-net --allow-env tests/integration.test.ts
//     supabase stop
//
// Versions match supabase/functions/deno.json as of 3845f4b.
// Pinned to exact versions (not caret ranges) so the integration
// test resolves to the same minor versions the edge functions do.
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";
import { generateSyntheticAssertion } from "../../../../packages/lib/tests/fixtures/generate-assertion.ts";
import { createClient } from "npm:@supabase/supabase-js@2.103.0";

// --- Well-known local Supabase keys (not secrets — shipped by CLI) ---
const API_URL = "http://127.0.0.1:54321";
const FUNCTIONS_URL = `${API_URL}/functions/v1`;
// This is the deterministic local-dev service-role key Supabase CLI
// emits from `supabase start` / `supabase status -o json`. Not a secret.
// Escape hatch: if a future CLI version stops emitting this key, fetch
// it at runtime via `supabase status -o json` (the SERVICE_ROLE_KEY
// field) and pipe into an env var read here.
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// MUST match the APP_ID default in supabase/functions/_shared/integrity.ts.
// Both sides hardcode the same value so no env configuration step is
// needed. If you change this, change APP_INFO.appId in integrity.ts too.
const TEST_APP_ID = "TEAMID1234.com.example.demo";
const TEST_DEVICE_ID = "test-device-" + crypto.randomUUID();

// --- Assertion helpers ---

function assertEquals<T>(actual: T, expected: T, msg: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(
      `FAIL: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${
        JSON.stringify(actual)
      }`,
    );
    throw new Error(`assertion failed: ${msg}`);
  }
}

function assertTrue(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    throw new Error(`assertion failed: ${msg}`);
  }
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown; timing: string | null }> {
  const res = await fetch(`${FUNCTIONS_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return {
    status: res.status,
    body: await res.json(),
    timing: res.headers.get("Server-Timing"),
  };
}

async function postRaw(
  path: string,
  rawBody: Uint8Array,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown; timing: string | null }> {
  const res = await fetch(`${FUNCTIONS_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: rawBody,
  });
  return {
    status: res.status,
    body: await res.json(),
    timing: res.headers.get("Server-Timing"),
  };
}

// --- Tests ---

const supabase = createClient(API_URL, SERVICE_ROLE_KEY);

async function testPing() {
  console.log("→ ping");
  const res = await fetch(`${API_URL}/rest/v1/`, {
    headers: { apikey: SERVICE_ROLE_KEY },
  });
  assertTrue(res.ok || res.status === 404, "Supabase API reachable");
  // Drain the body so the connection releases cleanly.
  await res.body?.cancel();
  console.log("  ok");
}

async function testUnprotectedEvent() {
  console.log("→ unprotected-event");
  const { status, body, timing } = await post("/unprotected-event", {});
  assertEquals(status, 200, "unprotected-event status");
  const typedBody = body as {
    ok: boolean;
    event: { id: number; protected: boolean };
    spans: Record<string, number>;
  };
  assertEquals(typedBody.ok, true, "unprotected-event ok");
  assertEquals(typedBody.event.protected, false, "protected flag false");
  assertTrue(
    typeof typedBody.event.id === "number",
    "event has numeric id",
  );
  assertTrue(
    typeof typedBody.spans["db_write_event"] === "number",
    "timing has db_write_event span",
  );
  assertTrue(timing !== null, "Server-Timing header present");
  console.log("  ok");
}

async function testChallenge() {
  console.log("→ challenge (attestation)");
  const { status, body } = await post("/challenge", {
    purpose: "attestation",
  });
  assertEquals(status, 200, "challenge status");
  const typed = body as { challenge: string; expiresAt: string };
  assertTrue(
    typeof typed.challenge === "string" && typed.challenge.length > 0,
    "challenge is non-empty string",
  );
  assertTrue(
    new Date(typed.expiresAt).getTime() > Date.now(),
    "expiresAt in future",
  );
  console.log("  ok");

  console.log("→ challenge (invalid purpose)");
  const bad = await post("/challenge", { purpose: "bogus" });
  assertEquals(bad.status, 400, "invalid purpose → 400");
  console.log("  ok");
}

async function testVerifyAttestationErrors() {
  console.log("→ verify-attestation (missing fields)");
  const { status, body } = await post("/verify-attestation", {
    missing: "everything",
  });
  assertEquals(status, 400, "missing fields → 400");
  const typed = body as { code: string };
  assertEquals(typed.code, "INVALID_FORMAT", "code is INVALID_FORMAT");
  console.log("  ok");

  console.log("→ verify-attestation (non-base64)");
  const { status: s2, body: b2 } = await post("/verify-attestation", {
    keyId: "abc",
    challenge: "!!!",
    attestation: "abc",
  });
  assertEquals(s2, 400, "non-base64 → 400");
  const typed2 = b2 as { code: string };
  assertEquals(
    typed2.code,
    "INVALID_FORMAT",
    "non-base64 code is INVALID_FORMAT",
  );
  console.log("  ok");
}

async function seedTestDevice(deviceId: string, publicKeyPem: string) {
  console.log(`→ seed test device ${deviceId.slice(0, 24)}...`);
  const { error } = await supabase
    .from("app_attest_devices")
    .upsert({
      device_id: deviceId,
      public_key_pem: publicKeyPem,
      sign_count: 0,
      receipt: null,
    });
  if (error) throw new Error(`seed failed: ${error.message}`);
  console.log("  ok");
}

async function issueAssertionChallenge(): Promise<string> {
  const { body } = await post("/challenge", { purpose: "assertion" });
  const typed = body as { challenge: string };
  return typed.challenge;
}

async function readStoredSignCount(deviceId: string): Promise<number> {
  const { data, error } = await supabase
    .from("app_attest_devices")
    .select("sign_count")
    .eq("device_id", deviceId)
    .single();
  if (error) throw new Error(`read sign_count failed: ${error.message}`);
  return Number((data as { sign_count: number }).sign_count);
}

async function testProtectedEventHappyPath() {
  console.log("→ protected-event (happy path via seeded device)");

  // Generate a synthetic keypair + assertion using the library's own
  // test fixture generator. The assertion is structurally identical
  // to what the Secure Enclave produces, just signed by a key we own.
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );

  // Issue a fresh challenge that the handler body will consume.
  const challengeStr = await issueAssertionChallenge();
  const bodyObj = {
    challenge: challengeStr,
    payload: { via: "integration test" },
  };
  const bodyBytes = new TextEncoder().encode(JSON.stringify(bodyObj));

  // Sign the exact bodyBytes the server will see.
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: bodyBytes,
    signCount: 1,
    keyPair,
  });

  // Seed the device row with the public key from the fixture.
  await seedTestDevice(TEST_DEVICE_ID, fixture.publicKeyPem);

  // POST the assertion against protected-event. Note we send the exact
  // same bodyBytes that were signed — any re-serialization would break
  // the signature.
  const { status, body, timing } = await postRaw(
    "/protected-event",
    bodyBytes,
    {
      "X-App-Attest-Assertion": encodeBase64(fixture.assertion),
      "X-App-Attest-Device-Id": TEST_DEVICE_ID,
    },
  );

  // Diagnostic dump on non-200 (helps trace which library span fired
  // before the failure, per the Server-Timing-as-debugging-aid pattern).
  if (status !== 200) {
    console.error("DIAG status:", status);
    console.error("DIAG body:", JSON.stringify(body, null, 2));
    console.error("DIAG Server-Timing:", timing);
  }
  assertEquals(status, 200, "protected-event happy path status");
  const typed = body as {
    ok: boolean;
    event: { protected: boolean; device_id: string };
    signCount: number;
    spans: Record<string, number>;
  };
  assertEquals(typed.ok, true, "ok: true");
  assertEquals(typed.event.protected, true, "protected flag true");
  assertEquals(typed.event.device_id, TEST_DEVICE_ID, "device_id matches");
  assertEquals(typed.signCount, 1, "signCount in handler ctx is 1");
  assertTrue(
    typeof typed.spans["assert_verifyMs"] === "number",
    "merged library verifyMs span present",
  );
  assertTrue(
    typeof typed.spans["db_write_event"] === "number",
    "handler db_write_event span present",
  );
  assertTrue(timing !== null, "Server-Timing header present");

  // Belt-and-suspenders: confirm the CAS actually wrote sign_count=1
  // to the real Postgres table, not just that the handler response
  // claimed it did. The library's commitSignCount callback is supposed
  // to use UPDATE ... WHERE sign_count < $1; that should have advanced
  // the seeded value of 0 up to 1.
  const stored = await readStoredSignCount(TEST_DEVICE_ID);
  assertEquals(
    stored,
    1,
    "stored sign_count in app_attest_devices is 1 (CAS landed)",
  );
  console.log("  ok");
}

async function testProtectedEventReplay() {
  console.log(
    "→ protected-event (replay → COUNTER_NOT_INCREMENTED, not SIGN_COUNT_STALE)",
  );

  // Why COUNTER_NOT_INCREMENTED, not SIGN_COUNT_STALE: sequential
  // replay of an assertion with counter <= stored fails inside
  // verifyAssertion (the library's pre-CAS counter check). The
  // SIGN_COUNT_STALE error code only surfaces under genuine concurrent
  // races where two requests both pass the counter check against the
  // same stored value and one of them loses the CAS race in
  // commitSignCount. That concurrent path is exercised by the
  // library's Phase A Deno KV concurrency test, not here.
  //
  // Sequence:
  //   1. Seed device with sign_count = 0.
  //   2. POST assertion with counter=5 → succeeds, stored becomes 5.
  //   3. POST a DIFFERENT assertion (different body bytes, different
  //      signature) also with counter=5 → fails with
  //      COUNTER_NOT_INCREMENTED because verifyAssertion checks
  //      newCount > stored and 5 > 5 is false.

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const replayDeviceId = "replay-device-" + crypto.randomUUID();

  // First assertion: counter=5, will succeed and advance stored to 5.
  const challenge1 = await issueAssertionChallenge();
  const body1 = new TextEncoder().encode(
    JSON.stringify({ challenge: challenge1, payload: { i: 1 } }),
  );
  const fixture1 = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: body1,
    signCount: 5,
    keyPair,
  });

  await seedTestDevice(replayDeviceId, fixture1.publicKeyPem);

  const { status: firstStatus } = await postRaw(
    "/protected-event",
    body1,
    {
      "X-App-Attest-Assertion": encodeBase64(fixture1.assertion),
      "X-App-Attest-Device-Id": replayDeviceId,
    },
  );
  assertEquals(firstStatus, 200, "first assertion succeeds");

  // Confirm stored sign_count is now 5 before the replay attempt.
  const afterFirst = await readStoredSignCount(replayDeviceId);
  assertEquals(afterFirst, 5, "stored sign_count is 5 after first commit");

  // Second assertion: same counter=5, different body, different signature.
  const challenge2 = await issueAssertionChallenge();
  const body2 = new TextEncoder().encode(
    JSON.stringify({ challenge: challenge2, payload: { i: 2 } }),
  );
  const fixture2 = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: body2,
    signCount: 5, // same counter as before → should be rejected
    keyPair,
  });

  const { status: replayStatus, body: replayBody } = await postRaw(
    "/protected-event",
    body2,
    {
      "X-App-Attest-Assertion": encodeBase64(fixture2.assertion),
      "X-App-Attest-Device-Id": replayDeviceId,
    },
  );
  assertEquals(replayStatus, 401, "replay rejected with 401");
  const typed = replayBody as { code: string };
  assertEquals(
    typed.code,
    "COUNTER_NOT_INCREMENTED",
    "replay code is COUNTER_NOT_INCREMENTED (NOT SIGN_COUNT_STALE)",
  );

  // The stored sign_count must still be 5 — the replay must not have
  // touched the row at all (the rejection happened before commitSignCount).
  const afterReplay = await readStoredSignCount(replayDeviceId);
  assertEquals(
    afterReplay,
    5,
    "stored sign_count unchanged at 5 after rejected replay",
  );
  console.log("  ok");
}

async function testResetDevice() {
  console.log("→ reset-device (seeded device)");
  const { status, body } = await post("/reset-device", {
    keyId: TEST_DEVICE_ID,
  });
  assertEquals(status, 200, "reset-device status");
  const typed = body as { ok: boolean; deletedDeviceRows: number };
  assertEquals(typed.ok, true, "ok: true");
  assertEquals(typed.deletedDeviceRows, 1, "exactly one row deleted");
  console.log("  ok");

  // Verify the row is gone via a direct query.
  const { data } = await supabase
    .from("app_attest_devices")
    .select("device_id")
    .eq("device_id", TEST_DEVICE_ID);
  assertEquals(data ?? [], [], "device_id no longer in table");
  console.log("  ok (verified via direct query)");
}

// --- Main ---

async function main() {
  console.log("Phase B integration test");
  console.log("========================");
  await testPing();
  await testUnprotectedEvent();
  await testChallenge();
  await testVerifyAttestationErrors();
  await testProtectedEventHappyPath();
  await testProtectedEventReplay();
  await testResetDevice();
  console.log("\nAll integration tests passed.");
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    console.error("\nIntegration test FAILED:", err);
    Deno.exit(1);
  }
}
