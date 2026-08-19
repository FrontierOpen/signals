import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import worker from "../src/index.js";
import { articlePackage, loadMarkdownArticle, releaseApprovalErrors } from "./lib/markdown-article.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const publishedWechat = JSON.parse(await readFile(join(root, "data/published-wechat.json"), "utf8"));
const publishedWechatBySource = new Map(publishedWechat.articles.map((entry) => [
  resolve(root, entry.source),
  entry,
]));

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(path));
    else if (entry.isFile() && entry.name === "article.json") found.push(path);
  }
  return found;
}

const articleFiles = await files(join(root, "data/articles"));
if (!articleFiles.length) throw new Error("No canonical articles found");

const published = [];
for (const articleFile of articleFiles) {
  const article = JSON.parse(await readFile(articleFile, "utf8"));
  const siteEntry = publishedWechatBySource.get(articleFile);
  if (article.series !== "Frontier Signals" || article.publisher !== "Frontier World") {
    throw new Error(`${articleFile} has invalid publication identity`);
  }
  if (article.status !== "published") continue;
  published.push(article);
  const [year, month, day] = article.date.split("-");
  const webDirectory = join(root, "dist", year, month, day, article.slug);
  const wechatDirectory = join(root, "drafts/wechat", year, month, day, article.slug);
  const publicationPath = join(root, "publication", year, month, day, `${article.slug}.json`);
  const [html, markdown, wechatHtml, wechatMarkdown, publication] = await Promise.all([
    readFile(join(webDirectory, "index.html"), "utf8"),
    readFile(join(webDirectory, "article.md"), "utf8"),
    readFile(join(wechatDirectory, "wechat.html"), "utf8"),
    readFile(join(wechatDirectory, "wechat.md"), "utf8"),
    readFile(publicationPath, "utf8").then(JSON.parse),
    access(join(webDirectory, "og.png")),
    access(join(wechatDirectory, "wechat-cover.jpg")),
  ]);

  for (const required of [
    article.canonical_url,
    siteEntry?.title || article.title,
    siteEntry?.description || article.excerpt,
    "Frontier Signals",
    "application/ld+json",
    "index,follow,max-image-preview:large",
    'property="og:image:width"',
    'name="twitter:title"',
    'name="twitter:image"',
  ]) {
    if (!html.includes(required)) throw new Error(`${article.id} web edition is missing: ${required}`);
  }
  for (const forbidden of ["Claire", "科技早报", "Nextier", "noindex,nofollow,noarchive"]) {
    if (html.includes(forbidden) || wechatHtml.includes(forbidden)) {
      throw new Error(`${article.id} contains forbidden wording: ${forbidden}`);
    }
  }
  if ((markdown.match(/^# /gmu) || []).length !== 1 || (wechatMarkdown.match(/^# /gmu) || []).length !== 1) {
    throw new Error(`${article.id} text editions must contain exactly one H1`);
  }
  if (/<style|<script/iu.test(wechatHtml)) throw new Error(`${article.id} WeChat HTML must remain all-inline`);
  for (const source of article.sources) {
    if (!html.includes(source.url) || !markdown.includes(source.url) || !wechatHtml.includes(source.url)) {
      throw new Error(`${article.id} is missing source URL: ${source.url}`);
    }
  }
  for (const image of article.sections.map((section) => section.image).filter(Boolean)) {
    await Promise.all([
      access(join(webDirectory, image.path)),
      access(join(wechatDirectory, image.path)),
    ]);
    for (const edition of [html, markdown, wechatHtml, wechatMarkdown]) {
      if (!edition.includes(image.path) || !edition.includes(image.alt)) {
        throw new Error(`${article.id} is missing section media ${image.path} in a channel edition`);
      }
    }
  }
  if (publication.article_id !== article.id || publication.web.url !== article.canonical_url) {
    throw new Error(`${article.id} publication state does not match the canonical article`);
  }
  if (article.distribution.feishu.status === "published") {
    if (publication.feishu.status !== "published" || publication.feishu.document_url !== article.distribution.feishu.document_url) {
      throw new Error(`${article.id} Feishu publication state is inconsistent`);
    }
    if (!publication.feishu.node_token || !publication.feishu.obj_token || !publication.feishu.space_id) {
      throw new Error(`${article.id} Feishu publication identifiers are incomplete`);
    }
  }
}

async function releaseFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await releaseFiles(path));
    else if (entry.isFile() && entry.name === "release.json") found.push(path);
  }
  return found;
}

