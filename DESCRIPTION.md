# jira2md — Export Jira Issues to Markdown

Convert any Jira issue to a clean Markdown file with one click. jira2md adds a floating button to every Jira issue page and opens a built-in modal editor so you can review, edit, and download the result — no copy-pasting, no external tools.

## What it does

- Extracts the issue title, description, comments, and attachments from the current Jira page
- Converts the HTML content to **GitHub Flavored Markdown** (GFM) — including tables, task lists, and strikethrough
- Opens a **modal editor** with live preview so you can review and tweak the output before saving
- Lets you download a standalone `.md` file or a `.zip` bundle that includes all linked attachments

## Why use jira2md?

- Document issues in your codebase or wiki without manual formatting
- Archive tickets for offline reference or handoffs
- Feed structured issue context into AI tools or note-taking apps
- Keep a Markdown log of resolved bugs, features, or tasks

## Permissions

jira2md only runs on `*.atlassian.net/browse/*` pages and requests the `downloads` permission to save files to your computer. No data is sent to any server — everything is processed locally in your browser.

## Privacy

This extension does not collect, transmit, or store any data. All processing happens entirely in your browser.
