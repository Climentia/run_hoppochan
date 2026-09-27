export type Item = { activity: string; amount: number; unit: "回" | "分" | "km" | "kcal"; kcal: number };
export type ParseResult = { ok: true; items: Item[]; kcal: number } | { ok: false; errors: string[] };

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

export function parseRecord(input: string): ParseResult {
  const normalized = input.normalize("NFKC")
    .replace(/\s*:\s*/gu, ":")
    .replace(/(\d)\s+(回|分|min|km|kcal|cal)/giu, "$1$2");
  const fields = normalized.split(/[\s、,]+/u).filter(Boolean);
  if (!fields.length) return { ok: false, errors: ["記録が空です"] };

  const items: Item[] = [];
  const errors: string[] = [];
  for (const field of fields) {
    const split = field.indexOf(":");
    if (split < 1) { errors.push(`「${field}」は「種目:量」形式で入力してください`); continue; }
    const activity = field.slice(0, split).trim();
    const match = field.slice(split + 1).trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(回|分|min|km|kcal|cal)?$/iu);
    if (!match) { errors.push(`「${field}」の量を読み取れません`); continue; }
    const amount = Number(match[1]);
    const rawUnit = (match[2] ?? "回").toLowerCase();
    const unit: Item["unit"] = rawUnit === "min" ? "分" : rawUnit === "cal" || rawUnit === "kcal" ? "kcal" : rawUnit as Item["unit"];
    const max = unit === "回" ? 10000 : unit === "分" ? 1440 : unit === "km" ? 300 : 20000;
    if (!Number.isFinite(amount) || amount <= 0 || amount > max) { errors.push(`「${field}」は 0 より大きく、${max} 以下で入力してください`); continue; }
    const coeff = coefficients[activity];
    let kcal: number | undefined;
    if (unit === "kcal") kcal = amount;
    else if (unit === "回" && coeff?.rep !== undefined) kcal = amount * coeff.rep;
    else if (unit === "分" && coeff?.min !== undefined) kcal = amount * coeff.min;
    else if (unit === "km" && coeff?.km !== undefined) kcal = amount * coeff.km;
    if (kcal === undefined) { errors.push(`「${field}」は種目と単位の組み合わせが使えません`); continue; }
    items.push({ activity, amount, unit, kcal });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, items, kcal: items.reduce((sum, item) => sum + item.kcal, 0) };
}

export function kcalToKm(kcal: number, capKm: number): { km: number; capped: boolean } {
  const raw = kcal / 40.89;
  return { km: Math.min(raw, capKm), capped: raw > capKm };
}
