/**
 * Supabase adapter entry point: ready-made storage callbacks and challenge
 * lifecycle for the middleware pair, backed by two Postgres tables (see
 * `sql/app_attest.sql`).
 *
 * ```ts
 * import { withAssertion } from "@bradford-tech/supabase-integrity-attest/assertion";
 * import { createSupabaseAdapter } from "@bradford-tech/supabase-integrity-attest/supabase";
 *
 * const adapter = createSupabaseAdapter(supabase);
 * Deno.serve(withAssertion({ appId, ...adapter }, handler));
 * ```
 *
 * `@supabase/supabase-js` is not a dependency — the client parameter is
 * typed structurally, so any recent supabase-js client works.
 *
 * @module
 */

export { createSupabaseAdapter } from "./src/supabase-adapter.ts";
export type {
  SupabaseAdapter,
  SupabaseAdapterOptions,
  SupabaseLikeClient,
} from "./src/supabase-adapter.ts";
