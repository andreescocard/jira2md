/**
 * Jira2Markdown Content Script v1.1.0
 * Modal editor + ZIP bundling + multi-field extraction.
 *
 * Loaded directly by manifest.json (no build step). Globals JSZip,
 * TurndownService and turndownPluginGfm come from libs/* loaded before this.
 */

(function() {
    console.log("[Jira2Markdown] Advanced version loaded.");

    // --- Modal editor ---
    function showEditorModal(initialMarkdown, issueInfo) {
        const overlay = document.createElement('div');
        overlay.id = 'j2m-modal-overlay';

        overlay.innerHTML = `
            <div id="j2m-modal-container">
                <div id="j2m-modal-header">
                    <h2>Jira2Markdown Editor - ${issueInfo.key}</h2>
                    <span style="color: #6b778c; font-size: 12px;">Editing: ${issueInfo.title}</span>
                </div>
                <div id="j2m-modal-body">
                    <div id="j2m-editor-pane">
                        <div style="margin-bottom: 8px; font-weight: bold; color: #5e6c84;">Markdown Editor</div>
                        <textarea id="j2m-markdown-input">${initialMarkdown}</textarea>
                    </div>
                    <div id="j2m-preview-pane">
                        <div style="margin-bottom: 8px; font-weight: bold; color: #5e6c84;">Live Preview (Basic)</div>
                        <div id="j2m-preview-content"></div>
                        <div id="j2m-attachments-list" style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
                            <div style="font-weight: bold; color: #5e6c84; margin-bottom: 8px;">Attachments to Download:</div>
                            <div id="j2m-attachments-content" style="max-height: 200px; overflow-y: auto; font-size: 12px;"></div>
                        </div>
                    </div>
                </div>
                <div id="j2m-modal-footer">
                    <button id="j2m-btn-cancel" class="j2m-btn j2m-btn-secondary">Cancel</button>
                    <button id="j2m-btn-download-md" class="j2m-btn j2m-btn-secondary">Download Markdown Only</button>
                    <button id="j2m-btn-download-bundle" class="j2m-btn j2m-btn-primary">Download with Attachments</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const textarea = overlay.querySelector('#j2m-markdown-input');
        const preview = overlay.querySelector('#j2m-preview-content');
        const attachmentsContent = overlay.querySelector('#j2m-attachments-content');
        const btnCancel = overlay.querySelector('#j2m-btn-cancel');
        const btnDownloadMd = overlay.querySelector('#j2m-btn-download-md');
        const btnDownloadBundle = overlay.querySelector('#j2m-btn-download-bundle');

        // Attachment list
        if (issueInfo.attachments && issueInfo.attachments.length > 0) {
            let attachmentHtml = '';
            issueInfo.attachments.forEach((att) => {
                attachmentHtml += `<div style="padding: 4px; border-bottom: 1px solid #eee;">✓ ${att.name}</div>`;
            });
            attachmentsContent.innerHTML = attachmentHtml;
        } else {
            attachmentsContent.innerHTML = '<div style="color: #999; font-style: italic;">No attachments found</div>';
        }

        // Basic preview (headings + line breaks only, no full markdown parser)
        const updatePreview = () => {
            const text = textarea.value;
            preview.innerHTML = text
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
                .replace(/\n/g, '<br>');
        };

        textarea.addEventListener('input', updatePreview);
        updatePreview();

        const closeModal = () => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        };

        btnCancel.onclick = closeModal;

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        };

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        btnDownloadMd.onclick = async () => {
            btnDownloadMd.innerText = "Downloading...";
            btnDownloadMd.disabled = true;
            const finalMarkdown = textarea.value;
            await generateZipArchive(finalMarkdown, issueInfo, false);
            closeModal();
        };

        btnDownloadBundle.onclick = async () => {
            btnDownloadBundle.innerText = "Processing Assets...";
            btnDownloadBundle.disabled = true;
            const finalMarkdown = textarea.value;
            await generateZipArchive(finalMarkdown, issueInfo, true);
            closeModal();
        };
    }

    // --- Attachment extraction ---
    async function extractAttachments() {
        const attachments = [];

        let issueKey = document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]')?.innerText.trim() || '';
        issueKey = issueKey.replace(/\s*Export\s+MD\s+Bundle\s*/gi, '').trim();

        if (!issueKey) {
            console.log('[Jira2Markdown] Could not find issue key');
            return attachments;
        }

        // Strategy 1: Jira REST API
        try {
            const apiV2Url = `/rest/api/2/issue/${issueKey}`;
            let response = await fetch(apiV2Url);

            if (!response.ok) {
                const apiV3Url = `/rest/api/3/issues/${issueKey}`;
                response = await fetch(apiV3Url);
            }

            if (response.ok) {
                const issueData = await response.json();

                let attachmentArray = [];
                if (issueData.fields && issueData.fields.attachment) {
                    attachmentArray = issueData.fields.attachment;
                }

                attachmentArray.forEach((att) => {
                    const fileName = att.filename || `attachment_${att.id}`;
                    const downloadUrl = att.content || att.download || att.url || '';
                    if (downloadUrl) {
                        attachments.push({
                            url: downloadUrl,
                            name: fileName,
                            fileId: att.id,
                            size: att.size
                        });
                    }
                });
            }
        } catch (apiError) {
            console.error('[Jira2Markdown] Failed to fetch from API:', apiError);
        }

        // Strategy 2: DOM fallback
        if (attachments.length === 0) {
            const filmstripWrapper = document.querySelector('[id="newFileExperienceWrapper"]') ||
                                    document.querySelector('[data-testid*="filmstrip-view"]');
            if (filmstripWrapper) {
                const imgs = filmstripWrapper.querySelectorAll('img');
                imgs.forEach((img) => {
                    const src = img.getAttribute('src') || '';
                    const fileId = img.getAttribute('data-fileid') || '';

                    if (fileId) {
                        let downloadUrl = src;
                        if (src.includes('media-cdn.atlassian.com')) {
                            downloadUrl = src.split('?')[0];
                        }

                        let fileName = `attachment_${fileId}`;
                        const pageText = document.body.innerText;
                        const filePattern = /[\w\-]+\.(png|jpg|jpeg|pdf|doc|docx|xls|xlsx|zip|rar|txt|csv|log|json|xml)/gi;
                        let fileMatch;
                        while ((fileMatch = filePattern.exec(pageText)) !== null) {
                            fileName = fileMatch[0];
                            break;
                        }

                        attachments.push({
                            url: downloadUrl,
                            name: fileName,
                            fileId: fileId,
                            originalSrc: src
                        });
                    }
                });
            }
        }

        return attachments;
    }

    // --- ZIP bundle download ---
    async function generateZipArchive(markdown, issueInfo, includeAttachments = false) {
        const zip = new JSZip();

        let cleanTitle = issueInfo.title.replace(/Export\s+MD\s+Bundle/gi, '').trim();
        if (!cleanTitle) {
            cleanTitle = 'No Title';
        }

        const mdFileName = `${issueInfo.key}_${cleanTitle}.md`;

        let updatedMarkdown = markdown;
        const fetchPromises = [];

        if (includeAttachments) {
            const assetsFolder = zip.folder("assets");

            const imgRegex = /!\[.*?\]\((https?:\/\/.*?)\)/g;
            let match;
            let assetCount = 0;

            while ((match = imgRegex.exec(markdown)) !== null) {
                const url = match[1];
                const ext = url.split('.').pop().split(/[?#]/)[0] || 'png';
                const fileName = `image_${++assetCount}.${ext}`;
                const relativePath = `./assets/${fileName}`;

                updatedMarkdown = updatedMarkdown.replace(url, relativePath);

                const fetchTask = fetch(url)
                    .then(res => res.blob())
                    .then(blob => {
                        assetsFolder.file(fileName, blob);
                    })
                    .catch(err => console.error(`Failed to fetch asset: ${url}`, err));

                fetchPromises.push(fetchTask);
            }

            const attachments = issueInfo.attachments || [];
            attachments.forEach((attachment) => {
                const fileName = `${attachment.name}`;
                const fetchTask = fetch(attachment.url)
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.blob();
                    })
                    .then(blob => {
                        assetsFolder.file(fileName, blob);
                    })
                    .catch(err => {
                        console.error(`[Jira2Markdown] Failed to fetch attachment: ${attachment.url}`, err);
                    });

                fetchPromises.push(fetchTask);
            });

            await Promise.all(fetchPromises);

            zip.file(mdFileName, updatedMarkdown);

            const content = await zip.generateAsync({ type: "blob" });
            const zipFileName = `${issueInfo.key}_${cleanTitle}_Bundle.zip`;

            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = zipFileName;
            link.click();
        } else {
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = mdFileName;
            link.click();
        }
    }

    let turndownService;
    function initTurndown() {
        if (typeof TurndownService === 'undefined') return false;
        if (turndownService) return true;

        turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            emDelimiter: '*',
            bulletListMarker: '-',
            hr: '---'
        });

        if (typeof turndownPluginGfm !== 'undefined') {
            turndownService.use(turndownPluginGfm.gfm);
        } else {
            console.warn('[Jira2Markdown] GFM plugin not found');
        }

        turndownService.addRule('table', {
            filter: 'table',
            replacement: function(content) {
                return '\n\n' + content + '\n\n';
            }
        });

        turndownService.addRule('table-row', {
            filter: 'tr',
            replacement: function(content, node) {
                var row = '';
                var cells = node.querySelectorAll('th, td');

                for (var i = 0; i < cells.length; i++) {
                    var cellText = cells[i].innerText.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
                    row += ' ' + cellText + ' |';
                }

                if (node.parentNode.tagName === 'THEAD' || node.querySelector('th')) {
                    row += '\n';
                    for (var j = 0; j < cells.length; j++) {
                        row += ' --- |';
                    }
                }

                return row + '\n';
            }
        });

        turndownService.addRule('table-cell', {
            filter: ['th', 'td'],
            replacement: function(content) {
                return content;
            }
        });

        turndownService.addRule('pre', {
            filter: 'pre',
            replacement: function(content, node) {
                var code = node.textContent || '';
                var cleanedCode = code.split('\n').join('\n').trim();

                var language = '';
                var codeElement = node.querySelector('code');
                if (codeElement && codeElement.className) {
                    var match = codeElement.className.match(/language-(\w+)/);
                    if (match) {
                        language = match[1];
                    }
                }

                return '\n```' + language + '\n' + cleanedCode + '\n```\n';
            }
        });

        turndownService.addRule('code', {
            filter: function(node) {
                return node.tagName === 'CODE' && node.parentNode.tagName !== 'PRE';
            },
            replacement: function(content, node) {
                return '`' + (node.textContent || '').trim() + '`';
            }
        });

        turndownService.addRule('cleanup-jira-attrs', {
            filter: function(node) {
                if (node.nodeType !== 1) return false;
                return node.className && node.className.includes('_');
            },
            replacement: function(content) {
                return content;
            }
        });

        return true;
    }

    // Convert a single rich-text field container (e.g. description, User Story,
    // Acceptance Criteria) into markdown. Reuses Turndown for tables/code and
    // falls back to innerText for plain content.
    function convertFieldToMarkdown(container) {
        const renderer = container.querySelector('.ak-renderer-document') || container;
        const html = renderer.innerHTML || '';

        const hasTable = html.includes('<table') || html.includes('<tbody') || html.includes('<tr');
        const hasCode = html.includes('<pre') || html.includes('<code');

        if ((hasTable || hasCode) && turndownService) {
            try {
                let cleanedHtml = html.replace(/<img[^>]*data-emoji[^>]*>/g, function(match) {
                    var altMatch = match.match(/alt="([^"]+)"/);
                    var shortNameMatch = match.match(/data-emoji-short-name="([^"]+)"/);
                    return altMatch ? altMatch[1] : (shortNameMatch ? shortNameMatch[1] : ':emoji:');
                });

                let converted = turndownService.turndown(cleanedHtml);

                if (converted) {
                    converted = converted
                        .replace(/<br>/g, '')
                        .replace(/\n\s+\n/g, '\n')
                        .replace(/\n\n\n+/g, '\n\n')
                        .replace(/^\n+/, '')
                        .replace(/\n+$/, '');
                }

                if (converted && typeof converted === 'string' && converted.trim().length > 0) {
                    return converted;
                }
                return (renderer.innerText || renderer.textContent || '').trim();
            } catch (e) {
                console.warn('[Jira2Markdown] Turndown error: ' + e.message + ', using innerText fallback');
                return (renderer.innerText || renderer.textContent || '').trim();
            }
        }

        return (renderer.innerText || renderer.textContent || '').trim();
    }

    // Jira renders every field block with a heading title element carrying one
    // of these component selectors. Anchoring on the heading (instead of on a
    // field-type-specific testid) lets us walk every field, whatever its type:
    // rich text, plain text area, checkbox, select, ...
    const FIELD_HEADING_SELECTOR = [
        '[data-component-selector="jira-issue-field-heading-multiline-field-heading-title"]',
        '[data-component-selector="jira-issue-field-heading-field-heading-title"]'
    ].join(', ');

    // Nodes that hold a field's rendered value in view mode.
    const FIELD_VALUE_SELECTOR = [
        '.ak-renderer-document',
        '[data-testid="issue-internal-fields.text-area.text-content-area"]',
        '[data-component-selector="jira-issue-field-inline-edit-read-view-container"]',
        '[data-read-view-fit-container-width="true"]'
    ].join(', ');

    // Placeholder text Jira shows for an empty field, per locale.
    const EMPTY_FIELD_VALUES = [
        'none', 'nenhum', 'nenhuma', 'ninguno', 'aucun', 'keine', 'nessuno',
        'なし', '-', '_'
    ];

    function isEmptyFieldValue(text) {
        const t = (text || '').trim().toLowerCase();
        if (!t) return true;
        return EMPTY_FIELD_VALUES.indexOf(t) !== -1;
    }

    // Given a heading title element, find the smallest ancestor that also holds
    // the field's value node. Bails out if the ancestor swallows a second
    // heading — that means we climbed past this field's own block.
    function findFieldBlock(heading) {
        let el = heading;
        for (let i = 0; i < 8 && el; i++) {
            el = el.parentElement;
            if (!el) break;
            if (el.querySelectorAll(FIELD_HEADING_SELECTOR).length > 1) return null;
            const value = el.querySelector(FIELD_VALUE_SELECTOR);
            if (value && !heading.contains(value)) return { block: el, value: value };
        }
        return null;
    }

    // Extract a field's value as markdown. Rich text goes through Turndown,
    // everything else through innerText.
    function extractFieldValue(block, valueNode) {
        const rich = block.querySelector('[data-testid^="issue.views.field.rich-text."]');
        if (rich) return convertFieldToMarkdown(rich);

        let text = valueNode.innerText || '';
        // Plain text-area fields keep their line breaks as raw newlines in the
        // source. If innerText collapsed them (no pre-wrap applied), fall back
        // to textContent so multi-line values are not flattened into one line.
        const raw = valueNode.textContent || '';
        if (text.indexOf('\n') === -1 && raw.indexOf('\n') !== -1) text = raw;

        return text
            .split('\n')
            .map(line => line.replace(/\s+$/, ''))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // Best-effort lookup of a rich-text field's display label (e.g. "User
    // Story", "Acceptance Criteria"). Walks up a few ancestors looking for a
    // heading/label element that sits outside the field value itself.
    function getFieldLabel(container) {
        let el = container;
        for (let i = 0; i < 6 && el; i++) {
            el = el.parentElement;
            if (!el) break;
            const candidates = el.querySelectorAll(
                'h2, h3, [role="heading"], label, [data-testid*="heading"], [data-testid*="label"]'
            );
            for (const c of candidates) {
                if (container.contains(c)) continue;
                const txt = (c.innerText || c.textContent || '').trim();
                if (txt && txt.length <= 80) return txt;
            }
        }
        return '';
    }

    // --- Pure helpers (also exposed for unit testing, see bottom of file) ---

    function pad2(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    // Formats an absolute Date as 'YYYY-MM-DD HH:mm' (local time). Falls back
    // to the trimmed fallbackText when date isn't a usable Date, and to ''
    // when neither is usable. Never throws on bad input.
    function formatCommentTimestamp(date, fallbackText) {
        if (date instanceof Date && !isNaN(date.getTime())) {
            const y = date.getFullYear();
            const m = pad2(date.getMonth() + 1);
            const d = pad2(date.getDate());
            const h = pad2(date.getHours());
            const min = pad2(date.getMinutes());
            return `${y}-${m}-${d} ${h}:${min}`;
        }
        return (fallbackText || '').trim();
    }

    // Shifts every ATX heading (# .. ######) so none outranks minLevel —
    // i.e. every heading level is clamped to at least minLevel, capped at 6
    // (there is no level-7 heading). Tracks fenced code blocks (``` and ~~~,
    // any fence length, with or without an info string) so a "# comment"
    // inside a fence is left untouched. ATX only: setext headings
    // ("Title\n=====") are a known limitation and are not detected.
    function demoteMarkdownHeadings(md, minLevel) {
        if (typeof md !== 'string' || !md) return md || '';

        const lines = md.split('\n');
        let fenceChar = null;
        let fenceLen = 0;

        const out = lines.map(line => {
            const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
            if (fenceMatch) {
                const marker = fenceMatch[1];
                const char = marker[0];
                const len = marker.length;
                if (fenceChar === null) {
                    // Opening fence.
                    fenceChar = char;
                    fenceLen = len;
                } else if (char === fenceChar && len >= fenceLen) {
                    // Matching (or longer) closing fence.
                    fenceChar = null;
                    fenceLen = 0;
                }
                return line;
            }

            if (fenceChar !== null) return line;

            const headingMatch = line.match(/^(#{1,6})(\s+.*)?$/);
            if (!headingMatch) return line;

            const level = headingMatch[1].length;
            const newLevel = Math.min(6, Math.max(level, minLevel));
            return '#'.repeat(newLevel) + (headingMatch[2] || '');
        });

        return out.join('\n');
    }

    // Comments render in whatever order the DOM happens to give them, but
    // Jira's own UI has a newest-first/oldest-first toggle for the thread —
    // DOM order is therefore not trustworthy. Returns a NEW array (input is
    // never mutated); comments with no parseable timestamp keep their
    // original relative order and are placed after every dated one.
    function sortCommentsChronologically(comments) {
        if (!Array.isArray(comments)) return [];

        const withDate = [];
        const withoutDate = [];
        comments.forEach(c => {
            if (c && c.timestamp instanceof Date && !isNaN(c.timestamp.getTime())) {
                withDate.push(c);
            } else {
                withoutDate.push(c);
            }
        });

        withDate.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return withDate.concat(withoutDate);
    }

    // --- Comment extraction ---

    // Jira's comment markup churns across Jira Software/JSM, and even across
    // releases of the same product, so we try several known testids in
    // order rather than trusting a single one. First match wins per
    // candidate, most specific first; see dedupeContainers() for how
    // overlapping matches are collapsed into one comment.
    const COMMENT_SELECTOR = [
        '[data-testid^="issue-comment-base.ui.comment"]',
        '[data-testid^="issue.activity.comment"]',
        '[data-testid*="comment-container"]'
    ].join(', ');

    // Used only to tell "no comments matched" apart from "there is no
    // comment section on this page", so the zero-match warning below fires
    // solely when there is visibly something to have matched.
    const COMMENT_SECTION_HINT_SELECTOR = [
        '[data-testid*="activity-comment"]',
        '[data-testid*="issue-comment"]',
        '[data-testid*="comment-count"]',
        '[data-testid*="activity-feed"]'
    ].join(', ');

    const LOAD_MORE_COMMENTS_PATTERN = /load more|show more|older comment/i;

    // Drop any matched node that is contained by another matched node, so a
    // comment matched by more than one selector candidate (or a wrapper and
    // its own inner container) is only counted once. Same idea as the
    // containment check used for the rich-text fallback fields above.
    function dedupeContainers(nodes) {
        return nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
    }

    // Strip button/icon text the same way the issue title is cleaned up
    // above, so the author name comes back plain.
    function extractAuthorName(commentEl) {
        const authorEl = commentEl.querySelector(
            '[data-testid*="comment-header"] a, [data-testid*="author"], a[href*="/jira/people/"]'
        );
        if (!authorEl) return '';
        const clone = authorEl.cloneNode(true);
        clone.querySelectorAll('button, svg').forEach(el => el.remove());
        return (clone.textContent || '').trim();
    }

    // Absolute timestamps only — never a relative "3 days ago" string, since
    // that is meaningless once pasted into a static markdown file. A <time>
    // element's datetime attribute is authoritative; failing that, Jira
    // often carries the absolute date in a title/aria-label tooltip; visible
    // text is the last, least reliable, resort.
    function extractCommentTimestamp(commentEl) {
        const timeEl = commentEl.querySelector('time');
        let raw = '';
        let text = '';

        if (timeEl) {
            raw = timeEl.getAttribute('datetime') || timeEl.getAttribute('title') || timeEl.getAttribute('aria-label') || '';
            text = (timeEl.innerText || timeEl.textContent || '').trim();
        }
        if (!raw) {
            const titled = commentEl.querySelector('[title*=":"], [aria-label*=":"]');
            if (titled) raw = titled.getAttribute('title') || titled.getAttribute('aria-label') || '';
        }
        if (!text) {
            const anyTime = commentEl.querySelector('time, [data-testid*="timestamp"], [data-testid*="created"]');
            text = anyTime ? (anyTime.innerText || anyTime.textContent || '').trim() : '';
        }

        const parsed = raw ? new Date(raw) : null;
        const validDate = parsed && !isNaN(parsed.getTime()) ? parsed : null;
        return { date: validDate, text: text };
    }

    // Positive detection only: a comment is flagged restricted when a JSM
    // internal-comment badge or a visibility-lock indicator is found.
    // Absence of the marker leaves restricted false — we never assert
    // "public" from silence, since a stale selector would otherwise
    // mislabel a genuinely internal comment.
    function isRestrictedComment(commentEl) {
        const marker = commentEl.querySelector(
            '[data-testid*="internal"], [data-testid*="restricted"], [data-testid*="visibility"], ' +
            '[aria-label*="Internal" i], [aria-label*="restricted" i]'
        );
        return !!marker;
    }

    // Comment bodies embed images via short-lived, token-signed Atlassian
    // Media URLs that 404 once the token expires, and media "cards" (files,
    // videos) often carry no <img> at all. Replace every image/media card
    // with a plain text marker instead of the raw (soon-dead) URL or a
    // base64 inline copy. Runs on a detached clone so the live DOM is
    // untouched.
    function stripCommentMedia(container) {
        const clone = container.cloneNode(true);
        clone.querySelectorAll('img, [data-testid*="media-card"], [data-testid*="media-single"]').forEach(mediaEl => {
            const name = mediaEl.getAttribute('alt') ||
                        mediaEl.getAttribute('title') ||
                        mediaEl.getAttribute('aria-label') ||
                        mediaEl.getAttribute('data-filename') ||
                        mediaEl.getAttribute('data-media-filename') ||
                        '';
            const marker = document.createTextNode(name ? `[image: ${name}]` : '[image]');
            mediaEl.replaceWith(marker);
        });
        return clone;
    }

    function findCommentBody(commentEl) {
        return commentEl.querySelector('.ak-renderer-document') ||
               commentEl.querySelector(FIELD_VALUE_SELECTOR) ||
               commentEl;
    }

    // Best-effort detection of a still-present "Load more comments" control,
    // so an export never silently claims completeness when Jira has only
    // rendered the most recent page of a long thread.
    function findLoadMoreComments(root) {
        const candidates = root.querySelectorAll('button, [role="button"], a');
        for (const el of candidates) {
            const text = (el.innerText || el.textContent || '').trim();
            if (text && LOAD_MORE_COMMENTS_PATTERN.test(text)) return text;
        }
        return null;
    }

    // Extract every visible comment into a plain object. Never throws:
    // handleExport's own try/catch is the safety net for the whole export,
    // but a comment-shaped page with unexpected markup should degrade to
    // "no comments found" rather than take the rest of the export down.
    function extractComments() {
        let matched = [];
        try {
            matched = dedupeContainers(Array.from(document.querySelectorAll(COMMENT_SELECTOR)));
        } catch (e) {
            console.warn('[Jira2Markdown] Comment selector failed: ' + e.message);
        }

        const comments = [];
        matched.forEach(commentEl => {
            try {
                const author = extractAuthorName(commentEl) || 'Unknown';
                const timestamp = extractCommentTimestamp(commentEl);
                const bodyContainer = findCommentBody(commentEl);
                const strippedBody = stripCommentMedia(bodyContainer);
                const bodyMarkdown = convertFieldToMarkdown(strippedBody);
                if (isEmptyFieldValue(bodyMarkdown)) return;

                comments.push({
                    author: author,
                    timestamp: timestamp.date,
                    timestampText: timestamp.text,
                    bodyMarkdown: bodyMarkdown,
                    restricted: isRestrictedComment(commentEl)
                });
            } catch (e) {
                console.warn('[Jira2Markdown] Skipped a comment due to error: ' + e.message);
            }
        });

        // The extension already shipped a bug once where extraction
        // "silently dropped" content (see the field-walk fallback above) —
        // do not repeat it for comments. Only warn when the page visibly
        // has a comment section but our selectors matched nothing in it.
        let warning = '';
        if (comments.length === 0) {
            const hasCommentSection = !!document.querySelector(COMMENT_SECTION_HINT_SELECTOR);
            if (hasCommentSection) {
                warning = 'jira2md: 0 comments matched — comment selectors may be stale';
                console.warn('[Jira2Markdown] ' + warning);
            }
        }

        let loadMoreNotice = '';
        const loadMoreText = findLoadMoreComments(document);
        if (loadMoreText) {
            loadMoreNotice = 'jira2md: older comments not loaded in the page were not exported';
            const countMatch = loadMoreText.match(/\d+/);
            if (countMatch) loadMoreNotice += ' (' + countMatch[0] + ')';
        }

        return { comments: sortCommentsChronologically(comments), warning: warning, loadMoreNotice: loadMoreNotice };
    }

    // --- Main export flow ---
    async function handleExport() {
        if (!initTurndown()) return alert("Library loading...");

        try {
            let issueKey = document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]')?.innerText.trim() || 'Jira';
            issueKey = issueKey.replace(/\s*Export\s+MD\s+Bundle\s*/gi, '').trim();

            let title = 'No Title';
            const headingElement = document.querySelector('[data-testid="issue.views.issue-base.foundation.summary.heading"]');
            if (headingElement) {
                const clonedElement = headingElement.cloneNode(true);
                clonedElement.querySelectorAll('button').forEach(btn => btn.remove());
                title = clonedElement.textContent.trim();
            }

            title = title.replace(/Export\s+MD\s+Bundle/gi, '')
                        .replace(/Download[^a-zA-Z]*/gi, '')
                        .replace(/\s+/g, ' ')
                        .trim();

            if (!title || title.length === 0) {
                title = 'No Title';
            }

            const attachments = await extractAttachments();

            let initialMarkdown = `# ${title}\n\n`;

            // --- Description (kept at top, no sub-heading) ---
            // Edit mode: read the active contenteditable. View mode: render via Turndown.
            let descriptionText = '';
            const editableDesc = document.querySelector('[data-testid*="description"] [contenteditable="true"]') ||
                                 document.querySelector('[contenteditable="true"]');
            if (editableDesc) {
                descriptionText = editableDesc.innerText || '';
            }
            if (!descriptionText) {
                const descriptionContainer = document.querySelector('[data-testid="issue.views.field.rich-text.description"]');
                if (descriptionContainer) {
                    descriptionText = convertFieldToMarkdown(descriptionContainer);
                }
            }
            if (descriptionText) {
                initialMarkdown += descriptionText;
            }

            // --- Every other field, in DOM order ---
            // Walks field headings rather than a single field-type testid, so
            // plain text areas (Steps to Reproduce, Expected/Actual Result),
            // checkbox/select fields (Devices) and rich-text custom fields
            // (User Story, Acceptance Criteria) all get exported. The old
            // version matched only rich-text and silently dropped the rest.
            const headings = Array.from(document.querySelectorAll(FIELD_HEADING_SELECTOR));
            const emittedRichText = [];
            let fieldCount = 0;

            headings.forEach(heading => {
                const found = findFieldBlock(heading);
                if (!found) return;

                // Description already emitted at the top, without a heading.
                if (found.block.querySelector('[data-testid="issue.views.field.rich-text.description"]')) return;

                const label = (heading.innerText || heading.textContent || '').trim();
                if (!label) return;

                const content = extractFieldValue(found.block, found.value);
                if (isEmptyFieldValue(content)) return;

                const rich = found.block.querySelector('[data-testid^="issue.views.field.rich-text."]');
                if (rich) emittedRichText.push(rich);

                initialMarkdown += `\n\n## ${label}\n\n${content}`;
                fieldCount++;
            });

            // Fallback: rich-text fields whose heading uses a markup we did not
            // recognise would otherwise be lost.
            const allRichText = Array.from(
                document.querySelectorAll('[data-testid^="issue.views.field.rich-text."]')
            );
            allRichText.forEach(container => {
                const testid = container.getAttribute('data-testid') || '';
                if (testid === 'issue.views.field.rich-text.description') return;
                if (emittedRichText.some(done => done === container || done.contains(container))) return;
                if (allRichText.some(other => other !== container && other.contains(container))) return;

                const content = convertFieldToMarkdown(container);
                if (isEmptyFieldValue(content)) return;

                const label = getFieldLabel(container) ||
                              testid.replace('issue.views.field.rich-text.', '');

                initialMarkdown += `\n\n## ${label}\n\n${content}`;
                fieldCount++;
            });

            // --- Comments ---
            // Kept separate from the field walk above: the comment thread
            // lives in a distinct activity feed, not among the issue's
            // fields, and needs its own author/timestamp handling plus a
            // heading demotion (below) so a heading pasted inside a comment
            // body can't outrank the comment's own attribution line.
            const { comments, warning, loadMoreNotice } = extractComments();

            if (comments.length > 0 || warning || loadMoreNotice) {
                initialMarkdown += '\n\n## Comments\n';
                if (loadMoreNotice) initialMarkdown += `\n<!-- ${loadMoreNotice} -->\n`;
                if (warning) initialMarkdown += `\n\n<!-- ${warning} -->\n`;

                comments.forEach(comment => {
                    const formattedTimestamp = formatCommentTimestamp(comment.timestamp, comment.timestampText);
                    const restrictedTag = comment.restricted ? ' **[INTERNAL]**' : '';
                    const body = demoteMarkdownHeadings(comment.bodyMarkdown, 4);
                    initialMarkdown += `\n\n### ${comment.author} — ${formattedTimestamp}${restrictedTag}\n\n${body}`;
                });
            }

            console.log('[Jira2Markdown] Final markdown length: ' + initialMarkdown.length +
                        ' (' + fieldCount + ' extra fields, ' + comments.length + ' comments)');

            showEditorModal(initialMarkdown, { key: issueKey, title: title, attachments: attachments });

        } catch (error) {
            console.error("[Jira2Markdown] Export error:", error);
        }
    }

    // --- Button injection ---
    function injectButton() {
        if (document.getElementById('jira-to-md-btn')) return;
        const target = document.querySelector('[data-testid="issue-view.views.common.content.main.content-column.top-navigation.actions-bar"]') ||
                     document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]');
        if (target) {
            const btn = document.createElement('button');
            btn.id = 'jira-to-md-btn';
            btn.className = 'jira-md-export-button';
            btn.innerHTML = 'Export MD Bundle';
            btn.onclick = handleExport;
            target.appendChild(btn);
        }
    }

    // Exposed so test/test.html can exercise the pure helpers above without
    // a build step or DOM fixtures. Inert on a real Jira page — it only
    // attaches function references, no DOM access happens here.
    window.__j2mTestables = {
        formatCommentTimestamp: formatCommentTimestamp,
        demoteMarkdownHeadings: demoteMarkdownHeadings,
        sortCommentsChronologically: sortCommentsChronologically
    };

    // Button injection + the observer that re-triggers it are meaningless
    // off a real Jira issue page (e.g. when this file is loaded standalone
    // by test/test.html), and document.body may not exist yet if the
    // script runs from <head>. Guard so that case no-ops instead of
    // throwing.
    if (document.body) {
        let timeout = null;
        const observer = new MutationObserver(() => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(injectButton, 500);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(injectButton, 1000);
    }
})();
