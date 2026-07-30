import { assertEquals } from "@std/assert";
import { createSupabaseAdapter } from "../src/supabase-adapter.ts";
import type { SupabaseLikeClient } from "../src/supabase-adapter.ts";

/**
 * In-memory fake implementing the minimal PostgREST-builder surface the
 * adapter uses. Rows are plain objects keyed by table name.
 */
export function createFakeClient(): {
  client: SupabaseLikeClient;
  tables: Map<string, Record<string, unknown>[]>;
} {
  const tables = new Map<string, Record<string, unknown>[]>();
  const rows = (t: string) => {
    if (!tables.has(t)) tables.set(t, []);
    return tables.get(t)!;
  };

  type Filter = { op: "eq" | "gt" | "lt"; col: string; val: unknown };
  const matches = (row: Record<string, unknown>, fs: Filter[]) =>
    fs.every((f) => {
      const a = row[f.col] as string | number;
      const b = f.val as string | number;
      return f.op === "eq" ? a === b : f.op === "gt" ? a > b : a < b;
    });

  function chain(
    table: string,
    mode: "select" | "delete" | "update",
    updateValues?: Record<string, unknown>,
  ) {
    const filters: Filter[] = [];
    const exec = () => {
      const all = rows(table);
      const hit = all.filter((r) => matches(r, filters));
      if (mode === "delete") {
        tables.set(table, all.filter((r) => !matches(r, filters)));
      }
      if (mode === "update") {
        for (const r of hit) Object.assign(r, updateValues);
      }
      return { data: hit as unknown, error: null };
    };
    const self = {
      eq: (
        col: string,
        val: unknown,
      ) => (filters.push({ op: "eq", col, val }), self),
      gt: (
        col: string,
        val: unknown,
      ) => (filters.push({ op: "gt", col, val }), self),
      lt: (
        col: string,
        val: unknown,
      ) => (filters.push({ op: "lt", col, val }), self),
      select: (_cols?: string) => self,
      maybeSingle: () => {
        const { data } = exec();
        const arr = data as unknown[];
        return Promise.resolve({
          data: (arr[0] ?? null) as unknown,
          error: null,
        });
      },
      then<T>(
        onf?:
          | ((v: { data: unknown; error: null }) => T | PromiseLike<T>)
          | null,
      ) {
        return Promise.resolve(exec()).then(onf);
      },
    };
    return self;
  }

  const client: SupabaseLikeClient = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        rows(table).push({ ...row });
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (row: Record<string, unknown>) => {
        // Primary key is device_id for devices, challenge for challenges.
        const key = "device_id" in row ? "device_id" : "challenge";
        const existing = rows(table).find((r) => r[key] === row[key]);
        if (existing) Object.assign(existing, row);
        else rows(table).push({ ...row });
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => chain(table, "delete"),
      select: (_cols?: string) => chain(table, "select"),
      update: (values: Record<string, unknown>) =>
        chain(table, "update", values),
    }),
  };
  return { client, tables };
}

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
