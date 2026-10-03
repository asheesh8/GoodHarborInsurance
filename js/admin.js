/*
  The site editor (admin.html).

  How it fits together
  - data/content.json is what's live ("published").
  - Changes made here go into a draft kept in this browser (localStorage)
    until they're published. This file is the only thing that writes it.
  - The Pages tab shows a real page in a frame (/page?edit). js/editor.js runs
    inside that frame and posts each change back here.
  - Publish sends the draft to /api/publish (api/publish.js), which saves it.

  Sections: 1. state  2. status  3. pages  4. business details
            5. team  6. publish  7. start
*/
import { shrinkPortrait } from "/js/shrink-photo.js";

const DRAFT_KEY = "goodharbor:draft";   // the same key js/content.js reads for previews

const PAGES = [
  { slug: "index", name: "Home" },
  { slug: "coverage", name: "Coverage" },
  { slug: "medicare", name: "Medicare & Medicaid" },
  { slug: "life", name: "Life insurance" },
  { slug: "health", name: "Health insurance" },
  { slug: "home-auto", name: "Home & auto" },
  { slug: "wealth", name: "Wealth management" },
  { slug: "benefits", name: "Employee benefits" },
  { slug: "business", name: "Business insurance" },
  { slug: "cannabis", name: "Cannabis industry" },
  { slug: "team", name: "Our team" },
  { slug: "contact", name: "Contact" },
  { slug: "agents", name: "For agents" },
];

/* After publishing, the live file takes a minute to update. Remember what
   was published so the editor doesn't show the old version meanwhile. */
const JUST_PUBLISHED_KEY = "goodharbor:just-published";
const PASSWORD_KEY = "goodharbor:password";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const copy = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);


/* 1. State --------------------------------------------------------------- */

let published = { version: 1, site: {}, team: [], pages: {} };
let draft = null;
let currentPage = "index";

const working = () => draft ?? published;

function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    alert("This browser has run out of room to save your changes. Try publishing, or use smaller photos.");
  }
}

/* Every change goes through here. */
function change(update) {
  draft ??= copy(published);
  update(draft);
  draft.updated = new Date().toISOString();
  saveDraft();
  refreshStatus();
}

function discardDraft() {
  draft = null;
  localStorage.removeItem(DRAFT_KEY);
  refreshStatus();
  renderBusiness();
  renderTeam();
  reloadFrame();
}

async function loadPublished() {
  try {
    const response = await fetch("/data/content.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(response.status);
    published = await response.json();
  } catch {
    showToast("The site's content file couldn't be loaded.");
  }
  const justPublished = readStored(JUST_PUBLISHED_KEY);
  if (justPublished && justPublished.updated > (published.updated ?? "")) published = justPublished;
  else localStorage.removeItem(JUST_PUBLISHED_KEY);

  draft = readStored(DRAFT_KEY);
}


/* 2. Status and the list of changes -------------------------------------- */

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function changedKeys(slug) {
  const mine = working().pages?.[slug] ?? {};
  const live = published.pages?.[slug] ?? {};
  const keys = new Set([...Object.keys(mine), ...Object.keys(live)]);
  return [...keys].filter((key) => !same(mine[key], live[key]));
}

function listChanges() {
  const changes = [];
  for (const page of PAGES) {
    const count = changedKeys(page.slug).length;
    if (count) changes.push({ what: page.name, detail: count === 1 ? "1 change" : `${count} changes`, count });
  }
  const siteFields = Object.keys({ ...working().site, ...published.site }).filter((k) => !same(working().site?.[k], published.site?.[k]));
  if (siteFields.length) changes.push({ what: "Business details", detail: siteFields.join(", "), count: siteFields.length });
  if (!same(working().team, published.team)) changes.push({ what: "Team", detail: `${working().team.length} people listed`, count: 1 });
  return changes;
}

function refreshStatus() {
  const changes = listChanges();
  const total = changes.reduce((sum, c) => sum + c.count, 0);

  $("[data-status]").classList.toggle("has-changes", total > 0);
  $("[data-status-text]").textContent = total
    ? `${total} unpublished ${total === 1 ? "change" : "changes"}`
    : "Everything is published";
  $("[data-badge]").hidden = !total;
  $("[data-badge]").textContent = total;
  $("[data-discard]").disabled = !draft;

  $("[data-changes]").innerHTML = changes.length
    ? changes.map((c) => `<div class="change"><strong>${escapeHtml(c.what)}</strong><span>${escapeHtml(c.detail)}</span></div>`).join("")
    : '<p class="empty">No unpublished changes. The live website matches what you see here.</p>';

  for (const button of $$("[data-page-list] button")) {
    const count = changedKeys(button.dataset.page).length;
    button.querySelector(".count")?.remove();
    if (count) button.insertAdjacentHTML("beforeend", `<span class="count">${count}</span>`);
  }
}

let toastTimer;
function showToast(message) {
  const toast = $("[data-toast]");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3500);
}


