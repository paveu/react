/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const {
  FORKS_DIR,
  getCanonicalSymbols,
} = require('./shared/hostConfigForkSurface');

const prettierConfig = require('../.prettierrc.js');

// The `.custom.js` / `.noop.js` forks are a fixed preamble (license header,
// `declare const $$$config`, and the fork's opaque-type block) followed by a
// body of `export const X = $$$config.X;` passthroughs interleaved with a few
// section-comment banners and two `export type` lines. The preamble differs per
// fork and is template-preserved (sliced verbatim from the committed file); the
// body is identical across both forks and is regenerated here from the
// canonical symbol list so a dropped passthrough is impossible by construction.

// Banner blocks emitted immediately before a trigger symbol, keyed by that
// symbol. Each value is the literal text inserted ahead of the symbol's
// passthrough (a leading blank line separates it from the previous group).
const SECTION_BLOCKS = {
  // Bare blank-line separator between the three renderer-metadata exports and
  // the core host-config surface (no banner).
  getPublicInstance: [''],
  supportsMicrotasks: [
    '',
    '// -------------------',
    '//      Microtasks',
    '//     (optional)',
    '// -------------------',
  ],
  supportsTestSelectors: [
    '',
    '// -------------------',
    '//      Test selectors',
    '//     (optional)',
    '// -------------------',
  ],
  appendChild: [
    '',
    '// -------------------',
    '//      Mutation',
    '//     (optional)',
    '// -------------------',
  ],
  cloneInstance: [
    '',
    '// -------------------',
    '//     Persistence',
    '//     (optional)',
    '// -------------------',
  ],
  isSuspenseInstancePending: [
    '',
    '// -------------------',
    '//     Hydration',
    '//     (optional)',
    '// -------------------',
  ],
  supportsResources: [
    '',
    '// -------------------',
    '//     Resources',
    '//     (optional)',
    '// -------------------',
    'export type HoistableRoot = mixed;',
    'export type Resource = mixed;',
  ],
  supportsSingletons: [
    '',
    '// -------------------',
    '//     Singletons',
    '//     (optional)',
    '// -------------------',
  ],
};

// Build the shared passthrough body from the canonical ordered symbol list,
// inserting each section block ahead of its trigger symbol. Output is a single
// `export const X = $$$config.X;` per symbol on one line; prettier reflows the
// long ones to the committed two-line form during formatting.
function buildBody(symbols) {
  const lines = [];
  symbols.forEach(name => {
    if (SECTION_BLOCKS[name]) {
      lines.push(...SECTION_BLOCKS[name]);
    }
    lines.push(`export const ${name} = $$$config.${name};`);
  });
  return lines.join('\n');
}

// The fixed preamble (header + opaque-type block, up to and including the blank
// line before the first `export const`) is sliced verbatim from the committed
// fork so per-fork type declarations are preserved exactly.
function getPreamble(forkPath) {
  const source = fs.readFileSync(forkPath, 'utf8');
  const marker = '\nexport const rendererVersion =';
  const idx = source.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Could not locate the body marker in ${forkPath}.`);
  }
  // Keep everything up to (and including) the newline that precedes the first
  // passthrough, so the blank separator line between preamble and body stays.
  return source.slice(0, idx + 1);
}

async function generateFork(forkName, body) {
  const forkPath = path.join(FORKS_DIR, forkName);
  const preamble = getPreamble(forkPath);
  const output = preamble + body + '\n';
  const formatted = await prettier.format(output, {
    ...prettierConfig,
    filepath: forkPath,
  });
  fs.writeFileSync(forkPath, formatted, 'utf8');
}

async function main() {
  const symbols = getCanonicalSymbols();
  const body = buildBody(symbols);
  // Generate `.custom.js` first (the canon source), then `.noop.js`; their
  // bodies are identical and only the preamble differs.
  await generateFork('ReactFiberConfig.custom.js', body);
  await generateFork('ReactFiberConfig.noop.js', body);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
