# jira2md

**Export Jira issues to Markdown in one click.**

jira2md is a Chrome extension that runs on any Jira issue page (`*.atlassian.net/browse/*`) and converts the full issue — title, description, comments, and attachments — into a clean Markdown document, directly in your browser.

---

## Features

- **One-click export** — a floating button appears on every Jira issue page
- **Modal editor** — review and edit the generated Markdown before saving
- **Live preview** — toggle between raw Markdown and rendered HTML
- **Asset bundling** — downloads attachments alongside the `.md` file, packaged as a `.zip`
- **GFM support** — GitHub Flavored Markdown (tables, task lists, strikethrough)
- **No server required** — everything runs locally in the browser

---

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder
5. Navigate to any Jira issue (`*.atlassian.net/browse/*`) — the jira2md button will appear

---

## Usage

1. Open any Jira issue in your browser
2. Click the **jira2md** floating button (bottom-right corner)
3. The modal editor opens with the generated Markdown
4. Edit the content if needed and toggle the preview to verify rendering
5. Click **Download .md** to save the Markdown file, or **Download .zip** to bundle attachments

---

## Tech Stack

| Library | Purpose |
|---|---|
| [Turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown conversion |
| [Turndown GFM Plugin](https://github.com/laurent22/joplin/tree/dev/packages/turndown-plugin-gfm) | GitHub Flavored Markdown tables & task lists |
| [JSZip](https://stuk.github.io/jszip/) | ZIP bundle creation in the browser |

---

## Project Structure

```
jira2md/
├── content.js                  # Main extension logic
├── styles.css                  # Modal & button styles
├── manifest.json               # Chrome extension manifest (MV3)
├── icon48.png                  # Extension icon (48×48)
├── icon128.png                 # Extension icon (128×128)
└── libs/
    ├── turndown.js
    ├── turndown-plugin-gfm.js
    └── jszip.min.js
```

---

## Support

If you find jira2md useful, consider buying me a coffee ☕

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-andreescocard-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/andreescocard)

---

## License

MIT
