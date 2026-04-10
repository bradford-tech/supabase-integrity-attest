// supabase/functions/verify-attestation/index.ts
//
// Core scaffolding for @bradford-tech/supabase-integrity-attest.
// One-time device registration. Consumes a challenge, verifies the
// attestation cryptographically, and persists the device key.
import { attest } from "../_shared/integrity.ts";
import { newTimingBuilder } from "../_shared/timing.ts";

Deno.serve(
  attest((_req, ctx) => {
    const timing = newTimingBuilder();
    // Library-internal attestation spans are available on ctx.timings.
    timing.merge(
      ctx.timings as unknown as Record<string, number>,
      "attest",
    );
    const { header, json } = timing.finish({
      ok: true,
      deviceId: ctx.deviceId,
    });
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Server-Timing": header,
      },
    });
  }),
);
