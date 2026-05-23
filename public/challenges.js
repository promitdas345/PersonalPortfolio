/**
 * challenges.js
 * 
 * Vanilla JavaScript for the Codecrafters-style coding challenges platform.
 * Adds interactivity on top of server-rendered HTML.
 * 
 * Features:
 *  - Stage navigation with hash-based routing
 *  - Code block copy-to-clipboard
 *  - Collapsible hint boxes
 *  - localStorage-based progress tracking
 *  - Stage completion with auto-advance & celebration
 *  - Scroll-triggered animations
 *  - Terminal typing animations
 */
(() => {
  'use strict';

  // =========================================================================
  // 1. CHALLENGE PROGRESS (localStorage-based)
  // =========================================================================

  const STORAGE_KEY = 'codecrafters_progress';

  /**
   * Manages per-challenge stage completion progress in localStorage.
   */
  const ChallengeProgress = {
    /**
     * Read the entire progress map from localStorage.
     * @returns {Object} - { [challengeId]: { completed: number[] } }
     */
    _read() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      } catch {
        return {};
      }
    },

    /**
     * Persist the progress map to localStorage.
     * @param {Object} data
     */
    _write(data) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn('ChallengeProgress: failed to write localStorage', e);
      }
    },

    /**
     * Mark a specific stage as completed.
     * @param {string} challengeId
     * @param {number} stageIndex - 0-based index
     */
    markStageComplete(challengeId, stageIndex) {
      const data = this._read();
      if (!data[challengeId]) {
        data[challengeId] = { completed: [] };
      }
      if (!data[challengeId].completed.includes(stageIndex)) {
        data[challengeId].completed.push(stageIndex);
        data[challengeId].completed.sort((a, b) => a - b);
      }
      this._write(data);
    },

    /**
     * Check whether a stage has been completed.
     * @param {string} challengeId
     * @param {number} stageIndex
     * @returns {boolean}
     */
    isStageComplete(challengeId, stageIndex) {
      const data = this._read();
      return data[challengeId]?.completed?.includes(stageIndex) ?? false;
    },

    /**
     * Get aggregate progress for a challenge.
     * @param {string} challengeId
     * @param {number} [total] - total number of stages (auto-detected from DOM if omitted)
     * @returns {{ completed: number, total: number }}
     */
    getProgress(challengeId, total) {
      const data = this._read();
      const completedStages = data[challengeId]?.completed ?? [];
      // If total is not supplied, try to detect from the DOM
      const stageCount = total ?? document.querySelectorAll('.stage-item').length || 0;
      return { completed: completedStages.length, total: stageCount };
    },

    /**
     * Reset all progress for a given challenge.
     * @param {string} challengeId
     */
    resetProgress(challengeId) {
      const data = this._read();
      delete data[challengeId];
      this._write(data);
    },
  };

  // Expose ChallengeProgress globally for potential external use
  window.ChallengeProgress = ChallengeProgress;

  // =========================================================================
  // 2. STAGE NAVIGATION
  // =========================================================================

  /**
   * Handles sidebar stage selection, prev/next buttons, and fade transitions
   * between stage content panels.
   */
  const initStageNavigation = () => {
    const stageItems = document.querySelectorAll('.stage-item');
    const stagePanels = document.querySelectorAll('[data-stage-panel]');
    const prevBtn = document.getElementById('prev-stage-btn');
    const nextBtn = document.getElementById('next-stage-btn');
    const completeBtn = document.getElementById('complete-stage-btn');

    if (!stageItems.length || !stagePanels.length) return;

    let currentIndex = 0;

    /**
     * Navigate to a stage by index.
     * @param {number} index - 0-based stage index
     * @param {boolean} [pushHash=true] - whether to update the URL hash
     */
    const goToStage = (index, pushHash = true) => {
      if (index < 0 || index >= stagePanels.length) return;

      // Hide all panels, show the target
      stagePanels.forEach((panel, i) => {
        panel.classList.toggle('stage-content--active', i === index);
      });

      // Update sidebar active state
      stageItems.forEach((item, i) => {
        item.classList.toggle('stage-item--active', i === index);
        item.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });

      currentIndex = index;

      // Update URL hash
      if (pushHash) {
        history.replaceState(null, '', `#stage-${index + 1}`);
      }

      // Toggle prev/next button states
      if (prevBtn) prevBtn.disabled = index === 0;
      if (nextBtn) nextBtn.disabled = index === stagePanels.length - 1;

      // Update complete button state
      const challengeId = document.querySelector('[data-challenge-id]')?.dataset.challengeId || 'default';
      if (completeBtn) {
        if (ChallengeProgress.isStageComplete(challengeId, index)) {
          completeBtn.textContent = '✓ Completed';
          completeBtn.disabled = true;
          completeBtn.classList.add('stage-nav__complete--done');
        } else {
          completeBtn.textContent = '✓ Mark Complete';
          completeBtn.disabled = false;
          completeBtn.classList.remove('stage-nav__complete--done');
        }
      }

      // Scroll to top of content
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Click handlers for sidebar stage items
    stageItems.forEach((item, i) => {
      item.addEventListener('click', () => goToStage(i));
    });

    // Previous / Next buttons
    if (prevBtn) prevBtn.addEventListener('click', () => goToStage(currentIndex - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToStage(currentIndex + 1));

    // Expose goToStage for other modules
    window.__goToStage = goToStage;
    window.__getStageCount = () => stagePanels.length;
    window.__getCurrentStageIndex = () => currentIndex;

    // Initialise: first panel is already active via HTML class
    goToStage(0, false);

    return { goToStage };
  };

  // =========================================================================
  // 3. CODE BLOCK COPY
  // =========================================================================

  /**
   * Adds click handlers to all `.code-block__copy` buttons so users can copy
   * code snippets to the clipboard.
   */
  const initCodeCopy = () => {
    const copyButtons = document.querySelectorAll('.code-block__copy');

    copyButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        // Locate the sibling code element
        const codeBlock =
          btn.closest('.code-block')?.querySelector('code, pre') ||
          btn.parentElement?.querySelector('code, pre');

        if (!codeBlock) return;

        const text = codeBlock.innerText;

        try {
          // Modern clipboard API
          await navigator.clipboard.writeText(text);
          showCopiedFeedback(btn);
        } catch {
          // Fallback for older browsers
          fallbackCopyText(text);
          showCopiedFeedback(btn);
        }
      });
    });
  };

  /**
   * Temporarily replace button text with "Copied!" feedback.
   * @param {HTMLElement} btn
   */
  const showCopiedFeedback = (btn) => {
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('code-block__copy--success');
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = originalText || 'Copy';
      btn.classList.remove('code-block__copy--success');
      btn.disabled = false;
    }, 2000);
  };

  /**
   * Fallback clipboard copy using a hidden textarea.
   * @param {string} text
   */
  const fallbackCopyText = (text) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      console.warn('Fallback copy failed', e);
    }
    document.body.removeChild(textarea);
  };

  // =========================================================================
  // 4. HINT TOGGLE
  // =========================================================================

  /**
   * Makes `.hint-box` elements collapsible with a smooth slide animation
   * driven by max-height transitions.
   */
  const initHints = () => {
    const hintBoxes = document.querySelectorAll('.hint-box');

    hintBoxes.forEach((box) => {
      const header = box.querySelector('.hint-box__header, .hint-header');
      const content = box.querySelector('.hint-box__content, .hint-content');
      const chevron = box.querySelector('.hint-box__chevron, .hint-chevron');

      if (!header || !content) return;

      // Start collapsed
      content.style.maxHeight = '0';
      content.style.overflow = 'hidden';
      content.style.transition = 'max-height 0.35s ease';
      box.classList.add('hint-box--collapsed');

      header.style.cursor = 'pointer';
      header.setAttribute('role', 'button');
      header.setAttribute('aria-expanded', 'false');
      header.tabIndex = 0;

      const toggle = () => {
        const isCollapsed = box.classList.contains('hint-box--collapsed');

        if (isCollapsed) {
          // Expand: set max-height to the scroll height so CSS can transition
          content.style.maxHeight = `${content.scrollHeight}px`;
          box.classList.remove('hint-box--collapsed');
          box.classList.add('hint-box--expanded');
          header.setAttribute('aria-expanded', 'true');
          if (chevron) chevron.classList.add('hint-chevron--open');
        } else {
          // Collapse
          content.style.maxHeight = '0';
          box.classList.add('hint-box--collapsed');
          box.classList.remove('hint-box--expanded');
          header.setAttribute('aria-expanded', 'false');
          if (chevron) chevron.classList.remove('hint-chevron--open');
        }
      };

      header.addEventListener('click', toggle);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  };

  // =========================================================================
  // 5. STAGE COMPLETION
  // =========================================================================

  /**
   * Handles "Mark as Complete" buttons. On click:
   *  - Persists completion to localStorage
   *  - Updates sidebar checkmark
   *  - Auto-advances to the next stage after a brief delay
   *  - Updates any progress bars / progress rings
   *  - Shows a celebration animation on final stage completion
   */
  const initStageCompletion = () => {
    const challengeId =
      document.querySelector('[data-challenge-id]')?.dataset.challengeId || 'default';
    const completeBtn = document.getElementById('complete-stage-btn');

    // Restore previously completed stages visually
    restoreProgressUI(challengeId);

    if (!completeBtn) return;

    completeBtn.addEventListener('click', () => {
      const stageIndex = window.__getCurrentStageIndex?.() ?? 0;

      // Mark complete in storage
      ChallengeProgress.markStageComplete(challengeId, stageIndex);

      // Visual updates
      markSidebarStageComplete(stageIndex);
      updateProgressUI(challengeId);

      // Update button state
      completeBtn.disabled = true;
      completeBtn.textContent = '✓ Completed';
      completeBtn.classList.add('stage-nav__complete--done');

      const totalStages = window.__getStageCount?.() || document.querySelectorAll('.stage-item').length;

      if (stageIndex === totalStages - 1) {
        // Final stage — celebrate! 🎉
        showCompletionCelebration();
        // Also show the built-in overlay
        const overlay = document.getElementById('challenge-complete');
        if (overlay) overlay.style.display = '';
      } else {
        // Auto-advance to the next stage after a short delay
        setTimeout(() => {
          window.__goToStage?.(stageIndex + 1);
        }, 600);
      }
    });
  };

  /**
   * Add a checkmark to the sidebar stage item at the given index.
   * @param {number} stageIndex
   */
  const markSidebarStageComplete = (stageIndex) => {
    const stageItems = document.querySelectorAll('.stage-item');
    const item = stageItems[stageIndex];
    if (!item) return;

    item.classList.add('stage-item--completed');

    // Insert a checkmark icon if not already present
    if (!item.querySelector('.stage-checkmark')) {
      const check = document.createElement('span');
      check.className = 'stage-checkmark';
      check.textContent = '✓';
      check.setAttribute('aria-label', 'Completed');
      item.appendChild(check);
    }
  };

  /**
   * Restore visual completion state from localStorage on load.
   * @param {string} challengeId
   */
  const restoreProgressUI = (challengeId) => {
    const stageItems = document.querySelectorAll('.stage-item');
    stageItems.forEach((_, i) => {
      if (ChallengeProgress.isStageComplete(challengeId, i)) {
        markSidebarStageComplete(i);

        // Also update the "Mark as Complete" button inside the corresponding panel
        const panels = document.querySelectorAll('.stage-content');
        const btn = panels[i]?.querySelector('.stage-complete-btn, [data-complete-stage]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = '✓ Completed';
          btn.classList.add('stage-complete-btn--done');
        }
      }
    });

    updateProgressUI(challengeId);
  };

  /**
   * Update progress bars and progress rings in the DOM.
   * @param {string} challengeId
   */
  const updateProgressUI = (challengeId) => {
    const { completed, total } = ChallengeProgress.getProgress(challengeId);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Progress bar (linear)
    const bar = document.getElementById('challenge-progress-bar');
    if (bar) {
      bar.style.width = `${pct}%`;
    }

    // Progress label
    const label = document.getElementById('challenge-progress-label');
    if (label) {
      label.textContent = `${completed} / ${total} stages completed`;
    }

    // Also update card progress bars on listing page
    document.querySelectorAll('.progress-bar__fill').forEach(fill => {
      fill.style.width = `${pct}%`;
    });
  };

  /**
   * Show a confetti-like CSS celebration overlay when the final stage is
   * completed.
   */
  const showCompletionCelebration = () => {
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    overlay.setAttribute('aria-live', 'polite');

    // Generate confetti pieces
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#f39c12'];
    const confettiCount = 60;

    for (let i = 0; i < confettiCount; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.cssText = `
        --x: ${Math.random() * 100}vw;
        --delay: ${Math.random() * 0.5}s;
        --rotation: ${Math.random() * 720 - 360}deg;
        --color: ${colors[i % colors.length]};
        left: var(--x);
        animation-delay: var(--delay);
        background: var(--color);
      `;
      overlay.appendChild(piece);
    }

    // Celebration message
    const message = document.createElement('div');
    message.className = 'celebration-message';
    message.innerHTML = `
      <h2>🎉 Challenge Complete!</h2>
      <p>Congratulations — you've mastered every stage.</p>
    `;
    overlay.appendChild(message);

    document.body.appendChild(overlay);

    // Remove after animation finishes
    setTimeout(() => {
      overlay.classList.add('celebration-overlay--fade-out');
      overlay.addEventListener('transitionend', () => overlay.remove());
      // Safety net in case transitionend doesn't fire
      setTimeout(() => overlay.remove(), 1000);
    }, 3500);
  };

  // =========================================================================
  // 6. ANIMATE ON SCROLL
  // =========================================================================

  /**
   * Uses IntersectionObserver to add `.animate-in` to elements bearing a
   * `data-animate` attribute when they scroll into view. Grid items are
   * staggered with a CSS custom property.
   */
  const initScrollAnimations = () => {
    const animatables = document.querySelectorAll('[data-animate]');
    if (!animatables.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    animatables.forEach((el, i) => {
      // Stagger delay for grid items
      const parent = el.parentElement;
      const isGridItem =
        parent &&
        (getComputedStyle(parent).display === 'grid' ||
          parent.classList.contains('challenges-grid'));

      if (isGridItem) {
        const siblings = Array.from(parent.children);
        const positionInGrid = siblings.indexOf(el);
        el.style.setProperty('--stagger-delay', `${positionInGrid * 80}ms`);
      }

      observer.observe(el);
    });
  };

  // =========================================================================
  // 7. TERMINAL ANIMATION
  // =========================================================================

  /**
   * For `.terminal-output` elements with `data-animate-terminal="true"`,
   * types out the text content character by character when the element
   * enters the viewport, with a blinking cursor at the end.
   */
  const initTerminalAnimations = () => {
    const terminals = document.querySelectorAll(
      '.terminal-output[data-animate-terminal="true"]'
    );
    if (!terminals.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            typeTerminalContent(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    terminals.forEach((terminal) => {
      const body = terminal.querySelector('.terminal-output__body');
      if (!body) return;
      // Stash the original text and clear the body content
      body.dataset._originalText = body.textContent;
      body.textContent = '';
      observer.observe(terminal);
    });
  };

  /**
   * Types text into a terminal element one character at a time.
   * @param {HTMLElement} terminal
   */
  const typeTerminalContent = (terminal) => {
    const body = terminal.querySelector('.terminal-output__body');
    if (!body) return;
    const fullText = body.dataset._originalText || '';
    let charIndex = 0;
    const speed = 15; // ms per character

    // Create a cursor element
    const cursor = document.createElement('span');
    cursor.className = 'terminal-cursor';
    cursor.textContent = '█';
    cursor.style.cssText = 'animation: terminalBlink 1s step-end infinite; color: #4ade80;';
    body.appendChild(cursor);

    const type = () => {
      if (charIndex < fullText.length) {
        const char = fullText[charIndex];
        const textNode = document.createTextNode(char);
        body.insertBefore(textNode, cursor);
        charIndex++;

        // Variable speed: pause longer on newlines for realism
        const delay = char === '\n' ? speed * 4 : speed;
        setTimeout(type, delay);
      } else {
        // Finished typing — cursor keeps blinking
        cursor.classList.add('terminal-cursor--blink');
      }
    };

    type();
  };

  // =========================================================================
  // 8. HASH-BASED STAGE ROUTING
  // =========================================================================

  /**
   * Reads `#stage-N` from the URL and navigates to the appropriate stage.
   * Listens for `hashchange` to support browser back/forward.
   */
  const initHashRouting = () => {
    const navigateToHash = () => {
      const hash = window.location.hash; // e.g. "#stage-3"
      const match = hash.match(/^#stage-(\d+)$/);
      if (match) {
        const stageNumber = parseInt(match[1], 10);
        const stageIndex = stageNumber - 1; // convert to 0-based
        window.__goToStage?.(stageIndex, false);
      }
    };

    // Navigate on initial load
    navigateToHash();

    // Support browser back/forward
    window.addEventListener('hashchange', navigateToHash);
  };

  // =========================================================================
  // 9. PAGE INITIALISATION
  // =========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    const isListingPage = !!document.querySelector('.challenges-grid');
    const isDetailPage = !!document.querySelector('.challenge-layout');

    // --- Features common to all pages ---
    initScrollAnimations();
    initTerminalAnimations();

    if (isDetailPage) {
      // Detail / challenge page specific
      initStageNavigation();
      initCodeCopy();
      initHints();
      initStageCompletion();
      initHashRouting();
    }

    if (isListingPage) {
      // Listing page — code copy and hints might still appear in previews
      initCodeCopy();
    }
  });
})();
