# Good Harbor Insurance Group

Website for [Good Harbor Insurance Group](https://www.goodharborinsurance.com), an
independent, partner-owned insurance agency at 7 Kilburn St, Burlington, VT.
Built by ArkiTech Solutions.

Plain HTML, CSS and JavaScript. No framework and no build step, so any page can be
opened and read as-is. A built-in site editor at `/admin` lets the owners change
words, photos, business details and the team list, and publish without code.

```bash
npm run dev        # http://localhost:3040   (editor: /admin, password "harbor")
```

Node 20+ is the only requirement; there are no dependencies to install.

## Where things live

| Path | What it is |
| --- | --- |
| `index.html`, `medicare.html`, … | One file per page. Clean URLs: `/medicare` serves `medicare.html`. |
| `partials/` | The shared `<head>`, header and footer. Edit here, then `npm run layout` copies them into every page. |
| `css/site.css` | All site styles. Light and dark theme tokens are at the top. |
| `js/site.js` | Theme button, mobile menu, contact form. |
| `js/content.js` | Lays saved editor changes (`data/content.json`) over each page. |
| `data/content.json` | Everything changed in the editor: business details, team, page edits. |
| `admin.html`, `js/admin.js`, `css/admin.css` | The site editor. |
| `js/editor.js`, `css/editor.css` | Click-to-edit, loaded inside the editor's preview frame. |
| `api/publish.js` | Saves the editor's changes (GitHub commit on Vercel, disk locally). |
| `api/contact.js` | Emails contact-form messages to the office (Resend). |
| `server.js` | Local dev server; runs `/api` the way Vercel does. |
| `assets/images/art/` | Watercolor illustrations made with Higgsfield. |
| `docs/ASSET-PROVENANCE.md` | Where every image came from. |

## How the editor works

Pages mark what can be edited:

```html
<h1 data-edit="hero-title">…</h1>                 <!-- a block of text -->
<ul data-edit-list="states">…</ul>                 <!-- repeated items: add / remove -->
<img data-edit-img="hero-photo" src="…">           <!-- a photo -->
<span data-site="phone">802-458-5500</span>        <!-- business detail, edited once -->
<a data-site-link="phone" href="tel:…">            <!-- link built from a detail -->
<ul data-team="all">…</ul>                         <!-- team list -->
```

The HTML keeps the original wording; `content.json` only stores what changed,
keyed by page and `data-edit` name. Renaming or moving markup never loses an
edit, as long as the key stays the same.

1. `/admin` loads the live `content.json` and the browser's unpublished draft.
2. The Pages tab shows the real page in a frame (`/page?edit`). `editor.js` makes
   the marked elements editable and posts each change to `admin.js`, which owns
   the draft (saved in `localStorage`).
3. **Preview site** opens the whole site with the draft applied.
4. **Publish** sends the draft and editor password to `/api/publish`. Uploaded
   photos are turned into files in `assets/uploads/`, then `content.json` and the
   photos are committed to GitHub in one commit. Vercel redeploys in about a minute.

Without publishing set up, the Publish tab offers a `content.json` download instead.

## Deploying (Vercel)

Import the repo into Vercel with no build command. Then add these environment
variables (see `.env.example`):

- `ADMIN_PASSWORD`: the editor password. Make it long; the endpoint slows down guesses but has no lockout.
- `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`: a fine-grained token with *Contents: read and write* on this repo only.
- `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM`: for the contact form. `CONTACT_FROM` must be on a domain verified in Resend.

## Design notes

- Readers are mostly retirees: 19px body text, Public Sans for reading, Newsreader for headings, high contrast, large buttons, phone number on every screen, nothing that moves on its own.
- The masthead is a dark "harbor" card with the logo in a paper tab cut into its corner. The footer ends in a watercolor of Burlington's harbor on Lake Champlain.
- Palette from the logo: harbor green-black, sea-glass mint, sky blue, plus a sunset peach for calls to action.
- Light and dark themes follow the device setting until the visitor presses the theme button.
