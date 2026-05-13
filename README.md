<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/counterclockwise-arrows-button_1f504.png" width="96" alt="jira2md" />
</p>

# 📋 jira2md

**one click. full issue. clean markdown.**

[![Stars](https://img.shields.io/github/stars/andreescocard/jira2md?style=flat&color=yellow)](https://github.com/andreescocard/jira2md/stargazers) [![Last Commit](https://img.shields.io/github/last-commit/andreescocard/jira2md?style=flat)](https://github.com/andreescocard/jira2md/commits/main) [![License](https://img.shields.io/github/license/andreescocard/jira2md?style=flat)](./LICENSE)

[What is this?](#what-is-this) • [Features](#features) • [Installation](#installation) • [Usage](#usage) • [Claude Code integration](#claude-code-integration-vs-code) • [Tech Stack](#tech-stack)

---

A Chrome extension that runs on any Jira issue page and converts the full issue — title, description, comments, and attachments — into a clean Markdown document, directly in your browser.

Built for real development work:

- export faster
- document without copy-pasting
- keep issues versioned in Markdown
- feed issue context directly into AI tools

## What is this?

`jira2md` is a browser tool for converting Jira issues into portable Markdown.

Not a Jira replacement.  
Not a sync service.  
Not a SaaS product.

Just a practical thing for when you need:

- a local copy of an issue
- Markdown for your docs or PR description
- attachments bundled alongside the write-up
- a clean snapshot of a ticket to feed into an AI coding assistant

## Features

- **One-click export** — button appears on every Jira issue page
- **Modal editor** — review and edit Markdown before saving
- **Live preview** — rendered HTML alongside the raw editor
- **Copy to clipboard** — one click, paste anywhere
- **Asset bundling** — downloads attachments alongside the `.md` file as a `.zip`
- **GFM support** — tables, task lists, and strikethrough via GitHub Flavored Markdown
- **Claude Code integration** — send the issue directly to Claude Code in your VS Code terminal
- **No server required** — everything runs locally in the browser

## Modal Layout

```
┌─────────────────────────────────────────┬──────────────────────┐
│  Header (key + title)                   │                      │
├──────────────────────┬──────────────────┤  🟠 Send to Claude   │
│                      │                  │  ─────────────────   │
│   Markdown Editor    │  Live Preview    │  📋 Copy Clipboard   │
│                      │                  │  📦 Download .zip    │
│                      │                  │  ⬇  Download .md     │
│                      │                  │                      │
│                      │                  │  ✕  Cancel           │
└──────────────────────┴──────────────────┴──────────────────────┘
```

## Before / After

### Without jira2md

> Open the issue.  
> Select all. Copy. Paste. Format manually.  
> Lose the tables. Lose the task lists.  
> Re-download attachments one by one.

### With `jira2md`

> Click the button.  
> Review the Markdown.  
> Copy, download, or send straight to Claude Code.

**Same result. Much less friction.**

## Installation

1. Download or clone this repository
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the project folder
5. Navigate to any Jira issue (`*.atlassian.net/browse/*`) — the button appears

## Usage

1. Open any Jira issue in Chrome
2. Click the **jira2md** button on the issue page
3. Review the generated Markdown in the modal editor
4. Toggle preview to verify rendering
5. Pick an action from the right-side button column:
   - **Send to Claude Code** — pipes the issue to Claude Code in your VS Code terminal
   - **Copy to Clipboard** — paste into any tool
   - **Download .zip** — Markdown + all attachments bundled
   - **Download .md** — Markdown file only

## Claude Code Integration (VS Code)

Send any Jira issue directly to [Claude Code](https://github.com/anthropics/claude-code) running in your VS Code terminal.

### How it works

```
Chrome extension  →  POST  →  relay.js (localhost)  →  claude <issue.md>
```

### Setup

**1. Start the relay in your VS Code terminal:**

```bash
node relay.js                        # writes to current directory
node relay.js C:\projects\my-repo    # custom output directory
node relay.js --no-claude            # write file only, skip claude
node relay.js --port 7338            # custom port
```

**2. Click "Send to Claude Code" in the modal.**

The relay writes `PROJ-123_issue-title.md` to your output directory and runs:

```bash
claude PROJ-123_issue-title.md
```

Claude Code opens in the terminal with the full issue as context.

### Requirements

- [Claude Code](https://github.com/anthropics/claude-code) installed (`npm i -g @anthropic-ai/claude-code`)
- Node.js (to run `relay.js`)

> If the relay is not running, the button shows **"Relay offline"** — no crash, no silent failure.

## Tech Stack

| Library | Purpose |
|---|---|
| [Turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown conversion |
| [Turndown GFM Plugin](https://github.com/laurent22/joplin/tree/dev/packages/turndown-plugin-gfm) | Tables & task lists |
| [JSZip](https://stuk.github.io/jszip/) | ZIP bundle creation in the browser |

## Project Structure

```
jira2md/
├── content.js                  # Main extension logic
├── relay-client.js             # Modal layout patches + Claude Code button
├── relay.js                    # Local relay server (run in VS Code terminal)
├── styles.css                  # Modal & button styles
├── manifest.json               # Chrome extension manifest (MV3)
├── icon48.png                  # Extension icon (48×48)
├── icon128.png                 # Extension icon (128×128)
└── libs/
    ├── turndown.js
    ├── turndown-plugin-gfm.js
    └── jszip.min.js
```

## Support

If jira2md saves you time, consider buying me a coffee ☕

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-andreescocard-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/andreescocard)

## License

MIT
