(function () {
  'use strict';

  const controls = document.querySelector('[data-reaction-controls]');
  if (!controls) return;

  const main = document.querySelector('main[data-post-slug]');
  const slug = controls.getAttribute('data-post-slug') || (main && main.getAttribute('data-post-slug')) || '';
  if (!slug) return;

  const status = document.createElement('p');
  status.className = 'reaction-status';
  controls.insertAdjacentElement('afterend', status);

  function setStatus(message, variant) {
    status.textContent = message || '';
    status.classList.remove('success', 'error');
    if (variant) status.classList.add(variant);
  }

  function updateReactionCounts(reactions) {
    ['like', 'celebrate', 'support', 'insightful'].forEach(type => {
      const count = controls.querySelector(`[data-reaction-count="${type}"]`);
      if (!count) return;
      const value = Number(reactions[type]);
      count.textContent = Number.isFinite(value) ? String(Math.max(0, Math.floor(value))) : '0';
    });
  }

  controls.addEventListener('click', async event => {
    const button = event.target.closest('[data-reaction-button]');
    if (!button) return;

    const type = String(button.getAttribute('data-reaction-button') || '').trim().toLowerCase();
    if (!type) return;

    button.disabled = true;
    setStatus('Saving reaction...');

    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(slug)}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.success === false) {
        throw new Error((payload && payload.error) || `Request failed (${response.status}).`);
      }
      updateReactionCounts(payload.reactions || {});
      setStatus('Reaction saved.', 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
})();
