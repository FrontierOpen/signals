import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDirectory = join(root, "public");
const checkOnly = process.argv.includes("--check");
const siteOrigin = "https://signals.frontierworld.ai";
const manifestPath = join(root, "data/published-wechat.json");

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const escapeXml = escapeHtml;
const withoutDot = (path = "") => path.replace(/^\.\//u, "");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const displayDate = (date) => date.replaceAll("-", ".");
const formatLabel = (format) => ({
  analysis: "ANALYSIS",
  bulletin: "BULLETIN",
  profile: "PROFILE",
  quick: "ANALYSIS",
  report: "REPORT",
}[format] || String(format || "SIGNAL").toUpperCase());

function imageMetadata(buffer, path) {
  let format;
  let width;
  let height;

  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    format = "png";
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    format = "jpeg";
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = buffer.readUInt16BE(offset);
      if (startOfFrame.has(marker)) {
        height = buffer.readUInt16BE(offset + 3);
        width = buffer.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  } else if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    format = "webp";
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      width = buffer.readUIntLE(24, 3) + 1;
      height = buffer.readUIntLE(27, 3) + 1;
    } else if (chunk === "VP8 ") {
      width = buffer.readUInt16LE(26) & 0x3fff;
      height = buffer.readUInt16LE(28) & 0x3fff;
    } else if (chunk === "VP8L") {
      const b1 = buffer[21];
      const b2 = buffer[22];
      const b3 = buffer[23];
      const b4 = buffer[24];
      width = 1 + b1 + ((b2 & 0x3f) << 8);
      height = 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10);
    }
  }

  if (!format || !width || !height) throw new Error(`Unsupported or unreadable image: ${path}`);

  const extension = extname(path).toLowerCase();
  const expected = extension === ".png" ? "png"
    : [".jpg", ".jpeg"].includes(extension) ? "jpeg"
      : extension === ".webp" ? "webp"
        : null;
  if (!expected || expected !== format) {
    throw new Error(`Image extension does not match content: ${path} (${extension || "none"} vs ${format})`);
  }

  const ratio = width / height;
  const layout = ratio < 0.65 ? "tall" : ratio < 0.95 ? "portrait" : "landscape";
  return { format, width, height, layout };
}

function pathDetails(entry) {
  const [year, month, day] = entry.path_date.split("-");
  const urlPath = `/${year}/${month}/${day}/${entry.slug}/`;
  return {
    year,
    month,
    day,
    urlPath,
    canonicalUrl: `${siteOrigin}${urlPath}`,
    outputDirectory: join(publicDirectory, year, month, day, entry.slug),
  };
}

function readingMinutes(parts, provided) {
  if (provided) return provided;
  const length = parts.join("").replace(/\s+/gu, "").length;
  return Math.max(3, Math.ceil(length / 360));
}

function normalizeMedia(media, sourceRoot, afterParagraph) {
  const outputPath = withoutDot(media.path);
  return {
    id: media.id || outputPath,
    outputPath,
    sourcePath: resolve(sourceRoot, outputPath),
    alt: media.alt || "Frontier Signals 文章配图",
    caption: media.caption || "",
    showCaption: media.show_caption === true,
    afterParagraph,
  };
}

