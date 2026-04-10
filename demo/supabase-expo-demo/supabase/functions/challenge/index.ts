// supabase/functions/challenge/index.ts
//
// Core scaffolding for @bradford-tech/supabase-integrity-attest.
// Issues one-time, short-lived challenge nonces for attestation and
// assertion flows. Every protected flow starts with a call to this
// function.
import { issueChallenge } from "../_shared/integrity.ts";
import { newTimingBuilder } from "../_shared/timing.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const timing = newTimingBuilder();

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  const parseStop = timing.start("parse_request");
  let body: { purpose?: string };
  try {
    body = await req.json();
  } catch {
    parseStop();
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
  parseStop();

  if (body.purpose !== "attestation" && body.purpose !== "assertion") {
    const { header, json } = timing.finish();
    return new Response(
      JSON.stringify({
        error: "purpose must be 'attestation' or 'assertion'",
        _timing: json,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Server-Timing": header,
        },
      },
    );
  }

  const issueStop = timing.start("challenge_issue");
  const { challengeBase64, expiresAt } = await issueChallenge(body.purpose);
  issueStop();

  const { header, json } = timing.finish({
    challenge: challengeBase64,
    expiresAt: expiresAt.toISOString(),
  });
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Server-Timing": header,
    },
  });
});
