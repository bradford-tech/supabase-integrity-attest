// supabase/functions/reset-device/index.ts
//
// DO NOT COPY INTO A REAL PROJECT — demo reset endpoint only.
//
// This is an unauthenticated destructive endpoint that deletes
// app_attest_devices rows for a given keyId. Fine for a local-only
// demo per spec §6.5 (the demo needs a way to reset state between
// test runs). In a hosted deployment this would be authenticated
// or removed entirely.
import { supabase } from "../_shared/integrity.ts";
import { newTimingBuilder } from "../_shared/timing.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const timing = newTimingBuilder();

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { keyId?: string };
  try {
    body = await req.json();
  } catch {
    const { header, json } = timing.finish();
    return new Response(
      JSON.stringify({ error: "Invalid JSON body", _timing: json }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Server-Timing": header,
        },
      },
    );
  }

  if (typeof body.keyId !== "string" || body.keyId.length === 0) {
    const { header, json } = timing.finish();
    return new Response(
      JSON.stringify({ error: "Missing keyId", _timing: json }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Server-Timing": header,
        },
      },
    );
  }

  // Atomic delete with row counting (supabase-js v2 idiom: count option
  // goes on .delete(), not on a chained .select()).
  const deleteDeviceStop = timing.start("delete_device");
  const { error: deviceErr, count: deviceCount } = await supabase
    .from("app_attest_devices")
    .delete({ count: "exact" })
    .eq("device_id", body.keyId);
  deleteDeviceStop();

  if (deviceErr) {
    const { header, json } = timing.finish();
    return new Response(
      JSON.stringify({ error: deviceErr.message, _timing: json }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Server-Timing": header,
        },
      },
    );
  }

  // Note on challenge cleanup: app_attest_challenges rows are not
  // associated with a device_id (challenges are bound only by their
  // bytes), so there's no per-device challenge state to delete here.
  // If a future schema associates challenges with device, add the
  // delete in this block.

  const { header, json } = timing.finish({
    ok: true,
    deletedDeviceRows: deviceCount ?? 0,
  });
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Server-Timing": header,
    },
  });
});