function normalizeLegacy(entry, source) {
  const assetRoot = resolve(root, entry.asset_root);
  const sources = source.sources || [];
  const sections = (source.sections || []).map((section, index) => {
    const paragraphs = section.paragraphs || [];
    const media = section.image
      ? [{
        ...normalizeMedia(section.image, assetRoot, paragraphs.length),
        showCaption: Boolean(section.image.caption),
      }]
      : [];
    return {
      id: section.id || `section-${index + 1}`,
      label: section.label || String(index + 1).padStart(2, "0"),
      heading: section.title,
      paragraphs,
      points: section.points || [],
      callout: section.callout || "",
      sourceIds: section.source_ids || [],
      media,
    };
  });
  const conclusion = source.conclusion
    ? {
      heading: source.conclusion.title || "写在最后",
      paragraphs: source.conclusion.paragraphs || [],
      callout: source.conclusion.question || "",
      sourceIds: source.conclusion.source_ids || [],
    }
    : null;
  const textParts = [
    ...(source.intro || []),
    ...sections.flatMap((section) => [section.heading, ...section.paragraphs, ...section.points]),
    ...(conclusion?.paragraphs || []),
  ];

  return {
    format: source.format || source.mode || "analysis",
    updatedAt: source.generated_at || entry.published_at,
    intro: source.intro || [],
    sections,
    conclusion,
    sources,
    readingMinutes: readingMinutes(textParts, source.reading_minutes),
  };
}

function normalizeSignal(entry, source, sourcePath) {
  const sourceRoot = entry.asset_root ? resolve(root, entry.asset_root) : dirname(sourcePath);
  const mediaById = new Map((source.media || []).map((media) => [media.id, media]));
  const claimsById = new Map((source.claims || []).map((claim) => [claim.id, claim]));
  const publicIds = new Set(source.public_source_ids || []);
  const sources = (source.public_source_ids || [])
    .map((id) => (source.sources || []).find((item) => item.id === id))
    .filter(Boolean);

  const sections = (source.sections || []).map((section, index) => {
    const paragraphs = section.paragraphs || [];
    const placements = new Map((section.media_placements || [])
      .map((placement) => [placement.media_id, placement.after_paragraph]));
    const media = (section.media_ids || []).map((id) => {
      const item = mediaById.get(id);
      if (!item) throw new Error(`${entry.id} references missing media ${id}`);
      return normalizeMedia(item, sourceRoot, placements.has(id) ? placements.get(id) : paragraphs.length);
    });
    const sourceIds = [...new Set((section.claim_ids || [])
      .flatMap((claimId) => claimsById.get(claimId)?.source_ids || []))]
      .filter((id) => publicIds.has(id));
    return {
      id: section.id || `section-${index + 1}`,
      label: String(index + 1).padStart(2, "0"),
      heading: section.heading,
      paragraphs,
      points: section.points || [],
      callout: section.callout || "",
      sourceIds,
      media,
    };
  });
  const textParts = sections.flatMap((section) => [section.heading, ...section.paragraphs, ...section.points]);

  return {
    format: source.meta?.format || "report",
    updatedAt: source.meta?.updated_at || entry.published_at,
    intro: [],
    sections,
    conclusion: null,
    sources,
    readingMinutes: readingMinutes(textParts),
  };
}

async function normalizeArticle(entry, manifestIndex) {
  const sourcePath = resolve(root, entry.source);
  const source = await readJson(sourcePath);
  const normalized = entry.source_type === "legacy"
    ? normalizeLegacy(entry, source)
    : normalizeSignal(entry, source, sourcePath);
  const details = pathDetails(entry);
  const publishedDate = entry.published_at.slice(0, 10);
  const heroSourcePath = resolve(root, entry.hero_source);
  const heroMetadata = imageMetadata(await readFile(heroSourcePath), entry.hero_source);
  const hero = {
    file: entry.hero_file,
    sourcePath: heroSourcePath,
    outputPath: join(details.outputDirectory, entry.hero_file),
    width: heroMetadata.width,
    height: heroMetadata.height,
    alt: `Frontier Signals：${entry.title}`,
  };
  const media = normalized.sections.flatMap((section) => section.media);
  await Promise.all(media.map(async (item) => {
    Object.assign(item, imageMetadata(await readFile(item.sourcePath), item.sourcePath));
  }));

  return {
    ...entry,
    ...details,
    ...normalized,
    manifestIndex,
    publishedDate,
    displayDate: displayDate(publishedDate),
    hero,
  };
}

