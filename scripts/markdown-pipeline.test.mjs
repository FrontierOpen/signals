import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  articlePackage,
  loadMarkdownArticle,
  releaseApprovalErrors,
  renderWebArticleHtml,
  renderWechatHtml,
} from "./lib/markdown-article.mjs";
import { nextRelease } from "./prepare-article.mjs";
import { manualPublishPlan, reviewPlan } from "./release-article.mjs";

function png(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function markdown(overrides = "") {
  return `---
schema: frontier-signals/article@2
id: 2026-08-18/markdown-pipeline
date: 2026-08-18
slug: markdown-pipeline
format: report
title: Markdown 单一稿源测试
description: 同一份 Markdown 确定性生成微信和网站版本。
cover: wechat-cover.png
hero: og.png
wechat:
  author: Frontier World
  digest: 同一份 Markdown 确定性生成微信和网站版本。
  topics: [AI Agent]
  comments:
    enabled: true
    fans_only: false
media:
  - path: wechat-cover.png
    alt: Frontier Signals 测试封面
    credit: Frontier World
    rights: owned
    purpose: cover
    generated: false
  - path: og.png
    alt: Frontier Signals 网站头图
    credit: Frontier World
    rights: owned
    purpose: hero
    generated: false
  - path: images/chart.png
    alt: 测试流程图
    caption: 微信与网站来自同一正文顺序。
    credit: Frontier World
    rights: owned
    purpose: evidence
    generated: false
    show_caption: true
---
# Markdown 单一稿源测试

开头只维护一次，包含一处 **明确判断**，以及 \`model_context_window\` 行内代码。

## 发生了什么

正文由同一份 Markdown 生成两个渠道版本。

![测试流程图](images/chart.png "微信与网站来自同一正文顺序。")

## 延伸阅读

- [Frontier World](https://frontierworld.ai/)
${overrides}`;
}

async function fixture(overrides = "") {
  const directory = await mkdtemp(join(tmpdir(), "frontier-signals-md-"));
  await mkdir(join(directory, "images"));
  await Promise.all([
    writeFile(join(directory, "article.md"), markdown(overrides)),
    writeFile(join(directory, "wechat-cover.png"), png(900, 383)),
    writeFile(join(directory, "og.png"), png(1200, 630)),
    writeFile(join(directory, "images/chart.png"), png(1000, 600)),
  ]);
  return { directory, articlePath: join(directory, "article.md") };
}

async function strictFixture() {
  const directory = await mkdtemp(join(tmpdir(), "frontier-signals-strict-"));
  await mkdir(join(directory, "images"));
  const paragraph = "这是一段用于验证发布门槛的完整正文。它交代事件主体、发生时间、关键动作、读者影响、适用条件和当前未知，同时保留反方解释与后续观察指标。所有判断都由附近的事实材料支撑，不使用空泛趋势或占位结论。";
  const body = Array.from({ length: 10 }, (_, index) => `${paragraph}这是第${index + 1}段。`).join("\n\n");
  const article = `---
schema: frontier-signals/article@2
id: 2026-08-18/strict-bulletin
date: 2026-08-18
slug: strict-bulletin
format: bulletin
title: 严格 Markdown 发布门测试
description: 验证来源、claim、图片权利和篇幅全部进入发布门。
thesis:
  core: 只有内容与证据同时通过，稿件才进入渠道渲染。
  boundary: 该判断只覆盖本次发布流水线，不代表外部平台永远稳定。
cover: wechat-cover.png
hero: og.png
wechat:
  author: Frontier World
  digest: 验证来源、claim、图片权利和篇幅全部进入发布门。
  topics: [AI]
  comments: { enabled: true, fans_only: false }
media:
  - { path: wechat-cover.png, alt: 严格测试封面, credit: Frontier World, rights: owned, purpose: cover, generated: false }
  - { path: og.png, alt: 严格测试头图, credit: Frontier World, rights: owned, purpose: hero, generated: false }
  - { path: images/one.png, alt: 第一张证据图, credit: Frontier World, rights: owned, purpose: evidence, generated: false }
  - { path: images/two.png, alt: 第二张证据图, credit: Frontier World, rights: owned, purpose: evidence, generated: false }
sources:
  - { id: S1, kind: primary, title: 官方来源一, publisher: 发布方一, url: https://example.com/one, published_at: 2026-08-18T09:00:00+08:00, checked_at: 2026-08-18T12:00:00+08:00 }
  - { id: S2, kind: secondary, title: 独立来源二, publisher: 媒体二, url: https://example.com/two, published_at: 2026-08-18T09:10:00+08:00, checked_at: 2026-08-18T12:00:00+08:00 }
  - { id: S3, kind: research, title: 研究来源三, publisher: 研究方三, url: https://example.com/three, published_at: 2026-08-18T09:20:00+08:00, checked_at: 2026-08-18T12:00:00+08:00 }
claims:
  - { id: C1, kind: fact, statement: 发布流水线存在明确的内容门槛。, source_ids: [S1], test_run_ids: [], confidence: high }
  - { id: C2, kind: analysis, statement: 内容与证据应当同时通过。, source_ids: [S1, S2, S3], test_run_ids: [], confidence: high }
test_runs: []
---
# 严格 Markdown 发布门测试

${body}

## 两项证据

![第一张证据图](images/one.png)

![第二张证据图](images/two.png)

## 延伸阅读

- [官方来源一](https://example.com/one)
`;
  await Promise.all([
    writeFile(join(directory, "article.md"), article),
    writeFile(join(directory, "source-notes.md"), "# Source notes\n\n三条来源已核对。\n"),
    writeFile(join(directory, "wechat-cover.png"), png(900, 383)),
    writeFile(join(directory, "og.png"), png(1200, 630)),
    writeFile(join(directory, "images/one.png"), png(1000, 600)),
    writeFile(join(directory, "images/two.png"), png(1000, 600)),
  ]);
  return { directory, articlePath: join(directory, "article.md") };
}

test("one Markdown source renders deterministic WeChat and website editions", async () => {
  const { articlePath } = await fixture();
  const article = await loadMarkdownArticle(articlePath, { strictEditorial: false });
  const first = await articlePackage(article);
  const second = await articlePackage(await loadMarkdownArticle(articlePath, { strictEditorial: false }));

  assert.equal(first.wechatHtml, second.wechatHtml);
  assert.equal(first.webHtml, second.webHtml);
  assert.equal(first.wechatPackageHash, second.wechatPackageHash);
  assert.match(renderWechatHtml(article), /id="frontier-signals-body"/u);
  assert.doesNotMatch(renderWechatHtml(article), /<h1/u);
  assert.doesNotMatch(renderWechatHtml(article), /wechat-cover\.png/u);
  assert.doesNotMatch(renderWechatHtml(article), /background:#FAFAF7/u);
  assert.match(renderWechatHtml(article), /<span style="[^"]*font-family:ui-monospace[^"]*overflow-wrap:anywhere[^"]*">model_context_window<\/span>/u);
  assert.doesNotMatch(renderWechatHtml(article), /<code style="[^"]*(?:background|padding|border-radius)/u);
  assert.doesNotMatch(renderWechatHtml(article), /<p\b[^>]*>\s*<figure|<\/figure>\s*<\/p>/u);
  assert.doesNotMatch(renderWechatHtml(article), /<p\b[^>]*>\s*<\/p>/u);
  assert.doesNotMatch(renderWechatHtml(article), /<figure\b/u);
  assert.match(renderWechatHtml(article), /<section style="margin:0 0 20px;padding:0;"><img/u);
  assert.match(renderWebArticleHtml(article), /name="frontier-source-hash"/u);
  assert.match(first.wechatHtml, /images\/chart\.png/u);
  assert.match(first.webHtml, /images\/chart\.png/u);
  assert.deepEqual(first.wechatMedia, ["images/chart.png"]);
  assert.doesNotMatch(first.webHtml, /公众号原文/u);
});

test("unsafe Markdown fails closed", async () => {
  const rawHtml = await fixture("\n<script>alert(1)</script>\n");
  await assert.rejects(() => loadMarkdownArticle(rawHtml.articlePath, { strictEditorial: false }), /Raw HTML is not allowed/u);

  const traversal = await fixture("\n![越界](../secret.png)\n");
  await assert.rejects(() => loadMarkdownArticle(traversal.articlePath, { strictEditorial: false }), /unsafe/u);
});

test("changed canonical packages invalidate channel approvals", async () => {
  const { articlePath } = await fixture();
  const article = await loadMarkdownArticle(articlePath, { strictEditorial: false });
  const bundle = await articlePackage(article);
  const existing = nextRelease(article, bundle, null, "2026-08-18T10:00:00Z");
  existing.approvals.remote_review = { confirmed_at: "2026-08-18T10:01:00Z" };
  existing.wechat.status = "review_confirmed";
  existing.site.status = "live";
  const changedBundle = { ...bundle, sitePackageHash: "sha256:changed" };
  const updated = nextRelease(article, changedBundle, existing, "2026-08-18T10:02:00Z");

  assert.deepEqual(updated.approvals, {});
  assert.equal(updated.wechat.status, "local_rendered");
  assert.equal(updated.site.status, "not_deployed");
});

test("website release requires a verified draft and post-draft hash match", async () => {
  const { articlePath } = await fixture();
  const article = await loadMarkdownArticle(articlePath, { strictEditorial: false });
  const bundle = await articlePackage(article);
  const release = nextRelease(article, bundle, null, "2026-08-18T10:00:00Z");
  let plan = reviewPlan(article, bundle, release, null);
  assert.equal(plan.ok, false);
  assert(plan.blockers.some((item) => item.includes("draft")));

  release.wechat.status = "remote_draft";
  release.wechat.draft_id = "draft-1";
  release.wechat.remote_content_hash = "sha256:remote";
  const receipt = {
    status: "verified",
    draft_id: "draft-1",
    content_hash: article.sourceHash,
    package_hash: bundle.wechatPackageHash,
  };
  plan = reviewPlan(article, bundle, release, receipt);
  assert.equal(plan.ok, true);

  receipt.package_hash = "sha256:stale";
  assert.equal(reviewPlan(article, bundle, release, receipt).ok, false);
});

test("manual WeChat publication can approve a site package without inventing a public URL", async () => {
  const { articlePath } = await fixture();
  const article = await loadMarkdownArticle(articlePath, { strictEditorial: false });
  const bundle = await articlePackage(article);
  const release = nextRelease(article, bundle, null, "2026-08-18T10:00:00Z");
  release.target_account = {
    name: "Frontier World",
    principal: "陈杰",
    app_id_fingerprint: "sha256:account",
  };
  const plan = manualPublishPlan(article, bundle, release);
  assert.equal(plan.ok, true);
  assert.equal(plan.wechat_public_url, null);

  release.wechat.status = "published_manual";
  release.wechat.public = {
    status: "published_unrecorded",
    url: null,
    published_at: null,
  };
  release.approvals.manual_publication = {
    confirmed_at: "2026-08-18T10:01:00Z",
    source_hash: article.sourceHash,
    wechat_package_hash: bundle.wechatPackageHash,
    site_package_hash: bundle.sitePackageHash,
    target_account_fingerprint: release.target_account.app_id_fingerprint,
  };
  assert.deepEqual(releaseApprovalErrors(release, article, bundle), []);
});

test("recording the later public WeChat URL changes only the website package", async () => {
  const { articlePath } = await fixture();
  const draftArticle = await loadMarkdownArticle(articlePath, { strictEditorial: false });
  const publicArticle = await loadMarkdownArticle(articlePath, {
    strictEditorial: false,
    wechatUrl: "https://mp.weixin.qq.com/s/example",
  });
  const draftBundle = await articlePackage(draftArticle);
  const publicBundle = await articlePackage(publicArticle);

  assert.equal(draftArticle.sourceHash, publicArticle.sourceHash);
  assert.equal(draftBundle.wechatPackageHash, publicBundle.wechatPackageHash);
  assert.notEqual(draftBundle.sitePackageHash, publicBundle.sitePackageHash);
  assert.match(publicBundle.webHtml, /公众号原文/u);
});

test("manual publication approval remains valid after the public WeChat URL is recorded", async () => {
  const { articlePath } = await fixture();
  const article = await loadMarkdownArticle(articlePath, {
    strictEditorial: false,
    wechatUrl: "https://mp.weixin.qq.com/s/example",
  });
  const bundle = await articlePackage(article);
  const release = nextRelease(article, bundle, null, "2026-08-18T10:00:00Z");
  release.target_account = {
    name: "Frontier World",
    principal: "陈杰",
    app_id_fingerprint: "sha256:account",
  };
  release.wechat = {
    status: "published_manual",
    public: {
      status: "published",
      url: article.wechatUrl,
      published_at: "2026-08-18T10:01:00Z",
    },
  };
  release.approvals.manual_publication = {
    confirmed_at: "2026-08-18T10:01:00Z",
    source_hash: article.sourceHash,
    wechat_package_hash: bundle.wechatPackageHash,
    site_package_hash: bundle.sitePackageHash,
    target_account_fingerprint: release.target_account.app_id_fingerprint,
  };
  release.approvals.wechat_public_record = {
    recorded_at: "2026-08-18T10:02:00Z",
    url: article.wechatUrl,
    source_hash: article.sourceHash,
    site_package_hash: bundle.sitePackageHash,
  };

  assert.deepEqual(releaseApprovalErrors(release, article, bundle), []);
});

test("release preparation enforces the editorial evidence and length gates", async () => {
  const { articlePath } = await fixture();
  await assert.rejects(
    () => loadMarkdownArticle(articlePath),
    /requires at least 4 sources|must contain at least one claim|body must contain/u,
  );
});

test("a release-ready Markdown bulletin passes the strict editorial gate", async () => {
  const { articlePath } = await strictFixture();
  const article = await loadMarkdownArticle(articlePath);
  const bundle = await articlePackage(article);

  assert.equal(article.format, "bulletin");
  assert.match(bundle.wechatPackageHash, /^sha256:/u);
  assert.match(bundle.sitePackageHash, /^sha256:/u);
});

test("site rendering fails closed unless review approval matches the deploy bundle", async () => {
  const { articlePath } = await fixture();
  const article = await loadMarkdownArticle(articlePath, { strictEditorial: false });
  const bundle = await articlePackage(article);
  const release = nextRelease(article, bundle, null, "2026-08-18T10:00:00Z");
  release.target_account = { name: "Frontier World", principal: "Frontier World", app_id_fingerprint: "sha256:account" };
  release.wechat = { status: "review_confirmed", draft_id: "draft-1", public: { url: null } };
  release.wechat.remote_content_hash = "sha256:remote";
  release.site = { status: "deploying" };
  release.approvals.remote_review = {
    confirmed_at: "2026-08-18T10:01:00Z",
    draft_id: "draft-1",
    source_hash: article.sourceHash,
    wechat_package_hash: bundle.wechatPackageHash,
    site_package_hash: bundle.sitePackageHash,
    remote_content_hash: "sha256:remote",
    target_account_fingerprint: "sha256:account",
  };

  assert.deepEqual(releaseApprovalErrors(release, article, bundle), []);
  assert.match(
    releaseApprovalErrors(release, article, bundle, { requireSiteBundle: true }).join(" "),
    /deploy bundle/u,
  );
  release.renders.site_bundle_hash = "sha256:bundle";
  release.site.planned_bundle_hash = "sha256:bundle";
  assert.deepEqual(releaseApprovalErrors(release, article, bundle, { requireSiteBundle: true }), []);
});
