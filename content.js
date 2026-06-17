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

            // --- Other rich-text fields (User Story, Acceptance Criteria, ...) ---
            // Every custom rich-text field renders as
            // [data-testid="issue.views.field.rich-text.<customfield_id>"].
            // The old version only read the description and dropped all of these.
            const allRichText = Array.from(
                document.querySelectorAll('[data-testid^="issue.views.field.rich-text."]')
            );

            // Drop the description (handled above) and any field nested inside
            // another matched field, to avoid duplicate output.
            const fields = allRichText.filter(container => {
                const testid = container.getAttribute('data-testid') || '';
                if (testid === 'issue.views.field.rich-text.description') return false;
                return !allRichText.some(other => other !== container && other.contains(container));
            });

            fields.forEach(container => {
                const content = convertFieldToMarkdown(container);
                if (!content || !content.trim()) return;

                const testid = container.getAttribute('data-testid') || '';
                const label = getFieldLabel(container) ||
                              testid.replace('issue.views.field.rich-text.', '');

                initialMarkdown += `\n\n## ${label}\n\n${content}`;
            });

            console.log('[Jira2Markdown] Final markdown length: ' + initialMarkdown.length +
                        ' (' + fields.length + ' extra rich-text fields)');

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

    let timeout = null;
    const observer = new MutationObserver(() => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(injectButton, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectButton, 1000);
})();