function citationHtml(sourceIds, sourceIndex, label = "本节来源") {
  const links = [...new Set(sourceIds)]
    .map((id) => sourceIndex.get(id))
    .filter(Boolean)
    .map((index) => `<a href="#source-${index}" aria-label="延伸阅读 ${index}">${index}</a>`)
    .join("");
  return links ? `<div class="citations">${label} ${links}</div>` : "";
}

function figureHtml(media) {
  const caption = media.showCaption && media.caption
    ? `<figcaption>${escapeHtml(media.caption)}</figcaption>`
    : "";
  const layoutClass = media.layout === "landscape" ? "" : ` article-media--${media.layout}`;
  return `<figure class="article-media${layoutClass}"><img src="./${escapeHtml(media.outputPath)}" alt="${escapeHtml(media.alt)}" width="${media.width}" height="${media.height}" loading="lazy" decoding="async">${caption}</figure>`;
}

function sectionHtml(section, sourceIndex) {
  const mediaByParagraph = new Map();
  for (const media of section.media) {
    const items = mediaByParagraph.get(media.afterParagraph) || [];
    items.push(media);
    mediaByParagraph.set(media.afterParagraph, items);
  }
  const body = [];
  for (const media of mediaByParagraph.get(0) || []) body.push(figureHtml(media));
  section.paragraphs.forEach((paragraph, index) => {
    body.push(`<p>${escapeHtml(paragraph)}</p>`);
    for (const media of mediaByParagraph.get(index + 1) || []) body.push(figureHtml(media));
  });
  if (section.points.length) {
    body.push(`<ol class="points">${section.points.map((point) => `<li><span class="point-copy">${escapeHtml(point)}</span></li>`).join("")}</ol>`);
  }
  if (section.callout) body.push(`<blockquote>${escapeHtml(section.callout)}</blockquote>`);
  body.push(citationHtml(section.sourceIds, sourceIndex));
  return `<section class="article-section" id="${escapeHtml(section.id)}"><div class="section-label">${escapeHtml(section.label)} / FRONTIER SIGNALS</div><h2>${escapeHtml(section.heading)}</h2>${body.join("")}</section>`;
}

function sourceListHtml(article) {
  const items = [];
  let sourceNumber = 1;
  if (article.wechat_url) {
    items.push(`<li id="source-${sourceNumber}"><span>${String(sourceNumber).padStart(2, "0")}</span><a href="${escapeHtml(article.wechat_url)}" rel="noopener noreferrer">Frontier World · 微信公众号原文</a></li>`);
    sourceNumber += 1;
  }
  items.push(...article.sources.map((source, index) => {
      const publisher = source.publisher ? `${source.publisher} · ` : "";
      const indexNumber = sourceNumber + index;
      return `<li id="source-${indexNumber}"><span>${String(indexNumber).padStart(2, "0")}</span><a href="${escapeHtml(source.url)}" rel="noopener noreferrer">${escapeHtml(publisher + source.title)}</a></li>`;
    }));
  return `<section class="sources"><h2>延伸阅读</h2><ol>${items.join("")}</ol></section>`;
}

function titleHtml(article) {
  const segments = article.title_segments;
  if (!segments?.length) return escapeHtml(article.title);
  if (!segments.every((segment) => typeof segment === "string") || segments.join("") !== article.title) {
    throw new Error(`${article.id} title_segments must reconstruct title exactly`);
  }
  return segments
    .map((segment) => `<span class="title-phrase">${escapeHtml(segment)}</span>`)
    .join("<wbr>");
}

