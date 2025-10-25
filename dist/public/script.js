// Client-side JavaScript for the portfolio site

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const statusEl = document.getElementById('formStatus');
      statusEl.classList.remove('success', 'error');
      statusEl.textContent = 'Sending…';
      const formData = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        message: document.getElementById('message').value.trim(),
      };
      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (result.success) {
          statusEl.textContent = 'Thank you! Your message has been sent.';
          statusEl.classList.add('success');
          form.reset();
        } else {
          statusEl.textContent = 'There was a problem sending your message.';
          statusEl.classList.add('error');
        }
      } catch (err) {
        console.error(err);
        statusEl.textContent = 'An error occurred. Please try again later.';
        statusEl.classList.add('error');
      }
    });
  }
});
