// tests/assertion-entry.test.ts
import { assertEquals } from "@std/assert";

Deno.test("assertion entry point exports verifyAssertion", async () => {
  const mod = await import("../assertion.ts");
  assertEquals(typeof mod.verifyAssertion, "function");
});

Deno.test("assertion entry point exports AssertionError", async () => {
  const mod = await import("../assertion.ts");
  assertEquals(typeof mod.AssertionError, "function");
});

Deno.test("assertion entry point exports AssertionErrorCode", async () => {
  const mod = await import("../assertion.ts");
  assertEquals(typeof mod.AssertionErrorCode, "object");
});
