import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  articlePackage,
  canonicalHash,
  loadMarkdownArticle,
} from "./lib/markdown-article.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function argumentsFor(argv) {
  const values = [...argv];
  const check = values.includes("--check");
  const paths = values.filter((value) => value !== "--check");
  if (paths.length !== 1) throw new Error("Usage: npm run article:prepare -- /absolute/path/to/article.md [--check]");
  return { articlePath: resolve(paths[0]), check };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function initialChannelState(existing, changed) {
  if (!existing || changed) {
    return {
      approvals: {},
      wechat: {
        status: "local_rendered",
        draft_id: null,
        verified_at: null,
        public: { status: "not_recorded", url: null, published_at: null },
      },
      site: {
        status: "not_deployed",
        url: null,
        started_at: null,
        published_at: null,
        verified_at: null,
      },
    };
  }
  return {
    approvals: existing.approvals || {},
    wechat: existing.wechat,
    site: existing.site,
  };
}

function targetAccount(existing) {
  if (existing?.name && existing?.principal && existing?.app_id_fingerprint) return existing;
  const name = process.env.WECHAT_TARGET_ACCOUNT || null;
  const principal = process.env.WECHAT_TARGET_PRINCIPAL || null;
  const fingerprint = process.env.WECHAT_APP_ID_FINGERPRINT
    || (process.env.WECHAT_APP_ID
      ? `sha256:${createHash("sha256").update(process.env.WECHAT_APP_ID).digest("hex")}`
      : null);
  return { name, principal, app_id_fingerprint: fingerprint };
}

export function nextRelease(article, bundle, existing = null, now = new Date().toISOString()) {
  const changed = Boolean(existing && (
    existing.canonical?.source_hash !== article.sourceHash
    || existing.renders?.wechat_package_hash !== bundle.wechatPackageHash
    || existing.renders?.site_package_hash !== bundle.sitePackageHash
  ));
  const channels = initialChannelState(existing, changed);
  return {
    schema_version: 2,
    article_id: article.id,
    canonical: {
      path: "article.md",
      source_hash: article.sourceHash,
    },
    renders: {
      wechat_package_hash: bundle.wechatPackageHash,
      site_package_hash: bundle.sitePackageHash,
      site_bundle_hash: changed ? null : existing?.renders?.site_bundle_hash || null,
    },
    target_account: targetAccount(existing?.target_account),
    approvals: channels.approvals,
    wechat: channels.wechat,
    site: channels.site,
    last_error: changed ? {
      step: "prepare",
      message: "Canonical Markdown or a rendered package changed; prior channel approvals were invalidated",
      at: now,
    } : existing?.last_error || null,
    updated_at: now,
  };
}

export function buildManifest(article, bundle) {
  return {
    schema_version: 1,
    renderer: "frontier-signals-markdown-v2",
    article_id: article.id,
    source: "article.md",
    source_hash: article.sourceHash,
    title: article.title,
    description: article.description,
    author: article.wechat.author,
    digest: article.wechat.digest,
    content_source_url: article.wechat.content_source_url,
    topics: article.wechat.topics,
    comments: article.wechat.comments,
    cover: article.cover,
    hero: article.hero,
    content_images: bundle.wechatMedia,
    media_hashes: bundle.mediaHashes,
    wechat_html: ".frontier-build/wechat.html",
    wechat_html_hash: canonicalHash(bundle.wechatHtml),
    web_preview: ".frontier-build/web/index.html",
    web_preview_hash: canonicalHash(bundle.webHtml),
    wechat_package_hash: bundle.wechatPackageHash,
    site_package_hash: bundle.sitePackageHash,
  };
}

async function compare(path, expected) {
  const current = await readFile(path, "utf8").catch(() => null);
  return current === expected;
}

async function main() {
  const { articlePath, check } = argumentsFor(process.argv.slice(2));
  if (articlePath !== join(dirname(articlePath), "article.md")) throw new Error("Canonical source must be named article.md");
  const article = await loadMarkdownArticle(articlePath);
  const bundle = await articlePackage(article);
  const articleDirectory = dirname(articlePath);
  const buildDirectory = join(articleDirectory, ".frontier-build");
  const releasePath = join(articleDirectory, "release.json");
  const manifestPath = join(buildDirectory, "channel-manifest.json");
  const wechatPath = join(buildDirectory, "wechat.html");
  const webPath = join(buildDirectory, "web", "index.html");
  const manifest = buildManifest(article, bundle);
  const existingRelease = await readJson(releasePath).catch(() => null);
  const release = nextRelease(article, bundle, existingRelease);
  const previewHtml = bundle.webHtml.replace(
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    '<meta name="robots" content="noindex,nofollow,noarchive">',
  );

  if (check) {
    const stale = [];
    if (!await compare(wechatPath, bundle.wechatHtml)) stale.push(relative(root, wechatPath));
    if (!await compare(webPath, previewHtml)) stale.push(relative(root, webPath));
    if (!await compare(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)) stale.push(relative(root, manifestPath));
    if (!existingRelease
      || existingRelease.canonical?.source_hash !== article.sourceHash
      || existingRelease.renders?.wechat_package_hash !== bundle.wechatPackageHash
      || existingRelease.renders?.site_package_hash !== bundle.sitePackageHash) {
      stale.push(relative(root, releasePath));
    }
    if (stale.length) throw new Error(`Article render is stale: ${stale.join(", ")}`);
  } else {
    await mkdir(dirname(webPath), { recursive: true });
    await writeFile(wechatPath, bundle.wechatHtml);
    await writeFile(webPath, previewHtml);
    await atomicJson(manifestPath, manifest);
    await atomicJson(releasePath, release);
    for (const media of article.mediaByPath.values()) {
      const output = join(buildDirectory, "web", media.path);
      await mkdir(dirname(output), { recursive: true });
      await copyFile(media.sourcePath, output);
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    check,
    article: articlePath,
    release: releasePath,
    wechat_preview: wechatPath,
    web_preview: webPath,
    source_hash: article.sourceHash,
    wechat_package_hash: bundle.wechatPackageHash,
    site_package_hash: bundle.sitePackageHash,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
