// Refreshes the newsletter card with the newest issue from
// /api/latest-newsletter (a Cloudflare Pages Function that reads the RSS
// feed at request time) — same pattern as podcast-latest.js.
//
// The issue baked in at the last build by scripts/build.js stays on
// screen as a fallback the whole time this fetch is in flight, and stays
// put permanently if the fetch ever fails — this only ever upgrades the
// card, never blanks it.

function buildSnippetNodes(text, truncated, link) {
  const nodes = [document.createTextNode(truncated ? `${text}… ` : text)];
  if (truncated) {
    const readMore = document.createElement("a");
    readMore.href = link;
    readMore.target = "_blank";
    readMore.rel = "noopener noreferrer";
    readMore.textContent = "(read more)";
    nodes.push(readMore);
  }
  return nodes;
}

async function refreshLatestNewsletter() {
  const card = document.querySelector("[data-newsletter-card]");
  if (!card) return;

  let issue;
  try {
    const response = await fetch("/api/latest-newsletter");
    if (!response.ok) return;
    issue = await response.json();
  } catch (error) {
    return;
  }

  if (!issue || !issue.link) return;

  const dateEl = card.querySelector(".card__date");
  const titleLinkEl = card.querySelector(".card__title a");
  const snippetEl = card.querySelector(".card__snippet");
  const ctaEl = card.querySelector(".btn--card-cta");
  let thumbnailEl = card.querySelector(".card__thumbnail");

  if (dateEl) dateEl.textContent = issue.date;

  if (titleLinkEl) {
    titleLinkEl.textContent = issue.title;
    titleLinkEl.href = issue.link;
  }

  if (snippetEl) {
    snippetEl.replaceChildren(
      ...buildSnippetNodes(issue.snippetText, issue.snippetTruncated, issue.link)
    );
  }

  if (ctaEl) ctaEl.href = issue.link;

  if (issue.thumbnailUrl) {
    if (!thumbnailEl) {
      thumbnailEl = document.createElement("img");
      thumbnailEl.className = "card__thumbnail";
      thumbnailEl.alt = "";
      card.insertBefore(thumbnailEl, card.firstChild);
    }
    if (thumbnailEl.src !== issue.thumbnailUrl) {
      thumbnailEl.src = issue.thumbnailUrl;
    }
  } else if (thumbnailEl) {
    thumbnailEl.remove();
  }
}

refreshLatestNewsletter();
