(function () {
  'use strict';

  const AUTOSAVE_KEY = 'blog-editor-autosave';
  const AUTOSAVE_INTERVAL_MS = 30000;

  let quill = null;
  let postData = null;
  let csrfToken = '';
  let isSaving = false;
  let hasUnsavedChanges = false;

  // ── DOM refs ──

  const $ = id => document.getElementById(id);

  function init() {
    const postDataEl = $('post-data');
    const csrfEl = $('csrf-token');
    csrfToken = csrfEl ? csrfEl.value : '';

    try {
      const raw = postDataEl ? postDataEl.value : 'null';
      postData = JSON.parse(raw);
    } catch (e) {
      postData = null;
    }

    initQuill();
    bindEvents();
    populateForm();
    startAutosave();
    updateStatusText();
  }

  // ── Quill setup ──

  function initQuill() {
    quill = new Quill('#quill-editor', {
      theme: 'snow',
      modules: {
        toolbar: {
          container: '#quill-toolbar',
          handlers: {
            image: imageHandler,
          },
        },
      },
      placeholder: 'Write your story...',
    });

    quill.on('text-change', () => {
      hasUnsavedChanges = true;
    });
  }

  // ── Custom image upload handler ──

  function imageHandler() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      setStatus('Uploading image...', '');
      const formData = new FormData();
      formData.append('image', file, file.name);

      try {
        const res = await fetch('/api/admin/uploads/images', {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Upload failed');

        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', json.url);
        quill.setSelection(range.index + 1);
        setStatus('Image uploaded', 'saved');
      } catch (err) {
        setStatus(err.message, 'error');
      }
    });
    input.click();
  }

  // ── Populate form for editing ──

  function populateForm() {
    const today = new Date().toISOString().slice(0, 10);
    $('post-date').value = postData ? postData.date : today;

    if (!postData) {
      // Check for autosaved draft
      tryRestoreAutosave();
      return;
    }

    $('post-title').value = postData.title || '';
    $('post-excerpt').value = postData.excerpt || '';
    $('post-status').value = postData.status || 'draft';
    $('post-hashtags').value = (postData.hashtags || []).join(', ');
    $('post-linkedin').value = postData.linkedinSourceUrl || '';

    if (postData.contentHtml) {
      quill.root.innerHTML = postData.contentHtml;
    }

    hasUnsavedChanges = false;
  }

  // ── Autosave ──

  function startAutosave() {
    setInterval(() => {
      if (!hasUnsavedChanges) return;
      const draft = gatherFormData();
      draft.contentHtml = quill.root.innerHTML;
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
      } catch (e) { /* ignore quota errors */ }
    }, AUTOSAVE_INTERVAL_MS);
  }

  function tryRestoreAutosave() {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (!draft || !draft.title) return;

      if (!confirm('Restore unsaved draft?')) {
        localStorage.removeItem(AUTOSAVE_KEY);
        return;
      }

      $('post-title').value = draft.title || '';
      $('post-excerpt').value = draft.excerpt || '';
      $('post-date').value = draft.date || new Date().toISOString().slice(0, 10);
      $('post-status').value = draft.status || 'draft';
      $('post-hashtags').value = draft.hashtags || '';
      $('post-linkedin').value = draft.linkedinSourceUrl || '';
      if (draft.contentHtml) quill.root.innerHTML = draft.contentHtml;
    } catch (e) { /* ignore */ }
  }

  function clearAutosave() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* ignore */ }
  }

  // ── Gather form data ──

  function gatherFormData() {
    return {
      title: $('post-title').value.trim(),
      excerpt: $('post-excerpt').value.trim(),
      date: $('post-date').value || new Date().toISOString().slice(0, 10),
      status: $('post-status').value,
      hashtags: $('post-hashtags').value,
      linkedinSourceUrl: $('post-linkedin').value.trim(),
    };
  }

  // ── Save / Publish ──

  async function savePost(overrideStatus) {
    if (isSaving) return;
    const data = gatherFormData();
    if (!data.title) {
      setError('Title is required.');
      $('post-title').focus();
      return;
    }

    const contentHtml = quill.root.innerHTML;
    const textContent = quill.getText().trim();
    if (!textContent) {
      setError('Post content is required.');
      quill.focus();
      return;
    }

    isSaving = true;
    setStatus('Saving...', '');
    setError('');

    const status = overrideStatus || data.status;
    const hashtags = data.hashtags
      ? data.hashtags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const payload = {
      title: data.title,
      excerpt: data.excerpt,
      contentHtml,
      contentMarkdown: '',
      date: data.date,
      status,
      hashtags,
      linkedinSourceUrl: data.linkedinSourceUrl,
    };

    try {
      const isEdit = postData && postData.id;
      const url = isEdit
        ? `/api/admin/posts/${encodeURIComponent(postData.id)}`
        : '/api/admin/posts';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save.');

      hasUnsavedChanges = false;
      clearAutosave();

      if (!isEdit && json.post) {
        // Redirect to edit mode for the newly created post
        window.location.href = `/blog/editor/${encodeURIComponent(json.post.slug)}`;
        return;
      }

      // Update local state
      if (json.post) {
        postData = json.post;
      }

      setStatus('Saved!', 'saved');
      updateStatusText();
      $('btn-preview').disabled = false;
    } catch (err) {
      setError(err.message);
      setStatus('Save failed', 'error');
    } finally {
      isSaving = false;
    }
  }

  // ── UI helpers ──

  function setStatus(text, className) {
    const el = $('editor-status');
    el.textContent = text;
    el.className = 'editor-status' + (className ? ' ' + className : '');
  }

  function setError(text) {
    $('editor-error').textContent = text;
  }

  function updateStatusText() {
    if (postData && postData.slug) {
      setStatus(`Editing: ${postData.title || postData.slug}`, '');
      $('btn-preview').disabled = false;
    } else {
      setStatus('New post', '');
      $('btn-preview').disabled = true;
    }
  }

  // ── Event bindings ──

  function bindEvents() {
    $('btn-save-draft').addEventListener('click', () => savePost('draft'));
    $('btn-publish').addEventListener('click', () => savePost('published'));

    $('btn-preview').addEventListener('click', () => {
      if (postData && postData.slug) {
        window.open(`/blog/${encodeURIComponent(postData.slug)}`, '_blank');
      }
    });

    // Track title changes
    $('post-title').addEventListener('input', () => { hasUnsavedChanges = true; });
    $('post-excerpt').addEventListener('input', () => { hasUnsavedChanges = true; });

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Ctrl+S / Cmd+S to save
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        savePost();
      }
    });
  }

  // ── Boot ──

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
