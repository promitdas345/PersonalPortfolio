/* Portfolio behaviour: theme, mobile nav, project filter, scroll-spy, reveal. */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ── theme, remembered per browser ──────────────────────── */

  var THEME_KEY = 'pd-theme';

  function readStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (err) {
      return null;   // private window, or storage blocked
    }
  }

  function storeTheme(value) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch (err) {
      /* nothing to do — the page still works, it just forgets */
    }
  }

  var stored = readStoredTheme();
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    root.setAttribute('data-theme', 'light');
  }

  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      storeTheme(next);
    });
  }

  /* ── mobile navigation ──────────────────────────────────── */

  var navToggle = document.getElementById('navToggle');
  var navMenu = document.getElementById('navMenu');

  function closeNav() {
    if (!navMenu) return;
    navMenu.classList.remove('is-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function () {
      var open = navMenu.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    navMenu.addEventListener('click', function (event) {
      if (event.target.tagName === 'A') closeNav();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeNav();
    });
  }

  /* ── project filter ─────────────────────────────────────── */

  var filters = document.getElementById('filters');
  var cards = Array.prototype.slice.call(document.querySelectorAll('#cards .card'));
  var empty = document.getElementById('empty');

  if (filters && cards.length) {
    filters.addEventListener('click', function (event) {
      var button = event.target.closest('.chip');
      if (!button) return;

      var wanted = button.dataset.filter;
      filters.querySelectorAll('.chip').forEach(function (chip) {
        chip.classList.toggle('is-active', chip === button);
      });

      var shown = 0;
      cards.forEach(function (card) {
        var tech = (card.dataset.tech || '').split(',');
        var match = wanted === 'all' || tech.indexOf(wanted) !== -1;
        card.classList.toggle('is-hidden', !match);
        if (match) shown++;
      });

      if (empty) empty.hidden = shown > 0;
    });
  }

  /* ── highlight the section you are reading ──────────────── */

  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var navLinks = {};
  document.querySelectorAll('.nav-menu a[href^="#"]').forEach(function (link) {
    navLinks[link.getAttribute('href').slice(1)] = link;
  });

  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = navLinks[entry.target.id];
        if (link && entry.isIntersecting) {
          Object.keys(navLinks).forEach(function (id) {
            navLinks[id].classList.toggle('is-current', id === entry.target.id);
          });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (section) { spy.observe(section); });
  }

  /* ── reveal on scroll ───────────────────────────────────── */

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealable = document.querySelectorAll('.section, .play-card, .card');

  if (!reduced && 'IntersectionObserver' in window) {
    revealable.forEach(function (el) { el.classList.add('reveal'); });

    var shower = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });

    revealable.forEach(function (el) { shower.observe(el); });

    // Failsafe: nothing may stay invisible because an observer never fired — a print
    // render, a prerender, or a browser that reports zero intersections on load.
    setTimeout(function () {
      revealable.forEach(function (el) { el.classList.add('is-in'); });
    }, 1200);
  }

  /* ── footer year ────────────────────────────────────────── */

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
