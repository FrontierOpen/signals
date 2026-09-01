import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { marked } from "marked";
import { parse as parseYaml } from "yaml";
import { renderSiteHeader, renderThemeBootScript } from "./site-shell.mjs";

export const ARTICLE_SCHEMA = "frontier-signals/article@2";
export const SITE_ORIGIN = "https://signals.frontierworld.ai";

const FORMATS = new Set(["bulletin", "report", "profile"]);
const FORMAT_RULES = {
  bulletin: { bodyMin: 900, bodyMax: 1500, sources: 3, images: 2 },
  report: { bodyMin: 1600, bodyMax: 2800, sources: 4, images: 3 },
  profile: { bodyMin: 2400, bodyMax: 4200, sources: 6, images: 4 },
};
const SOURCE_KINDS = new Set(["primary", "filing", "research", "secondary", "social"]);
const CLAIM_KINDS = new Set(["fact", "quote", "analysis", "forecast"]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
const MEDIA_RIGHTS = new Set(["owned", "licensed", "official", "fair_use_reviewed", "pending"]);
const SAFE_MEDIA_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const BODY_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function canonicalHash(value) {
  return sha256(JSON.stringify(stableValue(value)));
}

export async function fileHash(path) {
  return sha256(await readFile(path));
}

function requireText(value, label, errors, { maximum } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} must be a non-empty string`);
    return "";
  }
  const text = value.trim();
  if (maximum && Array.from(text).length > maximum) {
    errors.push(`${label} exceeds ${maximum} characters`);
  }
  return text;
}

export function normalizeMediaPath(value, label = "media path") {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a string`);
  const decoded = decodeURIComponent(value.trim()).replaceAll("\\", "/").replace(/^\.\//u, "");
  const normalized = posix.normalize(decoded);
  if (
    normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || posix.isAbsolute(normalized)
    || !SAFE_MEDIA_PATH.test(normalized)
  ) {
    throw new Error(`${label} is unsafe: ${value}`);
  }
  return normalized;
}

