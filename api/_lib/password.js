/* Checks the site editor password sent as "Authorization: Bearer <password>"
   against the ADMIN_PASSWORD environment variable. */
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (text) => createHash("sha256").update(String(text)).digest();

export async function isCorrectPassword(req) {
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const correct = timingSafeEqual(digest(given), digest(process.env.ADMIN_PASSWORD));

  /* Slow down anyone guessing. */
  if (!correct) await new Promise((resolve) => setTimeout(resolve, 800));
  return correct;
}
