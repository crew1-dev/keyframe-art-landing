/* ============================================================
   Keyframe — Landing · scroll choreography
   ============================================================ */

(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Split text for per-word reveal ---------- */
  const splitWords = (el) => {
    if (el.dataset.split === 'done') return;
    const text = el.textContent;
    // Preserve inline HTML by walking children
    const walk = (node) => {
      const out = [];
      node.childNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          const parts = n.textContent.split(/(\s+)/);
          parts.forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              out.push(document.createTextNode(part));
            } else {
              const word = document.createElement('span');
              word.className = 'word';
              const inner = document.createElement('span');
              inner.textContent = part;
              word.appendChild(inner);
              out.push(word);
            }
          });
        } else if (n.nodeType === Node.ELEMENT_NODE) {
          // Preserve inline element but wrap each word inside
          const clone = n.cloneNode(false);
          const children = walk(n);
          children.forEach((c) => clone.appendChild(c));
          // If the element itself is inline-level, wrap its words inside a .word? No —
          // We preserve inline elements' structure and let CSS handle.
          // But we need words to animate — so we wrap the inner text nodes.
          // Simplify: treat the whole inline element as one "word" block unless it's a highlight/serif-italic.
          // For best behavior we'll just keep the clone with split children.
          out.push(clone);
        }
      });
      return out;
    };

    const replaced = walk(el);
    el.innerHTML = '';
    replaced.forEach((c) => el.appendChild(c));

    // Re-scan to assign stagger index to every .word
    const words = el.querySelectorAll('.word');
    words.forEach((w, i) => w.style.setProperty('--i', i));
    el.dataset.split = 'done';
    void text; // quiet linter
  };

  /* ---------- Reveal on intersection ---------- */
  const revealTargets = () => {
    const nodes = [];
    document.querySelectorAll('.reveal, .reveal-words').forEach((n) => nodes.push(n));
    document.querySelectorAll('.still-list li').forEach((n) => nodes.push(n));
    document.querySelectorAll('.scene').forEach((n) => nodes.push(n));
    return nodes;
  };

  // Pre-split all reveal-words
  document.querySelectorAll('.reveal-words').forEach(splitWords);

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = parseInt(el.dataset.delay || '0', 10);
        if (delay) {
          setTimeout(() => el.classList.add('is-in'), delay);
        } else {
          el.classList.add('is-in');
        }
      } else {
        // keep is-in once set for narrative pages (no repeat)
      }
    });
  }, {
    root: null,
    threshold: 0.22,
    rootMargin: '0px 0px -10% 0px'
  });

  revealTargets().forEach((n) => io.observe(n));

  /* ---------- Timeline dots ---------- */
  const scenes = Array.from(document.querySelectorAll('.scene'));
  const timelineEl = document.querySelector('.timeline');

  const scrollToScene = (idx) => {
    idx = Math.max(0, Math.min(scenes.length - 1, idx));
    scenes[idx].scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
  };

  const dots = [];
  if (timelineEl) {
    scenes.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'timeline-dot';
      dot.setAttribute('aria-label', `Go to section ${i + 1}`);
      dot.addEventListener('click', () => scrollToScene(i));
      timelineEl.appendChild(dot);
      dots.push(dot);
    });
  }

  /* ---------- "A story can" pinned rotator ---------- */
  const storyScene = document.querySelector('.scene--story-can');
  const rots    = storyScene ? Array.from(storyScene.querySelectorAll('.rot'))           : [];
  const ticks   = storyScene ? Array.from(storyScene.querySelectorAll('.sp-tick'))       : [];
  const stories = storyScene ? Array.from(storyScene.querySelectorAll('.story-scene'))   : [];

  const updateStoryRotator = () => {
    if (!storyScene || rots.length === 0) return;
    const rect = storyScene.getBoundingClientRect();
    const total = storyScene.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    const progress = Math.max(0, Math.min(0.99999, -rect.top / total));
    const N = rots.length;
    const idx = Math.min(N - 1, Math.floor(progress * N));

    // Text + ticks — keep binary switch (they have their own smooth transitions)
    rots.forEach((r, i) => {
      r.classList.toggle('is-active', i === idx);
      r.classList.toggle('is-past',   i <  idx);
    });
    ticks.forEach((t, i) => {
      t.classList.toggle('is-active', i === idx);
      t.classList.toggle('is-past',   i <  idx);
    });

    // Scenes — continuous crossfade + scrubbed entrance progress.
    // Each scene i is "fully opaque" in [i/N, (i+1)/N] with linear
    // crossfades of width FADE at each interior boundary, so pairs of
    // adjacent scenes sum to 1 opacity across the boundary.
    const FADE = 0.06;
    stories.forEach((s, i) => {
      const sceneStart = i / N;
      const sceneEnd   = (i + 1) / N;
      let alpha = 1;
      if (i > 0 && progress < sceneStart + FADE) {
        alpha *= Math.max(0, (progress - (sceneStart - FADE)) / (2 * FADE));
      }
      if (i < N - 1 && progress > sceneEnd - FADE) {
        alpha *= Math.max(0, 1 - (progress - (sceneEnd - FADE)) / (2 * FADE));
      }
      alpha = Math.max(0, Math.min(1, alpha));

      // Scene-local progress 0..1, used for scrubbing internals
      const local = Math.max(0, Math.min(1,
        (progress - sceneStart) / (sceneEnd - sceneStart)
      ));
      // Entrance progress — squashes the motion into first ~55% of the scene
      // so the "appear" animation finishes while the phrase is still active.
      const enter = Math.max(0, Math.min(1, local / 0.55));

      s.style.setProperty('--scene-alpha', alpha.toFixed(3));
      s.style.setProperty('--local-p',     local.toFixed(3));
      s.style.setProperty('--enter-p',     enter.toFixed(3));

      // Sticky "has-entered" — kicks off idle loops once, never replays
      if (alpha > 0.35 && !s.classList.contains('has-entered')) {
        s.classList.add('has-entered');
      }
    });
  };

  /* ---------- Cameras pinned scene — scrubbed progress ---------- */
  const camerasScene  = document.querySelector('.scene--cameras');
  const camerasSticky = camerasScene ? camerasScene.querySelector('.cameras-sticky') : null;

  const updateCamerasScene = () => {
    if (!camerasScene || !camerasSticky) return;
    const rect = camerasScene.getBoundingClientRect();
    const total = camerasScene.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    const progress = Math.max(0, Math.min(1, -rect.top / total));
    camerasSticky.style.setProperty('--local-p', progress.toFixed(3));
  };

  /* ---------- Persistent pen — writes in the notebook, then travels to
                each subsequent act's end-line as you scroll ------------- */
  /* The pen is a single page-level SVG (.persistent-pen → .wl-pen) that
     JS controls every frame. It has two phases:
       (1) Writing: time-based animation driven by the notebook line's
           .is-in class. Entry (520ms) + travel-across-word (1600ms).
       (2) Scroll-driven: three anchors (notebook end-of-writing,
           imagination end-of-"you need.", reveal end-of-tagline). The
           pen flies between them as the next scene approaches the top
           of the viewport. Flight is an arc with mid-flight tilt, so
           the pen feels "weighted" — it doesn't just slide between
           positions.
     Nib-tip position is (20%, 89%) of the SVG sprite. transform-origin
     is set there in CSS so the tip stays anchored when the pen rotates. */
  const penRoot = document.querySelector('.persistent-pen');
  if (penRoot && !prefersReduced) {
    const penSvg       = penRoot.querySelector('.wl-pen');
    const writingLine  = document.querySelector('.nb-line--writing');
    const writingText  = document.querySelector('.wl-text');
    const revealAnchor = document.querySelector('.pen-anchor-reveal');
    const revealScene  = document.querySelector('.scene--reveal');

    if (penSvg && writingLine && writingText && revealAnchor && revealScene) {
      // ---- Constants --------------------------------------------------
      const NIB_X_FRAC = 0.20;      // nib tip lives at 20% from pen's left
      const NIB_Y_FRAC = 0.89;      // ... and 89% from pen's top
      const WRITING_START_DELAY = 650;   // wait after .is-in for line to land
      const WRITING_ENTRY_MS    = 520;   // pen flies in from upper-right
      const WRITING_TRAVEL_MS   = 1600;  // pen travels across "writing"
      // Transition triggers — the reveal scene's top position that starts/
      // ends the pen-flight interpolation.
      const FLIGHT_START_VH = 0.58;
      const FLIGHT_END_VH   = 0.18;

      // Rest-scales per anchor
      const SCALE_NOTEBOOK = 1;
      const SCALE_REVEAL   = 4.2;
      // Rest-rotations
      const ROT_NOTEBOOK = 7;
      const ROT_REVEAL   = 2;

      // Math helpers
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const lerp = (a, b, t) => a + (b - a) * t;
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // ---- State ------------------------------------------------------
      let state = 'hidden';            // 'hidden' | 'writing-entry' | 'writing-travel' | 'scroll-driven'
      let stateStart = 0;
      let hasWritingStarted = false;   // one-shot latch for the writing phase

      // ---- Anchor measurement ----------------------------------------
      // Returns the target *nib-tip* viewport position for each anchor.
      const anchorWritingStart = () => {
        const r = writingText.getBoundingClientRect();
        return { x: r.left, y: r.bottom - r.height * 0.05 };
      };
      const anchorWritingEnd = () => {
        const r = writingText.getBoundingClientRect();
        return { x: r.right + 4, y: r.bottom - r.height * 0.05 };
      };
      const anchorRevealEnd = () => {
        // .pen-anchor-reveal is a 0×0 positional span centered in .pen-stage.
        // transform-origin is at the nib (20%, 89%) of the sprite, so scale
        // expands the pen BODY up-and-to-the-right of the nib. To visually
        // center the WHOLE pen (body + nib) on the stage, offset the nib
        // target DOWN-and-LEFT by the vector from nib to sprite-center at
        // the target scale.
        //
        // IMPORTANT: offsetWidth/offsetHeight return the layout dimensions
        // and do NOT include the CSS transform's scale. If we used
        // getBoundingClientRect().width instead, we'd be multiplying an
        // already-scaled width by the scale again, and the pen would land
        // hundreds of px off.
        const r = revealAnchor.getBoundingClientRect();
        const pw = penSvg.offsetWidth  || 72;
        const ph = penSvg.offsetHeight || 72;
        const nibToCenterX = (0.5 - NIB_X_FRAC) * pw * SCALE_REVEAL;
        const nibToCenterY = (NIB_Y_FRAC - 0.5) * ph * SCALE_REVEAL;
        return {
          x: (r.left + r.right) / 2 - nibToCenterX,
          y: (r.top + r.bottom) / 2 + nibToCenterY,
        };
      };

      // Flight-progress from nextScene's top position in the viewport
      const flightProgress = (nextScene) => {
        const top = nextScene.getBoundingClientRect().top;
        const vh = window.innerHeight;
        const start = FLIGHT_START_VH * vh;
        const end   = FLIGHT_END_VH * vh;
        return clamp01(1 - (top - end) / (start - end));
      };

      // Arc flight between two anchors — lifts up mid-flight, tilts more,
      // and interpolates scale so the pen grows on its way to the reveal.
      const flightBetween = (a1, a2, t, rot1, rot2, scale1, scale2) => {
        const eT = easeInOutCubic(t);
        const ARC_LIFT = 64; // px the pen lifts at mid-flight
        const TILT_ADD = 18; // extra tilt degrees at mid-flight
        return {
          x: lerp(a1.x, a2.x, eT),
          y: lerp(a1.y, a2.y, eT) - Math.sin(t * Math.PI) * ARC_LIFT,
          rot: lerp(rot1, rot2, eT) + Math.sin(t * Math.PI) * TILT_ADD,
          scale: lerp(scale1, scale2, eT),
        };
      };

      // ---- Apply a nib-tip position to the pen's CSS transform -------
      // Because transform-origin is at the nib (20%, 89%), scale happens
      // around the nib — the tip stays anchored to (nibX, nibY) regardless
      // of scale or rotation. Only the body pivots and grows around it.
      //
      // We use offsetWidth/offsetHeight (layout dimensions, not scaled by
      // transform) so the translate math stays correct no matter what
      // scale is currently applied. Using rect.width here would cause the
      // translate to compound with scale and the pen would skate away.
      const applyNib = (nibX, nibY, rotation, scale, opacity) => {
        const w = penSvg.offsetWidth  || 64;
        const h = penSvg.offsetHeight || 64;
        const x = nibX - w * NIB_X_FRAC;
        const y = nibY - h * NIB_Y_FRAC;
        penRoot.style.transform =
          `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ` +
          `rotate(${rotation.toFixed(2)}deg) ` +
          `scale(${scale.toFixed(3)})`;
        penRoot.style.opacity = opacity.toFixed(3);
      };

      // ---- State machine update (called every rAF) -------------------
      const update = () => {
        const now = performance.now();

        // Elapsed-time state transitions
        if (state === 'writing-entry' && now - stateStart >= WRITING_ENTRY_MS) {
          state = 'writing-travel';
          stateStart = now;
        }
        if (state === 'writing-travel' && now - stateStart >= WRITING_TRAVEL_MS) {
          state = 'scroll-driven';
          stateStart = now;
        }

        // If user has blown past the notebook scene during the writing
        // phase, cut writing short and fall into the scroll state.
        if (state === 'writing-entry' || state === 'writing-travel') {
          const revTop = revealScene.getBoundingClientRect().top;
          if (revTop < window.innerHeight * 0.45) {
            state = 'scroll-driven';
          }
        }

        // Compute pen target per current state
        switch (state) {
          case 'hidden': {
            applyNib(-500, -500, 0, 1, 0);
            break;
          }
          case 'writing-entry': {
            const t = clamp01((now - stateStart) / WRITING_ENTRY_MS);
            const eT = easeOutCubic(t);
            const a = anchorWritingStart();
            const wordW = writingText.getBoundingClientRect().width;
            // Start: +85% word-width right, -90px up, tilted 28°
            const offX = lerp(wordW * 0.85, 0, eT);
            const offY = lerp(-90,          0, eT);
            const rot  = lerp(28,           ROT_NOTEBOOK, eT);
            const op   = clamp01(t * 1.6);
            applyNib(a.x + offX, a.y + offY, rot, SCALE_NOTEBOOK, op);
            break;
          }
          case 'writing-travel': {
            const t = clamp01((now - stateStart) / WRITING_TRAVEL_MS);
            const a = anchorWritingStart();
            const wordW = writingText.getBoundingClientRect().width;
            // Subtle hand-held wobble
            const wobbleY = Math.sin(t * Math.PI * 3) * 2;
            const wobbleR = Math.sin(t * Math.PI * 2) * 1;
            applyNib(a.x + wordW * t, a.y + wobbleY, ROT_NOTEBOOK + wobbleR - 1, SCALE_NOTEBOOK, 1);
            break;
          }
          case 'scroll-driven': {
            // Single leg: notebook → reveal. When the reveal scene's top
            // crosses ~58% of the viewport, the pen starts flying toward
            // its hero position; when it's at ~18%, the flight completes.
            const a1 = anchorWritingEnd();
            const a3 = anchorRevealEnd();
            const p = flightProgress(revealScene);

            let target;
            if (p >= 1) {
              target = { x: a3.x, y: a3.y, rot: ROT_REVEAL, scale: SCALE_REVEAL };
            } else if (p > 0) {
              target = flightBetween(a1, a3, p, ROT_NOTEBOOK, ROT_REVEAL, SCALE_NOTEBOOK, SCALE_REVEAL);
            } else {
              target = { x: a1.x, y: a1.y, rot: ROT_NOTEBOOK, scale: SCALE_NOTEBOOK };
            }
            applyNib(target.x, target.y, target.rot, target.scale, 1);
            break;
          }
        }

        requestAnimationFrame(update);
      };

      // ---- Kick things off -------------------------------------------
      // Case A: page load with notebook already past the viewport — skip
      // writing, put the pen into scroll-driven state directly.
      const startInScrollDriven = () => {
        if (hasWritingStarted) return;
        hasWritingStarted = true;
        state = 'scroll-driven';
        stateStart = performance.now();
      };
      if (writingLine.getBoundingClientRect().bottom < 0) {
        startInScrollDriven();
      }

      // Case B: listen for the writing line's .is-in class to trigger writing.
      const classObserver = new MutationObserver(() => {
        if (writingLine.classList.contains('is-in') && !hasWritingStarted) {
          hasWritingStarted = true;
          // If user is already well past the notebook when .is-in fires
          // (unlikely but possible), skip to scroll-driven.
          if (revealScene.getBoundingClientRect().top < window.innerHeight * 0.45) {
            state = 'scroll-driven';
            stateStart = performance.now();
          } else {
            setTimeout(() => {
              if (state === 'hidden') {
                state = 'writing-entry';
                stateStart = performance.now();
              }
            }, WRITING_START_DELAY);
          }
        }
      });
      classObserver.observe(writingLine, { attributes: true, attributeFilter: ['class'] });
      // Also check current state (in case .is-in was already set before observer attached)
      if (writingLine.classList.contains('is-in') && !hasWritingStarted) {
        hasWritingStarted = true;
        setTimeout(() => {
          if (state === 'hidden') {
            state = 'writing-entry';
            stateStart = performance.now();
          }
        }, WRITING_START_DELAY);
      }

      // Start the rAF loop. Cheap — only reads layout + writes transform.
      requestAnimationFrame(update);
    }
  }

  /* ---------- Ledger pinned scene — scrubbed progress ---------- */
  const ledgerScene  = document.querySelector('.scene--ledger');
  const ledgerSticky = ledgerScene ? ledgerScene.querySelector('.ledger-sticky') : null;

  const updateLedgerScene = () => {
    if (!ledgerScene || !ledgerSticky) return;
    const rect = ledgerScene.getBoundingClientRect();
    const total = ledgerScene.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    const progress = Math.max(0, Math.min(1, -rect.top / total));
    ledgerSticky.style.setProperty('--local-p', progress.toFixed(3));
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const viewportMid = window.scrollY + window.innerHeight / 2;
      let current = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (viewportMid >= scenes[i].offsetTop) current = i;
      }
      dots.forEach((d, i) => {
        d.classList.toggle('is-current', i === current);
        d.classList.toggle('is-past', i < current);
      });
      updateStoryRotator();
      updateCamerasScene();
      updateLedgerScene();
      ticking = false;
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  const currentSceneIndex = () => {
    const mid = window.scrollY + window.innerHeight / 2;
    let cur = 0;
    scenes.forEach((s, i) => { if (mid >= s.offsetTop) cur = i; });
    return cur;
  };

  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
      e.preventDefault();
      scrollToScene(currentSceneIndex() + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
      e.preventDefault();
      scrollToScene(currentSceneIndex() - 1);
    } else if (e.key === 'Home') {
      e.preventDefault(); scrollToScene(0);
    } else if (e.key === 'End') {
      e.preventDefault(); scrollToScene(scenes.length - 1);
    }
  });

  /* ---------- Signup fake-submit ---------- */
  const form = document.querySelector('.signup');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type=email]');
      const ok = form.querySelector('#signup-ok');
      if (!input || !ok) return;
      const val = (input.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        ok.textContent = 'Enter a valid email.';
        ok.style.color = 'var(--crimson)';
        ok.classList.add('is-visible');
        return;
      }
      ok.textContent = 'Added. We will be in touch.';
      ok.style.color = 'var(--amber)';
      ok.classList.add('is-visible');
      input.value = '';
      input.blur();
    });
  }

  /* ---------- First-scene fade-in on load ---------- */
  requestAnimationFrame(() => {
    const first = scenes[0];
    if (!first) return;
    first.classList.add('is-in');
    first.querySelectorAll('.reveal, .reveal-words').forEach((el) => {
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('is-in'), 180 + delay);
    });
  });

  /* ---------- "It's a story" reel ---------- */
  const reelTrack = document.querySelector('.reel-track');
  if (reelTrack) {
    const populate = (manifest) => {
      const frames = (manifest && manifest.frames) || [];
      if (frames.length === 0) return;
      const frag = document.createDocumentFragment();
      // Two copies for seamless -50% translate loop.
      for (let pass = 0; pass < 2; pass++) {
        frames.forEach((frame, i) => {
          const fig = document.createElement('figure');
          fig.className = 'reel-frame';
          const img = document.createElement('img');
          img.src = `assets/reel/${frame.file}`;
          img.alt = '';
          img.title = frame.label || '';
          img.loading = (pass === 0 && i < 10) ? 'eager' : 'lazy';
          img.decoding = 'async';
          img.draggable = false;
          fig.appendChild(img);
          frag.appendChild(fig);
        });
      }
      reelTrack.appendChild(frag);
    };

    // Prefer the inline manifest (works on file:// where fetch is blocked).
    if (window.__REEL_MANIFEST) {
      populate(window.__REEL_MANIFEST);
    } else {
      fetch('assets/reel/manifest.json', { cache: 'force-cache' })
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then(populate)
        .catch((err) => console.warn('reel manifest unavailable:', err));
    }
  }
})();
