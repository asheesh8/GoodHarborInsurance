/*
  Copies the shared <head> tags, header and footer into every page.

  The pages are plain HTML so they can be read and deployed without a build
  step. The shared parts live once in partials/; each page marks where they
  go:

      <!-- layout:head --> ... <!-- /layout:head -->       fonts, styles, theme
      <!-- layout:header --> ... <!-- /layout:header -->   logo and navigation
      <!-- layout:footer --> ... <!-- /layout:footer -->   footer

  After editing a partial, run:  npm run layout

  The nav link for the page you are on gets aria-current="page", so it shows
  as selected (coverage detail pages highlight "Coverage").
*/
import { readFile, writeFile, readdir } from "node:fs/promises";

const COVERAGE_PAGES = ["life", "health", "home-auto", "wealth", "benefits", "business", "cannabis"];
const SKIP = ["admin.html"];

const partials = {
  head: await readFile("partials/head.html", "utf8"),
  header: await readFile("partials/header.html", "utf8"),
  footer: await readFile("partials/footer.html", "utf8"),
};

function navPathFor(file) {
  const slug = file.replace(/\.html$/, "");
  if (slug === "index") return "/";
  if (COVERAGE_PAGES.includes(slug)) return "/coverage";
  return `/${slug}`;
}

function markCurrent(header, navPath) {
  return header.replace(`<li><a href="${navPath}">`, `<li><a href="${navPath}" aria-current="page">`);
}

const pages = (await readdir(".")).filter((file) => file.endsWith(".html") && !SKIP.includes(file));

for (const page of pages) {
  let html = await readFile(page, "utf8");

  for (const [name, partial] of Object.entries(partials)) {
    const block = new RegExp(`(<!-- layout:${name} -->)[\\s\\S]*?(\\n\\s*<!-- /layout:${name} -->)`);
    const content = name === "header" ? markCurrent(partial, navPathFor(page)) : partial;
    html = html.replace(block, (_, start, end) => `${start}\n${content.trimEnd()}${end}`);
  }

  await writeFile(page, html);
  console.log(`  updated ${page}`);
}