const markdownPublished = [];
for (const releasePath of (await releaseFiles(join(root, "data/articles"))).sort()) {
  const release = JSON.parse(await readFile(releasePath, "utf8"));
  if (release.schema_version !== 2 || !["deploying", "live", "metadata_update_pending"].includes(release.site?.status)) continue;
  if (!["review_confirmed", "published_manual"].includes(release.wechat?.status)) {
    throw new Error(`${release.article_id} web release lacks post-draft WeChat review`);
  }
  const articlePath = join(dirname(releasePath), release.canonical?.path || "article.md");
  const article = await loadMarkdownArticle(articlePath, {
    wechatUrl: release.wechat?.public?.url || null,
  });
  const bundle = await articlePackage(article);
  const approvalErrors = releaseApprovalErrors(release, article, bundle, { requireSiteBundle: true });
  if (approvalErrors.length) throw new Error(`${article.id} release approval failed: ${approvalErrors.join("; ")}`);
  const [year, month, day] = article.date.split("-");
  const webDirectory = join(root, "dist", year, month, day, article.slug);
  const html = await readFile(join(webDirectory, "index.html"), "utf8");
  for (const required of [article.title, article.description, article.canonicalUrl, article.sourceHash]) {
    if (!html.includes(required)) throw new Error(`${article.id} web edition is missing: ${required}`);
  }
  for (const path of new Set([article.hero, ...article.bodyImages.keys()])) await access(join(webDirectory, path));
  markdownPublished.push(article);
}

if (!published.length) throw new Error("No published articles found");

const [archive, rss, sitemap, robots, notFound] = await Promise.all([
  readFile(join(root, "dist/index.html"), "utf8"),
  readFile(join(root, "dist/rss.xml"), "utf8"),
  readFile(join(root, "dist/sitemap.xml"), "utf8"),
  readFile(join(root, "dist/robots.txt"), "utf8"),
  readFile(join(root, "dist/404.html"), "utf8"),
]);
for (const article of [...published, ...markdownPublished]) {
  const canonicalUrl = article.canonical_url || article.canonicalUrl;
  const path = new URL(canonicalUrl).pathname;
  if (!archive.includes(path) || !rss.includes(canonicalUrl) || !sitemap.includes(canonicalUrl)) {
    throw new Error(`${article.id} is missing from archive, RSS, or sitemap`);
  }
}
if (!archive.includes('name="twitter:image"') || !archive.includes('property="og:image:width"')) {
  throw new Error("Archive social metadata is incomplete");
}
if (archive.includes('src="https://signals.frontierworld.ai/')) {
  throw new Error("Archive preview images must use same-origin paths");
}
if (!robots.includes("Allow: /") || !robots.includes("signals.frontierworld.ai/sitemap.xml")) {
  throw new Error("robots.txt must allow crawlers and advertise the sitemap");
}
if (!notFound.includes("Frontier Signals")) throw new Error("404 page is missing the series identity");

const fetchWorker = (path) => worker.fetch(new Request(`https://signals.frontierworld.ai${path}`), {
  ASSETS: { fetch: async () => new Response("ok", { status: 200 }) },
});
const response = await fetchWorker("/");
for (const header of ["Referrer-Policy", "X-Content-Type-Options", "Permissions-Policy", "Cross-Origin-Opener-Policy"]) {
  if (!response.headers.get(header)) throw new Error(`Worker is missing ${header}`);
}
for (const path of ["/", "/rss.xml", "/sitemap.xml", "/robots.txt"]) {
  const cacheControl = (await fetchWorker(path)).headers.get("Cache-Control") || "";
  if (!cacheControl.includes("max-age=300") || cacheControl.includes("immutable")) {
    throw new Error(`${path} must use a short revalidating cache policy`);
  }
}
const articleMediaCache = (await fetchWorker("/2026/08/11/ai-is-rewriting-four-ledgers/og.png")).headers.get("Cache-Control") || "";
if (!articleMediaCache.includes("max-age=3600") || !articleMediaCache.includes("must-revalidate") || articleMediaCache.includes("immutable")) {
  throw new Error("Mutable article media must use a short revalidating cache policy");
}
for (const path of ["/assets/frontier-theme-v16.css", "/assets/site-header-v3.js"]) {
  const versionedAssetCache = (await fetchWorker(path)).headers.get("Cache-Control") || "";
  if (!versionedAssetCache.includes("max-age=31536000") || !versionedAssetCache.includes("immutable")) {
    throw new Error(`${path} must remain immutable`);
  }
}

console.log(`Frontier Signals package check passed for ${published.length} legacy canonical and ${markdownPublished.length} Markdown article(s); web archive covers ${publishedWechat.articles.length + markdownPublished.length}`);
