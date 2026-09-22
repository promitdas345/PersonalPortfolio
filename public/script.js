document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const statusEl = document.getElementById('formStatus');
  if (!form || !statusEl) return;

  const contactAddress = 'promitd@mun.ca';

  const setStatus = (message, variant) => {
    statusEl.textContent = message;
    statusEl.classList.remove('success', 'error');
    if (variant) statusEl.classList.add(variant);
  };

  /**
   * The static build (GitHub Pages, the CS server) ships this page without the API
   * behind it, so a failed POST there is expected rather than exceptional. Offer the
   * same message as a prefilled email instead of dropping what the visitor wrote.
   */
  const offerMailtoFallback = payload => {
    const subject = encodeURIComponent(`Portfolio contact from ${payload.name || 'a visitor'}`);
    const body = encodeURIComponent(`${payload.message}\n\n— ${payload.name}\n${payload.email}`);
    const link = document.createElement('a');
    link.href = `mailto:${contactAddress}?subject=${subject}&body=${body}`;
    link.textContent = `Send it as an email instead`;
    statusEl.append(' ', link);
  };

  const grabFormData = () => {
    return ['name', 'email', 'message'].reduce((acc, field) => {
      const input = document.getElementById(field);
      acc[field] = input ? input.value.trim() : '';
      return acc;
    }, {});
  };

  form.addEventListener('submit', async evt => {
    evt.preventDefault();
    setStatus('Sending...');
    const payload = grabFormData();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds (increased from 15)
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        // A validation or rate-limit refusal is the server's to explain; show it as-is
        // and keep what the visitor typed so they can correct and resend.
        if (result.error) {
          setStatus(result.error, 'error');
          return;
        }
        throw new Error(`Contact form failed: ${response.status}`);
      }
      setStatus('Thanks! Your message is in my inbox — I will get back to you shortly.', 'success');
      form.reset();
    } catch (err) {
      console.error('Contact form error', err);
      setStatus('Could not send your message right now.', 'error');
      offerMailtoFallback(payload);
    }
  });
});

