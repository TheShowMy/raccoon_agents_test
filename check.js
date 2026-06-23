#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

// Single self-contained HTML file
assert(html.includes('<!DOCTYPE html>'), 'Missing DOCTYPE');
assert(/<html[^>]*lang="zh-CN"/.test(html), 'Missing or wrong html lang');

// Core UI
assert(html.includes('id="searchInput"'), 'Missing search input');
assert(html.includes('id="gridContainer"'), 'Missing grid container');
assert(html.includes('class="card__copy-btn"'), 'Missing copy button');

// Syntax highlighting
assert(html.includes('function highlightCode'), 'Missing syntax highlight function');
assert(html.includes('.token.keyword'), 'Missing syntax highlight CSS');

// Dark editor style
assert(html.includes('--bg-code'), 'Missing dark editor code background');
assert(html.includes('--bg-card'), 'Missing dark editor card background');

// Language data
const langMatch = html.match(/const\s+languages\s*=\s*\(([\s\S]*?)\);/) ||
                  html.match(/const\s+languages\s*=\s*\[([\s\S]*?)\];/);
assert(langMatch, 'Missing languages array');
if (langMatch) {
  const entries = langMatch[1].match(/\{\s*lang\s*:/g) || [];
  assert(entries.length >= 20, `Expected at least 20 languages, found ${entries.length}`);
}

// No unresolved merge conflicts (whole-line markers only)
const lines = html.split(/\r?\n/);
const hasConflict = lines.some(line => /^(<{7}|={7}|>{7})/.test(line));
assert(!hasConflict, 'Unresolved conflict markers found');

if (errors.length) {
  console.error('Check failed:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

console.log('All checks passed.');
