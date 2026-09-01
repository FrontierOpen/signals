import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { articlePackage, canonicalHash, loadMarkdownArticle, releaseApprovalErrors } from "./lib/markdown-article.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDirectory = join(root, "dist");

function parseArguments(argv) {
  const [action, source, ...rest] = argv;
  if (!action || !source || !["review", "publish-manual-site", "retry-site", "reconcile-site", "record-wechat"].includes(action)) {
    throw new Error("Usage: node scripts/release-article.mjs <review|publish-manual-site|retry-site|reconcile-site|record-wechat> article.md [options]");
  }
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--confirm") options.confirm = true;
    else if (value.startsWith("--")) options[value.slice(2)] = rest[++index];
    else throw new Error(`Unexpected argument: ${value}`);
  }
  return { action, articlePath: resolve(source), options };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function command(name, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(name, args, { cwd: root, env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${name} ${args.join(" ")} failed (${signal || code})`));
    });
  });
}

async function commandOutput(name, args) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(name, args, { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${name} ${args.join(" ")} failed (${signal || code}): ${stderr.trim()}`));
    });
  });
}

async function assertInfrastructureClean() {
  const legacyManifest = JSON.parse(await readFile(join(root, "data", "published-wechat.json"), "utf8"));
  const legacyInputs = legacyManifest.articles
    .flatMap((entry) => [entry.source, entry.asset_root, entry.hero_source])
    .filter((value) => typeof value === "string" && value);
  const status = await commandOutput("git", [
    "status", "--porcelain", "--",
    "package.json", "package-lock.json", "wrangler.jsonc", "src", "scripts",
    "public/404.html", "public/robots.txt", "public/_headers",
    "public/assets/favicon-v1.svg", "public/assets/frontier-passage-v1.jpg",
    "public/assets/frontier-theme-v16.css", "public/assets/frontier-theme-v17.css",
    "public/assets/passage-mark-white-v1.svg",
    "public/assets/site-header-v3.js", "public/assets/site-header-v4.js",
    "data/published-wechat.json", ...legacyInputs,
  ]);
  if (status.trim()) {
    throw new Error("Automatic website release requires committed, clean renderer/Worker/config files");
  }
}