function renderArticleHtml(article) {
  const sourceIndexOffset = article.wechat_url ? 2 : 1;
  const sourceIndex = new Map(article.sources.map((source, index) => [source.id, index + sourceIndexOffset]));
  const titleClass = Array.from(article.title.replace(/\s+/gu, "")).length > 40
    ? " article-head--long-title"
    : "";
  const intro = article.intro.length
    ? `<section class="lede">${article.intro.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>`
    : "";
  const sections = article.sections.map((section) => sectionHtml(section, sourceIndex)).join("");
  const conclusion = article.conclusion
    ? `<section class="conclusion"><h2>${escapeHtml(article.conclusion.heading)}</h2>${article.conclusion.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}${article.conclusion.callout ? `<blockquote>${escapeHtml(article.conclusion.callout)}</blockquote>` : ""}${citationHtml(article.conclusion.sourceIds, sourceIndex, "结尾来源")}</section>`
    : "";
  const imageUrl = `${article.canonicalUrl}${article.hero.file}`;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.published_at,
    dateModified: article.updatedAt,
    mainEntityOfPage: article.canonicalUrl,
    ...(article.wechat_url ? { sameAs: article.wechat_url } : {}),
    image: [imageUrl],
    author: { "@type": "Organization", name: "Frontier World" },
    publisher: { "@type": "Organization", name: "Frontier World", url: "https://frontierworld.ai/" },
  }).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#050608">
  <title>${escapeHtml(article.title)} · Frontier Signals</title>
  <meta name="description" content="${escapeHtml(article.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${article.canonicalUrl}">
  <link rel="icon" href="/assets/favicon-v1.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/frontier-theme-v15.css">
  <script src="/assets/site-header-v3.js" defer></script>
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(article.title)}">
  <meta property="og:description" content="${escapeHtml(article.description)}">
  <meta property="og:url" content="${article.canonicalUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:alt" content="${escapeHtml(article.hero.alt)}">
  <meta property="og:image:width" content="${article.hero.width}">
  <meta property="og:image:height" content="${article.hero.height}">
  <meta property="og:site_name" content="Frontier Signals">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(article.title)}">
  <meta name="twitter:description" content="${escapeHtml(article.description)}">
  <meta name="twitter:image" content="${imageUrl}">
  <script type="application/ld+json">${structuredData}</script>
</head>
<body class="article-site">
  <a class="skip-link" href="#article-body">跳到正文</a>
  ${siteHeader(false, true)}
  <main>
    <article class="article-page">
      <header class="article-head${titleClass}">
        <div class="kicker">FRONTIER SIGNALS · ${article.displayDate}</div>
        <h1>${titleHtml(article)}</h1>
        <p class="subtitle">${escapeHtml(article.description)}</p>
        <div class="meta" aria-label="文章信息"><span>${formatLabel(article.format)}</span><span>${article.readingMinutes} 分钟阅读</span><span>Frontier World</span>${article.wechat_url ? `<a href="${escapeHtml(article.wechat_url)}" rel="noopener noreferrer">公众号原文 ↗</a>` : ""}</div>
      </header>
      <figure class="article-hero"><img src="./${escapeHtml(article.hero.file)}" alt="${escapeHtml(article.hero.alt)}" width="${article.hero.width}" height="${article.hero.height}" fetchpriority="high" decoding="async"></figure>
      <div class="article-body" id="article-body" tabindex="-1">${intro}${sections}${conclusion}${sourceListHtml(article)}</div>
    </article>
  </main>
  <footer class="site-footer"><div class="site-footer-inner"><div><strong>Frontier Signals</strong><span>Frontier World · 前沿之境</span></div><div><a href="https://frontierworld.ai/">把前沿，变成实践 ↗</a></div></div></footer>
