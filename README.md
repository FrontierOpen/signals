# Frontier Signals

The independent editorial repository for **Frontier Signals**, Frontier World’s daily AI and technology article series.

The repository keeps research evidence, canonical article data, media, channel-specific renders, publication state, and the public web archive together without coupling daily publishing to the main Frontier World website.

## Publication model

New articles use `article.md` as the only public content source. Its YAML frontmatter contains rendering metadata and the evidence/media ledger; its Markdown body contains the one reviewed article text and image order. WeChat HTML, the website edition, RSS and sitemap are derived from that exact revision. `release.json` stores channel state and hashes only.

Historical `article.json` and `signal.json` files remain readable so existing URLs do not need a forced migration.

```text
data/articles/YYYY/MM/DD/slug/article.md        canonical article
data/articles/YYYY/MM/DD/slug/source-notes.md   internal evidence notes
data/articles/YYYY/MM/DD/slug/images/           article-local media
data/articles/YYYY/MM/DD/slug/release.json      per-channel state and hashes
data/articles/YYYY/MM/DD/slug/.frontier-build/  derived local previews (ignored)
dist/                                           clean deploy bundle (ignored)
```

## Local checks

```bash
npm ci
npm run article:prepare -- /absolute/path/to/article.md
npm run site:render
npm run theme
npm run check
npm run deploy:dry-run
```

## WeChat composer

The optional local composer is maintained in the standalone `frontier-composer` repository. It imports `article.md` or a complete article folder, previews the WeChat-safe inline layout, resolves local images, and copies rich text to the clipboard without uploading the draft.

```bash
cd ../frontier-composer
npm ci
npm run dev
```

Open `http://127.0.0.1:8900`. Frontier Composer does not modify `article.md` or overwrite the deterministic `.frontier-build/wechat.html` used by the official draft adapter.

For new Markdown articles, the website renderer only includes a release whose WeChat draft was remotely verified and then explicitly confirmed by the owner. A public WeChat URL is optional because the website goes live before the owner manually publishes the WeChat article. `data/published-wechat.json` remains a legacy archive index.

`npm run site:render` rebuilds article pages, home, date archives, RSS and sitemap into a fresh `dist/`; it never deploys the long-lived `public/` working directory. This prevents unapproved or stale preview pages from leaking into production.

## Deployment

The Cloudflare Worker publishes the static archive at [signals.frontierworld.ai](https://signals.frontierworld.ai). For a new article, first save and verify the WeChat draft. After the owner opens that draft and confirms it is correct, run:

```bash
npm run article:review -- /absolute/path/to/article.md
npm run article:review -- /absolute/path/to/article.md --confirm
```

The first command is a dry-run. The confirmed command binds the review to the current draft ID and hashes, builds a clean site bundle, runs all checks, deploys Cloudflare, and verifies the article, home page, RSS and sitemap. WeChat public publishing remains a manual action in the WeChat draft editor.

Automatic deployment requires the renderer, Worker, Wrangler configuration, theme CSS and dependency lock to be committed and clean. Article content and release-state files may remain the intended working changes; unrelated infrastructure changes must be reviewed separately.

## Refreshing a live site package

When a shared website renderer or visual asset changes after an article is already live, use the refresh action instead of rewriting its original WeChat approval. It only permits an unchanged source hash and WeChat package, records an append-only site-refresh approval, deploys production, and reads the live article, home page, RSS, sitemap, and shared assets back.

```bash
npm run article:refresh -- /absolute/path/to/article.md
npm run article:refresh -- /absolute/path/to/article.md --confirm \
  --approved-hash <source_hash> \
  --approved-wechat-package-hash <wechat_package_hash> \
  --approved-current-site-package-hash <current_live_site_package_hash> \
  --approved-site-package-hash <new_site_package_hash> \
  --target-account "Frontier World" \
  --target-account-fingerprint <target_account_fingerprint>
```

The first command is a dry-run and prints every value that must be confirmed. The confirmation command deploys to production.

The legacy site at `brief.clairesparlor.com` remains separate during migration so historical links can be preserved.
