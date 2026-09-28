import { describe, expect, it } from "vitest";
import { activityOptions, kcalToKm, parseRecord, parseRecordItems } from "../src/exercise";

describe("exercise records", () => {
  it("parses units, aliases, full width input, and multiple lines", () => {
    const result = parseRecord("腹筋：３０回\nランニング：３ｋｍ, ベンチプレス:2回");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kcal).toBeCloseTo(8.7 + 122.67 + 6.2);
  });

  it("uses the specified coefficients for every activity and unit", () => {
    const result = parseRecord("スクワット:10回 腕立て伏せ:10回 背筋:10回 ランニング:1min ウォーキング:1km プランク:2分 サイドプランク:10分 任意:350cal ベンチプレス:1kcal");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kcal).toBeCloseTo(1.5 + 1.44 + 2.7 + 7.28 + 40.89 + 6 + 30 + 350 + 1);
  });

  it("accepts spaces around the colon and between amount and unit", () => {
    for (const input of ["ランニング:3 km", "腹筋: 30回", "腹筋 : 30回"]) {
      const result = parseRecord(input);
      expect(result.ok, input).toBe(true);
    }
  });

  it("rejects an invalid item as a whole and caps a log", () => {
    expect(parseRecord("腹筋:10回 なわとび:5回").ok).toBe(false);
    expect(parseRecord("腹筋:-1回").ok).toBe(false);
    expect(parseRecord("ランニング:2回").ok).toBe(false);
    expect(parseRecord("").ok).toBe(false);
    expect(kcalToKm(40.89 * 20, 15)).toEqual({ km: 15, capped: true });
  });

  it("exports the web form's unit factors from the same activity table", () => {
    expect(activityOptions.find(activity => activity.activity === "ランニング")?.units).toEqual([
      { unit: "分", kcalFactor: 7.28 }, { unit: "km", kcalFactor: 40.89 }
    ]);
    expect(parseRecordItems([{ activity: "プランク", amount: 30, unit: "回" }])).toEqual({
      ok: false, errors: ["「プランク:30回」は種目と単位の組み合わせが使えません"]
    });
  });
});
