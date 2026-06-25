import { describe, it, expect } from 'vitest';
import { escapeHTML, highlightCode } from '../legacy/test_highlight.js';

describe('escapeHTML', () => {
  it('escapes & < >', () => {
    expect(escapeHTML('&<>')).toBe('&amp;&lt;&gt;');
  });

  it('leaves normal text unchanged', () => {
    expect(escapeHTML('hello world')).toBe('hello world');
  });
});

describe('highlightCode', () => {
  it('highlights strings', () => {
    const result = highlightCode('var x = "hello";', 'js');
    expect(result).toContain('class="token string"');
    expect(result).toContain('hello');
  });

  it('highlights line comments', () => {
    const result = highlightCode('// this is a comment\nvar a = 1;', 'js');
    expect(result).toContain('class="token comment"');
  });

  it('highlights block comments', () => {
    const result = highlightCode('/* block */ var b = 2;', 'js');
    expect(result).toContain('class="token comment"');
  });

  it('highlights numbers', () => {
    const result = highlightCode('var n = 42;', 'js');
    expect(result).toContain('class="token number"');
  });

  it('highlights booleans', () => {
    const result = highlightCode('var f = false;', 'js');
    expect(result).toContain('class="token boolean"');
  });

  it('handles empty code', () => {
    expect(highlightCode('', 'js')).toBe('');
  });
});
