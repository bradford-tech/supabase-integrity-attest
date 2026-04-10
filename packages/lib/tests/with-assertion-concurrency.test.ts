// tests/with-assertion-concurrency.test.ts
//
// Concurrency test for the withAssertion commitSignCount CAS contract.
//
// Uses Deno's built-in KV (in-memory) to provide a real atomic storage
// backend. A plain JS object would be single-threaded and would never
// exercise the race the CAS is designed to fix. Deno KV's versionstamp
// check gives optimistic-concurrency semantics that closely mirror the
// Postgres `UPDATE ... WHERE sign_count < $1` pattern documented on
// WithAssertionOptions.commitSignCount.
import { assertEquals } from "@std/assert";
import { encodeBase64 } from "@std/encoding/base64";
import { withAssertion } from "../src/with-assertion.ts";
import {
  DEFAULT_ASSERTION_HEADER,
  DEFAULT_DEVICE_ID_HEADER,
} from "../src/with-assertion.ts";
import { AssertionErrorCode } from "../src/errors.ts";
import { generateSyntheticAssertion } from "./fixtures/generate-assertion.ts";

const TEST_APP_ID = "TEAMID1234.com.example.testapp";
const DEVICE_ID = "concurrent-device";

type DeviceRow = { publicKeyPem: string; signCount: number };

/**
 * Build a commitSignCount implementation backed by Deno KV with real
 * compare-and-swap semantics. Retries on versionstamp conflict so that a
 * racing writer that bumped the counter higher is handled correctly — the
 * retry re-reads, re-checks the strict-< condition, and returns false if
 * the new value is no longer strictly greater.
 */
function makeKvStorage(kv: Deno.Kv, publicKeyPem: string) {
  const key = ["device", DEVICE_ID];
  return {
    async seed(initialSignCount: number) {
      await kv.set(key, { publicKeyPem, signCount: initialSignCount });
    },
    async getDeviceKey(_deviceId: string) {
      const entry = await kv.get<DeviceRow>(key);
      return entry.value;
    },
    async commitSignCount(_deviceId: string, newSignCount: number) {
      while (true) {
        const current = await kv.get<DeviceRow>(key);
        if (current.value === null) return false;
        if (current.value.signCount >= newSignCount) return false;
        const result = await kv.atomic()
          .check({ key, versionstamp: current.versionstamp })
          .set(key, { ...current.value, signCount: newSignCount })
          .commit();
        if (result.ok) return true;
        // Version conflict → retry: re-read and re-check.
      }
    },
    async getStoredSignCount() {
      const entry = await kv.get<DeviceRow>(key);
      return entry.value?.signCount ?? -1;
    },
  };
}

Deno.test(
  "withAssertion concurrency: 25 parallel assertions, highest counter always wins",
  async () => {
    const kv = await Deno.openKv(":memory:");
    try {
      // Shared keyPair so every assertion verifies against the same device row.
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );

      // Pre-generate 25 synthetic assertions with counters 1..25.
      const N = 25;
      const fixtures = [];
      for (let i = 1; i <= N; i++) {
        const body = new TextEncoder().encode(JSON.stringify({ i }));
        const fixture = await generateSyntheticAssertion({
          appId: TEST_APP_ID,
          clientData: body,
          signCount: i,
          keyPair,
        });
        fixtures.push({ fixture, body });
      }

      const storage = makeKvStorage(kv, fixtures[0].fixture.publicKeyPem);
      await storage.seed(0);

      let successfulHandlerCalls = 0;
      const handler = withAssertion(
        {
          appId: TEST_APP_ID,
          getDeviceKey: storage.getDeviceKey,
          commitSignCount: storage.commitSignCount,
        },
        () => {
          successfulHandlerCalls++;
          return new Response("ok");
        },
      );

      // Build requests in ascending order, then shuffle so arrival order is
      // deterministic-but-scrambled (stable seed = reproducible runs).
      const requests = fixtures.map(({ fixture, body }) =>
        new Request("http://localhost/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [DEFAULT_ASSERTION_HEADER]: encodeBase64(fixture.assertion),
            [DEFAULT_DEVICE_ID_HEADER]: DEVICE_ID,
          },
          body,
        })
      );
      // Simple LCG shuffle with fixed seed for reproducibility.
      let seed = 42;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed;
      };
      for (let i = requests.length - 1; i > 0; i--) {
        const j = rand() % (i + 1);
        [requests[i], requests[j]] = [requests[j], requests[i]];
      }

      // Fire all requests concurrently.
      const responses = await Promise.all(requests.map((r) => handler(r)));

      // Classify responses.
      let okCount = 0;
      let staleCount = 0;
      for (const res of responses) {
        if (res.status === 200) {
          okCount++;
        } else if (res.status === 401) {
          const json = await res.json();
          if (json.code === AssertionErrorCode.SIGN_COUNT_STALE) {
            staleCount++;
          } else {
            throw new Error(
              `Unexpected 401 code: ${json.code} — expected SIGN_COUNT_STALE`,
            );
          }
        } else {
          throw new Error(`Unexpected status: ${res.status}`);
        }
      }

      // HARD assertions (deterministic regardless of arrival order):
      // - Final sign_count equals N (the highest counter always wins).
      // - Every request was either OK or SIGN_COUNT_STALE; none crashed.
      // - okCount + staleCount == N.
      // - The number of successful handler invocations matches the number
      //   of HTTP 200 responses.
      assertEquals(
        await storage.getStoredSignCount(),
        N,
        "final stored sign_count must equal N=25",
      );
      assertEquals(okCount + staleCount, N, "every request must resolve");
      assertEquals(
        successfulHandlerCalls,
        okCount,
        "handler invocations must match OK responses",
      );

      // SOFT bound: at least 1 success, no more than N.
      // Per spec §9 Phase D Done-when, the strict statistical assertion
      // around H(N) ≈ 3.82 lives in the demo rapid-fire harness where the
      // batch can be run many times for a stable empirical mean. Here we
      // only enforce that the contract is *functional* — at least one
      // request must succeed, and we must not somehow succeed more than
      // we issued.
      assertEquals(
        okCount >= 1,
        true,
        `expected at least 1 success, got ${okCount}`,
      );
      assertEquals(
        okCount <= N,
        true,
        `expected at most N=${N} successes, got ${okCount}`,
      );
    } finally {
      kv.close();
    }
  },
);