</body>
</html>
`;
}

function markdownFigure(media) {
  return `![${media.alt}](./${media.outputPath})${media.showCaption && media.caption ? `\n\n*${media.caption}*` : ""}`;
}

function renderArticleMarkdown(article) {
  const lines = [
    `# ${article.title}`,
    "",
    `> ${article.description}`,
    "",
    `**Frontier Signals · ${article.displayDate} · ${article.readingMinutes} 分钟**`,
    "",
    `![${article.hero.alt}](./${article.hero.file})`,
    "",
  ];
  if (article.wechat_url) lines.splice(6, 0, `[微信公众号原文](${article.wechat_url})`, "");
  for (const paragraph of article.intro) lines.push(paragraph, "");
  article.sections.forEach((section, index) => {
    lines.push(`## ${String(index + 1).padStart(2, "0")} · ${section.heading}`, "");
    const mediaByParagraph = new Map();
    for (const media of section.media) {
      const items = mediaByParagraph.get(media.afterParagraph) || [];
      items.push(media);
      mediaByParagraph.set(media.afterParagraph, items);
    }
    for (const media of mediaByParagraph.get(0) || []) lines.push(markdownFigure(media), "");
    section.paragraphs.forEach((paragraph, paragraphIndex) => {
      lines.push(paragraph, "");
      for (const media of mediaByParagraph.get(paragraphIndex + 1) || []) lines.push(markdownFigure(media), "");
    });
    for (const point of section.points) lines.push(`- ${point}`);
    if (section.points.length) lines.push("");
    if (section.callout) lines.push(`> ${section.callout}`, "");
  });
  if (article.conclusion) {
    lines.push(`## ${article.conclusion.heading}`, "");
    for (const paragraph of article.conclusion.paragraphs) lines.push(paragraph, "");
    if (article.conclusion.callout) lines.push(`> ${article.conclusion.callout}`, "");
  }
  lines.push("## 延伸阅读", "");
  if (article.wechat_url) lines.push(`- [微信公众号原文](${article.wechat_url}) · Frontier World`);
  for (const source of article.sources) lines.push(`- [${source.title}](${source.url})${source.publisher ? ` · ${source.publisher}` : ""}`);
  lines.push("", "— Frontier World", "");
  return lines.join("\n");
}

function issueHtml(article) {
  return `<a class="issue" href="${article.urlPath}"><div class="issue-date">${article.displayDate}</div><div><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.description)}</p></div><div class="issue-meta">${formatLabel(article.format)}<br>${article.readingMinutes} min ↗</div></a>`;
}

