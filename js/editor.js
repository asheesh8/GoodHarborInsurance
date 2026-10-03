/*
  In-page editor. content.js loads this only when a page is opened inside the
  site editor (/admin), which adds ?edit to the address.

  - Click any outlined text and type. A toolbar floats above it.
  - Lists (bullets, facts, offices, states) also get "Add one" and "Remove".
  - Click a photo to replace it.
  - Phone numbers, addresses and the team are edited in the admin's own tabs;
    clicking them here jumps to the right tab.

  This file never saves anything itself. Each change is posted to the admin
  window (js/admin.js), which keeps the one and only draft.
*/
import { shrinkPhoto } from "/js/shrink-photo.js";

const BLOCK = "[data-edit], [data-edit-list]";

const COLORS = [
  ["", "Default color"],
  ["#1f3b3c", "Harbor green"],
  ["#23698a", "Sea blue"],
  ["#b9761b", "Gold"],
  ["#a3261b", "Brick red"],
];

let pageName = "index";
let sanitize = (html) => html;

let active = null;    // the block being typed in
let before = null;    // its content when typing started
let saveTimer = null;


/* Start ------------------------------------------------------------------ */

export function startEditor(options) {
  pageName = options.pageName;
  sanitize = options.sanitize;

  document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/css/editor.css">');
  document.documentElement.classList.add("is-editing");
  document.body.append(toolbar, imagePanel, photoPicker);

  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", (event) => event.preventDefault(), true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("paste", onPaste, true);
  addEventListener("scroll", placeFloating, true);
  addEventListener("resize", placeFloating);
  addEventListener("message", onAdminMessage);

  tellAdmin("ready");
}

function tellAdmin(type, detail = {}) {
  parent.postMessage({ source: "goodharbor-editor", type, page: pageName, ...detail }, location.origin);
}

function onAdminMessage(event) {
  if (event.origin !== location.origin || event.data?.source !== "goodharbor-admin") return;
  if (event.data.type === "finish") {
    finishEditing();
    closeImagePanel();
  }
}


/* Text blocks ------------------------------------------------------------ */

const keyOf = (block) => block.dataset.edit ?? block.dataset.editList;
const isList = (block) => block.hasAttribute("data-edit-list");

function valueOf(block) {
  const html = sanitize(block.innerHTML).trim();
  const style = block.getAttribute("style");
  return style ? { html, style } : html;
}

function save(block) {
  tellAdmin("edit", { key: keyOf(block), value: valueOf(block) });
}

function startEditing(block, x, y) {
  if (active === block) return;
  finishEditing();
  closeImagePanel();

  active = block;
  before = { html: block.innerHTML, style: block.getAttribute("style") || "" };
  block.contentEditable = "true";
  block.spellcheck = true;
  block.classList.add("editor-active");
  block.focus({ preventScroll: true });
  putCaretAt(x, y);

  toolbar.classList.toggle("is-list", isList(block));
  toolbar.hidden = false;
  placeFloating();
  updateToolbarState();
}

function finishEditing() {
  if (!active) return;
  const block = active;
  active = null;
  clearTimeout(saveTimer);

  block.removeAttribute("contenteditable");
  block.removeAttribute("spellcheck");
  block.classList.remove("editor-active");
  if (!block.classList.length) block.removeAttribute("class");
  toolbar.hidden = true;

  const changed = block.innerHTML !== before.html || (block.getAttribute("style") || "") !== before.style;
  if (changed) save(block);
}

function putCaretAt(x, y) {
  if (x == null || !document.caretRangeFromPoint) return;
  const range = document.caretRangeFromPoint(x, y);
  if (range && active.contains(range.startContainer)) {
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }
}

/* In a list, the item the caret is in (or the last one). */
function currentItem() {
  let node = getSelection().anchorNode;
  node = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (node && node.parentElement !== active) node = node.parentElement;
  return node && active.contains(node) ? node : active.lastElementChild;
}


/* Toolbar ---------------------------------------------------------------- */

