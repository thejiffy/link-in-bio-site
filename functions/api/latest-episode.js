// Cloudflare Pages Function — serves the newest podcast episode as JSON,
// fetched from the RSS feed at request time (not build time). This is what
// lets the link-in-bio page show a freshly-published episode without
// needing a redeploy.
//
// Lives in /functions (not /src or /dist) because Cloudflare Pages always
// reads Functions from a top-level /functions directory, regardless of the
// configured build output directory.
//
// No XML library — Workers' runtime doesn't reliably support the
// Node-oriented deps rss-parser pulls in (sax/xml2js), so this pulls just
// the handful of fields the page needs with regexes tailored to a
// standard podcast RSS <item>.

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
  const feedUrl = context.env.PODCAST_RSS_URL;
  if (!feedUrl) {
    return jsonResponse({ error: "PODCAST_RSS_URL not configured" }, 500);
  }

  let xml;
  try {
    const feedResponse = await fetch(feedUrl);
    if (!feedResponse.ok) {
      return jsonResponse({ error: "Failed to fetch podcast feed" }, 502);
    }
    xml = await feedResponse.text();
  } catch (error) {
    return jsonResponse({ error: "Failed to fetch podcast feed" }, 502);
  }

  const firstItemMatch = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/i);
  if (!firstItemMatch) {
    return jsonResponse({ error: "No episodes found in feed" }, 502);
  }

  const itemXml = firstItemMatch[1];
  const audioUrl = extractEnclosureUrl(itemXml);
  const title = stripTags(extractTag(itemXml, "title"));
  const link = stripTags(extractTag(itemXml, "link")) || audioUrl;
  const pubDate = extractTag(itemXml, "pubDate");
  // Prefer the plain <description> (a short, clean blurb) over
  // <content:encoded>, which some feeds populate with the full styled
  // article/show-notes HTML — same field priority as build.js gets for
  // free from rss-parser's contentSnippet.
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
      audioUrl,
    },
    200
  );
}
