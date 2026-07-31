import { encodeBase64 } from "@std/encoding/base64";
import type { DeviceKey } from "./with-assertion.ts";

/** Result shape shared by all PostgREST builder executions. */
type PgResult = { data: unknown; error: { message: string } | null };

/** Filterable, thenable query chain (subset of PostgrestFilterBuilder). */
interface QueryChain extends PromiseLike<PgResult> {
  eq(column: string, value: unknown): QueryChain;
  gt(column: string, value: unknown): QueryChain;
  lt(column: string, value: unknown): QueryChain;
  select(columns?: string): QueryChain;
  maybeSingle(): PromiseLike<PgResult>;
}

/**
 * Structural subset of `SupabaseClient` used by the adapter. Any real
 * `@supabase/supabase-js` client satisfies this — the dependency itself
 * is deliberately never imported.
 *
 * The builder-returning methods are typed `unknown` on purpose: comparing
 * structurally against supabase-js's deeply generic PostgrestFilterBuilder
 * blows TypeScript's instantiation depth (TS2589). The implementation
 * casts to the internal {@linkcode QueryChain} shape instead.
 */
export interface SupabaseLikeClient {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<PgResult>;
    upsert(row: Record<string, unknown>): PromiseLike<PgResult>;
    delete(): unknown;
    select(columns?: string): unknown;
    update(values: Record<string, unknown>): unknown;
  };
}

/** Options for {@linkcode createSupabaseAdapter}. */
export type SupabaseAdapterOptions = {
  /** Device-keys table name. Default `"app_attest_devices"`. */
  devicesTable?: string;
  /** Challenges table name. Default `"app_attest_challenges"`. */
  challengesTable?: string;
  /** Challenge time-to-live in seconds. Default `60`. */
  challengeTtlSeconds?: number;
};

/** Storage callbacks + challenge lifecycle returned by {@linkcode createSupabaseAdapter}. */
export type SupabaseAdapter = {
  issueChallenge(purpose: "attestation" | "assertion"): Promise<{
    challenge: Uint8Array;
    challengeBase64: string;
    expiresAt: Date;
  }>;
  /**
   * Atomically consume a challenge (single-use `DELETE ... RETURNING`).
   *
   * `purpose` defaults to `"attestation"` — the shape `withAttestation`
   * expects when the adapter is spread into its options. A challenge whose
   * stored purpose differs from the requested one is NOT consumed and this
   * resolves `false`, exactly like an unknown or expired challenge. Pass
   * `"assertion"` explicitly to consume assertion-freshness challenges.
   */
  consumeChallenge(
    challenge: Uint8Array,
    purpose?: "attestation" | "assertion",
  ): Promise<boolean>;
  storeDeviceKey(row: {
    deviceId: string;
    publicKeyPem: string;
    signCount: number;
    receipt: Uint8Array;
  }): Promise<void>;
  getDeviceKey(deviceId: string): Promise<DeviceKey | null>;
  commitSignCount(deviceId: string, newSignCount: number): Promise<boolean>;
};

/** Encode bytes as a PostgREST bytea hex literal (`\x...`). */
function toPgBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return "\\x" + hex;
}

/**
 * Create ready-made Supabase-backed callbacks for the
 * {@linkcode withAttestation} / {@linkcode withAssertion} middleware.
 *
 * Spread into the middleware options:
 * `withAttestation({ appId, ...adapter }, handler)` and
 * `withAssertion({ appId, ...adapter }, handler)`.
 *
 * Schema: see `sql/app_attest.sql` in this package.
 */
export function createSupabaseAdapter(
  client: SupabaseLikeClient,
  options: SupabaseAdapterOptions = {},
): SupabaseAdapter {
  const devicesTable = options.devicesTable ?? "app_attest_devices";
  const challengesTable = options.challengesTable ?? "app_attest_challenges";
  const ttlSeconds = options.challengeTtlSeconds ?? 60;

  return {
    async issueChallenge(purpose) {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const { error } = await client.from(challengesTable).insert({
        challenge: toPgBytea(challenge),
        purpose,
        expires_at: expiresAt.toISOString(),
      });
      if (error) {
        throw new Error(`Failed to insert challenge: ${error.message}`);
      }
      return { challenge, challengeBase64: encodeBase64(challenge), expiresAt };
    },

    async consumeChallenge(challenge, purpose = "attestation") {
      const { data, error } = await (client
        .from(challengesTable)
        .delete() as QueryChain)
        .eq("challenge", toPgBytea(challenge))
        .eq("purpose", purpose)
        .gt("expires_at", new Date().toISOString())
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to consume challenge: ${error.message}`);
      }
      return data !== null;
    },

    async storeDeviceKey(row) {
      const { error } = await client.from(devicesTable).upsert({
        device_id: row.deviceId,
        public_key_pem: row.publicKeyPem,
        sign_count: row.signCount,
        receipt: toPgBytea(row.receipt),
        last_seen_at: new Date().toISOString(),
      });
      if (error) {
        throw new Error(`Failed to store device key: ${error.message}`);
      }
    },

    async getDeviceKey(deviceId) {
      const { data, error } = await (client
        .from(devicesTable)
        .select("public_key_pem, sign_count") as QueryChain)
        .eq("device_id", deviceId)
        .maybeSingle();
      if (error) throw new Error(`Failed to get device key: ${error.message}`);
      if (data === null) return null;
      const row = data as { public_key_pem: string; sign_count: number };
      return { publicKeyPem: row.public_key_pem, signCount: row.sign_count };
    },

    async commitSignCount(deviceId, newSignCount) {
      const { data, error } = await (client
        .from(devicesTable)
        .update({
          sign_count: newSignCount,
          last_seen_at: new Date().toISOString(),
        }) as QueryChain)
        .eq("device_id", deviceId)
        .lt("sign_count", newSignCount)
        .select();
      if (error) {
        throw new Error(`Failed to commit sign count: ${error.message}`);
      }
      return Array.isArray(data) && data.length > 0;
    },
  };
}
