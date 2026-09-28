import { activityOptions, KCAL_PER_KM, parseRecordItems } from "./exercise";
import type { Env } from "./env";
import { logRecord, perLogCap } from "./log";
import { isSameOriginJson } from "./request";
import { cookieValue, verifySession } from "./session";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: noStore });

export async function meResponse(request: Request, env: Env): Promise<Response> {
  const session = await verifySession(cookieValue(request.headers.get("Cookie"), "hoppo_session"), env.SESSION_SECRET);
  return json({ user: session ? { name: session.name } : null, activities: activityOptions, kcalPerKm: KCAL_PER_KM, perLogCapKm: perLogCap(env.PER_LOG_CAP_KM) });
}

export async function logResponse(request: Request, env: Env): Promise<Response> {
  if (!isSameOriginJson(request, env.SITE_URL)) return json({ error: "許可されていない送信元です" }, 403);
  const session = await verifySession(cookieValue(request.headers.get("Cookie"), "hoppo_session"), env.SESSION_SECRET);
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
