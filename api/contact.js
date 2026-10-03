/*
  /api/contact — emails a contact-form message to the office.

  Sends through Resend (https://resend.com). Settings:
    RESEND_API_KEY   required on the live site
    CONTACT_TO       where messages go     (default office@ghrsolutions.com)
    CONTACT_FROM     the sender, on a domain verified in Resend
                     (default "Good Harbor website <website@goodharborinsurance.com>")

  Running locally without a key, the message is printed in the terminal
  instead of emailed, so the form can still be tried out.
*/
import { readJson, sendJson } from "./_lib/http.js";

const clip = (value, length) => String(value ?? "").trim().slice(0, length);

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });

  const body = readJson(req);

  /* The hidden "website" field is a spam trap: people never fill it in. */
  if (body.website) return sendJson(res, 200, { ok: true });

  const message = {
    name: clip(body.name, 200),
    phone: clip(body.phone, 40),
    email: clip(body.email, 200),
    services: (Array.isArray(body.services) ? body.services : []).slice(0, 15).map((s) => clip(s, 60)),
    text: clip(body.message, 5000),
  };

  if (!message.name || !message.text || (!message.phone && !message.email)) {
    return sendJson(res, 400, { error: "Please include your name, a message, and a phone number or email." });
  }

  const emailBody = [
    `Name: ${message.name}`,
    `Phone: ${message.phone || "(not given)"}`,
    `Email: ${message.email || "(not given)"}`,
    `Interested in: ${message.services.join(", ") || "(not specified)"}`,
    "",
    message.text,
  ].join("\n");

  if (!process.env.RESEND_API_KEY) {
    if (process.env.LOCAL_PUBLISH) {
      console.log(`\n--- Contact form (local, not emailed) ---\n${emailBody}\n`);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 501, { error: "The contact form isn't connected to email yet." });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM || "Good Harbor website <website@goodharborinsurance.com>",
      to: [process.env.CONTACT_TO || "office@ghrsolutions.com"],
      reply_to: message.email || undefined,
      subject: `Website message from ${message.name}`,
      text: emailBody,
    }),
  });

  if (!response.ok) {
    console.error("Resend error", response.status, await response.text());
    return sendJson(res, 502, { error: "The message couldn't be sent." });
  }
  return sendJson(res, 200, { ok: true });
}
