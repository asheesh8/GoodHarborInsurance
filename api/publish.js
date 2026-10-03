/*
  /api/publish — puts the site editor's changes live.

  GET   tells the editor whether publishing is set up.
  POST  { content }  with  Authorization: Bearer <editor password>
        1. checks the password (ADMIN_PASSWORD)
        2. turns newly uploaded photos into files in assets/uploads/
        3. saves data/content.json and those photos (see _lib/save-files.js)
*/
import { readJson, sendJson } from "./_lib/http.js";
import { isCorrectPassword } from "./_lib/password.js";
import { saveFiles, saveMode } from "./_lib/save-files.js";
import { extractUploads } from "./_lib/uploads.js";

const MAX_CONTENT_BYTES = 4 * 1024 * 1024;

export default async function handler(req, res) {
  const mode = process.env.ADMIN_PASSWORD ? saveMode() : null;

  if (req.method === "GET") return sendJson(res, 200, { ready: Boolean(mode), mode });
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST to publish." });

  if (!mode) {
    return sendJson(res, 501, { error: "Publishing isn't set up on this site yet. Download the content file instead." });
  }
  if (!(await isCorrectPassword(req))) {
    return sendJson(res, 401, { error: "That password isn't right." });
  }

  const { content } = readJson(req);
  const problem = findProblem(content);
  if (problem) return sendJson(res, 400, { error: problem });

  try {
    const { content: saved, files } = extractUploads({ ...content, updated: new Date().toISOString() });
    files.push({ path: "data/content.json", content: Buffer.from(`${JSON.stringify(saved, null, 2)}\n`) });

    const when = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const result = await saveFiles(files, `Site editor: publish changes (${when})`);
    return sendJson(res, 200, { ok: true, content: saved, ...result });
  } catch (error) {
    console.error(error);
    return sendJson(res, 502, { error: `Your changes couldn't be saved. ${error.message}` });
  }
}

/* A quick shape check so a broken request can't wipe the site's content. */
function findProblem(content) {
  if (!content || typeof content !== "object") return "Nothing to publish.";
  if (typeof content.site !== "object" || !content.site) return "The business details are missing.";
  if (!Array.isArray(content.team)) return "The team list is missing.";
  if (typeof content.pages !== "object" || !content.pages) return "The page edits are missing.";
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) return "The changes are too large. Try using smaller photos.";
  return null;
}
