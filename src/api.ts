import { allTimeMembers, activeRoute, currentMoves, getRoute, members, pendingKm, routeHistory, type RouteRow } from "./db";
import { positionAt, thinPoints, type Point } from "./geo";

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  headers: { "Cache-Control": "public, max-age=60" }
});

async function routeState(db: D1Database, row: RouteRow, includeHistory: boolean): Promise<Record<string, unknown>> {
  const points = JSON.parse(row.points) as Point[];
  const cumulative = JSON.parse(row.cum_m) as number[];
  const [memberRows, pending, moves] = await Promise.all([members(db, row.id), pendingKm(db, row.id), currentMoves(db, row.id)]);
  const place = moves.at(-1)?.place ?? (row.progress_m === 0 ? row.origin_name : null);
  const data: Record<string, unknown> = {
    id: row.id,
    origin: row.origin_name,
    destination: row.destination_name,
    status: row.status,
    totalKm: row.total_m / 1000,
    progressKm: row.progress_m / 1000,
    pendingKm: pending,
    points: thinPoints(points, 500),
    current: positionAt(points, cumulative, row.progress_m),
    currentPlace: place,
    createdAt: row.created_at
  };
  return {
    route: data,
    members: memberRows,
    moves,
    ...(includeHistory ? { history: await routeHistory(db, row.id) } : {})
  };
}

export async function stateResponse(db: D1Database): Promise<Response> {
  const [route, allTime] = await Promise.all([activeRoute(db), allTimeMembers(db)]);
  if (!route) return json({ route: null, members: [], allTimeMembers: allTime, moves: [], history: await routeHistory(db) });
  const data = await routeState(db, route, true);
  return json({ ...data, allTimeMembers: allTime });
}

export async function pastRouteResponse(db: D1Database, id: number): Promise<Response> {
  const route = await getRoute(db, id);
  if (!route) return json({ error: "経路が見つかりません" }, 404);
  return json(await routeState(db, route, false));
}
