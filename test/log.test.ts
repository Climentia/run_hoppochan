import { describe, expect, it } from "vitest";
import { logRecord } from "../src/log";
import { parseRecord, parseRecordItems } from "../src/exercise";

function dbFor(route: Record<string, unknown> | null): D1Database {
  return {
    prepare(query: string) {
      const statement = {
        bind(..._values: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT * FROM routes WHERE status")) return route as T | null;
          if (query.includes("user_id = ?")) return { km: 15 } as T;
          if (query.includes("applied_move_id IS NULL")) return { km: 15 } as T;
          return null;
        },
        async run() { return { success: true, meta: {} }; }
      };
      return statement as unknown as D1PreparedStatement;
    }
  } as D1Database;
}

const route = {
  id: 1, total_m: 30_000, progress_m: 10_000
};

describe("shared log creation", () => {
  it("returns Discord-compatible validation errors without touching the database", async () => {
    const result = await logRecord(dbFor(null), {
      userId: "1", userName: "test", parsed: parseRecordItems([{ activity: "プランク", amount: 30, unit: "回" }]), capKm: 15
    });
    expect(result).toEqual({ ok: false, kind: "invalid", errors: ["「プランク:30回」は種目と単位の組み合わせが使えません"] });
  });

  it("applies the per-log cap and calculates the shared totals", async () => {
    const result = await logRecord(dbFor(route), {
      userId: "1", userName: "test", parsed: parseRecord("ランニング:30km"), capKm: 15
    });
    expect(result).toEqual({ ok: true, km: 15, capped: true, userTotalKm: 15, remainingKm: 5 });
  });

  it("reports the same no-active-route message used by the Discord command", async () => {
    const result = await logRecord(dbFor(null), {
      userId: "1", userName: "test", parsed: parseRecord("ランニング:1km"), capKm: 15
    });
    expect(result).toMatchObject({ ok: false, kind: "no_route", message: "経路が登録されていません。管理者に /route を実行してもらってください。" });
  });
});
