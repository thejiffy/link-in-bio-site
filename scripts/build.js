// Build script for The Jiffy link-in-bio page.
//
// What it does:
//   1. Reads the newsletter + podcast RSS feed URLs (from .env locally, or
//      from real environment variables in Cloudflare Pages).
//   2. Fetches both feeds and grabs the latest item from each.
//   3. Injects that data into src/index.html wherever a {{TOKEN}} appears.
//   4. Copies the templated HTML, styles.css, and fonts/ into dist/ — the
//      folder Cloudflare Pages actually serves.
//
// Run it with: npm run build

const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");

const SRC_DIR = path.join(__dirname, "..", "src");
const DIST_DIR = path.join(__dirname, "..", "dist");

// ---- Load .env for local runs only. In Cloudflare Pages the real
// NEWSLETTER_RSS_URL / PODCAST_RSS_URL environment variables are already
// set, so we never overwrite a variable that's already present. ----
function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ---- Minimal HTML-escaping for anything pulled from RSS before it goes
// into the page — titles/snippets are third-party content, so this keeps
// a stray "<" or "&" in a post title from being interpreted as markup. ----
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Builds the safe HTML for a card's snippet paragraph. When the raw
// description is short enough, it's just escaped text. When it has to be
// cut off, an inline "(read more)" link back to the full post/episode is
// appended — so a mid-word cutoff always has an obvious way to keep
// reading, instead of just trailing off.
function buildSnippetHtml(rawText, maxLength, link) {
  const clean = (rawText || "").trim();
  if (!clean) return "";
  if (clean.length <= maxLength) return escapeHtml(clean);

  const truncated = escapeHtml(clean.slice(0, maxLength).trim());
  const safeLink = escapeHtml(link || "");
  return `${truncated}… <a href="${safeLink}">(read more)</a>`;
}

async function fetchLatestNewsletterItem(feedUrl) {
  const parser = new Parser();
  const feed = await parser.parseURL(feedUrl);
  const item = feed.items[0];
  return {
    date: formatDate(item.pubDate || item.isoDate),
    link: item.link || "",
    title: item.title || "",
    descriptionRaw: item.contentSnippet || "",
  };
}

async function fetchLatestPodcastItem(feedUrl) {
  const parser = new Parser();
  const feed = await parser.parseURL(feedUrl);
  const item = feed.items[0];
  return {
    date: formatDate(item.pubDate || item.isoDate),
    // Not every podcast RSS item has its own <link> — fall back to the
    // audio file itself so the title is never a dead link.
    link: item.link || (item.enclosure && item.enclosure.url) || "",
    title: item.title || "",
    descriptionRaw: item.contentSnippet || "",
    audioUrl: (item.enclosure && item.enclosure.url) || "",
  };
}

function injectTokens(html, tokens) {
  let result = html;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.split(`{{${token}}}`).join(value);
  }
  return result;
}

async function build() {
  loadDotEnv();

  const newsletterFeedUrl = process.env.NEWSLETTER_RSS_URL;
  const podcastFeedUrl = process.env.PODCAST_RSS_URL;

  if (!newsletterFeedUrl || !podcastFeedUrl) {
    throw new Error(
      "Missing NEWSLETTER_RSS_URL or PODCAST_RSS_URL. Set them in .env " +
        "locally, or as Cloudflare Pages environment variables in production."
    );
  }

  console.log("Fetching latest newsletter issue…");
  const newsletter = await fetchLatestNewsletterItem(newsletterFeedUrl);
  console.log(`  -> ${newsletter.title}`);

  console.log("Fetching latest podcast episode…");
  const podcast = await fetchLatestPodcastItem(podcastFeedUrl);
  console.log(`  -> ${podcast.title}`);

  const template = fs.readFileSync(path.join(SRC_DIR, "index.html"), "utf8");
  const html = injectTokens(template, {
    NEWSLETTER_DATE: escapeHtml(newsletter.date),
    NEWSLETTER_LINK: escapeHtml(newsletter.link),
    NEWSLETTER_TITLE: escapeHtml(newsletter.title),
    // Already-safe HTML (may contain an inline "(read more)" link) —
    // do NOT escapeHtml this one, or that link would show up as text.
    NEWSLETTER_SNIPPET: buildSnippetHtml(newsletter.descriptionRaw, 200, newsletter.link),
    PODCAST_DATE: escapeHtml(podcast.date),
    PODCAST_LINK: escapeHtml(podcast.link),
    PODCAST_TITLE: escapeHtml(podcast.title),
    PODCAST_SNIPPET: buildSnippetHtml(podcast.descriptionRaw, 200, podcast.link),
    PODCAST_AUDIO_URL: escapeHtml(podcast.audioUrl),
  });

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  fs.writeFileSync(path.join(DIST_DIR, "index.html"), html);
  fs.copyFileSync(
    path.join(SRC_DIR, "styles.css"),
    path.join(DIST_DIR, "styles.css")
  );
  fs.cpSync(path.join(SRC_DIR, "fonts"), path.join(DIST_DIR, "fonts"), {
    recursive: true,
  });

  console.log(`Build complete -> ${path.relative(process.cwd(), DIST_DIR)}/`);
}

build().catch((error) => {
  console.error("Build failed:", error.message);
  process.exit(1);
});
