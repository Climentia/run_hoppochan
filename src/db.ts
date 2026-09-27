import type { Point } from "./geo";

export type RouteRow = {
  id: number; origin_name: string; destination_name: string; total_m: number;
  points: string; cum_m: string; progress_m: number; status: "active" | "finished" | "cancelled";
  created_by: string; created_at: string; finished_at: string | null;
};

export async function activeRoute(db: D1Database): Promise<RouteRow | null> {
  return db.prepare("SELECT * FROM routes WHERE status = 'active' LIMIT 1").first<RouteRow>();
}

export async function getRoute(db: D1Database, id: number): Promise<RouteRow | null> {
  return db.prepare("SELECT * FROM routes WHERE id = ?").bind(id).first<RouteRow>();
}

export async function createRoute(db: D1Database, route: {
  origin: string; destination: string; totalM: number; points: Point[]; cumulative: number[]; createdBy: string;
}): Promise<number> {
  const result = await db.prepare(`INSERT INTO routes (origin_name, destination_name, total_m, points, cum_m, created_by)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(route.origin, route.destination, route.totalM, JSON.stringify(route.points), JSON.stringify(route.cumulative), route.createdBy).run();
  const id = result.meta.last_row_id;
  if (id === undefined) throw new Error("経路を保存できませんでした");
  return id;
}

export async function recordLog(db: D1Database, input: {
  routeId: number; userId: string; userName: string; kcal: number; km: number; capped: boolean; detail: string;
}): Promise<void> {
  await db.prepare(`INSERT INTO logs (route_id, user_id, user_name, kcal, km, capped, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(input.routeId, input.userId, input.userName, input.kcal, input.km, Number(input.capped), input.detail).run();
}

export async function pendingKm(db: D1Database, routeId: number): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(SUM(km), 0) AS km FROM logs WHERE route_id = ? AND applied_move_id IS NULL").bind(routeId).first<{ km: number }>();
  return row?.km ?? 0;
}

export async function userKm(db: D1Database, routeId: number, userId: string): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(SUM(km), 0) AS km FROM logs WHERE route_id = ? AND user_id = ?").bind(routeId, userId).first<{ km: number }>();
  return row?.km ?? 0;
}

export type MemberRow = { userName: string; km: number; count: number; lastAt: string };
export async function members(db: D1Database, routeId: number): Promise<MemberRow[]> {
  const result = await db.prepare(`SELECT (SELECT newest.user_name FROM logs AS newest WHERE newest.user_id = logs.user_id ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1) AS userName,
    SUM(km) AS km, COUNT(*) AS count, MAX(created_at) AS lastAt FROM logs
    WHERE route_id = ? GROUP BY user_id ORDER BY km DESC, lastAt ASC`).bind(routeId).all<MemberRow>();
  return result.results;
}

export async function allTimeMembers(db: D1Database): Promise<MemberRow[]> {
  const result = await db.prepare(`SELECT (SELECT newest.user_name FROM logs AS newest WHERE newest.user_id = logs.user_id ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1) AS userName,
    SUM(km) AS km, COUNT(*) AS count, MAX(created_at) AS lastAt FROM logs GROUP BY user_id ORDER BY km DESC, lastAt ASC`).all<MemberRow>();
  return result.results;
}

export async function currentMoves(db: D1Database, routeId: number): Promise<{ date: string; km: number; place: string | null }[]> {
  const result = await db.prepare(`SELECT move_date AS date, km, place_name AS place FROM moves WHERE route_id = ? ORDER BY move_date ASC`).bind(routeId).all<{ date: string; km: number; place: string | null }>();
  return result.results;
}

export async function routeHistory(db: D1Database, excludeId?: number): Promise<Record<string, unknown>[]> {
  const result = excludeId === undefined
    ? await db.prepare("SELECT id, origin_name AS origin, destination_name AS destination, total_m / 1000.0 AS totalKm, status, finished_at AS finishedAt FROM routes ORDER BY id DESC").all<Record<string, unknown>>()
    : await db.prepare("SELECT id, origin_name AS origin, destination_name AS destination, total_m / 1000.0 AS totalKm, status, finished_at AS finishedAt FROM routes WHERE id != ? ORDER BY id DESC").bind(excludeId).all<Record<string, unknown>>();
  return result.results;
}

export async function cancelRoute(db: D1Database, routeId: number): Promise<void> {
  await db.prepare("UPDATE routes SET status = 'cancelled' WHERE id = ? AND status = 'active'").bind(routeId).run();
}
