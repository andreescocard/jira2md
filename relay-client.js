/**
 * relay-client.js — injected alongside content.js.
 * Restructures modal layout, adds icons, Copy button, Send to Claude Code.
 * Communicates with relay.js running in VS Code terminal.
 */

(function () {
  const RELAY_PORT = 7337;
  const RELAY_URL  = `http://127.0.0.1:${RELAY_PORT}`;

  // ── Patch TurndownService for Jira task lists ─────────────────────────────
  // Jira Cloud renders checkboxes as <li data-task-list-item data-checked="true/false">
  // not as <input type="checkbox">, so the GFM plugin misses them.
  // We wrap the constructor so every instance gets the rule automatically,
  // before content.js creates its instance.

  (function patchTurndown() {
    if (!window.TurndownService) return;
    const Orig = window.TurndownService;

    window.TurndownService = function TurndownService(opts) {
      const inst = new Orig(opts);

      // Jira Cloud ADF task list items
      inst.addRule('jira-task-list-item', {
        filter: function (node) {
          return node.nodeName === 'LI' && node.hasAttribute('data-task-list-item');
        },
        replacement: function (content, node) {
          const checked = node.getAttribute('data-checked') === 'true';
          return '\n' + (checked ? '- [x] ' : '- [ ] ') + content.trim();
        },
      });

      // Jira Server / older Cloud: <li class="task-list-item">
      inst.addRule('jira-task-list-item-class', {
        filter: function (node) {
          return node.nodeName === 'LI' &&
            node.className && node.className.includes('task-list-item');
        },
        replacement: function (content, node) {
          const checked = node.className.includes('checked') ||
            node.getAttribute('aria-checked') === 'true';
          return '\n' + (checked ? '- [x] ' : '- [ ] ') + content.trim();
        },
      });

      return inst;
    };

    Object.setPrototypeOf(window.TurndownService, Orig);
    window.TurndownService.prototype = Orig.prototype;
  })();

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

  // ── DOM restructure ───────────────────────────────────────────────────────

  function restructureModal(modal, getMarkdown, meta) {
    if (modal.querySelector('#j2m-button-column')) return;

    injectStyles();

    const footer    = modal.querySelector('#j2m-modal-footer');
    const body      = modal.querySelector('#j2m-modal-body');
    const cancelBtn = modal.querySelector('#j2m-btn-cancel');
    const mdBtn     = modal.querySelector('#j2m-btn-download-md');
    const zipBtn    = modal.querySelector('#j2m-btn-download-bundle');

    // Update labels on existing buttons (handlers stay intact)
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

    // Build column: Claude | divider | Copy | .zip | .md | spacer | Cancel
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

  // ── Observer ──────────────────────────────────────────────────────────────

  const observer = new MutationObserver(() => {
    const modal = document.getElementById('j2m-modal-overlay');
    if (!modal) return;
    const getMarkdown = () => {
      const ta = modal.querySelector('#j2m-markdown-input');
      return ta ? ta.value : '';
    };
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
})();