function sharedHead({ title, description, canonicalUrl, imageArticle }) {
  const imageUrl = `${imageArticle.canonicalUrl}${imageArticle.hero.file}`;
  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#050608">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="alternate" type="application/rss+xml" href="${siteOrigin}/rss.xml">
  <link rel="icon" href="/assets/favicon-v1.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/frontier-theme-v15.css">
  <script src="/assets/site-header-v3.js" defer></script>
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:alt" content="${escapeHtml(imageArticle.hero.alt)}">
  <meta property="og:image:width" content="${imageArticle.hero.width}">
  <meta property="og:image:height" content="${imageArticle.hero.height}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${imageUrl}">`;
}

function siteHeader(home = false, sticky = false) {
  const first = home ? '<a href="#latest">最新观察</a><a href="#archive">文章档案</a>' : '<a href="/">首页</a><a href="/2026/">2026</a>';
  const links = `${first}<a href="https://frontierworld.ai/" rel="noopener noreferrer">Frontier World <span aria-hidden="true">↗</span></a>`;
  const headerClass = sticky ? "site-header" : "top";
  const transparentAttribute = home ? ' data-transparent-at-top="true"' : "";
  return `<header class="${headerClass}" data-site-header${transparentAttribute}><div class="site-header-bar"><a class="brand" href="/" aria-label="Frontier Signals 首页"><span class="mark" aria-hidden="true"></span><span class="brand-copy"><strong>Frontier Signals</strong><small>by Frontier World</small></span></a><nav class="top-nav" aria-label="主导航">${links}</nav><button class="menu-button" type="button" aria-label="打开菜单" aria-expanded="false" aria-controls="site-mobile-navigation" data-menu-button><span class="menu-icon" aria-hidden="true"></span></button></div><nav class="mobile-nav" id="site-mobile-navigation" aria-label="移动端主导航" data-mobile-navigation hidden>${links}</nav></header>`;
}

const siteFooter = '<footer class="site-footer"><div class="site-footer-inner"><div><strong>Frontier Signals</strong><span>Frontier World · 前沿之境</span></div><div><a href="https://frontierworld.ai/">把前沿，变成实践 ↗</a></div></div></footer>';

function renderHome(articles) {
  const latest = articles[0];
  const description = "Frontier Signals：从 AI 与科技新闻中提炼值得被理解的变化，以可靠来源支撑判断。";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  ${sharedHead({ title: "Frontier Signals · AI 与科技观点", description, canonicalUrl: `${siteOrigin}/`, imageArticle: latest })}
</head>
<body class="home-page">
  <a class="skip-link" href="#main-content">跳到内容</a>
  ${siteHeader(true)}
  <main class="page" id="main-content" tabindex="-1">
    <section class="intro" aria-labelledby="signals-title"><div class="intro-copy"><div class="eyebrow"><span class="status-dot" aria-hidden="true"></span>Signals from the frontier</div><h1 id="signals-title"><span>Frontier</span><span>Signals</span></h1></div><div class="intro-note"><p>看见变化，<br>说清下一步。</p><span>从 AI 与科技新闻中提炼值得被理解的变化，以可靠来源支撑判断。</span><a class="intro-link" href="#latest">阅读最新观察 <span aria-hidden="true">↓</span></a></div></section>
    <section class="latest-section" id="latest" aria-labelledby="latest-title"><div class="section-heading"><h2 id="latest-title">最新观察</h2><span>01 / LATEST SIGNAL</span></div><a class="latest" href="${latest.urlPath}"><img src="${latest.urlPath}${latest.hero.file}" alt="${escapeHtml(latest.hero.alt)}" width="${latest.hero.width}" height="${latest.hero.height}"><div class="latest-copy"><div class="label">${latest.displayDate} · ${formatLabel(latest.format)}</div><h2>${escapeHtml(latest.title)}</h2><p>${escapeHtml(latest.description)}</p><footer><span>${latest.readingMinutes} 分钟阅读</span><span>阅读全文 ↗</span></footer></div></a></section>
    <section class="archive-section" id="archive" aria-labelledby="archive-title"><div class="archive-head"><h2 id="archive-title">文章档案</h2><span>${articles.length} SIGNALS</span></div>${articles.map(issueHtml).join("")}</section>
  </main>
  ${siteFooter}
</body>
</html>
`;
}

