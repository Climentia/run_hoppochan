import { activeRoute, createRoute } from "./db";
import type { Env } from "./env";
import { getRoute, RouteUserError } from "./ors";

export const activeRouteMessage = "すでに進行中の経路があります。先に /cancel を実行してください。";
export const routeRegistrationError = "経路登録に失敗しました。時間をおいて再度お試しください。";

export function validateRouteInput(start: unknown, goal: unknown): { start: string; goal: string } {
  if (typeof start !== "string" || typeof goal !== "string") throw new RouteUserError("出発地と目的地を 1〜256 文字で入力してください。");
  const trimmedStart = start.trim();
  const trimmedGoal = goal.trim();
  if (!trimmedStart || !trimmedGoal || trimmedStart.length > 256 || trimmedGoal.length > 256) {
    throw new RouteUserError("出発地と目的地を 1〜256 文字で入力してください。");
  }
  return { start: trimmedStart, goal: trimmedGoal };
}

export class RouteConflictError extends Error {
  constructor(readonly cause?: unknown) { super(activeRouteMessage); }
}

export class RouteRegistrationFailure extends Error {
  constructor(readonly status: 500 | 502, readonly cause?: unknown) { super(routeRegistrationError); }
}

export function isRouteUniqueConflict(error: unknown): boolean {
  return String(error).includes("UNIQUE constraint failed: routes.status");
}

export async function registerRoute(db: D1Database, env: Env, input: { start: string; goal: string }, createdBy: string): Promise<{
  id: number; origin: string; destination: string; totalM: number;
}> {
  let current;
  try { current = await activeRoute(db); }
  catch (error) { throw new RouteRegistrationFailure(500, error); }
  if (current) throw new RouteUserError(activeRouteMessage);

  let route;
  try { route = await getRoute(input.start, input.goal, env.ORS_API_KEY, env.ORS_PROFILE || "foot-walking"); }
  catch (error) {
    if (error instanceof RouteUserError) throw error;
    throw new RouteRegistrationFailure(502, error);
  }

  try {
    const id = await createRoute(db, { ...route, createdBy });
    return { id, origin: route.origin, destination: route.destination, totalM: route.totalM };
  } catch (error) {
    if (isRouteUniqueConflict(error)) throw new RouteConflictError(error);
    throw new RouteRegistrationFailure(500, error);
  }
}
