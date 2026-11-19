(function () {
  'use strict';

  const CATALOG_URL = 'data/travel-prompt-templates.js';
  const CACHE_KEY = 'setu.prompt-library.catalog.v1';
  const FORM_KEY = 'setu.prompt-library.form.v1';
  const CUSTOM_KEY = 'setu.prompt-library.custom.v1';
  const PLACEHOLDERS = ['destination', 'origin', 'travel_date', 'travel_style'];

  function validCatalog(data) {
    if (!data || data.schema !== 1 || !Array.isArray(data.templates) || !data.templates.length ||
        typeof data.revision !== 'string') return false;
    const ids = new Set();
    return data.templates.every(t => {
      if (!t || typeof t.id !== 'string' || !/^[a-z-]+$/.test(t.id) || ids.has(t.id) ||
          typeof t.title !== 'string' || typeof t.description !== 'string' ||
          typeof t.body !== 'string' || !t.body.trim()) return false;
      ids.add(t.id);
      return true;
    });
  }

  function renderPrompt(body, variables) {
    return body.replace(/{{\s*([a-z_]+)\s*}}/g, (match, key) =>
      PLACEHOLDERS.includes(key) ? String(variables[key] ?? '') : match
    ).trim();
  }

  function safeRead(key, fallback) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      return data && typeof data === 'object' ? data : fallback;
    } catch (_) { return fallback; }
  }

  function safeWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  function loadCatalog() {
    // A script instead of fetch allows users to run the self-contained Setu
    // HTML export on file://, while cache-busting picks up edited templates.
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CATALOG_URL + '?rev=' + Date.now();
      script.onload = () => {
        script.remove();
        if (validCatalog(window.SetuTravelPromptCatalog)) resolve(window.SetuTravelPromptCatalog);
        else reject(new Error('The template catalog is invalid.'));
      };
      script.onerror = () => { script.remove(); reject(new Error('Cannot load the latest template catalog.')); };
      document.head.appendChild(script);
    });
  }

  function init() {
    const byId = id => document.getElementById(id);
    const formFields = {
      destination: byId('destination'),
      origin: byId('origin'),
      travel_date: byId('travel-date'),
      travel_style: byId('travel-style'),
    };
    const existing = safeRead(FORM_KEY, {});
    Object.entries(formFields).forEach(([key, field]) => {
      if (typeof existing[key] !== 'string') return;
      if (field.tagName !== 'SELECT' || [...field.options].some(opt => opt.value === existing[key])) {
        field.value = existing[key];
      }
    });
    // Future saved-place cards can link here with a destination parameter.
    // Never interpret it as markup or permit excessively long prefilled text.
    const queryDestination = new URLSearchParams(window.location.search).get('destination');
    if (queryDestination && queryDestination.trim()) {
      formFields.destination.value = queryDestination.trim().slice(0, 180);
    }

    let catalog = null;
    let selected = typeof existing.selected === 'string' ? existing.selected : 'discover';
    let custom = safeRead(CUSTOM_KEY, {});
    let editing = false;

    function currentTemplate() {
      return catalog && catalog.templates.find(t => t.id === selected);
    }

    function currentVersion() {
      const t = currentTemplate();
      if (!t) return null;
      const override = Object.prototype.hasOwnProperty.call(custom, t.id) ? custom[t.id] : null;
      return override && typeof override.body === 'string' && override.body.trim() ? override : null;
    }

    function values() {
      return {
        destination: formFields.destination.value.trim() || '(destination not selected)',
        origin: formFields.origin.value.trim() || '(starting station not decided)',
        travel_date: formFields.travel_date.value || 'Not chosen yet — ask me before checking schedules or weather',
        travel_style: formFields.travel_style.value,
      };
    }

    function persistForm() {
      safeWrite(FORM_KEY, { ...Object.fromEntries(Object.entries(formFields).map(([k, f]) => [k, f.value])), selected });
    }

    function showAction(message, error) {
      const p = byId('action-status');
      p.textContent = message;
      p.style.color = error ? '#a0222d' : '#005d36';
    }

    function buildTabs() {
      const list = byId('template-list');
      list.replaceChildren();
      for (const t of catalog.templates) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'template-button';
        button.setAttribute('aria-pressed', String(t.id === selected));
        const index = document.createElement('span');
        index.className = 'step-index';
        index.textContent = String(t.step || catalog.templates.indexOf(t) + 1);
        const details = document.createElement('span');
        details.className = 'step-details';
        const title = document.createElement('strong');
        title.textContent = t.title;
        const desc = document.createElement('small');
        desc.textContent = t.description;
        details.append(title, desc);
        button.append(index, details);
        button.addEventListener('click', () => {
          selected = t.id;
          editing = false;
          persistForm();
          showAction('');
          render();
        });
        list.appendChild(button);
      }
    }

    function render() {
      const t = currentTemplate();
      if (!t) return;
      buildTabs();
      const override = currentVersion();
      byId('prompt-step').textContent = 'STEP ' + (t.step || 1) + ' / SAVED TEMPLATE';
      byId('prompt-title').textContent = t.title;
      byId('prompt-description').textContent = t.description;
      byId('prompt-version').textContent = override
        ? 'Personal edit' + (override.baseRevision !== catalog.revision ? ' · older base' : '')
        : 'Setu v' + catalog.revision;
      byId('prompt-preview').value = renderPrompt(override ? override.body : t.body, values());
      byId('copy-prompt').disabled = false;
      byId('toggle-editor').disabled = false;
      byId('toggle-editor').textContent = editing ? 'Editing…' : 'Edit template';
      const editorWasHidden = byId('editor').hidden;
      byId('editor').hidden = !editing;
      // Don't erase unsaved editor changes when the trip destination is edited.
      if (editing && editorWasHidden) byId('template-editor').value = override ? override.body : t.body;
      byId('reset-template').disabled = !override;
      if (override && override.baseRevision !== catalog.revision) {
        showAction('A newer Setu template is available. Restore latest Setu version to use it.');
      }
    }

    Object.values(formFields).forEach(input => {
      input.addEventListener('input', () => { persistForm(); if (catalog) render(); });
      input.addEventListener('change', () => { persistForm(); if (catalog) render(); });
    });

    byId('copy-prompt').addEventListener('click', async () => {
      const text = byId('prompt-preview').value;
      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch (_) { /* HTTP/file contexts can deny clipboard access */ }
      if (!copied) {
        try {
          const preview = byId('prompt-preview');
          preview.focus();
          preview.select();
          copied = document.execCommand('copy');
        } catch (_) { /* leave selection available for manual copy */ }
      }
      showAction(copied ? 'Copied. Open ChatGPT, choose your Travel project, paste and send.' : 'Select the preview text and copy it manually.', !copied);
    });

    byId('toggle-editor').addEventListener('click', () => { editing = !editing; render(); });
    byId('cancel-editor').addEventListener('click', () => { editing = false; render(); });
    byId('save-template').addEventListener('click', () => {
      const body = byId('template-editor').value.trim();
      if (body.length < 50) { showAction('Template must contain at least 50 characters.', true); return; }
      const unknown = [...body.matchAll(/{{\s*([^{}]+?)\s*}}/g)]
        .map(match => match[1].trim()).filter(key => !PLACEHOLDERS.includes(key));
      if (unknown.length) {
        showAction('Unknown placeholder: ' + [...new Set(unknown)].join(', ') + '. Use one of the four supported fields.', true);
        return;
      }
      if (!currentTemplate()) return;
      custom = { ...custom, [selected]: { body, baseRevision: catalog.revision } };
      if (!safeWrite(CUSTOM_KEY, custom)) {
        showAction('This browser could not save your personal template. Check storage permissions.', true);
        return;
      }
      editing = false;
      render();
      showAction('Saved personal template in this browser. Other devices continue using the latest Setu version.');
    });
    byId('reset-template').addEventListener('click', () => {
      if (!currentVersion()) return;
      custom = { ...custom };
      delete custom[selected];
      if (!safeWrite(CUSTOM_KEY, custom)) {
        showAction('Unable to save the reset. Browser storage may be unavailable.', true);
        return;
      }
      editing = false;
      render();
      showAction('Restored the latest Setu template for this prompt.');
    });

    loadCatalog().then(data => {
      catalog = data;
      safeWrite(CACHE_KEY, catalog);
      byId('catalog-status').textContent = 'Latest shared templates · ' + catalog.revision + ' · synced from Setu';
    }).catch(error => {
      const saved = safeRead(CACHE_KEY, null);
      if (validCatalog(saved)) {
        catalog = saved;
        byId('catalog-status').textContent = 'Offline: last saved templates · ' + catalog.revision + ' · may be out of date';
      } else {
        byId('catalog-status').textContent = 'Templates unavailable · ' + error.message + ' Try reopening when connected.';
        showAction('No saved template available in this browser.', true);
        return;
      }
    }).then(() => {
      if (!catalog) return;
      if (!catalog.templates.some(t => t.id === selected)) selected = catalog.templates[0].id;
      render();
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderPrompt, validCatalog, PLACEHOLDERS };
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
