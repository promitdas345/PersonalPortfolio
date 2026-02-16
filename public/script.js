document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const statusEl = document.getElementById('formStatus');
  if (!form || !statusEl) return;

  const setStatus = (message, variant) => {
    statusEl.textContent = message;
    statusEl.classList.remove('success', 'error');
    if (variant) statusEl.classList.add(variant);
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
      if (!response.ok) {
        throw new Error(`Contact form failed: ${response.status}`);
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error('Server rejected message');
      }
      setStatus('Thanks! I will get back to you shortly.', 'success');
      form.reset();
    } catch (err) {
      console.error('Contact form error', err);
      setStatus('Could not send message right now. Email me directly?', 'error');
    }
  });
});

