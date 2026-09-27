import { describe, expect, it } from "vitest";
import { cumulativeDistances, decodePolyline, haversine, positionAt, thinPoints, type Point } from "../src/geo";

describe("route geometry", () => {
  const points: Point[] = [[0, 0], [0, 1], [1, 1]];
  const cumulative = cumulativeDistances(points);

  it("computes known distances and interpolates endpoints and midpoint", () => {
    expect(haversine([0, 0], [0, 1])).toBeCloseTo(111195, -1);
    expect(positionAt(points, cumulative, -1)).toEqual(points[0]);
    expect(positionAt(points, cumulative, cumulative[1] / 2)[0]).toBe(0);
    expect(positionAt(points, cumulative, cumulative.at(-1)! + 1)).toEqual(points.at(-1));
  });

  it("keeps endpoints when thinning and decodes encoded polyline", () => {
    expect(thinPoints([0, 1, 2, 3, 4], 3)).toEqual([0, 2, 4]);
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
});
