#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function checkFile(filePath, checks) {
  const html = fs.readFileSync(filePath, 'utf8');
  const label = path.basename(filePath);

  checks.forEach(function (check) {
    assert(check(html, label), check(html, label) ? '' : '');
  });

  // No unresolved merge conflicts (whole-line markers only)
  const lines = html.split(/\r?\n/);
  const hasConflict = lines.some(function (line) { return /^(<{7}|={7}|>{7})/.test(line); });
  assert(!hasConflict, '[' + label + '] Unresolved conflict markers found');

  return html;
}

// =====================================================
//  index.html — 列表主页
// =====================================================
const indexHtml = checkFile(path.join(__dirname, 'index.html'), [
  function (html, label) {
    return html.includes('<!DOCTYPE html>') || fail(label, 'Missing DOCTYPE');
  },
  function (html, label) {
    return /<html[^>]*lang="zh-CN"/.test(html) || fail(label, 'Missing or wrong html lang');
  },
  function (html, label) {
    return html.includes('id="listContainer"') || fail(label, 'Missing list container');
  },
  function (html, label) {
    return /href=["']hello-world\.html["']/.test(html) || fail(label, 'Missing link to hello-world.html');
  },
  function (html, label) {
    return !html.includes('searchInput') || fail(label, 'Should not contain search input');
  },
  function (html, label) {
    return !html.includes('card__copy-btn') || fail(label, 'Should not contain copy button');
  },
  function (html, label) {
    return !html.includes('function highlightCode') || fail(label, 'Should not contain syntax highlighting');
  },
  function (html, label) {
    return !html.includes('const languages') || fail(label, 'Should not contain languages array');
  }
]);

// =====================================================
//  hello-world.html — Hello World 子页面
// =====================================================
checkFile(path.join(__dirname, 'hello-world.html'), [
  function (html, label) {
    return html.includes('<!DOCTYPE html>') || fail(label, 'Missing DOCTYPE');
  },
  function (html, label) {
    return /<html[^>]*lang="zh-CN"/.test(html) || fail(label, 'Missing or wrong html lang');
  },
  // Core UI
  function (html, label) {
    return html.includes('id="searchInput"') || fail(label, 'Missing search input');
  },
  function (html, label) {
    return html.includes('id="gridContainer"') || fail(label, 'Missing grid container');
  },
  function (html, label) {
    return html.includes('class="card__copy-btn"') || fail(label, 'Missing copy button');
  },
  // Syntax highlighting
  function (html, label) {
    return html.includes('function highlightCode') || fail(label, 'Missing syntax highlight function');
  },
  function (html, label) {
    return html.includes('.token.keyword') || fail(label, 'Missing syntax highlight CSS');
  },
  // Dark editor style
  function (html, label) {
    return html.includes('--bg-code') || fail(label, 'Missing dark editor code background');
  },
  function (html, label) {
    return html.includes('--bg-card') || fail(label, 'Missing dark editor card background');
  },
  // Language data — at least 20 languages
  function (html, label) {
    const langMatch = html.match(/const\s+languages\s*=\s*\(([\s\S]*?)\);/) ||
                      html.match(/const\s+languages\s*=\s*\[([\s\S]*?)\];/);
    if (!langMatch) {
      fail(label, 'Missing languages array');
      return false;
    }
    const entries = langMatch[1].match(/\{\s*lang\s*:/g) || [];
    if (entries.length < 20) {
      fail(label, 'Expected at least 20 languages, found ' + entries.length);
      return false;
    }
    return true;
  },
  // Back navigation
  function (html, label) {
    return html.includes('index.html') || fail(label, 'Missing back navigation link');
  }
]);

// =====================================================

function fail(label, message) {
  errors.push('[' + label + '] ' + message);
  return false;
}

if (errors.length) {
  console.error('Check failed:');
  errors.forEach(function (e) { console.error(' -', e); });
  process.exit(1);
}

console.log('All checks passed.');
