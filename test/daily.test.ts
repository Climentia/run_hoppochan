import { describe, expect, it } from "vitest";
import { buildPendingSql, calculateMove } from "../src/daily";

describe("daily progress", () => {
  it("caps progress at the destination", () => {
    expect(calculateMove(1200, 5000, 1.5)).toEqual({ fromM: 1200, toM: 2700, finished: false });
    expect(calculateMove(4000, 5000, 3)).toEqual({ fromM: 4000, toM: 5000, finished: true });
  });

  it("limits summary, contributors, and log acknowledgment to the snapshot max id", () => {
    const sql = buildPendingSql();
    expect(sql.maxId).toContain("MAX(id)");
    expect(sql.total).toContain("id <= ?");
    expect(sql.contributors.match(/id <= \?/gu)).toHaveLength(2);
    expect(sql.markApplied).toContain("id <= ?");
  });
});
