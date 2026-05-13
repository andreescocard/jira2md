#!/usr/bin/env node
/**
 * jira2md relay — run this in your VS Code terminal.
 * Receives Markdown from the Chrome extension and pipes it to claude.
 *
 * Usage:
 *   node relay.js [output-dir] [--port 7337] [--no-claude]
 *
 * Flags:
 *   output-dir   where to write .md files (default: cwd)
 *   --port N     listen port (default: 7337, must match relay-client.js)
 *   --no-claude  write file only, don't invoke claude
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = portFlag !== -1 ? parseInt(args[portFlag + 1], 10) : 7337;
const noClaude = args.includes('--no-claude');
const outDir = args.find(a => !a.startsWith('--') && a !== String(PORT)) || process.cwd();

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST')    { res.writeHead(405); return res.end('Method Not Allowed'); }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { markdown, filename } = JSON.parse(body);
      if (!markdown || !filename) throw new Error('missing markdown or filename');

      const safe = filename.replace(/[/\\?%*:|"<>]/g, '-');
      const filePath = path.join(outDir, safe);
      fs.writeFileSync(filePath, markdown, 'utf8');
      console.log(`\n[jira2md] wrote: ${filePath}`);

      if (noClaude) {
        console.log('[jira2md] --no-claude set, skipping claude invocation');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, path: filePath }));
      }

      // Run: claude <filepath>
      // claude CLI reads the file as context and drops into interactive session
      console.log(`[jira2md] running: claude "${filePath}"\n`);
      const child = spawn('claude', [filePath], {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

      child.on('error', err => {
        console.error(`[jira2md] claude not found: ${err.message}`);
        console.error('[jira2md] install with: npm i -g @anthropic-ai/claude-code');
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: filePath }));
    } catch (err) {
      console.error(`[jira2md] error: ${err.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`jira2md relay listening on http://127.0.0.1:${PORT}`);
  console.log(`writing files to: ${outDir}`);
  console.log(noClaude ? 'mode: file-only' : 'mode: file + claude');
  console.log('waiting for issues from Chrome extension...\n');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Run: node relay.js --port 7338`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