/* 3. Tabs and pages ------------------------------------------------------ */

function showTab(name) {
  tellFrame("finish");
  for (const button of $$("[data-tab]")) button.classList.toggle("on", button.dataset.tab === name);
  for (const panel of $$("[data-panel]")) panel.classList.toggle("on", panel.dataset.panel === name);
  $("[data-page-list-wrap]").hidden = name !== "pages";
  if (name === "publish") checkPublishing();
}

function renderPageList() {
  $("[data-page-list]").innerHTML = PAGES.map(
    (p) => `<button type="button" data-page="${p.slug}" class="${p.slug === currentPage ? "on" : ""}">${escapeHtml(p.name)}</button>`,
  ).join("");
  $("[data-page-select]").innerHTML = PAGES.map((p) => `<option value="${p.slug}">${escapeHtml(p.name)}</option>`).join("");
}

function reloadFrame() {
  const path = currentPage === "index" ? "/" : `/${currentPage}`;
  $("[data-frame]").src = `${path}?edit&t=${Date.now()}`;
}

function openPage(slug) {
  tellFrame("finish");
  currentPage = slug;
  for (const button of $$("[data-page-list] button")) button.classList.toggle("on", button.dataset.page === slug);
  $("[data-page-select]").value = slug;
  showTab("pages");
  setTimeout(reloadFrame, 50);   // let the frame hand over its last edit first
}

function tellFrame(type) {
  $("[data-frame]").contentWindow?.postMessage({ source: "goodharbor-admin", type }, location.origin);
}

/* Messages from js/editor.js inside the frame */
addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.data?.source !== "goodharbor-editor") return;
  const { type, page, key, value, tab } = event.data;

  if (type === "edit") {
    change((d) => {
      d.pages ??= {};
      d.pages[page] ??= {};
      d.pages[page][key] = value;
    });
  }
  if (type === "reset") {
    change((d) => {
      const live = published.pages?.[page]?.[key];
      if (live === undefined) delete d.pages?.[page]?.[key];
      else d.pages[page][key] = copy(live);
    });
    reloadFrame();
  }
  if (type === "open-tab") {
    showTab(tab);
    showToast(tab === "team" ? "The team list is edited here." : "Phone, email and address are edited here, once for the whole site.");
  }
});

$("[data-page-list]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (button) openPage(button.dataset.page);
});
$("[data-page-select]").addEventListener("change", (event) => openPage(event.target.value));

$("[data-widths]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-width]");
  if (!button) return;
  for (const b of $$("[data-width]")) b.classList.toggle("on", b === button);
  $("[data-stage]").dataset.width = button.dataset.width;
});

$(".tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (button) showTab(button.dataset.tab);
});
$("[data-open-tab]").addEventListener("click", (event) => showTab(event.currentTarget.dataset.openTab));

$("[data-discard]").addEventListener("click", () => {
  if (confirm("Throw away every unpublished change and go back to what's on the live website?")) discardDraft();
});


/* 4. Business details ---------------------------------------------------- */

const businessForm = $("[data-business-form]");

function renderBusiness() {
  for (const input of businessForm.elements) input.value = working().site?.[input.name] ?? "";
}

businessForm.addEventListener("input", (event) => {
  const { name, value } = event.target;
  change((d) => {
    d.site ??= {};
    d.site[name] = value.trim();
  });
});


/* 5. Team ---------------------------------------------------------------- */

const ICON = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

function initials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  return words.length ? (words[0][0] + (words.length > 1 ? words.at(-1)[0] : "")).toUpperCase() : "?";
}

function teamRow(person, index) {
  const picture = person.photo ? `<img src="${escapeHtml(person.photo)}" alt="">` : escapeHtml(initials(person.name));
  return `
    <div class="team-row" data-index="${index}">
      <button type="button" class="portrait" data-action="photo" title="Change photo">${picture}</button>
      <input type="text" data-field="name" value="${escapeHtml(person.name)}" placeholder="Full name" aria-label="Name">
      <input type="text" data-field="role" value="${escapeHtml(person.role)}" placeholder="Job title" aria-label="Job title">
      <label class="featured-check"><input type="checkbox" data-field="featured" ${person.featured ? "checked" : ""}> Home page</label>
      <span class="row-buttons">
        <button type="button" class="icon-button" data-action="up" title="Move up">${ICON.up}</button>
        <button type="button" class="icon-button" data-action="down" title="Move down">${ICON.down}</button>
        <button type="button" class="icon-button remove" data-action="remove" title="Remove">${ICON.remove}</button>
      </span>
    </div>`;
}

