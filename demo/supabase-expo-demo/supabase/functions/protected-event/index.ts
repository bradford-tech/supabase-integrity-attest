// supabase/functions/protected-event/index.ts
//
// CRITICAL FOOTGUN — DO NOT AWAIT req.json() / req.text() HERE.
// The App Attest assertion signs the exact byte sequence of the
// request body. withAssertion already captured those bytes into
// ctx.rawBody during verification. If you call req.json() inside
// this handler, the Request's body stream is already consumed and
// you'll get an error; worse, if you re-serialize via JSON.stringify
// the bytes may differ from what was signed and the verification
// (which already happened successfully!) becomes meaningless for
// the content the handler actually processes. Always read the body
// via ctx.rawBody.
//
// Demo of the protect() one-liner pattern. Business work is identical
// to unprotected-event (one insert into demo_events) so the A/B
// timing comparison is fair.
import {
  consumeChallengeAssertion,
  decodeBase64,
  protect,
  supabase,
} from '../_shared/integrity.ts';
import { newTimingBuilder } from '../_shared/timing.ts';

Deno.serve(
  protect(async (_req, ctx) => {
    const timing = newTimingBuilder();
    timing.merge(
      ctx.timings as unknown as Record<string, number>,
      'assert',
    );

    // Parse the signed body bytes from ctx.rawBody (NEVER req.json()).
    const parseStop = timing.start('parse_body');
    let body: { challenge?: string; payload?: unknown };
    try {
      body = JSON.parse(new TextDecoder().decode(ctx.rawBody));
    } catch {
      parseStop();
      const { header, json } = timing.finish();
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON body',
          code: 'INVALID_FORMAT',
          _timing: json,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Server-Timing': header,
          },
        },
      );
    }
    parseStop();

    // Verify the assertion challenge (belt-and-suspenders check on top
    // of the library's counter-based replay protection).
    if (typeof body.challenge !== 'string') {
      const { header, json } = timing.finish();
      return new Response(
        JSON.stringify({
          error: 'Missing challenge in body',
          code: 'CHALLENGE_INVALID',
          _timing: json,
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Server-Timing': header,
          },
        },
      );
    }

    const consumeStop = timing.start('challenge_consume');
    let challengeBytes: Uint8Array;
    try {
      challengeBytes = decodeBase64(body.challenge);
    } catch {
      consumeStop();
      const { header, json } = timing.finish();
      return new Response(
        JSON.stringify({
          error: 'challenge is not valid base64',
          code: 'CHALLENGE_INVALID',
          _timing: json,
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Server-Timing': header,
          },
        },
      );
    }
    const consumed = await consumeChallengeAssertion(challengeBytes);
    consumeStop();

    if (!consumed) {
      const { header, json } = timing.finish();
      return new Response(
        JSON.stringify({
          error: 'Challenge is missing, expired, or already consumed',
          code: 'CHALLENGE_INVALID',
          _timing: json,
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Server-Timing': header,
          },
        },
      );
    }

    // Business work: identical to unprotected-event.
    const insertStop = timing.start('db_write_event');
    const { data, error } = await supabase
      .from('demo_events')
      .insert({
        device_id: ctx.deviceId,
        protected: true,
        payload: body.payload ?? {
          source: 'protected-event',
          at: new Date().toISOString(),
        },
      })
      .select()
      .single();
    insertStop();

    if (error) {
      const { header, json } = timing.finish();
      return new Response(
        JSON.stringify({ error: error.message, _timing: json }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Server-Timing': header,
          },
        },
      );
    }

    const { header, json } = timing.finish({
      ok: true,
      event: data,
      deviceId: ctx.deviceId,
      signCount: ctx.signCount,
    });
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Server-Timing': header,
      },
    });
  }),
);