function safeLink(value) {
  if (typeof value !== "string" || !value) throw new Error("Markdown link is empty");
  if (value.startsWith("#")) return value;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Unsupported Markdown link: ${value}`);
  return url.href;
}

function frontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u);
  if (!match) throw new Error("article.md must start with YAML frontmatter");
  const metadata = parseYaml(match[1]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("article.md frontmatter must be an object");
  }
  return { metadata, markdown: source.slice(match[0].length) };
}

function walkTokens(tokens, visit) {
  for (const token of tokens) {
    visit(token);
    for (const key of ["tokens", "items"]) {
      if (Array.isArray(token[key])) walkTokens(token[key], visit);
    }
    if (token.type === "table") {
      for (const row of [token.header, ...(token.rows || [])]) {
        for (const cell of row || []) if (Array.isArray(cell.tokens)) walkTokens(cell.tokens, visit);
      }
    }
  }
}

function tokenText(tokens) {
  const parts = [];
  walkTokens(tokens, (token) => {
    if (["text", "codespan", "code"].includes(token.type) && typeof token.text === "string") {
      parts.push(token.text);
    }
  });
  return parts.join(" ").replace(/\s+/gu, " ").trim();
}

function countTokenType(tokens, type) {
  let count = 0;
  walkTokens(tokens, (token) => { if (token.type === type) count += 1; });
  return count;
}

function validateEditorial(metadata, tokens, format, bodyImages, mediaByPath, errors) {
  const rules = FORMAT_RULES[format];
  if (!rules) return;
  const bodyCharacters = tokenText(contentWithoutTitle(tokens)).replace(/\s+/gu, "").length;
  if (bodyCharacters < rules.bodyMin || bodyCharacters > rules.bodyMax) {
    errors.push(`${format} body must contain ${rules.bodyMin}-${rules.bodyMax} non-whitespace characters; got ${bodyCharacters}`);
  }
  if (bodyImages.size < rules.images) {
    errors.push(`${format} requires at least ${rules.images} inline images; got ${bodyImages.size}`);
  }

  if (!metadata.thesis || typeof metadata.thesis !== "object" || Array.isArray(metadata.thesis)) {
    errors.push("frontmatter.thesis must be an object");
  } else {
    requireText(metadata.thesis.core, "frontmatter.thesis.core", errors);
    requireText(metadata.thesis.boundary, "frontmatter.thesis.boundary", errors);
  }

  const sources = Array.isArray(metadata.sources) ? metadata.sources : [];
  if (!Array.isArray(metadata.sources)) errors.push("frontmatter.sources must be an array");
  if (sources.length < rules.sources) errors.push(`${format} requires at least ${rules.sources} sources; got ${sources.length}`);
  const sourceIds = new Set();
  for (const [index, source] of sources.entries()) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      errors.push(`frontmatter.sources[${index}] must be an object`);
      continue;
    }
    const id = requireText(source.id, `frontmatter.sources[${index}].id`, errors);
    if (!/^S[1-9][0-9]*$/u.test(id)) errors.push(`frontmatter.sources[${index}].id must look like S1`);
    if (sourceIds.has(id)) errors.push(`frontmatter.sources contains duplicate ID: ${id}`);
    sourceIds.add(id);
    if (!SOURCE_KINDS.has(source.kind)) errors.push(`frontmatter.sources[${index}].kind is invalid`);
    requireText(source.title, `frontmatter.sources[${index}].title`, errors);
    requireText(source.publisher, `frontmatter.sources[${index}].publisher`, errors);
    try { safeLink(source.url); } catch (error) { errors.push(`frontmatter.sources[${index}].url: ${error.message}`); }
    if (source.published_at !== null && (typeof source.published_at !== "string" || Number.isNaN(Date.parse(source.published_at)))) {
      errors.push(`frontmatter.sources[${index}].published_at must be an ISO date-time or null`);
    }
    if (typeof source.checked_at !== "string" || Number.isNaN(Date.parse(source.checked_at))) {
      errors.push(`frontmatter.sources[${index}].checked_at must be an ISO date-time`);
    }
  }

  const testRuns = Array.isArray(metadata.test_runs) ? metadata.test_runs : [];
  if (!Array.isArray(metadata.test_runs)) errors.push("frontmatter.test_runs must be an array");
  const testRunIds = new Set();
  for (const [index, run] of testRuns.entries()) {
    if (!run || typeof run !== "object" || Array.isArray(run)) {
      errors.push(`frontmatter.test_runs[${index}] must be an object`);
      continue;
    }
    const id = requireText(run.id, `frontmatter.test_runs[${index}].id`, errors);
    if (!/^T[1-9][0-9]*$/u.test(id)) errors.push(`frontmatter.test_runs[${index}].id must look like T1`);
    if (testRunIds.has(id)) errors.push(`frontmatter.test_runs contains duplicate ID: ${id}`);
    testRunIds.add(id);
    for (const key of [
      "tested_at", "access_scope", "region", "account_tier", "product_version", "model_version",
      "application_or_harness", "task", "prompt_or_input", "acceptance_criteria", "tools", "permissions",
      "reasoning_mode", "relevant_settings", "duration", "tokens", "cost", "result", "failures",
      "manual_intervention", "comparison_conditions", "limitations",
    ]) {
      if (!(key in run) || run[key] === null || run[key] === "") errors.push(`${id}.${key} is required`);
    }
    for (const key of ["run_count", "retries"]) {
      if (!Number.isInteger(run[key]) || run[key] < 0) errors.push(`${id}.${key} must be a non-negative integer`);
    }
    if (!Array.isArray(run.artifact_paths) || !run.artifact_paths.length) {
      errors.push(`${id}.artifact_paths must contain at least one relative path`);
    } else {
      for (const path of run.artifact_paths) {
        try { normalizeMediaPath(path, `${id}.artifact_paths`); } catch (error) { errors.push(error.message); }
      }
    }
  }

  const claims = Array.isArray(metadata.claims) ? metadata.claims : [];
  if (!Array.isArray(metadata.claims) || !claims.length) errors.push("frontmatter.claims must contain at least one claim");
  const claimIds = new Set();
  for (const [index, claim] of claims.entries()) {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
      errors.push(`frontmatter.claims[${index}] must be an object`);
      continue;
    }
    const id = requireText(claim.id, `frontmatter.claims[${index}].id`, errors);
    if (!/^C[1-9][0-9]*$/u.test(id)) errors.push(`frontmatter.claims[${index}].id must look like C1`);
    if (claimIds.has(id)) errors.push(`frontmatter.claims contains duplicate ID: ${id}`);
    claimIds.add(id);
    if (!CLAIM_KINDS.has(claim.kind)) errors.push(`frontmatter.claims[${index}].kind is invalid`);
    requireText(claim.statement, `frontmatter.claims[${index}].statement`, errors);
    if (!CONFIDENCE_LEVELS.has(claim.confidence)) errors.push(`frontmatter.claims[${index}].confidence is invalid`);
    const claimSources = Array.isArray(claim.source_ids) ? claim.source_ids : [];
    const claimRuns = Array.isArray(claim.test_run_ids) ? claim.test_run_ids : [];
    if (!Array.isArray(claim.source_ids) || !Array.isArray(claim.test_run_ids)) {
      errors.push(`frontmatter.claims[${index}] source_ids and test_run_ids must be arrays`);
    }
    for (const sourceId of claimSources) if (!sourceIds.has(sourceId)) errors.push(`${id} references missing source ${sourceId}`);
    for (const runId of claimRuns) if (!testRunIds.has(runId)) errors.push(`${id} references missing test run ${runId}`);
    if (claim.kind === "quote" && !claimSources.length) {
      errors.push(`${id} quote must reference a public source`);
    } else if (claim.kind === "fact" && !claimSources.length && !claimRuns.length) {
      errors.push(`${id} must reference a source or test run`);
    }
  }

  let generatedInline = 0;
  for (const [path, bodyImage] of bodyImages) {
    const media = mediaByPath.get(path);
    if (!media) continue;
    if (bodyImage.count !== 1) errors.push(`inline media must appear exactly once: ${path}`);
    if (bodyImage.alt !== media.alt) errors.push(`Markdown alt must match frontmatter.media alt: ${path}`);
    if (media.generated) generatedInline += 1;
  }
  const specialMedia = new Set([
    String(metadata.cover || "").replace(/^\.\//u, ""),
    String(metadata.hero || "").replace(/^\.\//u, ""),
  ]);
  for (const media of mediaByPath.values()) {
    if (!MEDIA_RIGHTS.has(media.rights) || media.rights === "pending") errors.push(`media rights are not cleared: ${media.path}`);
    if (!specialMedia.has(media.path) && !bodyImages.has(media.path)) {
      errors.push(`registered inline media is missing from Markdown: ${media.path}`);
    }
  }
  if (generatedInline > 1) errors.push("an article may contain at most one generated inline image");

  let strongTotal = 0;
  walkTokens(tokens, (token) => {
    if (token.type !== "paragraph") return;
    const paragraphStrong = countTokenType(token.tokens || [], "strong");
    if (paragraphStrong > 1) errors.push("each paragraph may contain at most one bold span");
    strongTotal += paragraphStrong;
  });
  if (strongTotal > 6) errors.push("an article may contain at most six bold spans");

  if (format === "profile") {
    const hasTimeline = Array.isArray(metadata.timeline) && metadata.timeline.length >= 2;
    const hasTimelineHeading = tokens.some((token) => token.type === "heading" && /时间|timeline/iu.test(token.text || ""));
    if (!hasTimeline && !hasTimelineHeading) errors.push("profile requires a timeline in frontmatter or a timeline section");
  }
}

function splitBody(tokens, title, errors) {
  const h1 = tokens.filter((token) => token.type === "heading" && token.depth === 1);
  if (h1.length !== 1) errors.push("article.md must contain exactly one H1");
  if (h1[0]?.text?.trim() !== title) errors.push("article.md H1 must exactly match frontmatter.title");

  const content = tokens.filter((token) => token !== h1[0]);
  const intro = [];
  const sections = [];
  let active = null;
  for (const token of content) {
    if (token.type === "heading" && token.depth === 2) {
      active = { heading: token.text.trim(), tokens: [] };
      sections.push(active);
    } else if (active) {
      active.tokens.push(token);
    } else {
      intro.push(token);
    }
  }
  if (!sections.length) errors.push("article.md must contain at least one H2 section");
  return { intro, sections };
}

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
    const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
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
      if (frames.has(marker)) {
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
      const [b1, b2, b3, b4] = [buffer[21], buffer[22], buffer[23], buffer[24]];
      width = 1 + b1 + ((b2 & 0x3f) << 8);
      height = 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10);
    }
  }
  if (!format || !width || !height) throw new Error(`Unsupported or unreadable image: ${path}`);
  return { format, width, height, bytes: buffer.length, layout: width / height < 0.65 ? "tall" : width / height < 0.95 ? "portrait" : "landscape" };
}

function siteRenderer(article) {
  const renderer = new marked.Renderer();
  renderer.html = () => { throw new Error("Raw HTML is not allowed in article.md"); };
  renderer.link = function link({ href, title, tokens }) {
    const safe = safeLink(href);
    const label = this.parser.parseInline(tokens);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(safe)}" rel="noopener noreferrer"${titleAttribute}>${label}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const path = normalizeMediaPath(href, "Markdown image");
    const image = article.mediaByPath.get(path);
    if (!image) throw new Error(`Markdown image is not registered in frontmatter.media: ${path}`);
    const caption = image.showCaption && (title || image.caption)
      ? `<figcaption>${escapeHtml(title || image.caption)}</figcaption>`
      : "";
    const layout = image.layout === "landscape" ? "" : ` article-media--${image.layout}`;
    return `<figure class="article-media${layout}"><img src="./${escapeHtml(path)}" alt="${escapeHtml(text)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async">${caption}</figure>`;
  };
  return renderer;
}

function wechatRenderer(article) {
  const renderer = new marked.Renderer();
  renderer.html = () => { throw new Error("Raw HTML is not allowed in article.md"); };
  renderer.paragraph = function paragraph({ tokens }) {
    if (tokens.length === 1 && tokens[0].type === "image") {
      return this.parser.parseInline(tokens);
    }
    return `<p style="margin:0 0 20px;color:#101114;font-size:16px;line-height:1.92;text-align:justify;">${this.parser.parseInline(tokens)}</p>`;
  };
  renderer.heading = function heading({ tokens, depth }) {
    const size = depth === 3 ? 18 : 16;
    return `<h${depth} style="margin:26px 0 14px;color:#101114;font-size:${size}px;line-height:1.5;font-weight:700;">${this.parser.parseInline(tokens)}</h${depth}>`;
  };
  renderer.strong = function strong({ tokens }) {
    return `<strong style="color:#101114;font-weight:700;">${this.parser.parseInline(tokens)}</strong>`;
  };
  renderer.em = function em({ tokens }) {
    return `<em style="font-style:italic;">${this.parser.parseInline(tokens)}</em>`;
  };
  renderer.codespan = ({ text }) => `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:0.92em;font-weight:600;letter-spacing:0;color:inherit;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(text)}</span>`;
  renderer.code = ({ text }) => `<pre style="margin:22px 0;padding:16px;overflow-x:auto;background:#101114;color:#FAFAF7;border-radius:4px;font-size:13px;line-height:1.65;"><code>${escapeHtml(text)}</code></pre>`;
  renderer.blockquote = function blockquote({ tokens }) {
    return `<blockquote style="margin:24px 0;padding:0 0 0 16px;border-left:2px solid #155EEF;color:#101114;">${this.parser.parse(tokens)}</blockquote>`;
  };
  renderer.list = function list(token) {
    const tag = token.ordered ? "ol" : "ul";
    const body = token.items.map((item) => this.listitem(item)).join("");
    return `<${tag} style="margin:18px 0 22px;padding-left:24px;color:#101114;font-size:16px;line-height:1.85;">${body}</${tag}>`;
  };
  renderer.listitem = function listitem(item) {
    return `<li style="margin:8px 0;">${this.parser.parse(item.tokens)}</li>`;
  };
  renderer.link = function link({ href, title, tokens }) {
    const safe = safeLink(href);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(safe)}" style="color:#155EEF;text-decoration:underline;"${titleAttribute}>${this.parser.parseInline(tokens)}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const path = normalizeMediaPath(href, "Markdown image");
    const image = article.mediaByPath.get(path);
    if (!image) throw new Error(`Markdown image is not registered in frontmatter.media: ${path}`);
    const caption = image.showCaption && (title || image.caption)
      ? `<p style="margin:9px 4px 0;color:#5D626D;font-size:12px;line-height:1.65;text-align:left;">${escapeHtml(title || image.caption)}</p>`
      : "";
    return `<section style="margin:0 0 20px;padding:0;"><img src="${escapeHtml(path)}" alt="${escapeHtml(text)}" style="display:block;width:100%;max-width:100%;height:auto;margin:0;border-radius:4px;">${caption}</section>`;
  };
  renderer.hr = () => '<hr style="margin:32px 0;border:0;border-top:1px solid #E8EEFF;">';
  renderer.table = () => { throw new Error("Markdown tables are not supported in the WeChat renderer"); };
  return renderer;
}

function renderTokenList(tokens, renderer) {
  return marked.parser(tokens, { gfm: true, breaks: false, renderer });
}

function titleHtml(article) {
  const segments = article.titleSegments;
  if (!segments?.length) return escapeHtml(article.title);
  if (!segments.every((segment) => typeof segment === "string") || segments.join("") !== article.title) {
    throw new Error("frontmatter.title_segments must reconstruct title exactly");
  }
  return segments.map((segment) => `<span class="title-phrase">${escapeHtml(segment)}</span>`).join("<wbr>");
}

export async function loadMarkdownArticle(sourcePath, options = {}) {
  const absolutePath = resolve(sourcePath);
  const source = await readFile(absolutePath, "utf8");
  const { metadata, markdown } = frontmatter(source);
  const errors = [];
  const title = requireText(metadata.title, "frontmatter.title", errors, { maximum: 32 });
  const description = requireText(metadata.description, "frontmatter.description", errors, { maximum: 160 });
  const id = requireText(metadata.id, "frontmatter.id", errors);
  const slug = requireText(metadata.slug, "frontmatter.slug", errors);
  const date = requireText(metadata.date, "frontmatter.date", errors);
  const format = requireText(metadata.format, "frontmatter.format", errors);
  if (metadata.schema !== ARTICLE_SCHEMA) errors.push(`frontmatter.schema must be ${ARTICLE_SCHEMA}`);
  if (!FORMATS.has(format)) errors.push("frontmatter.format must be bulletin, report, or profile");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) errors.push("frontmatter.date must use YYYY-MM-DD");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) errors.push("frontmatter.slug must use lowercase kebab-case");
  if (id !== `${date}/${slug}`) errors.push("frontmatter.id must equal date/slug");

  const tokens = marked.lexer(markdown, { gfm: true, breaks: false });
  const { intro, sections } = splitBody(tokens, title, errors);
  const bodyImages = new Map();
  walkTokens(tokens, (token) => {
    if (token.type === "html") errors.push("Raw HTML is not allowed in article.md");
    if (token.type === "table") errors.push("Markdown tables are not supported; use paragraphs or a figure");
    if (token.type === "link") {
      try { safeLink(token.href); } catch (error) { errors.push(error.message); }
    }
    if (token.type === "image") {
      try {
        const path = normalizeMediaPath(token.href, "Markdown image");
        if (!token.text?.trim()) errors.push(`Markdown image requires alt text: ${path}`);
        if (!BODY_IMAGE_EXTENSIONS.has(posix.extname(path).toLowerCase())) {
          errors.push(`WeChat body images must be PNG or JPEG: ${path}`);
        }
        const existing = bodyImages.get(path);
        bodyImages.set(path, {
          alt: token.text.trim(),
          caption: token.title || "",
          count: (existing?.count || 0) + 1,
        });
      } catch (error) {
        errors.push(error.message);
      }
    }
  });

  const mediaEntries = Array.isArray(metadata.media) ? metadata.media : [];
  if (!Array.isArray(metadata.media)) errors.push("frontmatter.media must be an array");
  const mediaByPath = new Map();
  for (const [index, item] of mediaEntries.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`frontmatter.media[${index}] must be an object`);
      continue;
    }
    try {
      const path = normalizeMediaPath(item.path, `frontmatter.media[${index}].path`);
      if (mediaByPath.has(path)) errors.push(`frontmatter.media contains duplicate path: ${path}`);
      mediaByPath.set(path, {
        path,
        alt: requireText(item.alt, `frontmatter.media[${index}].alt`, errors),
        caption: typeof item.caption === "string" ? item.caption.trim() : "",
        credit: requireText(item.credit, `frontmatter.media[${index}].credit`, errors),
        rights: requireText(item.rights, `frontmatter.media[${index}].rights`, errors),
        purpose: requireText(item.purpose, `frontmatter.media[${index}].purpose`, errors),
        generated: item.generated === true,
        showCaption: item.show_caption === true,
      });
    } catch (error) {
      errors.push(error.message);
    }
  }
  for (const path of bodyImages.keys()) {
    if (!mediaByPath.has(path)) errors.push(`Markdown image is not registered in frontmatter.media: ${path}`);
  }

  let cover = "";
  let hero = "";
  try { cover = normalizeMediaPath(metadata.cover, "frontmatter.cover"); } catch (error) { errors.push(error.message); }
  try { hero = normalizeMediaPath(metadata.hero, "frontmatter.hero"); } catch (error) { errors.push(error.message); }
  for (const [label, path] of [["cover", cover], ["hero", hero]]) {
    if (path && !mediaByPath.has(path)) errors.push(`frontmatter.${label} must also appear in frontmatter.media`);
  }
  if (cover && posix.extname(cover).toLowerCase() !== ".png") errors.push("frontmatter.cover must be a PNG");
  if (cover && cover !== "wechat-cover.png") errors.push("frontmatter.cover must be wechat-cover.png");

  const articleDirectory = dirname(absolutePath);
  for (const item of mediaByPath.values()) {
    try {
      const path = resolve(articleDirectory, item.path);
      if (!path.startsWith(`${articleDirectory}/`)) throw new Error(`Media path escapes article directory: ${item.path}`);
      const buffer = await readFile(path);
      const details = imageMetadata(buffer, path);
      const extension = posix.extname(item.path).toLowerCase();
      const expected = extension === ".png" ? "png"
        : [".jpg", ".jpeg"].includes(extension) ? "jpeg"
          : extension === ".webp" ? "webp"
            : null;
      if (!expected || expected !== details.format) throw new Error(`Image extension does not match content: ${item.path}`);
      Object.assign(item, details, { sourcePath: path, hash: sha256(buffer) });
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (options.strictEditorial !== false) {
    try {
      const notes = await readFile(join(articleDirectory, "source-notes.md"), "utf8");
      if (!notes.trim()) errors.push("source-notes.md must not be empty");
    } catch {
      errors.push("source-notes.md is required for a release-ready article");
    }
    validateEditorial(metadata, tokens, format, bodyImages, mediaByPath, errors);
  }
  if (errors.length) throw new Error(errors.join("\n"));

  const coverMedia = mediaByPath.get(cover);
  if (coverMedia.width !== 900 || coverMedia.height !== 383) {
    throw new Error(`frontmatter.cover must be exactly 900x383, got ${coverMedia.width}x${coverMedia.height}`);
  }
  for (const path of bodyImages.keys()) {
    if (mediaByPath.get(path).bytes >= 1_000_000) throw new Error(`WeChat body image exceeds 1MB: ${path}`);
  }

  const [year, month, day] = date.split("-");
  const canonicalUrl = `${SITE_ORIGIN}/${year}/${month}/${day}/${slug}/`;
  const wechat = metadata.wechat && typeof metadata.wechat === "object" ? metadata.wechat : {};
  const comments = wechat.comments && typeof wechat.comments === "object" ? wechat.comments : {};
  const article = {
    schema: ARTICLE_SCHEMA,
    sourcePath: absolutePath,
    articleDirectory,
    sourceHash: sha256(source),
    id,
    date,
    displayDate: date.replaceAll("-", "."),
    slug,
    format,
    title,
    titleSegments: Array.isArray(metadata.title_segments) ? metadata.title_segments : [],
    description,
    canonicalUrl,
    pathDate: date,
    publishedAt: options.publishedAt || metadata.published_at || `${date}T00:00:00+08:00`,
    updatedAt: options.updatedAt || metadata.updated_at || options.publishedAt || `${date}T00:00:00+08:00`,
    wechatUrl: options.wechatUrl || null,
    cover,
    hero,
    coverMedia,
    heroMedia: mediaByPath.get(hero),
    bodyImages,
    mediaByPath,
    introTokens: intro,
    sections,
    readingMinutes: Math.max(3, Math.ceil(tokenText(contentWithoutTitle(tokens)).replace(/\s+/gu, "").length / 360)),
    wechat: {
      author: typeof wechat.author === "string" ? wechat.author : "Frontier World",
      digest: typeof wechat.digest === "string" && wechat.digest.trim() ? wechat.digest.trim() : description,
      topics: Array.isArray(wechat.topics) ? wechat.topics : [],
      comments: {
        enabled: comments.enabled === true,
        fans_only: comments.fans_only === true,
      },
      content_source_url: canonicalUrl,
    },
  };
  if (article.wechat.comments.fans_only && !article.wechat.comments.enabled) {
    throw new Error("wechat.comments.fans_only requires comments.enabled=true");
  }
  if (!article.wechat.topics.length || article.wechat.topics.length > 3
    || article.wechat.topics.some((topic) => typeof topic !== "string" || !topic.trim())) {
    throw new Error("wechat.topics must contain one to three non-empty strings");
  }
  if (Array.from(article.wechat.digest).length > 120) throw new Error("wechat.digest exceeds 120 characters");
  return article;
}

function contentWithoutTitle(tokens) {
  return tokens.filter((token) => !(token.type === "heading" && token.depth === 1));
}

export function renderWechatHtml(article) {
  const renderer = wechatRenderer(article);
  const parts = [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(article.title)}</title>`,
    "</head>",
    '<body style="margin:0;padding:0;color:#101114;">',
    '<section id="frontier-signals-body" style="box-sizing:border-box;max-width:677px;margin:0 auto;padding:8px 18px 42px;color:#101114;font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Hiragino Sans GB\',\'Microsoft YaHei\',sans-serif;letter-spacing:0.02em;">',
    '<header style="margin:0 0 24px;padding:0;"><p style="margin:0;color:#155EEF;font-size:12px;font-weight:700;letter-spacing:0.18em;">FRONTIER SIGNALS</p></header>',
  ];
  const intro = renderTokenList(article.introTokens, renderer);
  if (intro.trim()) parts.push(`<section style="margin:0;padding:0;">${intro}</section>`);
  for (const section of article.sections) {
    parts.push('<section style="margin:36px 0 0;padding:0;">');
    parts.push(`<h2 style="margin:0 0 16px;padding:0 0 0 12px;border-left:3px solid #155EEF;color:#101114;font-size:22px;line-height:1.45;font-weight:730;word-break:keep-all;overflow-wrap:normal;">${escapeHtml(section.heading)}</h2>`);
    parts.push(renderTokenList(section.tokens, renderer));
    parts.push("</section>");
  }
  parts.push('<footer style="margin:34px 0 0;padding:18px 0 0;border-top:1px solid #E8EEFF;text-align:center;"><p style="margin:0;color:#155EEF;font-size:12px;font-weight:750;letter-spacing:0.16em;">FRONTIER WORLD</p></footer>');
  parts.push("</section>", "</body>", "</html>");
  return `${parts.join("\n")}\n`;
}

