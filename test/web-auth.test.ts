import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { authLogin } from "../src/auth";
import { hasSameOrigin, isSameOriginJson } from "../src/request";
import { meResponse } from "../src/web";
import type { Env } from "../src/env";

const site = "https://hoppo.example";

describe("web request guards", () => {
  it("requires the configured Origin and JSON content type", () => {
    expect(hasSameOrigin(new Request(site, { headers: { Origin: site } }), site)).toBe(true);
    expect(isSameOriginJson(new Request(site, { method: "POST", headers: { Origin: site, "Content-Type": "application/json; charset=utf-8" } }), site)).toBe(true);
    expect(isSameOriginJson(new Request(site, { method: "POST", headers: { Origin: "https://other.example", "Content-Type": "application/json" } }), site)).toBe(false);
    expect(isSameOriginJson(new Request(site, { method: "POST", headers: { Origin: site, "Content-Type": "text/plain" } }), site)).toBe(false);
  });

  it("starts OAuth with the callback URI, required scopes, and a short-lived state cookie", async () => {
    const response = await authLogin({ SITE_URL: site, DISCORD_APPLICATION_ID: "client-id" } as Env);
    const authorize = new URL(response.headers.get("Location")!);
    expect(authorize.origin).toBe("https://discord.com");
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${site}/auth/callback`);
    expect(authorize.searchParams.get("scope")).toBe("identify guilds.members.read");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns the activity factors and cap without caching them", async () => {
    const response = await meResponse(new Request(`${site}/api/me`), {
      SESSION_SECRET: "session-secret-that-is-at-least-32-bytes-long", PER_LOG_CAP_KM: "12"
    } as Env);
    const body = await response.json() as { user: unknown; activities: Array<{ activity: string; units: Array<{ unit: string; kcalFactor: number }> }>; perLogCapKm: number };
    expect(body.user).toBeNull();
    expect(body.activities.find(activity => activity.activity === "ランニング")?.units).toContainEqual({ unit: "km", kcalFactor: 40.89 });
    expect(body.perLogCapKm).toBe(12);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 401 from /api/log when no session is present", async () => {
    const env = { SITE_URL: site, SESSION_SECRET: "session-secret-that-is-at-least-32-bytes-long" } as Env;
    const request = new Request(`${site}/api/log`, {
      method: "POST", headers: { Origin: site, "Content-Type": "application/json" }, body: JSON.stringify({ items: [] })
    });
    const response = await worker.fetch(request, env, {} as ExecutionContext);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "ログインが必要です" });
  });
});
