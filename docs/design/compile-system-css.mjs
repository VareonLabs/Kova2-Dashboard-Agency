// Compiles docs/design/system-source.css into public/system.css. Every selector gets the same extra specificity
// (two :not(#_) clauses) so the layout system wins over the older feature stylesheets without !important.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const source = readFileSync(resolve(root, 'docs/design/system-source.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const boost = selector => selector.split(',').map(part => {
  const s = part.trim();
  if (!s || s.startsWith(':root') || s === 'body' || s === 'html') return s;
  const [base, pseudo] = s.split('::');
  return `${base}:not(#_):not(#_)${pseudo ? '::' + pseudo : ''}`;
}).join(',');
const output = source.replace(/(@font-face\s*)?([^{}@]*)\{([^{}]*)\}/g, (match, at, selector, body) => at ? `@font-face{${body.trim()}}` : `${boost(selector)}{${body.trim()}}`)
  .split('\n').map(line => line.trim()).filter(Boolean).join('\n');
writeFileSync(resolve(root, 'public/system.css'), `/* Generated from docs/design/system-source.css by docs/design/compile-system-css.mjs. Edit the source, not this file. */\n${output}\n`);
console.log('Wrote public/system.css');
