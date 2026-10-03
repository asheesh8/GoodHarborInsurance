/*
  Local development server.

  Serves the static site and runs the functions in /api the same way Vercel
  does, so the editor's Publish button and the contact form work on your own
  computer. No dependencies: `npm run dev`, then open http://localhost:3040.

  Locally, Publish writes straight into data/content.json (and assets/uploads/)
  instead of committing to GitHub. The editor password is "harbor" unless you
  set ADMIN_PASSWORD.
*/
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* This file lives in scripts/; the site is the folder above. It sits here
   (not at the top level) so Vercel doesn't mistake it for a Node server app. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const PORT = Number(process.env.PORT) || 3040;

process.env.LOCAL_PUBLISH ??= "1";
process.env.ADMIN_PASSWORD ??= "harbor";

const API_ROUTES = {
  "/api/publish": "api/publish.js",
  "/api/contact": "api/contact.js",
};

/* Folders that exist in the project but are never part of the website. */
const PRIVATE = ["/client-assets", "/api", "/scripts", "/partials", "/docs", "/node_modules", "/.", "/package.json"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function runApi(req, res, file) {
  req.body = await readBody(req);
  const { default: handler } = await import(`${pathToFileURL(path.join(ROOT, file))}?t=${Date.now()}`);
  await handler(req, res);
}

/* "/medicare" -> medicare.html, "/" -> index.html, like Vercel's cleanUrls. */
async function findFile(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/\/+$/, "") || "/index";
  const candidates = path.extname(clean) ? [clean] : [`${clean}.html`, `${clean}/index.html`];
  for (const candidate of candidates) {
    const file = path.join(ROOT, candidate);
    if (!file.startsWith(ROOT)) return null;
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

async function serveStatic(req, res, urlPath) {
  const blocked = PRIVATE.some((prefix) => urlPath === prefix || urlPath.startsWith(`${prefix}/`) || urlPath.startsWith(prefix + "."));
  const file = blocked ? null : await findFile(urlPath);

  if (!file) {
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    res.end(await readFile(path.join(ROOT, "404.html")).catch(() => "Not found"));
    return;
  }

  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(await readFile(file));
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (API_ROUTES[pathname]) await runApi(req, res, API_ROUTES[pathname]);
      else await serveStatic(req, res, pathname);
    } catch (error) {
      console.error(error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server error");
    }
  })
  .listen(PORT, () => {
    console.log(`Good Harbor running at http://localhost:${PORT}`);
    console.log(`Site editor:          http://localhost:${PORT}/admin  (password: ${process.env.ADMIN_PASSWORD})`);
  });