const icon = (path) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const ICONS = {
  link: icon('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  unlink: icon('<path d="M18.8 13.6 21 11.4a5 5 0 0 0-7-7l-2.2 2.2"/><path d="M5.2 10.4 3 12.6a5 5 0 0 0 7 7l2.2-2.2"/><path d="M2 2l20 20"/>'),
  left: icon('<path d="M3 6h18M3 12h11M3 18h15"/>'),
  center: icon('<path d="M3 6h18M7 12h10M5 18h14"/>'),
  add: icon('<path d="M12 5v14M5 12h14"/>'),
  remove: icon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  undo: icon('<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-6.4L3 9"/>'),
  photo: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
  close: icon('<path d="M18 6 6 18M6 6l12 12"/>'),
};

const toolbar = document.createElement("div");
toolbar.className = "editor-ui editor-toolbar";
toolbar.hidden = true;
toolbar.innerHTML = `
  <button type="button" data-command="bold" title="Bold"><b>B</b></button>
  <button type="button" data-command="italic" title="Italic"><i>I</i></button>
  <button type="button" data-command="link" title="Make a link">${ICONS.link}</button>
  <button type="button" data-command="unlink" title="Remove link">${ICONS.unlink}</button>
  <span class="sep"></span>
  <button type="button" data-size="-1" title="Smaller text">A−</button>
  <button type="button" data-size="1" title="Bigger text">A+</button>
  <button type="button" data-align="left" title="Align left">${ICONS.left}</button>
  <button type="button" data-align="center" title="Center">${ICONS.center}</button>
  <span class="sep"></span>
  ${COLORS.map(([color, name]) => `<button type="button" class="swatch" data-color="${color}" title="${name}" style="--swatch:${color || "transparent"}"></button>`).join("")}
  <span class="sep list-only"></span>
  <button type="button" class="list-only" data-command="add-item" title="Add another one, copied from this one">${ICONS.add} Add one</button>
  <button type="button" class="list-only danger" data-command="remove-item" title="Remove this one">${ICONS.remove} Remove</button>
  <span class="sep"></span>
  <button type="button" data-command="reset" title="Undo every unpublished change to this text">${ICONS.undo}</button>
  <button type="button" class="done" data-command="done">Done</button>`;

/* Keep the text selection when a toolbar button is pressed. */
toolbar.addEventListener("mousedown", (event) => event.preventDefault());

toolbar.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !active) return;
  const block = active;

  if (button.dataset.color !== undefined) return applyColor(block, button.dataset.color);
  if (button.dataset.size) return changeSize(block, Number(button.dataset.size));
  if (button.dataset.align) {
    block.style.textAlign = block.style.textAlign === button.dataset.align ? "" : button.dataset.align;
    return afterChange(block);
  }

  switch (button.dataset.command) {
    case "bold":
    case "italic":
      document.execCommand(button.dataset.command);
      return afterChange(block);
    case "link":
      return addLink(block);
    case "unlink":
      document.execCommand("unlink");
      return afterChange(block);
    case "add-item":
      return addItem(block);
    case "remove-item":
      return removeItem(block);
    case "reset":
      if (confirm("Put this text back the way it is on the live site?")) {
        active = null;
        tellAdmin("reset", { key: keyOf(block) });
      }
      return;
    case "done":
      return finishEditing();
  }
});

function afterChange(block) {
  save(block);
  updateToolbarState();
  placeFloating();
}

function applyColor(block, color) {
  const selection = getSelection();
  if (color && !selection.isCollapsed && block.contains(selection.anchorNode)) {
    document.execCommand("foreColor", false, color);
  } else {
    block.style.color = color;
  }
  afterChange(block);
}

function changeSize(block, direction) {
  const current = parseFloat(getComputedStyle(block).fontSize);
  const next = Math.round(current * (direction > 0 ? 1.1 : 1 / 1.1));
  block.style.fontSize = `${Math.max(14, Math.min(96, next))}px`;
  afterChange(block);
}

function addLink(block) {
  const url = prompt("Where should this link go?\n(A page like /contact, a web address starting with https://, or a phone number like tel:8024585500)");
  if (url === null) return;
  if (!url.trim()) document.execCommand("unlink");
  else if (/^\s*javascript:/i.test(url)) return alert("That kind of link isn't allowed.");
  else document.execCommand("createLink", false, url.trim());
  afterChange(block);
}

function addItem(block) {
  const item = currentItem();
  if (!item) return;
  const copy = item.cloneNode(true);
  item.after(copy);
  getSelection().selectAllChildren(copy);
  afterChange(block);
}

function removeItem(block) {
  const item = currentItem();
  if (!item) return;
  if (block.children.length <= 1) return alert("This is the only one left. Type over it instead of removing it.");
  if (!confirm("Remove this one from the page?")) return;
  item.remove();
  afterChange(block);
}

function updateToolbarState() {
  for (const command of ["bold", "italic"]) {
    toolbar.querySelector(`[data-command="${command}"]`).classList.toggle("on", document.queryCommandState(command));
  }
  for (const button of toolbar.querySelectorAll("[data-align]")) {
    button.classList.toggle("on", active?.style.textAlign === button.dataset.align);
  }
}


