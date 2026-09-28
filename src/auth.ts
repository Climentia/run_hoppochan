import type { Env } from "./env";
import { hasSameOrigin } from "./request";
import { cookieValue, constantTimeEqual, randomToken, sessionMaxAge, signSession } from "./session";

const STATE_COOKIE = "hoppo_oauth_state";
const SESSION_COOKIE = "hoppo_session";
const noStore = { "Cache-Control": "no-store" };
const callbackUrl = (siteUrl: string): string => `${siteUrl.replace(/\/$/u, "")}/auth/callback`;
const stateCookie = (value: string, maxAge = 600): string =>
  `${STATE_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
const sessionCookie = (value: string, maxAge = sessionMaxAge): string =>
  `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;

function redirect(siteUrl: string, query: string, clearState = true): Response {
  const headers = new Headers({ ...noStore, Location: new URL(query, siteUrl).toString() });
  if (clearState) headers.append("Set-Cookie", stateCookie("", 0));
  return new Response(null, { status: 302, headers });
}

export function originError(): Response {
  return Response.json({ error: "許可されていない送信元です" }, { status: 403, headers: noStore });
}

export async function authLogin(env: Env): Promise<Response> {
  const state = randomToken();
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.search = new URLSearchParams({
    client_id: env.DISCORD_APPLICATION_ID,
    redirect_uri: callbackUrl(env.SITE_URL),
    response_type: "code",
    scope: "identify guilds.members.read",
    state
  }).toString();
  return new Response(null, { status: 302, headers: {
    ...noStore, Location: authorize.toString(), "Set-Cookie": stateCookie(state)
  } });
}

export async function authCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const queryState = url.searchParams.get("state");
  const cookieState = cookieValue(request.headers.get("Cookie"), STATE_COOKIE);
  const goodState = queryState && cookieState && constantTimeEqual(new TextEncoder().encode(queryState), new TextEncoder().encode(cookieState));
  if (!goodState) return redirect(env.SITE_URL, "/?login=error");
  const code = url.searchParams.get("code");
  if (!code) return redirect(env.SITE_URL, "/?login=error");

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_APPLICATION_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl(env.SITE_URL)
      })
    });
    if (!tokenResponse.ok) return redirect(env.SITE_URL, "/?login=error");
    const tokenBody: unknown = await tokenResponse.json();
    if (!tokenBody || typeof tokenBody !== "object" || typeof (tokenBody as { access_token?: unknown }).access_token !== "string") {
      return redirect(env.SITE_URL, "/?login=error");
    }
    const accessToken = (tokenBody as { access_token: string }).access_token;
    const memberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (memberResponse.status === 404) {
      const response = redirect(env.SITE_URL, "/?login=not_member");
      response.headers.append("Set-Cookie", sessionCookie("", 0));
      return response;
    }
    if (!memberResponse.ok) return redirect(env.SITE_URL, "/?login=error");
    const member: unknown = await memberResponse.json();
    if (!member || typeof member !== "object") return redirect(env.SITE_URL, "/?login=error");
    const data = member as { nick?: unknown; user?: { id?: unknown; global_name?: unknown; username?: unknown } };
    if (typeof data.user?.id !== "string" || !data.user.id) return redirect(env.SITE_URL, "/?login=error");
    const name = (typeof data.nick === "string" && data.nick) ||
      (typeof data.user.global_name === "string" && data.user.global_name) ||
      (typeof data.user.username === "string" && data.user.username) || "メンバー";
    const signed = await signSession({ uid: data.user.id, name }, env.SESSION_SECRET);
    const response = redirect(env.SITE_URL, "/", false);
    response.headers.append("Set-Cookie", sessionCookie(signed));
    response.headers.append("Set-Cookie", stateCookie("", 0));
    return response;
  } catch {
    return redirect(env.SITE_URL, "/?login=error");
  }
}

export function authLogout(request: Request, env: Env): Response {
  if (!hasSameOrigin(request, env.SITE_URL)) return originError();
  return new Response(null, { status: 204, headers: { ...noStore, "Set-Cookie": sessionCookie("", 0) } });
}
