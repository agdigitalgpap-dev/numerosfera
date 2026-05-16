/**
 * NUMEROSFERA — Audio Manager
 * Persistent ambient audio across all quiz pages.
 * Starts on first user interaction, fades out when VSL begins.
 */
(function () {
  'use strict';

  const TARGET_VOL   = 0.28;   // 28% — suave, imersivo
  const FADE_IN_MS   = 1600;
  const FADE_OUT_MS  = 1200;
  const FADE_STEP_MS = 40;

  // Path relative to caller (root or /pages/)
  const inPages = window.location.pathname.replace(/\\/g, '/').includes('/pages/');
  const SRC = (inPages ? '../' : '') + 'Briefing/AUDIO/audio loop.mp3';

  let audio     = null;
  let fadeTimer = null;

  /* ─── Internal helpers ─── */

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(SRC);
    audio.loop    = true;
    audio.volume  = 0;
    audio.preload = 'auto';
    return audio;
  }

  function clearFade() {
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  }

  function fadeIn() {
    clearFade();
    const a = ensureAudio();
    a.volume = 0;

    const inc   = TARGET_VOL / (FADE_IN_MS / FADE_STEP_MS);
    fadeTimer   = setInterval(() => {
      const next = Math.min(a.volume + inc, TARGET_VOL);
      a.volume   = next;
      if (next >= TARGET_VOL) clearFade();
    }, FADE_STEP_MS);
  }

  function tryPlay() {
    const a = ensureAudio();
    if (!a.paused) return;               // already playing
    const p = a.play();
    if (p && p.catch) p.catch(() => {}); // swallow autoplay-policy errors silently
  }

  /* ─── Public API ─── */

  window.AudioManager = {

    /**
     * Call once on the very first user interaction (sign click on Page 1).
     * Saves state so subsequent pages resume automatically.
     */
    start() {
      if (localStorage.getItem('audioStarted') === 'true') return;
      localStorage.setItem('audioStarted', 'true');
      tryPlay();
      fadeIn();
    },

    /**
     * Auto-resume on pages 2-9 and VSL overlay.
     * Called automatically on DOMContentLoaded.
     */
    resume() {
      if (localStorage.getItem('audioStarted') !== 'true') return;
      tryPlay();
      fadeIn();
    },

    /**
     * Smooth fade-out + pause. Used when VSL video starts.
     * @param {Function} [cb] - optional callback after fade completes
     */
    fadeOut(cb) {
      clearFade();
      const a = ensureAudio();
      if (!a || a.paused) { if (cb) cb(); return; }

      const startVol = a.volume;
      const dec      = startVol / (FADE_OUT_MS / FADE_STEP_MS);

      fadeTimer = setInterval(() => {
        const next = Math.max(a.volume - dec, 0);
        a.volume   = next;
        if (next <= 0) {
          a.pause();
          a.volume = 0;
          clearFade();
          if (cb) cb();
        }
      }, FADE_STEP_MS);
    },

    /** Hard stop + clear localStorage flag. */
    stop() {
      clearFade();
      if (audio) { audio.pause(); audio.volume = 0; }
      localStorage.removeItem('audioStarted');
    },

    /** True while audio is actively playing. */
    isPlaying() {
      return audio ? !audio.paused : false;
    }
  };

  /* ─── Auto-resume on each page load ─── */
  function onReady() {
    if (localStorage.getItem('audioStarted') === 'true') {
      // Tiny delay — lets the browser finish painting before we attempt play
      setTimeout(() => AudioManager.resume(), 80);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

})();
