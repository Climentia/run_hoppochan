import { activeRoute, allTimeMembers, type RouteRow } from "./db";
import { positionAt, type Point } from "./geo";
import { postWebhook } from "./discord/api";
import type { Env } from "./env";
import { reverseGeocode } from "./ors";

export function calculateMove(progressM: number, totalM: number, km: number): { fromM: number; toM: number; finished: boolean } {
  const fromM = Math.min(Math.max(progressM, 0), totalM);
  const toM = Math.min(fromM + Math.max(km, 0) * 1000, totalM);
  return { fromM, toM, finished: toM >= totalM };
}

function jstDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function buildPendingSql() {
  return {
    maxId: "SELECT MAX(id) AS maxId FROM logs WHERE route_id = ? AND applied_move_id IS NULL",
    total: "SELECT COALESCE(SUM(km), 0) AS km FROM logs WHERE route_id = ? AND applied_move_id IS NULL AND id <= ?",
    contributors: `SELECT (SELECT newest.user_name FROM logs AS newest WHERE newest.user_id = logs.user_id
      AND newest.route_id = ? AND newest.applied_move_id IS NULL AND newest.id <= ?
      ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1) AS userName, SUM(km) AS km
      FROM logs WHERE route_id = ? AND applied_move_id IS NULL AND id <= ? GROUP BY user_id ORDER BY km DESC LIMIT 3`,
    markApplied: `UPDATE logs SET applied_move_id = (SELECT id FROM moves WHERE route_id = ? AND move_date = ?)
      WHERE route_id = ? AND applied_move_id IS NULL AND id <= ?
      AND EXISTS (SELECT 1 FROM moves WHERE route_id = ? AND move_date = ?)`
  };
}

async function pendingSummary(db: D1Database, routeId: number): Promise<{ maxId: number; km: number; contributors: { userName: string; km: number }[] }> {
  const queries = buildPendingSql();
  const latest = await db.prepare(queries.maxId).bind(routeId).first<{ maxId: number | null }>();
  const maxId = latest?.maxId ?? 0;
  if (maxId === 0) return { maxId, km: 0, contributors: [] };
  const [total, top] = await Promise.all([
    db.prepare(queries.total).bind(routeId, maxId).first<{ km: number }>(),
    db.prepare(queries.contributors).bind(routeId, maxId, routeId, maxId).all<{ userName: string; km: number }>()
  ]);
  return { maxId, km: total?.km ?? 0, contributors: top.results };
}

async function hasMoveForDate(db: D1Database, routeId: number, date: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT id FROM moves WHERE route_id = ? AND move_date = ? LIMIT 1")
    .bind(routeId, date).first<{ id: number }>());
}

function webhookPayload(route: RouteRow, input: {
  km: number; place: string | null; progressKm: number; remainingKm: number; contributors: { userName: string; km: number }[];
  siteUrl: string; finished: boolean; allTime: { userName: string; km: number }[];
}): unknown {
  const percent = route.total_m === 0 ? 100 : Math.floor(input.progressKm * 100 / (route.total_m / 1000));
  const fields = [
    { name: "今日の記録", value: `${input.km.toFixed(2)} km`, inline: true },
    { name: "現在地", value: input.place ?? "地名を取得できませんでした", inline: true },
    { name: "進捗", value: `${input.progressKm.toFixed(2)} / ${(route.total_m / 1000).toFixed(2)} km（${percent}%）`, inline: true },
    { name: "残り", value: `${input.remainingKm.toFixed(2)} km`, inline: true },
    { name: "今日の貢献", value: input.contributors.length ? input.contributors.map(row => `${row.userName}: ${row.km.toFixed(2)} km`).join("\n") : "記録なし", inline: false }
  ];
  const description = input.finished
    ? `🎉 **${route.destination_name} に到着しました！**\n総合ランキング\n${input.allTime.slice(0, 3).map((row, i) => `${i + 1}. ${row.userName}: ${row.km.toFixed(2)} km`).join("\n")}\n\n次の目的地は /route で登録してください。`
    : `${route.origin_name} から ${route.destination_name} へ進行中です。`;
  return {
    allowed_mentions: { parse: [] },
    embeds: [{ title: "ほっぽちゃんの日次進捗", description, url: input.siteUrl, fields, color: input.finished ? 0x2ecc71 : 0xe74c3c }]
  };
}

async function insertMove(db: D1Database, route: RouteRow, date: string, input: {
  fromM: number; toM: number; place: string | null; finished: boolean; maxId: number;
}): Promise<boolean> {
  const queries = buildPendingSql();
  try {
    await db.batch([
      db.prepare(`INSERT INTO moves (route_id, move_date, km, from_m, to_m, place_name) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(route.id, date, (input.toM - input.fromM) / 1000, input.fromM, input.toM, input.place),
      db.prepare(queries.markApplied).bind(route.id, date, route.id, input.maxId, route.id, date),
      db.prepare(`UPDATE routes SET progress_m = ?, status = ?, finished_at = CASE WHEN ? THEN datetime('now') ELSE finished_at END
        WHERE id = ? AND status = 'active'`).bind(input.toM, input.finished ? "finished" : "active", Number(input.finished), route.id)
    ]);
    return true;
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: moves.route_id, moves.move_date")) return false;
    throw error;
  }
}

export async function runDaily(env: Env): Promise<void> {
  const route = await activeRoute(env.DB);
  if (!route) return;
  const date = jstDate();
  if (await hasMoveForDate(env.DB, route.id, date)) return;
  const pending = await pendingSummary(env.DB, route.id);
  if (pending.km <= 0) {
    if (await hasMoveForDate(env.DB, route.id, date)) return;
    try {
      await postWebhook(env.DISCORD_WEBHOOK_URL, {
        content: "今日は誰も走っていません。",
        allowed_mentions: { parse: [] }
      });
    } catch (error) { console.error("Daily webhook failed", error); }
    return;
  }

  const { fromM, toM, finished } = calculateMove(route.progress_m, route.total_m, pending.km);
  const points = JSON.parse(route.points) as Point[];
  const cumulative = JSON.parse(route.cum_m) as number[];
  const point = positionAt(points, cumulative, toM);
  const place = await reverseGeocode(point, env.ORS_API_KEY);
  if (!await insertMove(env.DB, route, date, { fromM, toM, place, finished, maxId: pending.maxId })) return;

  const allTime = finished ? await allTimeMembers(env.DB) : [];
  const progressKm = toM / 1000;
  const remainingKm = Math.max(0, (route.total_m - toM) / 1000);
  try {
    await postWebhook(env.DISCORD_WEBHOOK_URL, webhookPayload(route, {
      km: pending.km, place, progressKm, remainingKm, contributors: pending.contributors,
      siteUrl: env.SITE_URL, finished, allTime
    }));
  } catch (error) { console.error("Daily webhook failed", error); }
}
