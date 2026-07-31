import type { SupabaseLikeClient } from "../../src/supabase-adapter.ts";

/**
 * In-memory fake implementing the minimal PostgREST-builder surface the
 * adapter uses. Rows are plain objects keyed by table name.
 */
export function createFakeClient(): {
  client: SupabaseLikeClient;
  tables: Map<string, Record<string, unknown>[]>;
} {
  const tables = new Map<string, Record<string, unknown>[]>();
  const rows = (t: string) => {
    if (!tables.has(t)) tables.set(t, []);
    return tables.get(t)!;
  };

  type Filter = { op: "eq" | "gt" | "lt"; col: string; val: unknown };
  const matches = (row: Record<string, unknown>, fs: Filter[]) =>
    fs.every((f) => {
      const a = row[f.col] as string | number;
      const b = f.val as string | number;
      return f.op === "eq" ? a === b : f.op === "gt" ? a > b : a < b;
    });

  function chain(
    table: string,
    mode: "select" | "delete" | "update",
    updateValues?: Record<string, unknown>,
  ) {
    const filters: Filter[] = [];
    const exec = () => {
      const all = rows(table);
      const hit = all.filter((r) => matches(r, filters));
      if (mode === "delete") {
        tables.set(table, all.filter((r) => !matches(r, filters)));
      }
      if (mode === "update") {
        for (const r of hit) Object.assign(r, updateValues);
      }
      return { data: hit as unknown, error: null };
    };
    const self = {
      eq: (
        col: string,
        val: unknown,
      ) => (filters.push({ op: "eq", col, val }), self),
      gt: (
        col: string,
        val: unknown,
      ) => (filters.push({ op: "gt", col, val }), self),
      lt: (
        col: string,
        val: unknown,
      ) => (filters.push({ op: "lt", col, val }), self),
      select: (_cols?: string) => self,
      maybeSingle: () => {
        const { data } = exec();
        const arr = data as unknown[];
        return Promise.resolve({
          data: (arr[0] ?? null) as unknown,
          error: null,
        });
      },
      then<T>(
        onf?:
          | ((v: { data: unknown; error: null }) => T | PromiseLike<T>)
          | null,
      ) {
        return Promise.resolve(exec()).then(onf);
      },
    };
    return self;
  }

  const client: SupabaseLikeClient = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        rows(table).push({ ...row });
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (row: Record<string, unknown>) => {
        // Primary key is device_id for devices, challenge for challenges.
        const key = "device_id" in row ? "device_id" : "challenge";
        const existing = rows(table).find((r) => r[key] === row[key]);
        if (existing) Object.assign(existing, row);
        else rows(table).push({ ...row });
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => chain(table, "delete"),
      select: (_cols?: string) => chain(table, "select"),
      update: (values: Record<string, unknown>) =>
        chain(table, "update", values),
    }),
  };
  return { client, tables };
}
