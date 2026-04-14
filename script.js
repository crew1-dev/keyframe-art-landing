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

  /* ---------- Timeline / scene indicator ---------- */
  const timelineProgress = document.querySelector('.timeline-progress');
  const tlCurrent = document.querySelector('.tl-current');
  const scenes = Array.from(document.querySelectorAll('.scene'));

  const total = scenes.length;
  const tlTotal = document.querySelector('.tl-total');
  if (tlTotal) tlTotal.textContent = String(total).padStart(2, '0');

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const doc = document.documentElement;
      const scrolled = window.scrollY;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = Math.max(0, Math.min(1, scrolled / max));
      if (timelineProgress) timelineProgress.style.height = (pct * 100).toFixed(2) + '%';

      // Which scene's top is nearest the middle of the viewport
      const viewportMid = scrolled + window.innerHeight / 2;
      let current = 0;
      for (let i = 0; i < scenes.length; i++) {
        const top = scenes[i].offsetTop;
        if (viewportMid >= top) current = i;
      }
      if (tlCurrent) tlCurrent.textContent = String(current + 1).padStart(2, '0');

      ticking = false;
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- Keyboard navigation ---------- */
  const scrollToScene = (idx) => {
    idx = Math.max(0, Math.min(scenes.length - 1, idx));
    scenes[idx].scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
  };

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

  /* ---------- Subtle parallax for hero title ---------- */
  const heroTitle = document.querySelector('.title-big');
  if (heroTitle && !prefersReduced) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y > window.innerHeight * 1.5) return;
      heroTitle.style.transform = `translateY(${y * 0.18}px)`;
      heroTitle.style.opacity = String(Math.max(0, 1 - y / (window.innerHeight * 0.9)));
    }, { passive: true });
  }

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

  /* ---------- Opening fade-in on load ---------- */
  requestAnimationFrame(() => {
    const opening = document.querySelector('.scene--opening');
    if (opening) opening.classList.add('is-in');
    const openingReveals = document.querySelectorAll('.scene--opening .reveal, .scene--opening .reveal-words');
    openingReveals.forEach((el) => {
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('is-in'), 120 + delay);
    });
  });
})();
