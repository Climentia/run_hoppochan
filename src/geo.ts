export type Point = [number, number];
const EARTH_RADIUS_M = 6371008.8;

export function haversine(a: Point, b: Point): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(x));
}

export function cumulativeDistances(points: Point[]): number[] {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + haversine(points[i - 1], points[i]));
  return points.length ? distances : [];
}

export function positionAt(points: Point[], cumulative: number[], distance: number): Point {
  if (points.length === 0 || points.length !== cumulative.length) throw new Error("Invalid route points");
  if (distance <= 0) return points[0];
  const end = cumulative[cumulative.length - 1];
  if (distance >= end) return points[points.length - 1];
  for (let i = 1; i < cumulative.length; i++) {
    if (distance <= cumulative[i]) {
      const span = cumulative[i] - cumulative[i - 1];
      const ratio = span ? (distance - cumulative[i - 1]) / span : 0;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * ratio,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * ratio
      ];
    }
  }
  return points[points.length - 1];
}

export function thinPoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints || maxPoints >= points.length) return points;
  if (maxPoints < 2) throw new Error("maxPoints must be at least 2");
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * (points.length - 1) / (maxPoints - 1))]);
}

export function decodePolyline(encoded: string): Point[] {
  const points: Point[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    const read = () => {
      let result = 0, shift = 0, byte: number;
      do {
        if (index >= encoded.length) throw new Error("Invalid polyline");
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    lat += read();
    lng += read();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}