function renderArchive({ articles, periodHtml, eyebrow, canonicalPath, title, description }) {
  const latest = articles[0];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  ${sharedHead({ title: `${title} · Frontier Signals`, description, canonicalUrl: `${siteOrigin}${canonicalPath}`, imageArticle: latest })}
</head>
<body class="archive-site">
  <a class="skip-link" href="#main-content">跳到内容</a>
  ${siteHeader(false)}
  <main class="page" id="main-content" tabindex="-1"><section class="intro" aria-labelledby="archive-period"><div><div class="eyebrow"><span class="status-dot" aria-hidden="true"></span>${eyebrow}</div><h1 id="archive-period">${periodHtml}</h1></div><p>${articles.length} 篇 AI 与科技观点文章。</p></section><section aria-labelledby="archive-title"><div class="archive-head"><h2 id="archive-title">文章档案</h2><span>${articles.length} SIGNALS</span></div>${articles.map(issueHtml).join("")}</section></main>
  ${siteFooter}
</body>
</html>
`;
}

function renderRss(articles) {
  const items = articles.map((article) => `<item><title>${escapeXml(article.title)}</title><link>${article.canonicalUrl}</link><guid isPermaLink="true">${article.canonicalUrl}</guid><pubDate>${new Date(article.published_at).toUTCString()}</pubDate><description>${escapeXml(article.description)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Frontier Signals</title><link>${siteOrigin}/</link><description>Frontier World 的 AI 与科技观点文章</description><language>zh-CN</language>${items}</channel></rss>\n`;
}

function renderSitemap(articles, yearGroups, monthGroups) {
  const urls = [
    `${siteOrigin}/`,
    ...articles.map((article) => article.canonicalUrl),
    ...[...yearGroups.keys()].map((year) => `${siteOrigin}/${year}/`),
    ...[...monthGroups.keys()].map((key) => `${siteOrigin}/${key.replace("-", "/")}/`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeXml(url)}</loc></url>`).join("")}</urlset>\n`;
}

const manifest = await readJson(manifestPath);
if (manifest.schema_version !== 1 || !Array.isArray(manifest.articles)) {
  throw new Error("data/published-wechat.json has an unsupported schema");
}

const articles = (await Promise.all(manifest.articles.map(normalizeArticle)))
  .sort((a, b) => new Date(b.published_at) - new Date(a.published_at) || a.manifestIndex - b.manifestIndex);
const yearGroups = new Map();
const monthGroups = new Map();
for (const article of articles) {
  const year = article.publishedDate.slice(0, 4);
  const monthKey = article.publishedDate.slice(0, 7);
  yearGroups.set(year, [...(yearGroups.get(year) || []), article]);
  monthGroups.set(monthKey, [...(monthGroups.get(monthKey) || []), article]);
}

const expectedText = new Map();
const expectedAssets = new Map();
for (const article of articles) {
  expectedText.set(join(article.outputDirectory, "index.html"), renderArticleHtml(article));
  expectedText.set(join(article.outputDirectory, "article.md"), renderArticleMarkdown(article));
  expectedAssets.set(article.hero.outputPath, article.hero.sourcePath);
  for (const media of article.sections.flatMap((section) => section.media)) {
    expectedAssets.set(join(article.outputDirectory, media.outputPath), media.sourcePath);
  }
}
expectedText.set(join(publicDirectory, "index.html"), renderHome(articles));
for (const [year, yearArticles] of yearGroups) {
  expectedText.set(join(publicDirectory, year, "index.html"), renderArchive({
    articles: yearArticles,
    periodHtml: year,
    eyebrow: "Year archive",
    canonicalPath: `/${year}/`,
    title: year,
    description: `${year} 年 Frontier Signals 文章档案。`,
  }));
}
for (const [monthKey, monthArticles] of monthGroups) {
  const [year, month] = monthKey.split("-");
  expectedText.set(join(publicDirectory, year, month, "index.html"), renderArchive({
    articles: monthArticles,
    periodHtml: `${year}.<em>${month}</em>`,
    eyebrow: "Month archive",
    canonicalPath: `/${year}/${month}/`,
    title: `${year}.${month}`,
    description: `${year} 年 ${month} 月 Frontier Signals 文章档案。`,
  }));
}
expectedText.set(join(publicDirectory, "rss.xml"), renderRss(articles));
expectedText.set(join(publicDirectory, "sitemap.xml"), renderSitemap(articles, yearGroups, monthGroups));

const stale = [];
for (const [path, content] of expectedText) {
  const current = await readFile(path, "utf8").catch(() => null);
  if (current === content) continue;
  stale.push(relative(root, path));
  if (!checkOnly) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
}
for (const [outputPath, sourcePath] of expectedAssets) {
  const [source, output] = await Promise.all([
    readFile(sourcePath),
    readFile(outputPath).catch(() => null),
  ]);
  if (output?.equals(source)) continue;
  stale.push(relative(root, outputPath));
  if (!checkOnly) {
    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(sourcePath, outputPath);
  }
}

if (checkOnly && stale.length) {
  throw new Error(`Published site output is stale: ${stale.join(", ")}`);
}

console.log(checkOnly
  ? `Frontier Signals site output passed for ${articles.length} published article(s)`
  : `Rendered ${articles.length} published article(s); updated ${stale.length} file(s)`);
