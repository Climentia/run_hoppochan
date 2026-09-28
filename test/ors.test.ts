import { describe, expect, it, vi } from "vitest";
import { getRoute, reverseGeocode } from "../src/ors";

describe("HeiGIT OpenRouteService URLs", () => {
  it("requests the search, directions, and reverse endpoints", async () => {
    const urls: string[] = [];
    const replies = [
      { features: [{ properties: { label: "Tokyo" }, geometry: { coordinates: [139, 35] } }] },
      { features: [{ properties: { label: "Osaka" }, geometry: { coordinates: [135, 34] } }] },
      { features: [{ properties: { summary: { distance: 400000 } }, geometry: { coordinates: [[139, 35], [135, 34]] } }] },
      { features: [{ properties: { label: "途中" } }] }
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(replies[urls.length - 1]), { status: 200 });
    }));

    try {
      await getRoute("Tokyo", "Osaka", "test-key", "foot-walking");
      await reverseGeocode([35, 139], "test-key");

      expect(urls).toEqual([
        "https://api.heigit.org/pelias/v1/search?text=Tokyo&size=1",
        "https://api.heigit.org/pelias/v1/search?text=Osaka&size=1",
        "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson",
        "https://api.heigit.org/pelias/v1/reverse?point.lat=35&point.lon=139&size=1"
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
