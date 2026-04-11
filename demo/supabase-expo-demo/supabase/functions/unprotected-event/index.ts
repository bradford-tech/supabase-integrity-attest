// supabase/functions/unprotected-event/index.ts
//
// DO NOT COPY INTO A REAL PROJECT — measurement baseline only.
//
// This file exists solely so the A/B demo has an honest baseline for
// the timing comparison against protected-event. It inserts one row
// into demo_events with no App Attest verification, no authentication,
// no nothing. In a production project this would be a gaping security
// hole. Never copy this file into a real codebase.
import { supabase } from '../_shared/integrity.ts';
import { newTimingBuilder } from '../_shared/timing.ts';

Deno.serve(async (_req: Request): Promise<Response> => {
  const timing = newTimingBuilder();

  const insertStop = timing.start('db_write_event');
  const { data, error } = await supabase
    .from('demo_events')
    .insert({
      device_id: null,
      protected: false,
      payload: { source: 'unprotected-event', at: new Date().toISOString() },
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

  const { header, json } = timing.finish({ ok: true, event: data });
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Server-Timing': header,
    },
  });
});