export function extractWechatBody(html) {
  const match = html.match(/(<section id="frontier-signals-body"[^>]*>[\s\S]*<\/section>)\s*<\/body>/u);
  if (!match) throw new Error("Rendered WeChat HTML is missing frontier-signals-body");
  return match[1];
}

export function renderWebArticleHtml(article) {
  const renderer = siteRenderer(article);
  const intro = renderTokenList(article.introTokens, renderer);
  const sections = article.sections.map((section, index) => {
    const classes = section.heading === "延伸阅读" ? "article-section sources sources--markdown" : "article-section";
    return `<section class="${classes}" id="section-${String(index + 1).padStart(2, "0")}"><div class="section-label">${String(index + 1).padStart(2, "0")} / FRONTIER SIGNALS</div><h2>${escapeHtml(section.heading)}</h2>${renderTokenList(section.tokens, renderer)}</section>`;
  }).join("");
  const hero = article.heroMedia;
  const imageUrl = `${article.canonicalUrl}${article.hero}`;
  const structured = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    mainEntityOfPage: article.canonicalUrl,
    image: [imageUrl],
    author: { "@type": "Organization", name: "Frontier World" },
    publisher: { "@type": "Organization", name: "Frontier World", url: "https://frontierworld.ai/" },
  };
  if (article.wechatUrl) structured.sameAs = article.wechatUrl;
  const wechatMeta = article.wechatUrl
    ? `<a href="${escapeHtml(article.wechatUrl)}" rel="noopener noreferrer">公众号原文</a>`
    : "";
  const titleClass = Array.from(article.title.replace(/\s+/gu, "")).length > 40 ? " article-head--long-title" : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#050608">
  ${renderThemeBootScript()}
  <meta name="frontier-source-hash" content="${article.sourceHash}">
  <title>${escapeHtml(article.title)} · Frontier Signals</title>
  <meta name="description" content="${escapeHtml(article.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${article.canonicalUrl}">
  <link rel="icon" href="/assets/favicon-v1.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/frontier-theme-v18.css">
  <script src="/assets/site-header-v5.js" defer></script>
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(article.title)}">
  <meta property="og:description" content="${escapeHtml(article.description)}">
  <meta property="og:url" content="${article.canonicalUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:alt" content="${escapeHtml(hero.alt)}">
  <meta property="og:image:width" content="${hero.width}">
  <meta property="og:image:height" content="${hero.height}">
  <meta property="og:site_name" content="Frontier Signals">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(article.title)}">
  <meta name="twitter:description" content="${escapeHtml(article.description)}">
  <meta name="twitter:image" content="${imageUrl}">
  <script type="application/ld+json">${JSON.stringify(structured).replaceAll("<", "\\u003c")}</script>
