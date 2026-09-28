export type Item = { activity: string; amount: number; unit: "回" | "分" | "km" | "kcal"; kcal: number };
export type ParseResult = { ok: true; items: Item[]; kcal: number } | { ok: false; errors: string[] };
type RecordInput = { activity: string; amount: number; unit: string };
export const KCAL_PER_KM = 40.89;

const coefficients: Record<string, { rep?: number; min?: number; km?: number }> = {
  腹筋: { rep: 0.29, min: 8.67 },
  スクワット: { rep: 0.15, min: 5.69 },
  腕立て: { rep: 0.144, min: 4.32 },
  腕立て伏せ: { rep: 0.144, min: 4.32 },
  背筋: { rep: 0.27, min: 8.1 },
  ランニング: { km: 40.89, min: 7.28 },
  ウォーキング: { km: 40.89 },
  プランク: { min: 3 },
  サイドプランク: { min: 3 },
  ベンチプレス: { rep: 3.1 }
};

const unitLabel = { rep: "回", min: "分", km: "km" } as const;
export const activityOptions = Object.entries(coefficients).map(([activity, factors]) => ({
  activity,
  units: [
    ...Object.entries(unitLabel).flatMap(([key, unit]) => factors[key as keyof typeof unitLabel] === undefined
      ? [] : [{ unit, kcalFactor: factors[key as keyof typeof unitLabel]! }])
  ]
}));

function calculateItems(inputs: Array<RecordInput & { label: string }>): ParseResult {
  if (!inputs.length) return { ok: false, errors: ["記録が空です"] };
  const items: Item[] = [];
  const errors: string[] = [];
  for (const input of inputs) {
    const { activity, amount, label } = input;
    const rawUnit = input.unit.toLowerCase();
    const unit: Item["unit"] = rawUnit === "min" ? "分" : rawUnit === "cal" || rawUnit === "kcal" ? "kcal" : rawUnit as Item["unit"];
    const max = unit === "回" ? 10000 : unit === "分" ? 1440 : unit === "km" ? 300 : 20000;
    if (!(unit === "回" || unit === "分" || unit === "km" || unit === "kcal")) {
      errors.push(`「${label}」は種目と単位の組み合わせが使えません`);
      continue;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > max) {
      errors.push(`「${label}」は 0 より大きく、${max} 以下で入力してください`);
      continue;
    }
    const coeff = coefficients[activity];
    let kcal: number | undefined;
    if (unit === "kcal") kcal = amount;
    else if (unit === "回" && coeff?.rep !== undefined) kcal = amount * coeff.rep;
    else if (unit === "分" && coeff?.min !== undefined) kcal = amount * coeff.min;
    else if (unit === "km" && coeff?.km !== undefined) kcal = amount * coeff.km;
    if (kcal === undefined) { errors.push(`「${label}」は種目と単位の組み合わせが使えません`); continue; }
    items.push({ activity, amount, unit, kcal });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, items, kcal: items.reduce((sum, item) => sum + item.kcal, 0) };
}

export function parseRecord(input: string): ParseResult {
  const normalized = input.normalize("NFKC")
    .replace(/\s*:\s*/gu, ":")
    .replace(/(\d)\s+(回|分|min|km|kcal|cal)/giu, "$1$2");
  const fields = normalized.split(/[\s、,]+/u).filter(Boolean);
  if (!fields.length) return { ok: false, errors: ["記録が空です"] };

  const items: Array<RecordInput & { label: string }> = [];
  const errors: string[] = [];
  for (const field of fields) {
    const split = field.indexOf(":");
    if (split < 1) { errors.push(`「${field}」は「種目:量」形式で入力してください`); continue; }
    const activity = field.slice(0, split).trim();
    const match = field.slice(split + 1).trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(回|分|min|km|kcal|cal)?$/iu);
    if (!match) { errors.push(`「${field}」の量を読み取れません`); continue; }
    items.push({ activity, amount: Number(match[1]), unit: match[2] ?? "回", label: field });
  }
  if (errors.length) return { ok: false, errors };
  return calculateItems(items);
}

export function parseRecordItems(value: unknown): ParseResult {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    return { ok: false, errors: [value && Array.isArray(value) && value.length === 0 ? "記録が空です" : "記録は 1〜10 件で入力してください"] };
  }
  return calculateItems(value.map((item, index) => {
    if (!item || typeof item !== "object") return { activity: "", amount: NaN, unit: "", label: `項目${index + 1}` };
    const record = item as Record<string, unknown>;
    const activity = typeof record.activity === "string" ? record.activity.trim() : "";
    const amount = typeof record.amount === "number" ? record.amount : NaN;
    const unit = typeof record.unit === "string" ? record.unit : "";
    return { activity, amount, unit, label: `${activity || `項目${index + 1}`}:${String(record.amount ?? "")}${unit}` };
  }));
}

export function kcalToKm(kcal: number, capKm: number): { km: number; capped: boolean } {
  const raw = kcal / KCAL_PER_KM;
  return { km: Math.min(raw, capKm), capped: raw > capKm };
}
