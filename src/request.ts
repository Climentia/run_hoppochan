export function hasSameOrigin(request: Request, siteUrl: string): boolean {
  return request.headers.get("Origin") === new URL(siteUrl).origin;
}

export function isSameOriginJson(request: Request, siteUrl: string): boolean {
  return hasSameOrigin(request, siteUrl) &&
    request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}
