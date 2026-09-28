import { describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";

const site = "https://hoppo.example";
const db = {
  prepare() {
    const statement = {
      bind() { return statement; },
      async first() { return null; },
      async all() { return { results: [] }; }
    };
    return statement;
  }
} as unknown as D1Database;

describe("state cache headers", () => {
  it.each([["/api/state", 200], ["/api/routes/1", 404]] as const)("requires revalidation for %s", async (path, status) => {
    const response = await worker.fetch(new Request(`${site}${path}`), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });
});
