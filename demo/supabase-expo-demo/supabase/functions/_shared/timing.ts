// supabase/functions/_shared/timing.ts
//
// DEMO-ONLY — not part of the copy-pasteable core.
//
// Server-Timing span builder for the demo event endpoints. Produces
// both a W3C Server-Timing header (so browser devtools pick it up
// for free) and an embedded _timing object in the JSON response
// body (so the demo UI can draw its timing bars without re-parsing
// the header). Single source of truth: one span map, two emissions.
//
// Cold-start detection uses module-level BOOT_TIME and REQUEST_COUNT
// globals. The first request after module evaluation flags cold=true.
// Good enough to color a timing bar differently in the UI (see
// spec §6.8).

/** Time the module was first loaded. Used for cold-start detection. */
export const BOOT_TIME = Date.now();

/** Module-level request counter for cold-start detection. */
let REQUEST_COUNT = 0;

/**
 * Record that a new request has arrived. Returns `{ cold, bootAgeMs }`
 * — `cold` is true for the first request after module boot. Call this
 * once at the start of each handler.
 */
export function markRequest(): { cold: boolean; bootAgeMs: number } {
  REQUEST_COUNT++;
  return {
    cold: REQUEST_COUNT === 1,
    bootAgeMs: Date.now() - BOOT_TIME,
  };
}

/** A measured span with a name, duration in ms, and optional description. */
export type Span = {
  name: string;
  dur: number;
  desc?: string;
};

/**
 * Mutable span builder. Usage:
 *
 *     const timing = newTimingBuilder();
 *     const stop = timing.start("db_write_event");
 *     // ... do work ...
 *     stop();
 *     // ... more spans ...
 *     const { header, json } = timing.finish();
 */
export type TimingBuilder = {
  /** Start a span; returns a `stop()` function to call when the work completes. */
  start(name: string, desc?: string): () => void;
  /** Add an already-measured span (e.g. spans imported from ctx.timings). */
  add(name: string, dur: number, desc?: string): void;
  /** Merge a map of span name → duration (for withAssertion/withAttestation ctx.timings). */
  merge(timings: Record<string, number>, prefix?: string): void;
  /** Finalize and return both the Server-Timing header value and a JSON object. */
  finish(extras?: Record<string, unknown>): {
    header: string;
    json: Record<string, unknown> & {
      spans: Record<string, number>;
      cold: boolean;
      boot_age_ms: number;
    };
  };
};

export function newTimingBuilder(): TimingBuilder {
  const spans: Span[] = [];
  const meta = markRequest();
  const totalStart = performance.now();

  return {
    start(name, desc) {
      const startAt = performance.now();
      return () => {
        spans.push({ name, dur: performance.now() - startAt, desc });
      };
    },
    add(name, dur, desc) {
      spans.push({ name, dur, desc });
    },
    merge(timings, prefix) {
      for (const [name, dur] of Object.entries(timings)) {
        if (typeof dur !== 'number') continue;
        spans.push({
          name: prefix ? `${prefix}_${name}` : name,
          dur,
        });
      }
    },
    finish(extras) {
      const total = performance.now() - totalStart;
      spans.push({ name: 'total', dur: total });

      // Build the W3C Server-Timing header value. Format:
      //   name;dur=123.45;desc="description", name2;dur=6.78
      // Names must be ASCII-safe, no commas/semicolons inside.
      const headerParts: string[] = [];
      const spansJson: Record<string, number> = {};
      for (const s of spans) {
        const safeName = s.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        let part = `${safeName};dur=${s.dur.toFixed(2)}`;
        if (s.desc) {
          // Escape quotes in descriptions.
          part += `;desc="${s.desc.replace(/"/g, '\\"')}"`;
        }
        headerParts.push(part);
        spansJson[safeName] = Number(s.dur.toFixed(2));
      }

      return {
        header: headerParts.join(', '),
        json: {
          ...(extras ?? {}),
          spans: spansJson,
          cold: meta.cold,
          boot_age_ms: meta.bootAgeMs,
        },
      };
    },
  };
}
