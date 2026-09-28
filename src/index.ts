import { pastRouteResponse, stateResponse } from "./api";
import { authCallback, authLogin, authLogout } from "./auth";
import { handleInteraction } from "./discord/handlers";
import { verifyRequest } from "./discord/verify";
import { runDaily } from "./daily";
import type { Env } from "./env";
import { adminCancelResponse, adminRouteResponse, logResponse, meResponse } from "./web";

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/interactions") {
      if (request.method !== "POST") return errorResponse("Method not allowed", 405);
      const body = await request.arrayBuffer();
      if (!await verifyRequest(request, body, env.DISCORD_PUBLIC_KEY)) return errorResponse("Invalid request signature", 401);
      try {
        const interaction: unknown = JSON.parse(new TextDecoder().decode(body));
        if (!interaction || typeof interaction !== "object") return errorResponse("Invalid request body", 400);
        return await handleInteraction(interaction as Parameters<typeof handleInteraction>[0], env, ctx);
      } catch (error) {
        console.error("Interaction failed", error);
        return Response.json({ type: 4, data: { content: "処理に失敗しました。時間をおいて再度お試しください。", flags: 64, allowed_mentions: { parse: [] } } });
      }
    }
    if (url.pathname === "/auth/login" && request.method === "GET") return authLogin(env);
    if (url.pathname === "/auth/callback" && request.method === "GET") return authCallback(request, env);
    if (url.pathname === "/auth/logout" && request.method === "POST") return authLogout(request, env);
    if (url.pathname.startsWith("/auth/")) return errorResponse("Method not allowed", 405);
    if (url.pathname === "/api/me" && request.method === "GET") return meResponse(request, env);
    if (url.pathname === "/api/log" && request.method === "POST") return logResponse(request, env);
    if (url.pathname === "/api/admin/route" && request.method === "POST") return adminRouteResponse(request, env);
    if (url.pathname === "/api/admin/cancel" && request.method === "POST") return adminCancelResponse(request, env);
    if (url.pathname === "/api/state" && request.method === "GET") {
      try { return await stateResponse(env.DB); }
      catch (error) { console.error("State query failed", error); return errorResponse("State is unavailable", 500); }
    }
    const match = url.pathname.match(/^\/api\/routes\/(\d+)$/u);
    if (match && request.method === "GET") {
      try { return await pastRouteResponse(env.DB, Number(match[1])); }
      catch (error) { console.error("Route query failed", error); return errorResponse("Route is unavailable", 500); }
    }
    return env.ASSETS.fetch(request);
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runDaily(env).catch(error => console.error("Daily job failed", error)));
  }
};