function renderTeam() {
  $("[data-team-list]").innerHTML = (working().team ?? []).map(teamRow).join("");
}

function moveItem(list, from, to) {
  if (to < 0 || to >= list.length) return;
  list.splice(to, 0, list.splice(from, 1)[0]);
}

const teamList = $("[data-team-list]");
const portraitPicker = $("[data-portrait-picker]");
let portraitFor = null;

teamList.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  const index = Number(event.target.closest("[data-index]")?.dataset.index);
  if (!field || Number.isNaN(index)) return;
  change((d) => {
    d.team[index][field] = field === "featured" ? event.target.checked : event.target.value;
  });
});

teamList.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  const index = Number(event.target.closest("[data-index]")?.dataset.index);
  if (!action) return;

  if (action === "photo") {
    portraitFor = index;
    portraitPicker.click();
    return;
  }
  if (action === "remove") {
    const name = working().team[index].name || "this person";
    if (!confirm(`Remove ${name} from the team page?`)) return;
    change((d) => d.team.splice(index, 1));
  }
  if (action === "up") change((d) => moveItem(d.team, index, index - 1));
  if (action === "down") change((d) => moveItem(d.team, index, index + 1));
  renderTeam();
});

portraitPicker.addEventListener("change", async () => {
  const file = portraitPicker.files[0];
  portraitPicker.value = "";
  if (!file || portraitFor === null) return;
  try {
    const photo = await shrinkPortrait(file);
    change((d) => (d.team[portraitFor].photo = photo));
    renderTeam();
  } catch {
    alert("Sorry, that file couldn't be opened as a photo. Try a JPG or PNG.");
  }
});

$("[data-add-person]").addEventListener("click", () => {
  change((d) => d.team.push({ name: "", role: "Agent", photo: "", featured: false }));
  renderTeam();
  $$("[data-team-list] [data-field=name]").at(-1)?.focus();
});


/* 6. Publish ------------------------------------------------------------- */

const passwordInput = $("[data-password]");
const publishButton = $("[data-publish]");
const publishMessage = $("[data-publish-message]");

passwordInput.value = sessionStorage.getItem(PASSWORD_KEY) ?? "";

async function checkPublishing() {
  let ready = false;
  try {
    ready = (await (await fetch("/api/publish")).json()).ready;
  } catch {
    /* static hosting with no /api: hand the file over instead */
  }
  $("[data-publish-ready]").hidden = !ready;
  $("[data-publish-manual]").hidden = ready;
}

function setPublishMessage(text, kind = "") {
  publishMessage.textContent = text;
  publishMessage.className = `publish-message ${kind ? `is-${kind}` : ""}`;
}

publishButton.addEventListener("click", async () => {
  if (!draft || !listChanges().length) return setPublishMessage("There's nothing new to publish.");
  if (!passwordInput.value) return setPublishMessage("Please enter the editor password.", "error");

  tellFrame("finish");
  publishButton.disabled = true;
  setPublishMessage("Publishing…");

  try {
    const response = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${passwordInput.value}` },
      body: JSON.stringify({ content: draft }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Something went wrong.");

    sessionStorage.setItem(PASSWORD_KEY, passwordInput.value);
    published = result.content;
    localStorage.setItem(JUST_PUBLISHED_KEY, JSON.stringify(published));
    draft = null;
    localStorage.removeItem(DRAFT_KEY);

    refreshStatus();
    renderTeam();
    setPublishMessage(
      result.mode === "github"
        ? "Published! The live website will show your changes in about a minute."
        : "Published! Your changes are saved in data/content.json.",
      "done",
    );
  } catch (error) {
    setPublishMessage(error.message, "error");
  } finally {
    publishButton.disabled = false;
  }
});

$("[data-download]").addEventListener("click", () => {
  const file = new Blob([`${JSON.stringify(working(), null, 2)}\n`], { type: "application/json" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: "content.json" });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
});


/* 7. Start --------------------------------------------------------------- */

await loadPublished();
renderPageList();
renderBusiness();
renderTeam();
refreshStatus();
reloadFrame();
