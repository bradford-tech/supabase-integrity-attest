import { assertEquals } from "@std/assert";
import { createSupabaseAdapter } from "../src/supabase-adapter.ts";
import { createFakeClient } from "./fixtures/fake-supabase-client.ts";

Deno.test("issueChallenge inserts a 32-byte challenge with TTL and returns it", async () => {
  const { client, tables } = createFakeClient();
  const adapter = createSupabaseAdapter(client);
  const before = Date.now();
  const issued = await adapter.issueChallenge("attestation");

  assertEquals(issued.challenge.length, 32);
  assertEquals(typeof issued.challengeBase64, "string");
  // TTL default 60s (± scheduling slop)
  const ttlMs = issued.expiresAt.getTime() - before;
  assertEquals(ttlMs > 55_000 && ttlMs < 65_000, true);

  const stored = tables.get("app_attest_challenges")!;
  assertEquals(stored.length, 1);
  assertEquals(stored[0].purpose, "attestation");
  // bytea hex literal: "\x" + 64 hex chars
  assertEquals((stored[0].challenge as string).startsWith("\\x"), true);
  assertEquals((stored[0].challenge as string).length, 2 + 64);
});

Deno.test("consumeChallenge consumes exactly once", async () => {
  const { client } = createFakeClient();
  const adapter = createSupabaseAdapter(client);
  const { challenge } = await adapter.issueChallenge("attestation");
  assertEquals(await adapter.consumeChallenge(challenge), true);
  assertEquals(await adapter.consumeChallenge(challenge), false);
});

Deno.test("consumeChallenge rejects purpose mismatch", async () => {
  const { client } = createFakeClient();
  const adapter = createSupabaseAdapter(client);
  const { challenge } = await adapter.issueChallenge("assertion");
  // Default purpose is "attestation" — an assertion challenge must not satisfy it.
  assertEquals(await adapter.consumeChallenge(challenge), false);
  // Explicit purpose works.
  assertEquals(await adapter.consumeChallenge(challenge, "assertion"), true);
});

Deno.test("consumeChallenge rejects expired challenges", async () => {
  const { client } = createFakeClient();
  const adapter = createSupabaseAdapter(client, { challengeTtlSeconds: -1 });
  const { challenge } = await adapter.issueChallenge("attestation");
  assertEquals(await adapter.consumeChallenge(challenge), false);
});

Deno.test("consumeChallenge rejects an unknown challenge", async () => {
  const { client } = createFakeClient();
  const adapter = createSupabaseAdapter(client);
  assertEquals(await adapter.consumeChallenge(new Uint8Array(32)), false);
});

Deno.test("storeDeviceKey upserts and getDeviceKey round-trips", async () => {
  const { client, tables } = createFakeClient();
  const adapter = createSupabaseAdapter(client);
  await adapter.storeDeviceKey({
    deviceId: "dev-1",
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----",
    signCount: 0,
    receipt: new Uint8Array([0xde, 0xad]),
  });
  // Re-attest same device: upsert, not duplicate.
  await adapter.storeDeviceKey({
    deviceId: "dev-1",
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\nxyz\n-----END PUBLIC KEY-----",
    signCount: 0,
    receipt: new Uint8Array([0xbe, 0xef]),
  });
  assertEquals(tables.get("app_attest_devices")!.length, 1);
  assertEquals(tables.get("app_attest_devices")![0].receipt, "\\xbeef");

  const key = await adapter.getDeviceKey("dev-1");
  assertEquals(key?.signCount, 0);
  assertEquals(key?.publicKeyPem.includes("xyz"), true);
  assertEquals(await adapter.getDeviceKey("nope"), null);
});

Deno.test("commitSignCount advances only when strictly greater", async () => {
  const { client } = createFakeClient();
  const adapter = createSupabaseAdapter(client);
  await adapter.storeDeviceKey({
    deviceId: "dev-1",
    publicKeyPem: "pem",
    signCount: 5,
    receipt: new Uint8Array(0),
  });
  assertEquals(await adapter.commitSignCount("dev-1", 6), true);
  assertEquals((await adapter.getDeviceKey("dev-1"))?.signCount, 6);
  // Stale: stored value (6) is not < 6.
  assertEquals(await adapter.commitSignCount("dev-1", 6), false);
  assertEquals(await adapter.commitSignCount("dev-1", 4), false);
});

Deno.test("table name overrides are respected", async () => {
  const { client, tables } = createFakeClient();
  const adapter = createSupabaseAdapter(client, {
    devicesTable: "my_devices",
    challengesTable: "my_challenges",
  });
  await adapter.issueChallenge("attestation");
  await adapter.storeDeviceKey({
    deviceId: "d",
    publicKeyPem: "p",
    signCount: 0,
    receipt: new Uint8Array(0),
  });
  assertEquals(tables.get("my_challenges")!.length, 1);
  assertEquals(tables.get("my_devices")!.length, 1);
});
