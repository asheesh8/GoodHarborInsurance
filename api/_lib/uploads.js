/*
  Photos chosen in the editor travel inside the content as data: URLs. Before
  saving, each one becomes a real file in assets/uploads/ and the content
  points at that file instead. Files are named by a hash of their bytes, so
  uploading the same photo twice stores it once.
*/
import { createHash } from "node:crypto";

const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export function extractUploads(content) {
  const files = [];

  const visit = (value) => {
    if (typeof value === "string") {
      const match = value.match(DATA_URL);
      if (!match) return value;

      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length > MAX_PHOTO_BYTES) throw new Error("One of the photos is too large (over 3 MB).");

      const extension = match[1] === "jpeg" ? "jpg" : match[1];
      const name = createHash("sha1").update(bytes).digest("hex").slice(0, 16);
      const path = `assets/uploads/${name}.${extension}`;
      if (!files.some((file) => file.path === path)) files.push({ path, content: bytes });
      return `/${path}`;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, visit(inner)]));
    }
    return value;
  };

  return { content: visit(content), files };
}
