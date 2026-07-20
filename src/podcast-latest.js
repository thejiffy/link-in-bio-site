// Refreshes the podcast card with the newest episode from
// /api/latest-episode (a Cloudflare Pages Function that reads the RSS feed
// at request time) — so this page shows a freshly-published episode
// without needing a redeploy.
//
// The episode baked in at the last build by scripts/build.js stays on
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

async function refreshLatestEpisode() {
  const playerEl = document.querySelector("[data-podcast-player]");
  if (!playerEl) return;

  const card = playerEl.closest(".card");
  if (!card) return;

  let episode;
  try {
    const response = await fetch("/api/latest-episode");
    if (!response.ok) return;
    episode = await response.json();
  } catch (error) {
    return;
  }

  if (!episode || !episode.audioUrl) return;

  const dateEl = card.querySelector(".card__date");
  const titleLinkEl = card.querySelector(".card__title a");
  const snippetEl = card.querySelector(".card__snippet");
  const audio = playerEl.querySelector("[data-podcast-audio]");
  const downloadLink = audio ? audio.querySelector("a") : null;

  if (dateEl) dateEl.textContent = episode.date;

  if (titleLinkEl) {
    titleLinkEl.textContent = episode.title;
    titleLinkEl.href = episode.link;
  }

  if (snippetEl) {
    snippetEl.replaceChildren(
      ...buildSnippetNodes(episode.snippetText, episode.snippetTruncated, episode.link)
    );
  }

  if (downloadLink) downloadLink.href = episode.audioUrl;

  if (audio && audio.getAttribute("src") !== episode.audioUrl) {
    audio.pause();
    audio.setAttribute("src", episode.audioUrl);
    audio.load();
  }
}

refreshLatestEpisode();
