import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const publicDirectory = join(root, "public");
const checkOnly = process.argv.includes("--check");
const themeHref = "/assets/frontier-theme-v6.css";
const headerScriptSrc = "/assets/site-header-v1.js";
const versionedThemeHrefPattern = /\/assets\/frontier-theme-v\d+\.css/giu;
const versionedThemeLinkPattern = /<link\b[^>]*\bhref=(["'])\/assets\/frontier-theme-v\d+\.css\1[^>]*>/giu;

await Promise.all([
  access(join(publicDirectory, "assets/frontier-theme-v6.css")),
  access(join(publicDirectory, "assets/frontier-passage-v1.jpg")),
  access(join(publicDirectory, "assets/passage-mark-white-v1.svg")),
  access(join(publicDirectory, "assets/favicon-v1.svg")),
  access(join(publicDirectory, "assets/site-header-v1.js")),
]);

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await htmlFiles(path));
    if (entry.isFile() && entry.name.endsWith(".html")) found.push(path);
  }

  return found;
}

function addBodyClass(html, className) {
  return html.replace(/<body([^>]*)>/iu, (tag, attributes) => {
    const classMatch = attributes.match(/\bclass=(['"])(.*?)\1/iu);
    if (!classMatch) return `<body${attributes} class="${className}">`;

    const classes = new Set(classMatch[2].split(/\s+/u).filter(Boolean));
    classes.add(className);
    const replacement = `class=${classMatch[1]}${[...classes].join(" ")}${classMatch[1]}`;
    return tag.replace(classMatch[0], replacement);
  });
}

function addHeadAssets(html) {
  let themeLinkSeen = false;
  const migratedHtml = html.replace(versionedThemeLinkPattern, (link) => {
    if (themeLinkSeen) return "";
    themeLinkSeen = true;
    return link.replace(versionedThemeHrefPattern, themeHref);
  });
  const additions = [];

  if (!migratedHtml.includes('name="theme-color"')) {
    additions.push('  <meta name="theme-color" content="#050608">');
  }
  if (!migratedHtml.includes('href="/assets/favicon-v1.svg"')) {
    additions.push('  <link rel="icon" href="/assets/favicon-v1.svg" type="image/svg+xml">');
  }
  if (!themeLinkSeen) {
    additions.push(`  <link rel="stylesheet" href="${themeHref}">`);
  }
  if (!migratedHtml.includes(`src="${headerScriptSrc}"`)) {
    additions.push(`  <script src="${headerScriptSrc}" defer></script>`);
  }

  if (!additions.length) return migratedHtml;
  return migratedHtml.replace(/<\/head>/iu, `${additions.join("\n")}\n</head>`);
}

function addArticleHero(html) {
  if (html.includes('class="article-hero"')) return html;

  const articleHeadStart = html.indexOf('<header class="article-head">');
  if (articleHeadStart < 0) return html;

  const articleHeadEnd = html.indexOf("</header>", articleHeadStart);
  if (articleHeadEnd < 0) return html;

  const alt = html.match(/<meta\s+property="og:image:alt"\s+content="([^"]*)"/iu)?.[1]
    || "Frontier Signals 文章封面";
  const hero = `\n      <figure class="article-hero"><img src="./og.png" alt="${alt}" width="1200" height="630" fetchpriority="high" decoding="async"></figure>`;
  const insertionPoint = articleHeadEnd + "</header>".length;
  return `${html.slice(0, insertionPoint)}${hero}${html.slice(insertionPoint)}`;
}

function applyTheme(html, relativePath) {
  const isArticle = html.includes('class="article-page"');
  let output = addHeadAssets(html);

  if (isArticle) {
    output = addBodyClass(output, "article-site");
    output = addArticleHero(output);
  } else if (relativePath === "404.html") {
    output = addBodyClass(output, "not-found-page");
  } else if (relativePath === "index.html") {
    output = addBodyClass(output, "home-page");
  } else if (relativePath.endsWith("/index.html")) {
    output = addBodyClass(output, "archive-site");
  }

  return output;
}

const changed = [];
for (const path of await htmlFiles(publicDirectory)) {
  const relativePath = relative(publicDirectory, path);
  const html = await readFile(path, "utf8");
  const themed = applyTheme(html, relativePath);
  if (themed === html) continue;

  changed.push(relativePath);
  if (!checkOnly) await writeFile(path, themed);
}

if (checkOnly && changed.length) {
  throw new Error(`Theme integration is missing from: ${changed.join(", ")}`);
}

console.log(checkOnly
  ? "Frontier Signals theme integration passed"
  : `Applied Frontier Signals theme to ${changed.length} page(s)`);
