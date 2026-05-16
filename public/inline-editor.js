(function () {
  'use strict';

  const TEMPLATE_PATHS = [
    { pattern: /^\/$/, path: 'views/index.html' },
    { pattern: /^\/about$/, path: 'views/about.html' },
    { pattern: /^\/contact$/, path: 'views/contact.html' },
    { pattern: /^\/blog$/, path: 'views/blog.html' },
    { pattern: /^\/projects$/, path: 'views/projects.html' },
    { pattern: /^\/pacman$/, path: 'views/pacman.html' },
  ];

  const EDITABLE_SELECTOR = [
    '[data-post-field]',
    '[data-project-field]',
    'main h1',
    'main h2',
    'main h3',
    'main h4',
    'main h5',
    'main h6',
    'main p',
    'main li',
  ].join(',');

  const state = {
    authenticated: false,
    username: '',
    defaultUsername: '',
    csrfToken: '',
    capabilities: [],
    roles: [],
    canInlineEdit: false,
    editMode: false,
    templatePath: null,
    originalDisplay: new Map(),
    originalValue: new Map(),
    changedElements: new Set(),
    metaByElement: new WeakMap(),
  };

  function normalizePathname(pathname) {
    if (!pathname || pathname === '/') return '/';
    return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  }

  function resolveTemplatePath(pathname) {
    const normalized = normalizePathname(pathname);
    const match = TEMPLATE_PATHS.find(candidate => candidate.pattern.test(normalized));
    return match ? match.path : null;
  }

  function getRouteType() {
    const pathname = normalizePathname(window.location.pathname);
    if (/^\/blog(?:\/|$)/.test(pathname)) return 'blog';
    if (/^\/projects(?:\/|$)/.test(pathname)) return 'projects';
    return 'other';
  }

  async function apiRequest(url, options = {}) {
    const requestOptions = {
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    };
    const method = String(requestOptions.method || 'GET').toUpperCase();
    const isMutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    if (isMutation && state.csrfToken && !requestOptions.headers['x-csrf-token']) {
      requestOptions.headers['x-csrf-token'] = state.csrfToken;
    }

    const response = await fetch(url, requestOptions);
    let payload = null;

    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }

    if (!response.ok || (payload && payload.success === false)) {
      const message = (payload && payload.error) || `Request failed (${response.status}).`;
      throw new Error(message);
    }

    return payload || {};
  }

  async function fetchSession() {
    try {
      const data = await apiRequest('/api/admin/session');
      state.authenticated = Boolean(data.authenticated);
      state.username = (data.user && (data.user.displayName || data.user.email)) || '';
      state.defaultUsername = data.defaultUsername || state.defaultUsername;
      state.csrfToken = data.csrfToken || '';
      state.capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
      state.roles = Array.isArray(data.roles) ? data.roles : [];
      state.canInlineEdit = Boolean(data.canInlineEdit);
    } catch (err) {
      state.authenticated = false;
      state.username = '';
      state.csrfToken = '';
      state.capabilities = [];
      state.roles = [];
      state.canInlineEdit = false;
    }
  }

  function createLauncher() {
    if (document.getElementById('inline-editor-launcher')) return;

    const button = document.createElement('button');
    button.id = 'inline-editor-launcher';
    button.type = 'button';
    button.className = 'inline-edit-toggle';
    button.addEventListener('click', handleLauncherClick);
    const footer = document.querySelector('.site-footer');
    if (footer) {
      footer.appendChild(button);
    } else {
      document.body.appendChild(button);
    }
  }

  function renderLauncher() {
    const button = document.getElementById('inline-editor-launcher');
    if (!button) return;

    button.textContent = state.canInlineEdit ? 'Edit site' : 'Admin';
    button.style.display = state.editMode ? 'none' : 'inline-flex';
  }

  function createAuthModal() {
    if (document.getElementById('inline-editor-auth-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'inline-editor-auth-overlay';
    overlay.className = 'inline-auth-overlay is-hidden';
    overlay.innerHTML = `
      <div class="inline-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="inlineAuthTitle">
        <h2 id="inlineAuthTitle">Admin sign in</h2>
        <p class="inline-auth-help">Sign in to edit content directly on the page.</p>
        <form id="inline-auth-form" class="inline-auth-form">
          <label>
            <span>Username or email</span>
            <input id="inline-auth-username" name="username" type="text" autocomplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input id="inline-auth-password" name="password" type="password" autocomplete="current-password" required />
          </label>
          <p id="inline-auth-status" class="inline-auth-status"></p>
          <div class="inline-auth-actions">
            <button type="button" id="inline-auth-cancel" class="toolbar-btn">Cancel</button>
            <button type="submit" id="inline-auth-submit" class="toolbar-btn toolbar-btn-save">Sign in</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeAuthModal();
      }
    });

    document.getElementById('inline-auth-cancel').addEventListener('click', closeAuthModal);
    document.getElementById('inline-auth-form').addEventListener('submit', onLoginSubmit);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.classList.contains('is-hidden')) {
        closeAuthModal();
      }
    });
  }

  function openAuthModal() {
    const overlay = document.getElementById('inline-editor-auth-overlay');
    if (!overlay) return;

    overlay.classList.remove('is-hidden');
    const usernameInput = document.getElementById('inline-auth-username');
    const passwordInput = document.getElementById('inline-auth-password');
    const preferredUsername = state.username || state.defaultUsername || '';

    usernameInput.value = preferredUsername;
    passwordInput.value = '';
    setAuthStatus('');
    usernameInput.focus();
  }

  function closeAuthModal() {
    const overlay = document.getElementById('inline-editor-auth-overlay');
    if (!overlay) return;
    overlay.classList.add('is-hidden');
  }

  function setAuthStatus(message, variant = '') {
    const status = document.getElementById('inline-auth-status');
    if (!status) return;
    status.textContent = message;
    status.classList.remove('success', 'error');
    if (variant) status.classList.add(variant);
  }

  async function onLoginSubmit(event) {
    event.preventDefault();

    const usernameInput = document.getElementById('inline-auth-username');
    const passwordInput = document.getElementById('inline-auth-password');
    const submitButton = document.getElementById('inline-auth-submit');

    const username = (usernameInput.value || '').trim();
    const password = passwordInput.value || '';

    if (!username || !password) {
      setAuthStatus('Username and password are required.', 'error');
      return;
    }

    submitButton.disabled = true;
    setAuthStatus('Signing in...');

    try {
      await apiRequest('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      await fetchSession();
      closeAuthModal();
      createLauncher();
      renderLauncher();
      if (state.canInlineEdit) {
        enterEditMode();
      } else {
        setToolbarStatus('Your account does not have inline edit permission.', 'error');
      }
    } catch (err) {
      setAuthStatus(err.message, 'error');
    } finally {
      submitButton.disabled = false;
    }
  }

  function createToolbar() {
    if (document.getElementById('inline-editor-toolbar')) return;

    const routeType = getRouteType();
    const showCreate = routeType === 'blog' || routeType === 'projects';
    const createLabel = routeType === 'blog' ? 'New post' : 'New project';

    const toolbar = document.createElement('div');
    toolbar.id = 'inline-editor-toolbar';
    toolbar.innerHTML = `
      <div class="inline-toolbar-content">
        <p id="inline-toolbar-status" class="inline-toolbar-status">Edit mode is active.</p>
        <div class="inline-toolbar-buttons">
          <button id="inline-save-button" type="button" class="toolbar-btn toolbar-btn-save" disabled>Save</button>
          <button id="inline-cancel-button" type="button" class="toolbar-btn">Cancel</button>
          ${showCreate ? `<button id="inline-create-button" type="button" class="toolbar-btn">${createLabel}</button>` : ''}
          <button id="inline-logout-button" type="button" class="toolbar-btn">Log out</button>
          <button id="inline-exit-button" type="button" class="toolbar-btn toolbar-btn-exit">Exit</button>
        </div>
      </div>
    `;

    document.body.appendChild(toolbar);

    document.getElementById('inline-save-button').addEventListener('click', saveAllChanges);
    document.getElementById('inline-cancel-button').addEventListener('click', cancelAllChanges);
    document.getElementById('inline-logout-button').addEventListener('click', logout);
    document.getElementById('inline-exit-button').addEventListener('click', () => exitEditMode(false));

    if (showCreate) {
      document.getElementById('inline-create-button').addEventListener('click', createNewContent);
    }
  }

  function setToolbarStatus(message, variant = '') {
    const status = document.getElementById('inline-toolbar-status');
    if (!status) return;

    status.textContent = message;
    status.classList.remove('success', 'error');
    if (variant) status.classList.add(variant);
  }

  function handleLauncherClick() {
    if (state.authenticated && state.canInlineEdit) {
      enterEditMode();
      return;
    }
    openAuthModal();
  }

  function isEditableElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (!element.textContent || !element.textContent.trim()) return false;

    if (element.closest('header, footer, nav, form, #inline-editor-toolbar, #inline-editor-launcher, #inline-editor-auth-overlay')) {
      return false;
    }

    if (element.closest('#projectDemo, .project-actions, .resume-actions, .pacman-panel')) {
      return false;
    }

    const isDataField = element.hasAttribute('data-post-field') || element.hasAttribute('data-project-field');
    if (element.closest('[data-inline-dynamic]') && !isDataField) {
      return false;
    }

    if (isDataField) return true;

    if (!state.templatePath) return false;
    if (element.closest('[data-post-id], [data-project-id]')) return false;

    const allowedTags = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    return allowedTags.has(element.tagName);
  }

  function getDepth(element) {
    let depth = 0;
    let node = element;
    while (node && node !== document.body) {
      depth += 1;
      node = node.parentElement;
    }
    return depth;
  }

  function buildElementPath(element) {
    const parts = [];
    let current = element;

    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) return '';

      const tag = current.tagName.toLowerCase();
      const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
      const index = siblings.indexOf(current) + 1;
      if (index < 1) return '';

      parts.push(`${tag}:${index}`);
      current = parent;
    }

    if (current !== document.body) return '';
    parts.push('body:1');
    return parts.reverse().join('>');
  }

  function resolveElementPath(bodyElement, pathValue) {
    const segments = String(pathValue || '').split('>').filter(Boolean);
    if (!segments.length || segments[0] !== 'body:1') return null;

    let current = bodyElement;

    for (let i = 1; i < segments.length; i += 1) {
      const [tagName, indexText] = segments[i].split(':');
      const index = Number(indexText);
      if (!tagName || !Number.isFinite(index) || index < 1) return null;

      const matches = Array.from(current.children).filter(
        child => child.tagName.toLowerCase() === tagName.toLowerCase()
      );
      current = matches[index - 1];
      if (!current) return null;
    }

    return current;
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanHtml(value) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(value || '').trim();
    return wrapper.innerHTML.trim();
  }

  function htmlToMarkdown(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(html || '');

    let text = wrapper.innerText || '';
    text = text.replace(/\r/g, '');

    const lines = text.split('\n').map(line => line.trimEnd());
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function readPostFieldValue(element, field) {
    if (field === 'contentMarkdown') {
      return htmlToMarkdown(element.innerHTML);
    }

    if (field === 'date') {
      return normalizeText(element.textContent).slice(0, 10);
    }

    return normalizeText(element.textContent);
  }

  function readProjectFieldValue(element, field) {
    if (field === 'technologies') {
      const tagItems = Array.from(element.querySelectorAll('.tag'))
        .map(tag => normalizeText(tag.textContent))
        .filter(Boolean);
      if (tagItems.length) return tagItems;

      return normalizeText(element.textContent)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    }

    if (field === 'highlights' || field === 'metrics' || field === 'architecture') {
      return Array.from(element.querySelectorAll('li'))
        .map(item => normalizeText(item.textContent))
        .filter(Boolean);
    }

    if (field === 'content') {
      return cleanHtml(element.innerHTML);
    }

    return normalizeText(element.textContent);
  }

  function getElementMeta(element) {
    const postField = element.getAttribute('data-post-field');
    if (postField) {
      const owner = element.closest('[data-post-id]');
      const postId = owner && owner.getAttribute('data-post-id');
      if (postId) {
        return { kind: 'post', id: postId, field: postField };
      }
    }

    const projectField = element.getAttribute('data-project-field');
    if (projectField) {
      const owner = element.closest('[data-project-id]');
      const projectId = owner && owner.getAttribute('data-project-id');
      if (projectId) {
        return { kind: 'project', id: projectId, field: projectField };
      }
    }

    if (!state.templatePath) return { kind: 'none' };

    const pathValue = buildElementPath(element);
    if (!pathValue) return { kind: 'none' };

    return { kind: 'template', path: pathValue };
  }

  function readElementValue(element, meta) {
    if (!meta || meta.kind === 'none') return '';

    if (meta.kind === 'post') {
      return readPostFieldValue(element, meta.field);
    }

    if (meta.kind === 'project') {
      return readProjectFieldValue(element, meta.field);
    }

    return cleanHtml(element.innerHTML);
  }

  function serializeValue(value) {
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    return String(value == null ? '' : value);
  }

  function onEditableFocus(event) {
    event.currentTarget.classList.add('editing');
  }

  function updateChangedState(element) {
    const meta = state.metaByElement.get(element);
    if (!meta || meta.kind === 'none') return;

    const current = serializeValue(readElementValue(element, meta));
    const original = state.originalValue.get(element);

    if (current !== original) {
      state.changedElements.add(element);
      element.classList.add('has-changes');
    } else {
      state.changedElements.delete(element);
      element.classList.remove('has-changes');
    }

    renderSaveButton();
  }

  function onEditableInput(event) {
    updateChangedState(event.currentTarget);
  }

  function onEditableBlur(event) {
    const element = event.currentTarget;
    element.classList.remove('editing');
    updateChangedState(element);
  }

  function renderSaveButton() {
    const button = document.getElementById('inline-save-button');
    if (!button) return;

    const count = state.changedElements.size;
    button.disabled = count === 0;
    button.textContent = count > 0 ? `Save ${count}` : 'Save';
  }

  function enterEditMode() {
    if (!state.canInlineEdit) {
      return;
    }
    if (!state.authenticated) {
      openAuthModal();
      return;
    }

    if (state.editMode) return;

    state.templatePath = resolveTemplatePath(window.location.pathname);
    state.editMode = true;

    document.body.classList.add('inline-edit-active');
    createToolbar();

    const candidates = Array.from(new Set(Array.from(document.querySelectorAll(EDITABLE_SELECTOR))))
      .filter(isEditableElement)
      .sort((left, right) => getDepth(left) - getDepth(right));

    let editableCount = 0;

    for (const element of candidates) {
      if (element.closest('[contenteditable="true"]')) continue;

      const meta = getElementMeta(element);
      if (!meta || meta.kind === 'none') continue;

      state.metaByElement.set(element, meta);
      state.originalDisplay.set(element, element.innerHTML);
      state.originalValue.set(element, serializeValue(readElementValue(element, meta)));

      element.contentEditable = 'true';
      element.spellcheck = true;
      element.classList.add('inline-editable');
      element.addEventListener('focus', onEditableFocus);
      element.addEventListener('input', onEditableInput);
      element.addEventListener('blur', onEditableBlur);
      editableCount += 1;
    }

    renderSaveButton();
    setToolbarStatus(`Editing ${editableCount} field(s).`);
    renderLauncher();
    showDeleteButton();
  }

  function exitEditMode(force) {
    if (!force && state.changedElements.size > 0) {
      const shouldExit = window.confirm('Exit without saving all changes?');
      if (!shouldExit) return;
    }

    const editableNodes = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    for (const node of editableNodes) {
      node.contentEditable = 'false';
      node.classList.remove('inline-editable', 'has-changes', 'editing');
      node.removeEventListener('focus', onEditableFocus);
      node.removeEventListener('input', onEditableInput);
      node.removeEventListener('blur', onEditableBlur);
    }

    const toolbar = document.getElementById('inline-editor-toolbar');
    if (toolbar) toolbar.remove();

    state.editMode = false;
    state.changedElements.clear();
    state.originalDisplay.clear();
    state.originalValue.clear();
    state.metaByElement = new WeakMap();

    document.body.classList.remove('inline-edit-active');
    renderLauncher();
    hideDeleteButton();
  }

  function cancelAllChanges() {
    if (state.changedElements.size === 0) {
      exitEditMode(false);
      return;
    }

    const confirmed = window.confirm(`Discard ${state.changedElements.size} change(s)?`);
    if (!confirmed) return;

    for (const element of state.changedElements) {
      const original = state.originalDisplay.get(element);
      if (typeof original === 'string') {
        element.innerHTML = original;
      }
      element.classList.remove('has-changes', 'editing');
    }

    state.changedElements.clear();
    renderSaveButton();
    setToolbarStatus('Changes discarded.');
  }

  function collectChanges() {
    const templateChanges = [];
    const postPayloads = new Map();
    const projectPayloads = new Map();

    for (const element of state.changedElements) {
      const meta = state.metaByElement.get(element);
      if (!meta || meta.kind === 'none') continue;

      const value = readElementValue(element, meta);

      if (meta.kind === 'template') {
        templateChanges.push({ meta, value });
        continue;
      }

      if (meta.kind === 'post') {
        const payload = postPayloads.get(meta.id) || {};
        payload[meta.field] = value;
        postPayloads.set(meta.id, payload);
        continue;
      }

      const payload = projectPayloads.get(meta.id) || {};
      payload[meta.field] = value;
      projectPayloads.set(meta.id, payload);
    }

    return { templateChanges, postPayloads, projectPayloads };
  }

  function commitActiveEditable() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (active.getAttribute('contenteditable') !== 'true') return;
    updateChangedState(active);
  }

  async function saveTemplateChanges(templateChanges) {
    if (!templateChanges.length || !state.templatePath) {
      return { applied: 0, skipped: templateChanges.length };
    }

    const fileData = await apiRequest(`/api/admin/site-file?path=${encodeURIComponent(state.templatePath)}`);
    const parser = new DOMParser();
    const sourceDocument = parser.parseFromString(fileData.content || '', 'text/html');

    let applied = 0;

    for (const change of templateChanges) {
      const target = resolveElementPath(sourceDocument.body, change.meta.path);
      if (!target) continue;
      target.innerHTML = String(change.value == null ? '' : change.value);
      applied += 1;
    }

    if (!applied) {
      return { applied: 0, skipped: templateChanges.length };
    }

    const hadDoctype = /^\s*<!doctype html>/i.test(fileData.content || '');
    const nextContent = `${hadDoctype ? '<!DOCTYPE html>\n' : ''}${sourceDocument.documentElement.outerHTML}\n`;

    await apiRequest('/api/admin/site-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: state.templatePath, content: nextContent }),
    });

    return {
      applied,
      skipped: templateChanges.length - applied,
    };
  }

  function assertIsoDate(value, label) {
    if (!value) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      throw new Error(`${label} must use YYYY-MM-DD.`);
    }
  }

  async function savePostChanges(postPayloads) {
    let count = 0;

    for (const [postId, payload] of postPayloads.entries()) {
      assertIsoDate(payload.date, 'Post date');

      if (Object.prototype.hasOwnProperty.call(payload, 'contentMarkdown')) {
        payload.contentMarkdown = String(payload.contentMarkdown || '').trim();
        if (!payload.contentMarkdown) {
          throw new Error('Post content cannot be empty.');
        }
      }

      await apiRequest(`/api/admin/posts/${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      count += 1;
    }

    return count;
  }

  async function saveProjectChanges(projectPayloads) {
    let count = 0;

    for (const [projectId, payload] of projectPayloads.entries()) {
      await apiRequest(`/api/admin/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      count += 1;
    }

    return count;
  }

  function markChangesAsSaved() {
    for (const element of state.changedElements) {
      const meta = state.metaByElement.get(element);
      const nextValue = meta ? serializeValue(readElementValue(element, meta)) : '';
      state.originalDisplay.set(element, element.innerHTML);
      state.originalValue.set(element, nextValue);
      element.classList.remove('has-changes', 'editing');
    }

    state.changedElements.clear();
  }

  async function saveAllChanges() {
    commitActiveEditable();
    if (state.changedElements.size === 0) return;

    const saveButton = document.getElementById('inline-save-button');
    if (saveButton) saveButton.disabled = true;

    setToolbarStatus('Saving changes...');

    try {
      const { templateChanges, postPayloads, projectPayloads } = collectChanges();
      const templateResult = await saveTemplateChanges(templateChanges);
      const postCount = await savePostChanges(postPayloads);
      const projectCount = await saveProjectChanges(projectPayloads);

      markChangesAsSaved();
      renderSaveButton();

      const parts = [];
      if (templateResult.applied > 0) parts.push(`${templateResult.applied} template`);
      if (postCount > 0) parts.push(`${postCount} post`);
      if (projectCount > 0) parts.push(`${projectCount} project`);

      if (!parts.length) {
        setToolbarStatus('Nothing changed.', 'success');
      } else {
        const skippedText = templateResult.skipped > 0 ? ` (${templateResult.skipped} skipped generated element(s))` : '';
        setToolbarStatus(`Saved ${parts.join(', ')} update(s).${skippedText}`, 'success');
      }
    } catch (err) {
      setToolbarStatus(err.message, 'error');
    } finally {
      if (saveButton) saveButton.disabled = false;
      renderSaveButton();
    }
  }

  async function logout() {
    try {
      await apiRequest('/api/admin/logout', { method: 'POST' });
    } catch (err) {
      setToolbarStatus(err.message, 'error');
      return;
    }

    state.authenticated = false;
    state.username = '';
    state.csrfToken = '';
    state.capabilities = [];
    state.roles = [];
    state.canInlineEdit = false;
    exitEditMode(true);
    createLauncher();
    renderLauncher();
  }

  async function createNewContent() {
    const routeType = getRouteType();

    if (routeType === 'blog') {
      window.location.href = '/blog/editor';
      return;
    }

    if (routeType === 'projects') {
      await createProject();
    }
  }

  /* ── Delete post button ── */

  function showDeleteButton() {
    const deleteBtn = document.getElementById('delete-post-btn');
    if (!deleteBtn) return;

    const postArticle = document.querySelector('[data-post-id]');
    if (!postArticle) return;

    deleteBtn.style.display = 'flex';
    deleteBtn.onclick = handleDeletePost;
  }

  function hideDeleteButton() {
    const deleteBtn = document.getElementById('delete-post-btn');
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
      deleteBtn.onclick = null;
    }
  }

  async function handleDeletePost() {
    const postArticle = document.querySelector('[data-post-id]');
    if (!postArticle) return;

    const postId = postArticle.getAttribute('data-post-id');
    const postTitle = document.querySelector('[data-post-field="title"]')?.textContent || 'this post';

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${postTitle}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const response = await apiRequest(`/api/admin/posts/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
      });

      if (response && response.success) {
        window.location.href = '/blog';
      } else {
        throw new Error(response?.error || 'Failed to delete post');
      }
    } catch (err) {
      alert(`Error deleting post: ${err.message}`);
    }
  }

  /* ── Project creation modal ── */

  function createProjectModal() {
    if (document.getElementById('create-project-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'create-project-overlay';
    overlay.className = 'create-modal-overlay is-hidden';
    overlay.innerHTML = `
      <div class="create-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="createProjectTitle">
        <h2 id="createProjectTitle" class="create-modal-heading">Create new project</h2>
        <p class="create-modal-subtext">Add a project to your portfolio.</p>
        <form id="create-project-form" class="create-modal-form">
          <input id="create-project-title" name="title" type="text" class="create-modal-title-input" placeholder="Project name" required autocomplete="off" />
          <textarea id="create-project-description" name="description" class="create-modal-textarea" placeholder="Short description of the project" rows="3"></textarea>
          <p id="create-project-error" class="create-modal-error"></p>
          <div class="create-modal-actions">
            <button type="button" id="create-project-cancel" class="toolbar-btn">Cancel</button>
            <button type="submit" id="create-project-submit" class="toolbar-btn toolbar-btn-save">Create project</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeProjectModal();
    });
    document.getElementById('create-project-cancel').addEventListener('click', closeProjectModal);
    document.getElementById('create-project-form').addEventListener('submit', onProjectModalSubmit);
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeProjectModal();
    });
  }

  function openProjectModal() {
    createProjectModal();
    const overlay = document.getElementById('create-project-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-hidden');

    const titleInput = document.getElementById('create-project-title');
    titleInput.value = '';
    document.getElementById('create-project-description').value = '';
    document.getElementById('create-project-error').textContent = '';
    document.getElementById('create-project-submit').disabled = false;
    titleInput.focus();
  }

  function closeProjectModal() {
    const overlay = document.getElementById('create-project-overlay');
    if (overlay) overlay.classList.add('is-hidden');
  }

  async function onProjectModalSubmit(event) {
    event.preventDefault();

    const titleInput = document.getElementById('create-project-title');
    const descInput = document.getElementById('create-project-description');
    const errorEl = document.getElementById('create-project-error');
    const submitBtn = document.getElementById('create-project-submit');

    const title = (titleInput.value || '').trim();
    const description = (descInput.value || '').trim() || 'Project summary';

    if (!title) {
      errorEl.textContent = 'A project name is required.';
      titleInput.focus();
      return;
    }

    submitBtn.disabled = true;
    errorEl.textContent = '';

    try {
      const data = await apiRequest('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, summary: description }),
      });

      if (data && data.project && data.project.slug) {
        window.location.href = `/projects/${encodeURIComponent(data.project.slug)}`;
      }
    } catch (err) {
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
    }
  }

  async function createProject() {
    openProjectModal();
  }

  async function init() {
    state.templatePath = resolveTemplatePath(window.location.pathname);
    await fetchSession();
    createLauncher();
    createAuthModal();
    renderLauncher();

    const currentPath = normalizePathname(window.location.pathname);
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = normalizePathname(link.getAttribute('href'));
      if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
        link.classList.add('active');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
