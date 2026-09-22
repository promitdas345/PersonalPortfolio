document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('inboxList');
  const summary = document.getElementById('inboxSummary');
  const statusEl = document.getElementById('inboxStatus');
  const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
  if (!list || !summary || !statusEl) return;

  const csrfToken = document.body.getAttribute('data-csrf-token') || '';
  let filter = 'all';

  const setStatus = (message, variant) => {
    statusEl.textContent = message;
    statusEl.classList.remove('success', 'error');
    if (variant) statusEl.classList.add(variant);
  };

  const formatDate = iso => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso || 'unknown date';
    return parsed.toLocaleString();
  };

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, ...(options.headers || {}) },
    });
    if (response.status === 401) {
      window.location.href = '/contact';
      throw new Error('Signed out');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  };

  const renderMessage = message => {
    const item = document.createElement('li');
    item.className = `inbox-item${message.read ? '' : ' is-unread'}`;
    item.dataset.id = message.id;

    const top = document.createElement('div');
    top.className = 'inbox-item-top';

    const from = document.createElement('p');
    from.className = 'inbox-from';
    from.textContent = message.name;

    const meta = document.createElement('p');
    meta.className = 'inbox-meta';
    meta.textContent = formatDate(message.createdAt);

    top.append(from, meta);

    const address = document.createElement('p');
    address.className = 'inbox-meta';
    const mailLink = document.createElement('a');
    mailLink.href = `mailto:${message.email}?subject=${encodeURIComponent(`Re: your message on promit's portfolio`)}`;
    mailLink.textContent = message.email;
    address.append(mailLink);

    const body = document.createElement('p');
    body.className = 'inbox-body';
    body.textContent = message.message;

    const badges = document.createElement('div');
    badges.className = 'inbox-badges';
    if (!message.read) {
      const unread = document.createElement('span');
      unread.className = 'inbox-badge';
      unread.textContent = 'Unread';
      badges.append(unread);
    }
    if (!message.emailed) {
      const failed = document.createElement('span');
      failed.className = 'inbox-badge is-warning';
      failed.textContent = 'Email notification failed';
      badges.append(failed);
    }

    const actions = document.createElement('div');
    actions.className = 'inbox-actions';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-secondary';
    toggle.textContent = message.read ? 'Mark unread' : 'Mark read';
    toggle.addEventListener('click', async () => {
      try {
        await request(`/api/admin/messages/${encodeURIComponent(message.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ read: !message.read }),
        });
        await load();
      } catch (err) {
        setStatus(err.message, 'error');
      }
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-secondary';
    remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Delete the message from ${message.name}? This cannot be undone.`)) return;
      try {
        await request(`/api/admin/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE' });
        setStatus('Message deleted.', 'success');
        await load();
      } catch (err) {
        setStatus(err.message, 'error');
      }
    });

    actions.append(toggle, remove);
    item.append(top, address, body, badges, actions);
    return item;
  };

  async function load() {
    try {
      const payload = await request(`/api/admin/messages?status=${filter}`);
      list.textContent = '';
      if (!payload.messages.length) {
        const empty = document.createElement('li');
        empty.className = 'inbox-empty';
        empty.textContent = filter === 'unread' ? 'No unread messages.' : 'No messages yet.';
        list.append(empty);
      } else {
        for (const message of payload.messages) list.append(renderMessage(message));
      }
      summary.textContent = `${payload.total} message${payload.total === 1 ? '' : 's'} · ${payload.unreadCount} unread`;
    } catch (err) {
      if (err.message !== 'Signed out') setStatus(err.message, 'error');
    }
  }

  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      filter = button.dataset.filter;
      for (const other of filterButtons) other.classList.toggle('is-active', other === button);
      load();
    });
  }

  load();
});
