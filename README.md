# Frontier Signals

The independent editorial repository for **Frontier Signals**, Frontier World’s daily AI and technology article series.

The repository keeps research evidence, canonical article data, media, channel-specific renders, publication state, and the public web archive together without coupling daily publishing to the main Frontier World website.

## Publication model

`article.json` is the canonical source. Web, WeChat Official Account, Feishu, covers, RSS, and sitemap are rendered from the same reviewed revision using the `frontier-signals` Codex Skill.

```text
data/research/YYYY/MM/DD/research.json          verified research dossier
data/articles/YYYY/MM/DD/slug/article.json     canonical article history
media/YYYY/MM/DD/slug/                         local source and editorial media
drafts/wechat/YYYY/MM/DD/slug/                 WeChat draft artifacts
publication/YYYY/MM/DD/slug.json               per-channel state and remote IDs
public/YYYY/MM/DD/slug/                        published web edition
```

## Local checks

```bash
npm ci
npm run site:render
npm run theme
npm run check
npm run deploy:dry-run
```

`data/published-wechat.json` records the public WeChat editions included in the web archive. `npm run site:render` rebuilds their article pages, home page, date archives, RSS and sitemap from the reviewed local sources. `npm run theme` then applies the shared Frontier World visual system to every HTML page in `public/`. Deployment runs the renderer, theme integration and complete validation suite automatically.

## Deployment

The Cloudflare Worker publishes the static archive at [signals.frontierworld.ai](https://signals.frontierworld.ai). Production deployment is explicit:

```bash
npm run deploy
```

The legacy site at `brief.clairesparlor.com` remains separate during migration so historical links can be preserved.