</head>
<body class="article-site">
  <a class="skip-link" href="#article-body">跳到正文</a>
  ${renderSiteHeader({ sticky: true })}
  <main><article class="article-page"><header class="article-head${titleClass}"><div class="kicker">FRONTIER SIGNALS · ${article.displayDate}</div><h1>${titleHtml(article)}</h1><p class="subtitle">${escapeHtml(article.description)}</p><div class="meta" aria-label="文章信息"><span>${article.format.toUpperCase()}</span><span>${article.readingMinutes} 分钟阅读</span><span>Frontier World</span>${wechatMeta}</div></header><figure class="article-hero"><img src="./${escapeHtml(article.hero)}" alt="${escapeHtml(hero.alt)}" width="${hero.width}" height="${hero.height}" fetchpriority="high" decoding="async"></figure><div class="article-body" id="article-body" tabindex="-1">${intro ? `<section class="lede">${intro}</section>` : ""}${sections}</div></article></main>
  <footer class="site-footer"><div class="site-footer-inner"><div><strong>Frontier Signals</strong><span>Frontier World · 前沿之境</span></div><div><a href="https://frontierworld.ai/">把前沿，变成实践</a></div></div></footer>
</body>
</html>
`;
}

export async function articlePackage(article) {
  const wechatHtml = renderWechatHtml(article);
  const wechatBody = extractWechatBody(wechatHtml);
  const webHtml = renderWebArticleHtml(article);
  const bodyMedia = [...article.bodyImages.keys()].sort();
  const wechatMedia = bodyMedia;
  const allMedia = [...new Set([article.cover, article.hero, ...bodyMedia])].sort();
  const mediaHashes = Object.fromEntries(allMedia.map((path) => [path, article.mediaByPath.get(path).hash]));
  return {
    wechatHtml,
    webHtml,
    mediaHashes,
    wechatPackageHash: canonicalHash({
      signal_hash: article.sourceHash,
      wechat_body_hash: sha256(wechatBody),
      content_images: Object.fromEntries(wechatMedia.map((path) => [path, article.mediaByPath.get(path).hash])),
      cover_hash: article.mediaByPath.get(article.cover).hash,
    }),
    sitePackageHash: canonicalHash({ source_hash: article.sourceHash, body_hash: sha256(webHtml), hero: article.mediaByPath.get(article.hero).hash, images: Object.fromEntries(bodyMedia.map((path) => [path, article.mediaByPath.get(path).hash])) }),
    wechatMedia,
  };
}

export function releaseApprovalErrors(release, article, bundle, { requireSiteBundle = false } = {}) {
  const errors = [];
  if (release.schema_version !== 2 || release.article_id !== article.id) errors.push("release identity does not match article.md");
  if (release.canonical?.source_hash !== article.sourceHash) errors.push("release source hash does not match article.md");
  if (release.renders?.wechat_package_hash !== bundle.wechatPackageHash) errors.push("release WeChat package hash drifted");
  if (release.renders?.site_package_hash !== bundle.sitePackageHash) errors.push("release site package hash drifted");
  if (!["review_confirmed", "published_manual"].includes(release.wechat?.status)) errors.push("WeChat draft review is not confirmed");

  const manualPublication = release.wechat?.status === "published_manual"
    && !release.approvals?.remote_review;
  const approval = manualPublication
    ? release.approvals?.manual_publication
    : release.approvals?.remote_review;
  if (!approval?.confirmed_at) errors.push(manualPublication ? "manual publication approval is missing" : "post-draft owner review is missing");
  if (!manualPublication && approval?.draft_id !== release.wechat?.draft_id) errors.push("approved draft ID does not match release state");
  if (approval?.source_hash !== article.sourceHash) errors.push("owner review source hash drifted");
  if (approval?.wechat_package_hash !== bundle.wechatPackageHash) errors.push("owner review WeChat package hash drifted");
  if (approval?.site_package_hash !== bundle.sitePackageHash) errors.push("owner review site package hash drifted");
  if (!manualPublication && (!release.wechat?.remote_content_hash || approval?.remote_content_hash !== release.wechat.remote_content_hash)) errors.push("owner review remote content hash drifted");
  if (approval?.target_account_fingerprint !== release.target_account?.app_id_fingerprint) errors.push("owner review target account drifted");
  if (requireSiteBundle && (
    !release.renders?.site_bundle_hash
    || release.site?.planned_bundle_hash !== release.renders.site_bundle_hash
  )) errors.push("site deployment plan is not bound to the deploy bundle");

  if (release.wechat?.public?.url) {
    const publicApproval = release.approvals?.wechat_public_record;
    if (publicApproval?.source_hash !== article.sourceHash
      || publicApproval?.site_package_hash !== bundle.sitePackageHash
      || publicApproval?.url !== release.wechat?.public?.url) {
      errors.push("public WeChat URL update is not approved for the current site package");
    }
  }
  return errors;
}

export function publicArticleEntry(article, release) {
  return {
    id: article.id,
    sourceType: "markdown",
    sourcePath: article.sourcePath,
    publishedAt: release.site.published_at || release.site.started_at || article.publishedAt,
    updatedAt: release.site.updated_at || release.site.published_at || article.updatedAt,
    wechatUrl: release.wechat?.public?.url || null,
  };
}
