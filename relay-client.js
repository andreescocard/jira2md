/**
 * relay-client.js — injected alongside content.js.
 * Restructures modal layout, adds icons, Copy button, Send to Claude Code.
 * Communicates with relay.js running in VS Code terminal.
 *
 * CHECKBOX FIX STRATEGY
 * content.js reads the description via element.innerText which discards all
 * checkbox state. The fix works at the source: before content.js calls
 * innerText we inject plain text markers ("- [x] " / "- [ ] ") directly into
 * the Jira DOM as text nodes next to each checkbox widget. innerText then
 * picks them up naturally. We remove the injected nodes after the modal opens.
 *
 * STRIKETHROUGH FIX STRATEGY
 * Same problem: innerText discards text-decoration:line-through. Before the
 * read we inject "~~" text nodes at the start and end of each struck element
 * (inline style line-through, or <del>/<s>/<strike>) so innerText yields
 * "~~text~~". Cleaned up with the same marker list.
 *
 * SHARED MARKER SEAM
 * All three injectors take an optional root (default document) so a caller
 * can scope injection to a single comment instead of the whole page.
 * withMarkers(root, fn) is the one seam that runs injectors, calls fn(), and
 * schedules cleanup — used by the main export button today and by future
 * per-comment export buttons. Injectors also skip anything inside an open
 * [contenteditable="true"] region so an unsaved draft never gets mutated.
 */

