import { assertEquals } from "@std/assert";
import { createSupabaseAdapter } from "../supabase.ts";
import type {
  SupabaseAdapter,
  SupabaseAdapterOptions,
  SupabaseLikeClient,
} from "../supabase.ts";

Deno.test("supabase entry exports the factory", () => {
  assertEquals(typeof createSupabaseAdapter, "function");
});

Deno.test("supabase entry types are usable", () => {
  // Type-level check: assignment compiles.
  const opts: SupabaseAdapterOptions = { challengeTtlSeconds: 30 };
  assertEquals(typeof opts, "object");
  const _clientType: SupabaseLikeClient | null = null;
  const _adapterType: SupabaseAdapter | null = null;
  assertEquals(_clientType, null);
  assertEquals(_adapterType, null);
});
