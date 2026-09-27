import { cumulativeDistances, thinPoints, type Point } from "./geo";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value !== null && typeof value === "object" ? value as JsonObject : null;

export class RouteUserError extends Error {}

async function orsJson(url: URL, apiKey: string, init?: RequestInit): Promise<JsonObject> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: apiKey, ...(init?.headers ?? {}) }
  });
  const data: unknown = await response.json().catch(() => null);
  const root = object(data);
  if (!response.ok) {
    const error = object(root?.error);
    throw new RouteUserError(typeof error?.message === "string" ? error.message : `OpenRouteService error (${response.status})`);
  }
  if (!root) throw new Error("OpenRouteService returned invalid JSON");
  return root;
}

async function geocode(place: string, apiKey: string): Promise<{ label: string; point: Point }> {
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.search = new URLSearchParams({ text: place, size: "1" }).toString();
  const root = await orsJson(url, apiKey);
  const features = Array.isArray(root.features) ? root.features : [];
  const feature = object(features[0]);
  const properties = object(feature?.properties);
  const geometry = object(feature?.geometry);
  const coords = geometry?.coordinates;
  if (!properties || typeof properties.label !== "string" || !Array.isArray(coords) || typeof coords[0] !== "number" || typeof coords[1] !== "number") {
    throw new RouteUserError(`場所が見つかりません: ${place}`);
  }
  return { label: properties.label, point: [coords[1], coords[0]] };
}

export async function getRoute(start: string, goal: string, apiKey: string, profile: string): Promise<{
  origin: string; destination: string; points: Point[]; cumulative: number[]; totalM: number;
}> {
  const [origin, destination] = await Promise.all([geocode(start, apiKey), geocode(goal, apiKey)]);
  const url = new URL(`https://api.openrouteservice.org/v2/directions/${encodeURIComponent(profile)}/geojson`);
  const root = await orsJson(url, apiKey, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coordinates: [[origin.point[1], origin.point[0]], [destination.point[1], destination.point[0]]] })
  });
  const features = Array.isArray(root.features) ? root.features : [];
  const feature = object(features[0]);
  const geometry = object(feature?.geometry);
  const properties = object(feature?.properties);
  const summary = object(properties?.summary);
  const coordinates = geometry?.coordinates;
  if (typeof summary?.distance !== "number" || !Number.isFinite(summary.distance) || summary.distance <= 0) {
    throw new Error("OpenRouteService の経路距離が不正です");
  }
  if (!Array.isArray(coordinates)) throw new Error("OpenRouteService の経路がありません");
  const points = thinPoints(coordinates.map((coordinate): Point => {
    if (!Array.isArray(coordinate) || typeof coordinate[0] !== "number" || typeof coordinate[1] !== "number") throw new Error("OpenRouteService returned invalid coordinates");
    return [coordinate[1], coordinate[0]];
  }), 2000);
  if (points.length < 2) throw new Error("経路の座標が不足しています");
  const cumulative = cumulativeDistances(points);
  const totalM = cumulative[cumulative.length - 1];
  if (!Number.isFinite(totalM) || totalM <= 0) throw new Error("経路距離が不正です");
  return { origin: origin.label, destination: destination.label, points, cumulative, totalM };
}

export async function reverseGeocode(point: Point, apiKey: string): Promise<string | null> {
  const url = new URL("https://api.openrouteservice.org/geocode/reverse");
  url.search = new URLSearchParams({ "point.lat": String(point[0]), "point.lon": String(point[1]), size: "1" }).toString();
  try {
    const root = await orsJson(url, apiKey);
    const features = Array.isArray(root.features) ? root.features : [];
    const properties = object(object(features[0])?.properties);
    return typeof properties?.label === "string" ? properties.label : null;
  } catch {
    return null;
  }
}