/* Photos ----------------------------------------------------------------- */

const imagePanel = document.createElement("div");
imagePanel.className = "editor-ui editor-panel";
imagePanel.hidden = true;
imagePanel.innerHTML = `
  <header>${ICONS.photo}<span>Photo</span><button type="button" data-panel="close" title="Close">${ICONS.close}</button></header>
  <div class="body">
    <button type="button" class="wide" data-panel="choose">${ICONS.photo} Choose a new photo…</button>
    <label>Describe the photo (read aloud to visitors who can't see it)
      <input type="text" data-panel-field="alt">
    </label>
    <div class="row">
      <button type="button" data-panel="save">Save description</button>
      <button type="button" class="quiet" data-panel="reset">${ICONS.undo} Original</button>
    </div>
    <p class="hint">Large photos are shrunk automatically. Wide photos look best here.</p>
  </div>`;

const photoPicker = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
let photoTarget = null;

function openImagePanel(image) {
  finishEditing();
  photoTarget = image;
  imagePanel.querySelector("[data-panel-field=alt]").value = image.alt;
  imagePanel.hidden = false;
  placeFloating();
}

function closeImagePanel() {
  imagePanel.hidden = true;
  photoTarget = null;
}

function savePhoto() {
  const image = photoTarget;
  tellAdmin("edit", { key: image.dataset.editImg, value: { src: image.getAttribute("src"), alt: image.alt } });
}

imagePanel.addEventListener("click", (event) => {
  const action = event.target.closest("[data-panel]")?.dataset.panel;
  if (!action || !photoTarget) return;

  if (action === "close") closeImagePanel();
  if (action === "choose") photoPicker.click();
  if (action === "save") {
    photoTarget.alt = imagePanel.querySelector("[data-panel-field=alt]").value.trim();
    savePhoto();
    closeImagePanel();
  }
  if (action === "reset" && confirm("Put back the photo that's on the live site?")) {
    tellAdmin("reset", { key: photoTarget.dataset.editImg });
  }
});

photoPicker.addEventListener("change", async () => {
  const file = photoPicker.files[0];
  photoPicker.value = "";
  if (!file || !photoTarget) return;
  try {
    photoTarget.src = await shrinkPhoto(file);
    photoTarget.removeAttribute("srcset");
    savePhoto();
  } catch {
    alert("Sorry, that file couldn't be opened as a photo. Try a JPG or PNG.");
  }
});


/* Positioning ------------------------------------------------------------ */

function placeNear(box, target) {
  if (box.hidden || !target) return;
  const rect = target.getBoundingClientRect();
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  let top = rect.top - height - 12;
  if (top < 8) top = Math.min(rect.bottom + 12, innerHeight - height - 8);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, innerWidth - width - 8));
  box.style.top = `${Math.max(8, top)}px`;
  box.style.left = `${left}px`;
}

function placeFloating() {
  placeNear(toolbar, active);
  placeNear(imagePanel, photoTarget);
}


/* Page events ------------------------------------------------------------ */

function onClick(event) {
  if (event.target.closest(".editor-ui")) return;

  /* Nothing on the page navigates or submits while editing. */
  event.preventDefault();
  event.stopPropagation();

  const image = event.target.closest("img[data-edit-img]");
  if (image) return openImagePanel(image);

  if (event.target.closest("[data-site], [data-site-link]")) {
    finishEditing();
    return tellAdmin("open-tab", { tab: "business" });
  }
  if (event.target.closest("[data-team]")) {
    finishEditing();
    return tellAdmin("open-tab", { tab: "team" });
  }

  const block = event.target.closest(BLOCK);
  if (block) return startEditing(block, event.clientX, event.clientY);

  finishEditing();
  closeImagePanel();
}

function onInput(event) {
  if (!active?.contains(event.target)) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => active && save(active), 500);
}

function onKeyDown(event) {
  if (!active) return;
  if (event.key === "Escape") {
    event.preventDefault();
    finishEditing();
    return;
  }

  /* Enter makes a new paragraph or bullet where that makes sense
     (article text, bulleted lists). In a heading or a single line it makes
     a line break instead of breaking the layout. */
  if (event.key === "Enter" && !event.shiftKey) {
    const makesParagraphs = active.querySelector(":scope > p, :scope > li");
    if (!makesParagraphs) {
      event.preventDefault();
      document.execCommand("insertLineBreak");
    }
  }
}

function onPaste(event) {
  if (!active?.contains(event.target)) return;
  event.preventDefault();
  document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
}

addEventListener("selectionchange", () => active && updateToolbarState());
addEventListener("beforeunload", finishEditing);
