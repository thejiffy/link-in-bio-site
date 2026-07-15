// Custom podcast player controls.
//
// Replaces the browser's native <audio controls> UI (which can't be
// restyled beyond its default pill shape) with our own play/pause button
// and scrubber, driven by a plain <audio> element with no controls
// attribute. No dependencies, no third-party embed.

function formatTime(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function setUpPlayer(playerEl) {
  const audio = playerEl.querySelector("[data-podcast-audio]");
  const toggle = playerEl.querySelector("[data-podcast-toggle]");
  const scrubber = playerEl.querySelector("[data-podcast-scrubber]");
  const elapsedEl = playerEl.querySelector("[data-podcast-elapsed]");
  const durationEl = playerEl.querySelector("[data-podcast-duration]");

  toggle.addEventListener("click", () => {
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  });

  // Toggle a class on the player rather than setting `.hidden` on the
  // icon <svg>s directly — the `hidden` IDL property isn't reliably
  // implemented for SVG elements across browsers, so it can silently
  // fail to show/hide them even though everything else in this handler
  // (e.g. the aria-label below) runs fine. Plain CSS display swaps via
  // a class always work.
  audio.addEventListener("play", () => {
    playerEl.classList.add("is-playing");
    toggle.setAttribute("aria-label", "Pause episode");
  });

  audio.addEventListener("pause", () => {
    playerEl.classList.remove("is-playing");
    toggle.setAttribute("aria-label", "Play episode");
  });

  audio.addEventListener("loadedmetadata", () => {
    scrubber.max = audio.duration;
    durationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener("timeupdate", () => {
    scrubber.value = audio.currentTime;
    elapsedEl.textContent = formatTime(audio.currentTime);
  });

  scrubber.addEventListener("input", () => {
    audio.currentTime = Number(scrubber.value);
  });
}

document.querySelectorAll("[data-podcast-player]").forEach(setUpPlayer);
