/*
  Saves files for the site editor, in one of two places:

  - GitHub (the live site). Needs GITHUB_TOKEN and GITHUB_REPO ("owner/name"),
    optionally GITHUB_BRANCH (default "main"). Every file goes into a single
    commit; Vercel sees the commit and redeploys the site in about a minute.

  - This computer (npm run dev). scripts/dev-server.js sets LOCAL_PUBLISH, and files are
    written straight into the project folder.

  files: [{ path: "data/content.json", content: Buffer }]
*/
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function saveMode() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) return "github";
  if (process.env.LOCAL_PUBLISH) return "local";
  return null;
}

export async function saveFiles(files, message) {
  const mode = saveMode();
  if (mode === "github") return commitToGitHub(files, message);
  if (mode === "local") return writeToDisk(files);
  throw new Error("Publishing isn't connected to GitHub yet (GITHUB_TOKEN and GITHUB_REPO).");
}


/* This computer -------------------------------------------------------- */

async function writeToDisk(files) {
  const root = process.cwd();
  for (const file of files) {
    const target = path.resolve(root, file.path);
    if (!target.startsWith(root + path.sep)) throw new Error(`Refusing to write outside the project: ${file.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
  return { mode: "local" };
}


/* GitHub ---------------------------------------------------------------- */

async function github(method, endpoint, body) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub said ${response.status}: ${await response.text()}`);
  return response.json();
}

async function commitToGitHub(files, message) {
  const branch = process.env.GITHUB_BRANCH || "main";

  /* Where the branch is now. */
  const ref = await github("GET", `/git/ref/heads/${branch}`);
  const parent = await github("GET", `/git/commits/${ref.object.sha}`);

  /* Upload each file, then build a tree with them on top of the current one. */
  const entries = await Promise.all(
    files.map(async (file) => {
      const blob = await github("POST", "/git/blobs", { content: file.content.toString("base64"), encoding: "base64" });
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );
  const tree = await github("POST", "/git/trees", { base_tree: parent.tree.sha, tree: entries });

  /* Commit it and move the branch forward. */
  const commit = await github("POST", "/git/commits", { message, tree: tree.sha, parents: [parent.sha] });
  await github("PATCH", `/git/refs/heads/${branch}`, { sha: commit.sha });

  return { mode: "github", commit: commit.sha.slice(0, 7) };
}
