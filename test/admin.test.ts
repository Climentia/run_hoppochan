import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { validateRouteInput } from "../src/route";
import { signSession } from "../src/session";
import { isAdmin, meResponse, parseAdminUserIds } from "../src/web";
import type { Env } from "../src/env";

const site = "https://hoppo.example";
const secret = "a-random-session-secret-with-at-least-32-bytes";

function database(active: { id: number } | null = null) {
  let writes = 0;
  const db = {
    prepare(query: string) {
      const statement = {
        bind() { return statement; },
        async first() { return query.includes("SELECT * FROM routes WHERE status") ? active : null; },
        async run() { writes++; return { success: true, meta: { changes: 1 } }; }
      };
      return statement;
    }
  } as unknown as D1Database;
  return { db, writes: () => writes };
}

const post = (path: string, body: unknown, cookie?: string, origin = site) => new Request(`${site}${path}`, {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body)
});

async function cookie(uid: string): Promise<string> {
  return `hoppo_session=${await signSession({ uid, name: "test" }, secret)}`;
}

function env(db: D1Database, adminIds = "42"): Env {
  return { DB: db, SITE_URL: site, SESSION_SECRET: secret, ADMIN_USER_IDS: adminIds, ORS_API_KEY: "key", ORS_PROFILE: "foot-walking" } as Env;
}

describe("admin access", () => {
  it("parses empty and spaced ID lists and rejects non-members", () => {
    expect([...parseAdminUserIds("")]).toEqual([]);
    expect([...parseAdminUserIds(" 42, , 84 ")]).toEqual(["42", "84"]);
    expect(isAdmin({ uid: "84" }, "42, 21")).toBe(false);
    expect(isAdmin(null, "42")).toBe(false);
  });

  it("re-evaluates /api/me admin access from the current environment", async () => {
    const signed = await cookie("42");
    const request = new Request(`${site}/api/me`, { headers: { Cookie: signed } });
    const first = await meResponse(request, env(database().db, "42"));
    const second = await meResponse(request, env(database().db, ""));
    expect((await first.json() as { isAdmin: boolean }).isAdmin).toBe(true);
    expect((await second.json() as { isAdmin: boolean }).isAdmin).toBe(false);
  });

  it("uses the shared Discord route input validation", () => {
    expect(validateRouteInput("  東京駅 ", " 横浜駅 ")).toEqual({ start: "東京駅", goal: "横浜駅" });
    expect(() => validateRouteInput("  ", "goal")).toThrow("出発地と目的地を 1〜256 文字で入力してください。");
    expect(() => validateRouteInput("x".repeat(257), "goal")).toThrow("出発地と目的地を 1〜256 文字で入力してください。");
  });

  it.each(["/api/admin/route", "/api/admin/cancel"]) ("requires a session at %s", async path => {
    const response = await worker.fetch(post(path, { start: "a", goal: "b", routeId: 1 }), env(database().db), {} as ExecutionContext);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "ログインが必要です" });
  });

  it.each(["/api/admin/route", "/api/admin/cancel"]) ("rejects non-admins and foreign Origins at %s", async path => {
    const db = database().db;
    const nonAdmin = await worker.fetch(post(path, { start: "a", goal: "b", routeId: 1 }, await cookie("84")), env(db), {} as ExecutionContext);
    expect(nonAdmin.status).toBe(403);
    expect(await nonAdmin.json()).toEqual({ error: "管理者のみ操作できます" });
    const wrongOrigin = await worker.fetch(post(path, {}, undefined, "https://attacker.example"), env(db), {} as ExecutionContext);
    expect(wrongOrigin.status).toBe(403);
    expect(await wrongOrigin.json()).toEqual({ error: "許可されていない送信元です" });
  });

  it("returns 409 when canceling a route other than the current active one", async () => {
    const { db, writes } = database({ id: 7 });
    const response = await worker.fetch(post("/api/admin/cancel", { routeId: 8 }, await cookie("42")), env(db), {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(writes()).toBe(0);
  });
});
