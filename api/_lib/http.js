/* Small helpers shared by the /api functions. Files in api/_lib are not
   routes; Vercel ignores folders that start with an underscore. */

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

/* Vercel (and scripts/dev-server.js) parse JSON bodies into req.body already. */
export function readJson(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body && typeof req.body === "object" ? req.body : {};
}