(function () {
  const RELAY_PORT = 7337;
  const RELAY_URL  = `http://127.0.0.1:${RELAY_PORT}`;

  // Holds text nodes injected into the Jira DOM; cleaned up after modal opens
  let _injectedMarkers = [];

  // ── Checkbox DOM injection ────────────────────────────────────────────────

  function injectCheckboxMarkers(root = document) {
    _injectedMarkers = [];

    // All checkboxes under root that are NOT inside our own modal or an open
    // editable draft — mutating a draft's DOM would corrupt unsaved text.
    // (content.js separately reads [contenteditable="true"] via innerText in
    // edit mode — see content.js:536 — that read doesn't depend on markers,
    // so skipping injection there is safe.)
    const overlay = document.getElementById('j2m-modal-overlay');
    const all = Array.from(root.querySelectorAll('input[type="checkbox"]'));
    const checkboxes = all.filter(cb =>
      (!overlay || !overlay.contains(cb)) && !cb.closest('[contenteditable="true"]')
    );

    checkboxes.forEach(cb => {
      const checked = cb.checked || cb.hasAttribute('checked');
      const marker  = document.createTextNode(checked ? '- [x] ' : '- [ ] ');

      // The checkbox lives inside <span contenteditable="false">.
      // Insert the text node BEFORE that widget so innerText picks it up.
      const widget = cb.closest('[contenteditable="false"]') || cb.parentElement;
      const parent = widget && widget.parentElement;
      if (!parent) return;

      // The task text lives in the next sibling element (e.g. <p>) after the
      // widget span. Inserting the marker BETWEEN two block elements still
      // creates a line break. Insert INSIDE the text container at its start so
      // innerText reads "- [x] Task text" as a single line.
      const textSibling = widget.nextElementSibling;
      if (textSibling) {
        textSibling.insertBefore(marker, textSibling.firstChild);
      } else {
        parent.insertBefore(marker, widget.nextSibling);
      }
      _injectedMarkers.push(marker);
    });
  }

  // ── Strikethrough DOM injection ───────────────────────────────────────────

  const STRIKE_SELECTOR = 'del, s, strike, [style*="line-through"]';

  function injectStrikethroughMarkers(root = document) {
    const overlay = document.getElementById('j2m-modal-overlay');
    const all = Array.from(root.querySelectorAll(STRIKE_SELECTOR));
    // querySelectorAll never matches root itself — check separately so a
    // caller can pass a single struck element as the scope (e.g. a comment).
    if (root.nodeType === 1 && root.matches(STRIKE_SELECTOR)) all.unshift(root);
    // Skip our own modal and open editable drafts (see contenteditable note
    // in injectCheckboxMarkers above).
    const struck = all.filter(el =>
      (!overlay || !overlay.contains(el)) && !el.closest('[contenteditable="true"]')
    );

    struck.forEach(el => {
      // Skip nested matches — only mark the outermost struck element so we
      // don't emit "~~~~text~~~~".
      if (el.parentElement && el.parentElement.closest(STRIKE_SELECTOR)) return;
      if (!(el.textContent || '').trim()) return;

      const open  = document.createTextNode('~~');
      const close = document.createTextNode('~~');
      el.insertBefore(open, el.firstChild);
      el.appendChild(close);
      _injectedMarkers.push(open, close);
    });
  }

  // ── Text color DOM injection ──────────────────────────────────────────────
  // New Jira wraps colored text in spans carrying data-text-custom-color (a hex
  // value). innerText drops the color, so wrap the run in an inline HTML span —
  // the only way to carry color through markdown.

  const COLOR_SELECTOR = '[data-text-custom-color]';

  function injectColorMarkers(root = document) {
    const overlay = document.getElementById('j2m-modal-overlay');
    const all = Array.from(root.querySelectorAll(COLOR_SELECTOR));
    // querySelectorAll never matches root itself — check separately, same as
    // injectStrikethroughMarkers.
    if (root.nodeType === 1 && root.matches(COLOR_SELECTOR)) all.unshift(root);
    // Skip our own modal and open editable drafts (see contenteditable note
    // in injectCheckboxMarkers above).
    const colored = all.filter(el =>
      (!overlay || !overlay.contains(el)) && !el.closest('[contenteditable="true"]')
    );

    colored.forEach(el => {
      // Only the outermost colored element, so we don't nest spans.
      if (el.parentElement && el.parentElement.closest(COLOR_SELECTOR)) return;
      if (!(el.textContent || '').trim()) return;

      const color = (el.getAttribute('data-text-custom-color') || '').trim();
      // Strict hex allowlist — value is DOM-sourced, so reject anything that
      // could break out of the style attribute or the tag.
      if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) return;

      const open  = document.createTextNode(`<span style="color:${color}">`);
      const close = document.createTextNode('</span>');
      el.insertBefore(open, el.firstChild);
      el.appendChild(close);
      _injectedMarkers.push(open, close);
    });
  }

  function removeInjectedMarkers() {
    _injectedMarkers.forEach(n => { if (n.parentNode) n.parentNode.removeChild(n); });
    _injectedMarkers = [];
  }

  // ── Shared marker seam ─────────────────────────────────────────────────────
  // Single entry point that runs all three injectors over root, then fn(),
  // then schedules the fallback cleanup. Both the main export button and
  // future per-comment export buttons should call this rather than the
  // injectors directly, so nobody forgets a step.

  function withMarkers(root = document, fn) {
    injectCheckboxMarkers(root);
    injectStrikethroughMarkers(root);
    injectColorMarkers(root);
    try {
      return fn();
    } finally {
      // Fallback cleanup in case the modal never opens (e.g. error in
      // content.js) — NOT synchronous, restructureModal's own cleanup runs
      // first in the success path and this is just the safety net.
      setTimeout(removeInjectedMarkers, 5000);
    }
  }

  // ── Intercept export button ───────────────────────────────────────────────
  // Wrap content.js's onclick so we inject markers just before it reads
  // innerText, and schedule cleanup after the modal has been created.

  function interceptExportButton() {
    const btn = document.getElementById('jira-to-md-btn');
    if (!btn || btn._j2mPatched) return;
    btn._j2mPatched = true;

    const orig = btn.onclick;
    btn.onclick = function (e) {
      withMarkers(document, () => orig && orig.call(this, e));
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setLabel(btn, emoji, text) {
    btn.textContent = '';
    if (emoji) {
      const ico = document.createElement('span');
      ico.setAttribute('aria-hidden', 'true');
      ico.style.cssText = 'margin-right:7px;font-style:normal;';
      ico.textContent = emoji;
      btn.appendChild(ico);
    }
    btn.appendChild(document.createTextNode(text));
  }

  // ── Injected styles ───────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('j2m-relay-styles')) return;
    const s = document.createElement('style');
    s.id = 'j2m-relay-styles';
    s.textContent = `
      #j2m-modal-container {
        max-width: 1100px !important;
        width: 95vw !important;
      }
      #j2m-modal-body {
        display: flex !important;
        flex-direction: row !important;
        align-items: stretch !important;
        min-height: 0 !important;
      }
      #j2m-modal-footer {
        display: none !important;
      }
      #j2m-modal-header {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        padding-right: 8px !important;
      }
      #j2m-header-icon {
        font-size: 20px;
        line-height: 1;
        flex-shrink: 0;
      }
      #j2m-modal-header h2 {
        flex: 1 !important;
        margin: 0 !important;
      }
      #j2m-header-subtitle {
        display: none !important;
      }
      #j2m-btn-close {
        margin-left: auto;
        flex-shrink: 0;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        color: #97a0af;
        padding: 4px 6px;
        border-radius: 4px;
        transition: color 0.15s, background 0.15s;
      }
      #j2m-btn-close:hover {
        color: #172b4d;
        background: #ebecf0;
      }
      #j2m-button-column {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px 12px;
        min-width: 190px;
        max-width: 190px;
        border-left: 1px solid #dfe1e6;
        background: #f4f5f7;
        box-sizing: border-box;
      }
      #j2m-button-column .j2m-btn {
        width: 100% !important;
        display: flex !important;
        align-items: center !important;
        text-align: left !important;
        padding: 9px 12px !important;
        font-size: 13px !important;
        white-space: nowrap !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        border: 1px solid transparent !important;
        font-weight: 500 !important;
        transition: filter 0.15s !important;
        box-sizing: border-box !important;
      }
      #j2m-button-column .j2m-btn:hover:not(:disabled) { filter: brightness(0.9); }
      #j2m-button-column .j2m-btn:disabled { opacity: 0.6; cursor: not-allowed !important; }
      #j2m-button-column .j2m-btn-secondary {
        background: #fff !important;
        border-color: #dfe1e6 !important;
        color: #42526e !important;
      }
      #j2m-button-column .j2m-btn-primary {
        background: #0052cc !important;
        border-color: #0052cc !important;
        color: #fff !important;
      }
      #j2m-btn-claude-col {
        background: #E8520A !important;
        border-color: #c44208 !important;
        color: #fff !important;
      }
      #j2m-btn-cancel-col {
        margin-top: auto !important;
        background: transparent !important;
        border-color: #dfe1e6 !important;
        color: #97a0af !important;
      }
      #j2m-btn-cancel-col:hover:not(:disabled) {
        color: #dc2626 !important;
        border-color: #dc2626 !important;
        filter: none !important;
      }
      #j2m-col-divider {
        height: 1px;
        background: #dfe1e6;
        margin: 2px 0;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Reshape modal header ──────────────────────────────────────────────────

  function reshapeHeader(modal, meta) {
    const header = modal.querySelector('#j2m-modal-header');
    if (!header || header.querySelector('#j2m-header-icon')) return;

    const icon = document.createElement('span');
    icon.id = 'j2m-header-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📤';
    header.insertBefore(icon, header.firstChild);

    const h2 = header.querySelector('h2');
    if (h2) {
      h2.textContent = '';
      h2.appendChild(document.createTextNode(meta.title + ' — ' + meta.key));
    }

    const subtitle = header.querySelector('span');
    if (subtitle) subtitle.id = 'j2m-header-subtitle';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'j2m-btn-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => {
      const overlay = document.getElementById('j2m-modal-overlay');
      if (overlay) overlay.remove();
    };
    header.appendChild(closeBtn);
  }

  // ── DOM restructure ───────────────────────────────────────────────────────

  function restructureModal(modal, getMarkdown, meta) {
    if (modal.querySelector('#j2m-button-column')) return;

    // Markers have been read by content.js — safe to remove now
    removeInjectedMarkers();

    injectStyles();
    reshapeHeader(modal, meta);

    const footer    = modal.querySelector('#j2m-modal-footer');
    const body      = modal.querySelector('#j2m-modal-body');
    const cancelBtn = modal.querySelector('#j2m-btn-cancel');
    const mdBtn     = modal.querySelector('#j2m-btn-download-md');
    const zipBtn    = modal.querySelector('#j2m-btn-download-bundle');

    if (cancelBtn) setLabel(cancelBtn, '✕', 'Cancel');
    if (mdBtn)     setLabel(mdBtn,     '⬇', 'Download .md');
    if (zipBtn)    setLabel(zipBtn,    '📦', 'Download .zip');

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.id = 'j2m-btn-copy';
    copyBtn.className = 'j2m-btn j2m-btn-secondary';
    setLabel(copyBtn, '📋', 'Copy to Clipboard');
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(getMarkdown());
        setLabel(copyBtn, '✓', 'Copied!');
        setTimeout(() => setLabel(copyBtn, '📋', 'Copy to Clipboard'), 2000);
      } catch {
        setLabel(copyBtn, '✕', 'Copy failed');
        setTimeout(() => setLabel(copyBtn, '📋', 'Copy to Clipboard'), 2000);
      }
    };

    // Claude Code button
    const claudeBtn = document.createElement('button');
    claudeBtn.id = 'j2m-btn-claude-col';
    claudeBtn.className = 'j2m-btn';
    setLabel(claudeBtn, '🟠', 'Send to Claude Code');
    claudeBtn.onclick = async () => {
      setLabel(claudeBtn, '⏳', 'Sending…');
      claudeBtn.disabled = true;
      const safe = meta.title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60);
      const filename = meta.key + '_' + safe + '.md';
      try {
        const res = await fetch(RELAY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: getMarkdown(), filename }),
        });
        if (!res.ok) throw new Error('relay ' + res.status);
        setLabel(claudeBtn, '✓', 'Sent!');
        claudeBtn.style.background = '#16a34a';
        claudeBtn.style.borderColor = '#15803d';
        setTimeout(() => {
          setLabel(claudeBtn, '🟠', 'Send to Claude Code');
          claudeBtn.style.background = '';
          claudeBtn.style.borderColor = '';
          claudeBtn.disabled = false;
        }, 3000);
      } catch {
        setLabel(claudeBtn, '⚠', 'Relay offline');
        claudeBtn.style.background = '#dc2626';
        claudeBtn.style.borderColor = '#b91c1c';
        claudeBtn.title = 'Start relay: node relay.js  (in VS Code terminal)';
        setTimeout(() => {
          setLabel(claudeBtn, '🟠', 'Send to Claude Code');
          claudeBtn.style.background = '';
          claudeBtn.style.borderColor = '';
          claudeBtn.disabled = false;
        }, 4000);
      }
    };

    const col = document.createElement('div');
    col.id = 'j2m-button-column';
    col.appendChild(claudeBtn);

    const divider = document.createElement('div');
    divider.id = 'j2m-col-divider';
    col.appendChild(divider);

    col.appendChild(copyBtn);
    if (zipBtn) col.appendChild(zipBtn);
    if (mdBtn)  col.appendChild(mdBtn);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    col.appendChild(spacer);

    if (cancelBtn) col.appendChild(cancelBtn);

    body.appendChild(col);
  }

  // ── Observer — watches for button + modal ─────────────────────────────────

  const observer = new MutationObserver(() => {
    // Intercept the export button as soon as content.js creates it
    interceptExportButton();

    const modal = document.getElementById('j2m-modal-overlay');
    if (!modal) return;

    const getMarkdown = () => {
      const ta = modal.querySelector('#j2m-markdown-input');
      return ta ? ta.value : '';
    };

    // Read meta from original content.js header text before we rewrite it
    const keyEl    = modal.querySelector('#j2m-modal-header h2');
    const titleEl  = modal.querySelector('#j2m-modal-header span');
    const keyMatch = keyEl && keyEl.textContent.match(/([A-Z]+-\d+)/);
    const meta = {
      key:   keyMatch ? keyMatch[1] : 'ISSUE',
      title: titleEl  ? titleEl.textContent.replace('Editing: ', '').trim() : 'issue',
    };

    restructureModal(modal, getMarkdown, meta);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Shared seam for future per-comment export buttons — they scope root to
  // a single comment instead of document, reusing the same cleanup contract.
  window.__j2mWithMarkers = withMarkers;
})();
