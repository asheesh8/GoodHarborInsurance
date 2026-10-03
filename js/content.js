/*
  Content runtime. Runs on every public page.

  The HTML files hold the original wording, so the site reads fine on its own.
  Anything changed in the site editor (/admin) is saved to data/content.json
  and laid over the page here. The page marks what can change:

    data-edit="key"          a block of text           content.pages[page][key] = "<html>" or { html, style }
    data-edit-list="key"     a group of repeated items  content.pages[page][key] = "<html>"
    data-edit-img="key"      a photo                    content.pages[page][key] = { src, alt }
    data-site="field"        a business detail          content.site[field]      = "text"
    data-site-link="field"   a link built from one      (tel:, mailto:, payment and review pages)
    data-team="all|featured" the team list              content.team             = [{ name, role, photo, featured }]

  While someone is previewing unpublished changes, the editor's draft (saved
  in this browser) is used instead of the published file.
*/

export const DRAFT_KEY = "goodharbor:draft";
const PREVIEW_KEY = "goodharbor:preview";
const CONTENT_URL = "/data/content.json";

const params = new URLSearchParams(location.search);

/* Opened inside the editor's preview frame. */
export const isEditing = params.has("edit");

/* "View site" from the editor sets this so it sticks while you click around. */
if (params.has("preview")) sessionStorage.setItem(PREVIEW_KEY, "1");
const isPreviewing = isEditing || sessionStorage.getItem(PREVIEW_KEY) === "1";

/* "/" -> "index", "/medicare" or "/medicare.html" -> "medicare" */
export const pageName = location.pathname.replace(/^\/|\.html$|\/$/g, "") || "index";


/* Reading content -------------------------------------------------------- */

export function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null;
  } catch {
    return null;
  }
}

async function loadContent() {
  const draft = isPreviewing ? readDraft() : null;
  if (draft) return draft;
  try {
    const response = await fetch(CONTENT_URL, { cache: "no-cache" });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}


/* Safety ----------------------------------------------------------------- */

/* Saved HTML only ever comes from our own editor, but strip anything that
   could run code before it goes back into the page. */
export function sanitize(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  template.content.querySelectorAll("script, style, iframe, object, embed, form, link, meta").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    for (const { name, value } of [...node.attributes]) {
      const isHandler = name.startsWith("on");
      const isScriptUrl = ["href", "src"].includes(name) && /^\s*(javascript|data:text)/i.test(value);
      if (isHandler || isScriptUrl || name === "contenteditable") node.removeAttribute(name);
    }
  });
  return template.innerHTML;
}

export function safeUrl(url) {
  return /^\s*javascript:/i.test(url ?? "") ? "" : String(url ?? "");
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}


/* Business details (phone, email, address, hours) ----------------------- */

const SITE_LINKS = {
  phone: (value) => `tel:+1${value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")}`,
  email: (value) => `mailto:${value}`,
  payment: (value) => safeUrl(value),
  reviews: (value) => safeUrl(value),
};

function applySite(site = {}) {
  document.querySelectorAll("[data-site]").forEach((el) => {
    const value = site[el.dataset.site];
    if (value) el.textContent = value;
  });
  document.querySelectorAll("[data-site-link]").forEach((el) => {
    const field = el.dataset.siteLink;
    const value = site[field];
    if (value && SITE_LINKS[field]) el.setAttribute("href", SITE_LINKS[field](value));
  });
}


/* Team -------------------------------------------------------------------- */

export function initials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words.at(-1)[0] : "")).toUpperCase();
}

function personHtml(person) {
  const picture = person.photo
    ? `<img src="${escapeHtml(safeUrl(person.photo))}" alt="" width="600" height="600" loading="lazy">`
    : `<span class="initials" aria-hidden="true">${escapeHtml(initials(person.name))}</span>`;
  return `<li class="person">${picture}<strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.role)}</span></li>`;
}

export function renderTeam(team) {
  if (!Array.isArray(team) || !team.length) return;
  document.querySelectorAll("[data-team]").forEach((list) => {
    const people = list.dataset.team === "featured" ? team.filter((p) => p.featured) : team;
    list.innerHTML = people.map(personHtml).join("");
  });
}


/* Page edits -------------------------------------------------------------- */

function applyPageEdits(edits = {}) {
  for (const [key, value] of Object.entries(edits)) {
    const image = document.querySelector(`[data-edit-img="${CSS.escape(key)}"]`);
    if (image && value && typeof value === "object") {
      if (value.src) image.src = safeUrl(value.src);
      if (typeof value.alt === "string") image.alt = value.alt;
      image.removeAttribute("srcset");
      continue;
    }
    const block = document.querySelector(`[data-edit="${CSS.escape(key)}"], [data-edit-list="${CSS.escape(key)}"]`);
    if (!block) continue;
    const { html, style } = typeof value === "string" ? { html: value } : value || {};
    if (typeof html === "string") block.innerHTML = sanitize(html);
    if (style) block.setAttribute("style", style);
  }
}


/* Preview banner ---------------------------------------------------------- */

function showPreviewBanner() {
  const banner = document.createElement("div");
  banner.className = "preview-banner";
  banner.innerHTML = `<span>You're previewing unpublished changes.</span>
    <a href="/admin">Back to editor</a>
    <button type="button">Exit preview</button>`;
  banner.querySelector("button").addEventListener("click", () => {
    sessionStorage.removeItem(PREVIEW_KEY);
    location.href = location.pathname;
  });
  document.body.append(banner);
}


/* Start ------------------------------------------------------------------- */

export const content = await loadContent();

if (content) {
  applySite(content.site);
  renderTeam(content.team);
  applyPageEdits(content.pages?.[pageName]);
}

if (isEditing) {
  /* editor.js doesn't import this file (that would be a loop), so hand over what it needs. */
  const { startEditor } = await import("/js/editor.js");
  startEditor({ pageName, sanitize });
} else if (isPreviewing) {
  showPreviewBanner();
}
