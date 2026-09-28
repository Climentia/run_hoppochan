import { activeRoute, pendingKm, recordLog, userKm } from "./db";
import { kcalToKm, type ParseResult } from "./exercise";

export const NO_ACTIVE_ROUTE = "経路が登録されていません。管理者に /route を実行してもらってください。";

export type LogResult =
  | { ok: true; km: number; capped: boolean; userTotalKm: number; remainingKm: number }
  | { ok: false; kind: "invalid"; errors: string[] }
  | { ok: false; kind: "no_route"; message: string };

export async function logRecord(db: D1Database, input: {
  userId: string; userName: string; parsed: ParseResult; capKm: number;
}): Promise<LogResult> {
  if (!input.parsed.ok) return { ok: false, kind: "invalid", errors: input.parsed.errors };
  const route = await activeRoute(db);
  if (!route) return { ok: false, kind: "no_route", message: NO_ACTIVE_ROUTE };
  const converted = kcalToKm(input.parsed.kcal, input.capKm);
  await recordLog(db, {
    routeId: route.id, userId: input.userId, userName: input.userName,
    kcal: input.parsed.kcal, km: converted.km, capped: converted.capped,
    detail: JSON.stringify(input.parsed.items)
  });
  const [userTotalKm, pending] = await Promise.all([
    userKm(db, route.id, input.userId), pendingKm(db, route.id)
  ]);
  return {
    ok: true, km: converted.km, capped: converted.capped, userTotalKm,
    remainingKm: Math.max(0, (route.total_m - route.progress_m) / 1000 - pending)
  };
}

export function perLogCap(value: string): number {
  const configured = Number(value);
  return Number.isFinite(configured) && configured > 0 ? configured : 15;
}
