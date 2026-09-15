/**
 * Custom Analytics Event Tracking
 * Tracks key user interactions for portfolio performance analysis
 */

(function() {
  'use strict';

  // Helper to send events to GA4
  function trackEvent(eventName, params = {}) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
    }
  }

  // Track resume downloads
  document.addEventListener('click', (e) => {
    const target = e.target.closest('a');
    if (!target) return;

    const href = target.getAttribute('href') || '';

    // Resume downloads
    if (href.includes('resume') || href.includes('Resume')) {
      trackEvent('resume_download', {
        event_category: 'engagement',
        event_label: 'Resume PDF Download',
        file_name: href.split('/').pop()
      });
    }

    // External social links
    if (target.hostname && target.hostname !== window.location.hostname) {
      const platform =
        href.includes('github.com') ? 'GitHub' :
        href.includes('linkedin.com') ? 'LinkedIn' :
        href.includes('mailto:') ? 'Email' :
        'External';

      trackEvent('social_link_click', {
        event_category: 'outbound',
        event_label: platform,
        link_url: href
      });
    }

    // Project demo clicks
    if (target.closest('[data-inline-dynamic="projects"]') ||
        href.includes('/project/')) {
      const projectTitle = target.textContent.trim() || 'Unknown Project';
      trackEvent('project_view', {
        event_category: 'content',
        event_label: projectTitle,
        link_url: href
      });
    }

    // Blog post clicks
    if (target.closest('[data-inline-dynamic="posts"]') ||
        href.includes('/post/')) {
      const postTitle = target.textContent.trim() || 'Unknown Post';
      trackEvent('blog_post_view', {
        event_category: 'content',
        event_label: postTitle,
        link_url: href
      });
    }
  });

  // Track contact form submissions
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', () => {
      trackEvent('contact_form_submit', {
        event_category: 'engagement',
        event_label: 'Contact Form Submission'
      });
    });
  }

  // Track time spent on page (engagement depth)
  let timeOnPage = 0;
  const timeInterval = setInterval(() => {
    timeOnPage += 30;
    // Track every 30 seconds, 60 seconds, 3 minutes, 5 minutes
    if ([30, 60, 180, 300].includes(timeOnPage)) {
      trackEvent('time_on_page', {
        event_category: 'engagement',
        event_label: `${timeOnPage}s`,
        value: timeOnPage
      });
    }
  }, 30000);

  // Clear interval when user leaves
  window.addEventListener('beforeunload', () => {
    clearInterval(timeInterval);
  });

  // Track scroll depth
  let maxScrollDepth = 0;
  const trackScrollDepth = () => {
    const scrollPercentage = Math.round(
      (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100
    );

    if (scrollPercentage > maxScrollDepth) {
      maxScrollDepth = scrollPercentage;

      // Track milestones: 25%, 50%, 75%, 100%
      if ([25, 50, 75, 100].includes(maxScrollDepth)) {
        trackEvent('scroll_depth', {
          event_category: 'engagement',
          event_label: `${maxScrollDepth}%`,
          value: maxScrollDepth
        });
      }
    }
  };

  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(trackScrollDepth, 150);
  }, { passive: true });

  // Track video plays (if any embedded videos)
  document.addEventListener('play', (e) => {
    if (e.target.tagName === 'VIDEO' || e.target.tagName === 'IFRAME') {
      trackEvent('video_play', {
        event_category: 'engagement',
        event_label: e.target.title || e.target.src || 'Unknown Video'
      });
    }
  }, true);

  // Track Pac-Man game interactions
  const pacmanCanvas = document.getElementById('pacmanCanvas');
  if (pacmanCanvas) {
    let gameStarted = false;
    pacmanCanvas.addEventListener('click', () => {
      if (!gameStarted) {
        trackEvent('pacman_game_start', {
          event_category: 'engagement',
          event_label: 'Pac-Man Game Started'
        });
        gameStarted = true;
      }
    }, { once: true });
  }

  // Track project demo interactions
  const flappyBirdIframe = document.querySelector('iframe[src*="flappy"]');
  if (flappyBirdIframe) {
    trackEvent('page_has_demo', {
      event_category: 'content',
      event_label: 'Flappy Bird AI Demo Present'
    });
  }

})();
