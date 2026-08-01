// supabase/tests/bench-ab.ts
//
// A/B latency benchmark: unprotected-event vs protected-event against a
// running `supabase start` stack. Both endpoints do the identical
// demo_events insert; the difference is the withAssertion middleware
// (header extract + getDeviceKey read + ECDSA verify + CAS commit) plus
// the demo's optional in-handler assertion-challenge consume.
//
// Run from demo/supabase-expo-demo/supabase/:
//     supabase start && supabase db reset
//     deno run --allow-net --allow-env tests/bench-ab.ts
//     supabase stop
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";
import { generateSyntheticAssertion } from "../../../../packages/lib/tests/fixtures/generate-assertion.ts";
// Pinned exact (not caret) for the same reason as integration.test.ts:
// benchmark runs should resolve the same versions the edge functions do.
import { createClient } from "npm:@supabase/supabase-js@2.103.0";

const API_URL = "http://127.0.0.1:54321";
const FUNCTIONS_URL = `${API_URL}/functions/v1`;
// Deterministic local-dev service-role key emitted by `supabase start`.
// Not a secret.
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const teamId = Deno.env.get("EXPO_PUBLIC_TEAM_ID");
const bundleId = Deno.env.get("EXPO_PUBLIC_BUNDLE_IDENTIFIER");
const APP_ID = teamId && bundleId
  ? `${teamId}.${bundleId}`
  : "TEAMID1234.com.example.demo";
const DEVICE_ID = "bench-device-" + crypto.randomUUID();

const WARMUP = 5;
const N = 100;

const supabase = createClient(API_URL, SERVICE_ROLE_KEY);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)];
}

async function issueChallenge(): Promise<string> {
  const res = await fetch(`${FUNCTIONS_URL}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "assertion" }),
  });
  const body = await res.json();
  if (res.status !== 200) throw new Error(`challenge: ${res.status}`);
  return body.challenge as string;
}

async function hitUnprotected(): Promise<{ ms: number }> {
  const t0 = performance.now();
  const res = await fetch(`${FUNCTIONS_URL}/unprotected-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const ms = performance.now() - t0;
  if (res.status !== 200) {
    throw new Error(`unprotected: ${res.status} ${await res.text()}`);
  }
  await res.body?.cancel();
  return { ms };
}

async function hitProtected(
  keyPair: CryptoKeyPair,
  signCount: number,
): Promise<{ ms: number; spans: Record<string, number> }> {
  // Challenge issuance is OUTSIDE the timed window — it's a separate
  // endpoint. Its consumption inside the handler IS included (and shown
  // separately via the span breakdown).
  const challenge = await issueChallenge();
  const bodyBytes = new TextEncoder().encode(
    JSON.stringify({ challenge, payload: { via: "bench" } }),
  );
  const fixture = await generateSyntheticAssertion({
    appId: APP_ID,
    clientData: bodyBytes,
    signCount,
    keyPair,
  });
  const t0 = performance.now();
  const res = await fetch(`${FUNCTIONS_URL}/protected-event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Attest-Assertion": encodeBase64(fixture.assertion),
      "X-App-Attest-Device-Id": DEVICE_ID,
    },
    body: bodyBytes,
  });
  const ms = performance.now() - t0;
  const body = await res.json();
  if (res.status !== 200) {
    throw new Error(`protected: ${res.status} ${JSON.stringify(body)}`);
  }
  return { ms, spans: body.spans as Record<string, number> };
}

// --- Main ---

console.log(`A/B latency benchmark (N=${N}, warmup=${WARMUP})`);

const keyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
) as CryptoKeyPair;

// Seed the device row once; sign counts increment monotonically.
{
  const fixture = await generateSyntheticAssertion({
    appId: APP_ID,
    clientData: new Uint8Array(1),
    signCount: 1,
    keyPair,
  });
  const { error } = await supabase.from("app_attest_devices").upsert({
    device_id: DEVICE_ID,
    public_key_pem: fixture.publicKeyPem,
    sign_count: 0,
    receipt: null,
  });
  if (error) throw new Error(`seed failed: ${error.message}`);
}

let signCount = 0;
for (let i = 0; i < WARMUP; i++) {
  await hitUnprotected();
  signCount++;
  await hitProtected(keyPair, signCount);
}

const un: number[] = [];
const pr: number[] = [];
const spanSums: Record<string, number[]> = {};
for (let i = 0; i < N; i++) {
  un.push((await hitUnprotected()).ms);
  signCount++;
  const r = await hitProtected(keyPair, signCount);
  pr.push(r.ms);
  for (const [k, v] of Object.entries(r.spans)) {
    (spanSums[k] ??= []).push(v);
  }
}

console.log(
  `\nunprotected-event  median ${median(un).toFixed(1)}ms  p95 ${
    p95(un).toFixed(1)
  }ms`,
);
console.log(
  `protected-event    median ${median(pr).toFixed(1)}ms  p95 ${
    p95(pr).toFixed(1)
  }ms`,
);
console.log(`median delta       ${(median(pr) - median(un)).toFixed(1)}ms`);
console.log(`\nprotected-event span medians (ms):`);
for (const [k, v] of Object.entries(spanSums)) {
  console.log(`  ${k.padEnd(24)} ${median(v).toFixed(2)}`);
}
const libSpans = [
  "assert_extractMs",
  "assert_getDeviceKeyMs",
  "assert_verifyMs",
  "assert_commitMs",
];
const libSum = libSpans.reduce(
  (n, k) => n + (spanSums[k] ? median(spanSums[k]) : 0),
  0,
);
console.log(`\nlibrary middleware span sum (median): ${libSum.toFixed(2)}ms`);

// Clean up the bench device row.
await supabase.from("app_attest_devices").delete().eq("device_id", DEVICE_ID);
console.log("\ndone");