async function recursiveFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await recursiveFiles(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

async function directoryHash(directory) {
  const files = (await recursiveFiles(directory)).sort();
  const digest = createHash("sha256");
  for (const path of files) {
    digest.update(relative(directory, path));
    digest.update("\0");
    digest.update(await readFile(path));
    digest.update("\0");
  }
  return `sha256:${digest.digest("hex")}`;
}

function bufferHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function deploymentBundleHash(attemptId) {
  const inputs = {};
  for (const name of ["package.json", "package-lock.json", "wrangler.jsonc", "src/index.js"]) {
    inputs[name] = bufferHash(await readFile(join(root, name)));
  }
  return canonicalHash({ dist: await directoryHash(distDirectory), inputs, release_attempt: attemptId });
}

async function verifyLive(article) {
  const cacheBust = `frontier_verify=${Date.now()}`;
  const [year, month, day] = article.date.split("-");
  const checks = [
    [article.canonicalUrl, join(distDirectory, year, month, day, article.slug, "index.html")],
    ["https://signals.frontierworld.ai/", join(distDirectory, "index.html")],
    ["https://signals.frontierworld.ai/rss.xml", join(distDirectory, "rss.xml")],
    ["https://signals.frontierworld.ai/sitemap.xml", join(distDirectory, "sitemap.xml")],
    ["https://signals.frontierworld.ai/assets/frontier-theme-v16.css", join(distDirectory, "assets", "frontier-theme-v16.css")],
    ["https://signals.frontierworld.ai/assets/frontier-theme-v17.css", join(distDirectory, "assets", "frontier-theme-v17.css")],
    ["https://signals.frontierworld.ai/assets/site-header-v3.js", join(distDirectory, "assets", "site-header-v3.js")],
    ["https://signals.frontierworld.ai/assets/site-header-v4.js", join(distDirectory, "assets", "site-header-v4.js")],
  ];
  for (const path of article.bodyImages.keys()) {
    checks.push([
      `${article.canonicalUrl}${path}`,
      join(distDirectory, year, month, day, article.slug, path),
    ]);
  }
  const verified = {};
  for (const [url, path] of checks) {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}${cacheBust}`, { cache: "no-store" });
    const [remote, local] = await Promise.all([
      response.arrayBuffer().then((value) => Buffer.from(value)),
      readFile(path),
    ]);
    if (!response.ok || !remote.equals(local)) throw new Error(`Live asset does not match deploy bundle: ${url}`);
    if (url === article.canonicalUrl
      && response.headers.get("X-Frontier-Release-Attempt") !== article.releaseAttempt) {
      throw new Error("Live Worker release attempt does not match the deployment attempt");
    }
    verified[new URL(url).pathname] = bufferHash(remote);
  }
  const pagePath = join(distDirectory, year, month, day, article.slug, "index.html");
  const html = await readFile(pagePath, "utf8");
  if (!html.includes(`name="frontier-source-hash" content="${article.sourceHash}"`)) {
    throw new Error("Live article does not contain the approved source hash");
  }
  for (const name of ["index.html", "rss.xml", "sitemap.xml"]) {
    if (!(await readFile(join(distDirectory, name), "utf8")).includes(article.canonicalUrl)) {
      throw new Error(`Deploy bundle ${name} does not include the article URL`);
    }
  }
  const heroResponse = await fetch(`${article.canonicalUrl}${article.hero}?${cacheBust}`, { cache: "no-store" });
  const heroCache = heroResponse.headers.get("Cache-Control") || "";
  const [remoteHero, localHero] = await Promise.all([
    heroResponse.arrayBuffer().then((value) => Buffer.from(value)),
    readFile(join(distDirectory, year, month, day, article.slug, article.hero)),
  ]);
  if (!heroResponse.ok || !remoteHero.equals(localHero)
    || !heroCache.includes("max-age=3600") || heroCache.includes("immutable")) {
    throw new Error("Live Worker did not apply the expected article-media cache policy");
  }
  return { url: article.canonicalUrl, assets: verified, verified_at: new Date().toISOString() };
}

export function reviewPlan(article, bundle, release, receipt) {
  const blockers = [];
  if (release.schema_version !== 2 || release.article_id !== article.id) blockers.push("release.json does not describe this article");
  if (release.canonical?.source_hash !== article.sourceHash) blockers.push("article.md changed after prepare");
  if (release.renders?.wechat_package_hash !== bundle.wechatPackageHash) blockers.push("WeChat package changed after prepare");
  if (release.renders?.site_package_hash !== bundle.sitePackageHash) blockers.push("site package changed after prepare");
  if (release.wechat?.status !== "remote_draft") blockers.push("WeChat draft has not been created and verified");
  if (!receipt || receipt.status !== "verified") blockers.push("verified WeChat draft receipt is missing");
  if (receipt?.draft_id !== release.wechat?.draft_id) blockers.push("WeChat draft ID does not match the release state");
  if (receipt?.content_hash !== article.sourceHash) blockers.push("WeChat receipt is not bound to the current article.md");
  if (receipt?.package_hash !== bundle.wechatPackageHash) blockers.push("WeChat receipt is not bound to the current rendered package");
  if (!release.wechat?.remote_content_hash) blockers.push("verified remote WeChat content hash is missing");
  return {
    ok: blockers.length === 0,
    blockers,
    article_id: article.id,
    title: article.title,
    draft_id: receipt?.draft_id || null,
    source_hash: article.sourceHash,
    wechat_package_hash: bundle.wechatPackageHash,
    remote_content_hash: release.wechat?.remote_content_hash || null,
    site_package_hash: bundle.sitePackageHash,
    target_url: article.canonicalUrl,
  };
}

export function manualPublishPlan(article, bundle, release) {
  const blockers = [];
  if (release.schema_version !== 2 || release.article_id !== article.id) blockers.push("release.json does not describe this article");
  if (release.canonical?.source_hash !== article.sourceHash) blockers.push("article.md changed after prepare");
  if (release.renders?.wechat_package_hash !== bundle.wechatPackageHash) blockers.push("WeChat package changed after prepare");
  if (release.renders?.site_package_hash !== bundle.sitePackageHash) blockers.push("site package changed after prepare");
  if (!release.target_account?.app_id_fingerprint) blockers.push("target account fingerprint is missing");
  if (release.site?.status === "live") blockers.push("website is already live");
  return {
    ok: blockers.length === 0,
    blockers,
    article_id: article.id,
    title: article.title,
    source_hash: article.sourceHash,
    wechat_package_hash: bundle.wechatPackageHash,
    site_package_hash: bundle.sitePackageHash,
    target_account: release.target_account?.name || null,
    target_url: article.canonicalUrl,
    wechat_public_url: null,
  };
}

async function deploySiteUnlocked(article, releasePath, release) {
  release.site = {
    ...(release.site || {}),
    status: "deploying",
    url: article.canonicalUrl,
    attempt_id: randomBytes(16).toString("hex"),
    started_at: new Date().toISOString(),
  };
  article.releaseAttempt = release.site.attempt_id;
  release.renders.site_bundle_hash = null;
  release.site.planned_bundle_hash = null;
  release.last_error = null;
  await atomicJson(releasePath, release);

  let deploymentError = null;
  let uploadStarted = false;
  try {
    await command("npm", ["run", "site:render"]);
    await command("npm", ["run", "theme"]);
    release.renders.site_bundle_hash = await deploymentBundleHash(release.site.attempt_id);
    release.site.planned_bundle_hash = release.renders.site_bundle_hash;
    await atomicJson(releasePath, release);
    await command("npm", ["run", "check"]);
    uploadStarted = true;
    await command("npx", [
      "wrangler", "deploy", "--strict", "--var",
      `FRONTIER_RELEASE_ATTEMPT:${release.site.attempt_id}`,
    ]);
  } catch (error) {
    deploymentError = error;
  }

  if (deploymentError && !uploadStarted) {
    release.site.status = "failed";
    release.last_error = {
      step: "site_build",
      message: deploymentError.message,
      at: new Date().toISOString(),
      retryable: true,
      outcome: "not_uploaded",
    };
    await atomicJson(releasePath, release);
    throw new Error("Website build failed before upload; fix the local error and run article:retry");
  }

  try {
    const verification = await verifyLive(article);
    release.site.status = "live";
    release.site.published_at ||= new Date().toISOString();
    release.site.verified_at = verification.verified_at;
    release.site.deployed_bundle_hash = release.renders.site_bundle_hash;
    release.site.verification = verification;
    release.last_error = null;
    await atomicJson(releasePath, release);
    process.stdout.write(`${JSON.stringify({ ok: true, deployed: true, url: article.canonicalUrl, verification }, null, 2)}\n`);
  } catch (verificationError) {
    release.site.status = deploymentError ? "deployment_result_unknown" : "deployed_unverified";
    release.last_error = {
      step: "site_deploy_or_verify",
      message: (deploymentError || verificationError).message,
      at: new Date().toISOString(),
      retryable: false,
    };
    await atomicJson(releasePath, release);
    throw new Error("Website deployment is not verified; run article:reconcile before any retry");
  }
}

async function deploySite(article, releasePath, release) {
  await assertInfrastructureClean();
  const lockPath = join(root, ".wrangler", "frontier-signals-site-release.lock");
  await mkdir(dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, article_id: article.id, started_at: new Date().toISOString() })}\n`);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another website release is running; inspect ${lockPath}`);
    throw error;
  }
  try {
    return await deploySiteUnlocked(article, releasePath, release);
  } finally {
    await handle.close();
    await unlink(lockPath).catch(() => {});
  }
}

async function review(articlePath, options) {
  const article = await loadMarkdownArticle(articlePath);
  const bundle = await articlePackage(article);
  const releasePath = join(dirname(articlePath), "release.json");
  const receiptPath = join(dirname(articlePath), "wechat-draft-receipt.json");
  let [release, receipt] = await Promise.all([
    readJson(releasePath),
    readJson(receiptPath).catch(() => null),
  ]);
  let plan = reviewPlan(article, bundle, release, receipt);
  if (!options.confirm) {
    process.stdout.write(`${JSON.stringify({ ...plan, dry_run: true }, null, 2)}\n`);
    if (!plan.ok) process.exitCode = 1;
    return;
  }
  if (!plan.ok) throw new Error(`Review confirmation is blocked: ${plan.blockers.join("; ")}`);

  const verifier = join(root, "..", "skills", "frontier-signals", "scripts", "push_markdown_draft.py");
  await command("python3", [
    verifier,
    dirname(articlePath),
    "--confirm",
    "--approved-hash", plan.source_hash,
    "--approved-package-hash", plan.wechat_package_hash,
    "--target-account", release.target_account.name,
  ]);
  [release, receipt] = await Promise.all([readJson(releasePath), readJson(receiptPath)]);
  plan = reviewPlan(article, bundle, release, receipt);
  if (!plan.ok) throw new Error(`Remote draft changed during final verification: ${plan.blockers.join("; ")}`);
  await assertInfrastructureClean();

  const now = new Date().toISOString();
  release.approvals ||= {};
  release.approvals.remote_review = {
    confirmed_at: now,
    draft_id: plan.draft_id,
    source_hash: plan.source_hash,
    wechat_package_hash: plan.wechat_package_hash,
    remote_content_hash: plan.remote_content_hash,
    site_package_hash: plan.site_package_hash,
    target_account_fingerprint: release.target_account.app_id_fingerprint,
  };
  release.wechat.status = "review_confirmed";
  await deploySite(article, releasePath, release);
}

async function publishManualSite(articlePath, options) {
  const article = await loadMarkdownArticle(articlePath);
  const bundle = await articlePackage(article);
  const releasePath = join(dirname(articlePath), "release.json");
  const release = await readJson(releasePath);
  const plan = manualPublishPlan(article, bundle, release);
  if (!options.confirm) {
    process.stdout.write(`${JSON.stringify({ ...plan, dry_run: true, operation: "manual_wechat_publication_then_site" }, null, 2)}\n`);
    if (!plan.ok) process.exitCode = 1;
    return;
  }
  if (!plan.ok) throw new Error(`Manual publication recovery is blocked: ${plan.blockers.join("; ")}`);
  if (options["approved-hash"] !== plan.source_hash
    || options["approved-wechat-package-hash"] !== plan.wechat_package_hash
    || options["approved-site-package-hash"] !== plan.site_package_hash
    || options["target-account"] !== plan.target_account) {
    throw new Error("Manual publication approval does not match the current article, packages, or account");
  }
  await assertInfrastructureClean();

  const now = new Date().toISOString();
  release.approvals ||= {};
  release.approvals.manual_publication = {
    confirmed_at: now,
    source_hash: plan.source_hash,
    wechat_package_hash: plan.wechat_package_hash,
    site_package_hash: plan.site_package_hash,
    target_account_fingerprint: release.target_account.app_id_fingerprint,
    public_url_recorded: false,
  };
  release.wechat = {
    ...(release.wechat || {}),
    status: "published_manual",
    public: {
      status: "published_unrecorded",
      url: null,
      published_at: null,
      declared_at: now,
    },
  };
  release.last_error = null;
  await atomicJson(releasePath, release);
  await deploySite(article, releasePath, release);
}

async function recordWechat(articlePath, options) {
  if (!options.confirm) throw new Error("record-wechat requires --confirm");
  const url = new URL(options.url || "");
  if (url.protocol !== "https:" || url.hostname !== "mp.weixin.qq.com" || !url.pathname.startsWith("/s/")) {
    throw new Error("--url must be a public https://mp.weixin.qq.com/s/... article URL");
  }
  if (!options["published-at"] || Number.isNaN(Date.parse(options["published-at"]))) {
    throw new Error("--published-at must be an ISO date-time");
  }
  const releasePath = join(dirname(articlePath), "release.json");
  const release = await readJson(releasePath);
  if (!release.wechat || !["review_confirmed", "published_manual"].includes(release.wechat.status)) {
    throw new Error("WeChat draft must be review_confirmed before recording a public URL");
  }
  if (release.site?.status !== "live") throw new Error("The website must be live before recording the manually published WeChat URL");
  await assertInfrastructureClean();
  release.wechat.status = "published_manual";
  release.wechat.public = {
    status: "published",
    url: url.href,
    published_at: new Date(options["published-at"]).toISOString(),
    recorded_at: new Date().toISOString(),
  };
  const article = await loadMarkdownArticle(articlePath, { wechatUrl: url.href });
  const bundle = await articlePackage(article);
  release.renders.site_package_hash = bundle.sitePackageHash;
  release.renders.site_bundle_hash = null;
  release.approvals ||= {};
  const approval = release.approvals.remote_review || release.approvals.manual_publication;
  if (!approval) throw new Error("No site publication approval is available");
  approval.site_package_hash = bundle.sitePackageHash;
  release.site.planned_bundle_hash = null;
  release.approvals.wechat_public_record = {
    recorded_at: new Date().toISOString(),
    url: url.href,
    source_hash: article.sourceHash,
    site_package_hash: bundle.sitePackageHash,
  };
  await atomicJson(releasePath, release);
  await deploySite(article, releasePath, release);
}

async function retrySite(articlePath) {
  const releasePath = join(dirname(articlePath), "release.json");
  const release = await readJson(releasePath);
  if (release.site?.status !== "failed" || release.last_error?.outcome !== "not_uploaded") {
    throw new Error("article:retry is only valid after a known pre-upload website failure");
  }
  const article = await loadMarkdownArticle(articlePath, { wechatUrl: release.wechat?.public?.url || null });
  const bundle = await articlePackage(article);
  const approvalErrors = releaseApprovalErrors(release, article, bundle, { requireSiteBundle: false });
  if (approvalErrors.length) throw new Error(`Website retry approval failed: ${approvalErrors.join("; ")}`);
  await deploySite(article, releasePath, release);
}

async function reconcileSite(articlePath) {
  const releasePath = join(dirname(articlePath), "release.json");
  const release = await readJson(releasePath);
  if (!["deployment_result_unknown", "deployed_unverified", "deploying"].includes(release.site?.status)) {
    throw new Error("Site reconciliation is only valid for an unknown or interrupted deployment");
  }
  const article = await loadMarkdownArticle(articlePath, {
    wechatUrl: release.wechat?.public?.url || null,
  });
  article.releaseAttempt = release.site.attempt_id;
  if (release.canonical?.source_hash !== article.sourceHash) {
    throw new Error("article.md changed after the deployment attempt");
  }
  const verification = await verifyLive(article);
  release.site.status = "live";
  release.site.published_at ||= new Date().toISOString();
  release.site.verified_at = verification.verified_at;
  release.site.deployed_bundle_hash = release.renders.site_bundle_hash;
  release.site.verification = verification;
  release.last_error = null;
  await atomicJson(releasePath, release);
  process.stdout.write(`${JSON.stringify({ ok: true, reconciled: true, verification }, null, 2)}\n`);
}

async function main() {
  const { action, articlePath, options } = parseArguments(process.argv.slice(2));
  if (articlePath !== join(dirname(articlePath), "article.md")) throw new Error("Canonical source must be named article.md");
  if (action === "review") await review(articlePath, options);
  else if (action === "publish-manual-site") await publishManualSite(articlePath, options);
  else if (action === "retry-site") await retrySite(articlePath);
  else if (action === "reconcile-site") await reconcileSite(articlePath);
  else await recordWechat(articlePath, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
