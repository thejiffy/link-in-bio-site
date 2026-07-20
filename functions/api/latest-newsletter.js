// Cloudflare Pages Function — serves the newest newsletter issue as JSON,
// fetched from the RSS feed at request time (not build time), the same way
// /api/latest-episode.js does for the podcast. See that file for why this
// is regex-based rather than using rss-parser.

const SNIPPET_MAX_LENGTH = 200;

function stripTags(value) {
  return (value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(itemXml, tagName) {
  const match = itemXml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  if (!match) return "";
  return match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim();
}

function extractEnclosureUrl(itemXml) {
  const match = itemXml.match(/<enclosure[^>]*\burl="([^"]+)"/i);
  return match ? match[1] : "";
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

function buildSnippet(rawText) {
  const clean = stripTags(rawText);
  if (clean.length <= SNIPPET_MAX_LENGTH) {
    return { text: clean, truncated: false };
  }
  return { text: clean.slice(0, SNIPPET_MAX_LENGTH).trim(), truncated: true };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestGet(context) {
  const feedUrl = context.env.NEWSLETTER_RSS_URL;
  if (!feedUrl) {
    return jsonResponse({ error: "NEWSLETTER_RSS_URL not configured" }, 500);
  }

  let xml;
  try {
    const feedResponse = await fetch(feedUrl);
    if (!feedResponse.ok) {
      return jsonResponse({ error: "Failed to fetch newsletter feed" }, 502);
    }
    xml = await feedResponse.text();
  } catch (error) {
    return jsonResponse({ error: "Failed to fetch newsletter feed" }, 502);
  }

  const firstItemMatch = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/i);
  if (!firstItemMatch) {
    return jsonResponse({ error: "No issues found in feed" }, 502);
  }

  const itemXml = firstItemMatch[1];
  const title = stripTags(extractTag(itemXml, "title"));
  const link = stripTags(extractTag(itemXml, "link"));
  const pubDate = extractTag(itemXml, "pubDate");
  // Beehiiv publishes the issue's key art as a standard RSS <enclosure> —
  // same mechanism as the podcast audio file.
  const thumbnailUrl = extractEnclosureUrl(itemXml);
  const descriptionRaw =
    extractTag(itemXml, "description") || extractTag(itemXml, "content:encoded");
  const snippet = buildSnippet(descriptionRaw);

  return jsonResponse(
    {
      date: formatDate(pubDate),
      link,
      title,
      snippetText: snippet.text,
      snippetTruncated: snippet.truncated,
      thumbnailUrl,
    },
    200
  );
}
