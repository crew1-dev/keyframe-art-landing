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
  const rots  = storyScene ? Array.from(storyScene.querySelectorAll('.rot'))    : [];
  const ticks = storyScene ? Array.from(storyScene.querySelectorAll('.sp-tick')) : [];

  const updateStoryRotator = () => {
    if (!storyScene || rots.length === 0) return;
    const rect = storyScene.getBoundingClientRect();
    const total = storyScene.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    const progress = Math.max(0, Math.min(0.99999, -rect.top / total));
    const idx = Math.floor(progress * rots.length);
    rots.forEach((r, i) => {
      r.classList.toggle('is-active', i === idx);
      r.classList.toggle('is-past',   i <  idx);
    });
    ticks.forEach((t, i) => {
      t.classList.toggle('is-active', i === idx);
      t.classList.toggle('is-past',   i <  idx);
    });
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
