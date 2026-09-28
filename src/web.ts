import { activityOptions, KCAL_PER_KM, parseRecordItems } from "./exercise";
import type { Env } from "./env";
import { logRecord, perLogCap } from "./log";
import { isSameOriginJson } from "./request";
import { cookieValue, verifySession, type Session } from "./session";
import { registerRoute, RouteConflictError, RouteRegistrationFailure, routeRegistrationError, validateRouteInput } from "./route";
import { RouteUserError } from "./ors";
import { activeRoute, cancelRoute } from "./db";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: noStore });

export function parseAdminUserIds(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map(id => id.trim()).filter(Boolean));
}

export function isAdmin(session: Pick<Session, "uid"> | null, configuredIds: string | undefined): boolean {
  return Boolean(session && parseAdminUserIds(configuredIds).has(session.uid));
}

async function requestSession(request: Request, env: Env): Promise<Session | null> {
  return verifySession(cookieValue(request.headers.get("Cookie"), "hoppo_session"), env.SESSION_SECRET);
}

export async function meResponse(request: Request, env: Env): Promise<Response> {
  const session = await requestSession(request, env);
  return json({ user: session ? { name: session.name } : null, isAdmin: isAdmin(session, env.ADMIN_USER_IDS), activities: activityOptions, kcalPerKm: KCAL_PER_KM, perLogCapKm: perLogCap(env.PER_LOG_CAP_KM) });
}

export async function logResponse(request: Request, env: Env): Promise<Response> {
  if (!isSameOriginJson(request, env.SITE_URL)) return json({ error: "許可されていない送信元です" }, 403);
  const session = await requestSession(request, env);
  if (!session) return json({ error: "ログインが必要です" }, 401);
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "JSON を読み取れません" }, 400); }
  if (!body || typeof body !== "object" || !("items" in body)) return json({ error: "記録内容を読み取れません" }, 400);
  let result;
  try {
    result = await logRecord(env.DB, {
      userId: session.uid, userName: session.name,
      parsed: parseRecordItems((body as { items: unknown }).items),
      capKm: perLogCap(env.PER_LOG_CAP_KM)
    });
  } catch {
    return json({ error: "記録に失敗しました。時間をおいて再度お試しください。" }, 500);
  }
  if (!result.ok && result.kind === "invalid") return json({ errors: result.errors }, 422);
  if (!result.ok) return json({ error: result.message }, 409);
  return json(result);
}

async function adminSession(request: Request, env: Env): Promise<{ session: Session } | { response: Response }> {
  if (!isSameOriginJson(request, env.SITE_URL)) return { response: json({ error: "許可されていない送信元です" }, 403) };
  const session = await requestSession(request, env);
  if (!session) return { response: json({ error: "ログインが必要です" }, 401) };
  if (!isAdmin(session, env.ADMIN_USER_IDS)) return { response: json({ error: "管理者のみ操作できます" }, 403) };
  return { session };
}

export async function adminRouteResponse(request: Request, env: Env): Promise<Response> {
  const access = await adminSession(request, env);
  if ("response" in access) return access.response;
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "JSON を読み取れません" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "経路の内容を読み取れません" }, 400);

  let input: { start: string; goal: string };
  try { input = validateRouteInput((body as { start?: unknown }).start, (body as { goal?: unknown }).goal); }
  catch (error) {
    if (error instanceof RouteUserError) return json({ error: error.message }, 422);
    return json({ error: routeRegistrationError }, 500);
  }

  try {
    const route = await registerRoute(env.DB, env, input, access.session.uid);
    console.log("Admin route registered", access.session.uid, route.id);
    return json({ origin: route.origin, destination: route.destination, totalKm: route.totalM / 1000 });
  } catch (error) {
    if (error instanceof RouteUserError) return json({ error: error.message }, 422);
    if (error instanceof RouteConflictError) return json({ error: error.message }, 409);
    if (error instanceof RouteRegistrationFailure) {
      console.error("Admin route registration failed", access.session.uid, error.cause);
      return json({ error: routeRegistrationError }, error.status);
    }
    console.error("Admin route registration failed", access.session.uid, error);
    return json({ error: routeRegistrationError }, 500);
  }
}

export async function adminCancelResponse(request: Request, env: Env): Promise<Response> {
  const access = await adminSession(request, env);
  if ("response" in access) return access.response;
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "JSON を読み取れません" }, 400); }
  const routeId = body && typeof body === "object" ? (body as { routeId?: unknown }).routeId : null;
  if (typeof routeId !== "number" || !Number.isSafeInteger(routeId) || routeId < 1) return json({ error: "経路 ID が正しくありません" }, 400);

  try {
    const route = await activeRoute(env.DB);
    if (!route || route.id !== routeId || !await cancelRoute(env.DB, routeId)) {
      return json({ error: "キャンセル対象の経路がありません。ページを更新してください。" }, 409);
    }
  } catch (error) {
    console.error("Admin route cancellation failed", access.session.uid, routeId, error);
    return json({ error: "経路の中止に失敗しました。時間をおいて再度お試しください。" }, 500);
  }
  console.log("Admin route cancelled", access.session.uid, routeId);
  return json({ ok: true });
}
