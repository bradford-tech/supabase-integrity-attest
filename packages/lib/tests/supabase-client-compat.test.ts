// Regression test for TS2589: a REAL @supabase/supabase-js client must
// satisfy SupabaseLikeClient structurally. The assertion that matters here
// happens at type-check time — comparing against supabase-js's deeply
// generic PostgrestFilterBuilder used to blow TypeScript's instantiation
// depth. supabase-js is a dev-only dependency: tests are outside the
// publish/export graph, so it never reaches consumers.
import { assertEquals } from "@std/assert";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createSupabaseAdapter } from "../src/supabase-adapter.ts";

Deno.test("a real supabase-js client satisfies SupabaseLikeClient", () => {
  // No network: createClient only constructs; no request is made. Auth
  // auto-refresh is disabled so no interval leaks past the test sanitizer.
  const client = createClient("http://localhost:54321", "anon-key", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adapter = createSupabaseAdapter(client);
  assertEquals(typeof adapter.consumeChallenge, "function");
  assertEquals(typeof adapter.commitSignCount, "function");
});
