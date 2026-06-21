/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {parse} = require('hermes-parser');

const FORKS_DIR = path.resolve(
  __dirname,
  '../../packages/react-reconciler/src/forks'
);

// `.custom.js` is the de-facto canonical contract surface: 166 hand-maintained
// `export const X = $$$config.X;` passthroughs. The count is asserted by callers
// as a self-check, since the canon is *derived from* this file.
const CANONICAL_SYMBOL_COUNT = 166;

// Parse a fork file with hermes-parser (React's Flow parser) so multiline
// `export const X =\n  $$$config.X;` declarations are counted and Flow-only
// syntax like `declare const $$$config` parses. A line-oriented regex
// undercounts (135 vs 166) because 31 of the 166 passthroughs wrap to two
// lines at printWidth 80.
function parseForkFile(forkPath) {
  const source = fs.readFileSync(forkPath, 'utf8');
  return parse(source, {flow: 'all'});
}

// Returns the ordered list of `export const` binding names declared directly in
// a fork file (i.e. the `$$$config` passthrough surface). `export *` re-exports
// and `export (opaque) type` declarations are intentionally excluded — they are
// not part of the value contract this surface enforces.
function getForkExports(forkPath) {
  const ast = parseForkFile(forkPath);
  const names = [];
  ast.body.forEach(node => {
    if (
      node.type === 'ExportNamedDeclaration' &&
      node.declaration &&
      node.declaration.type === 'VariableDeclaration'
    ) {
      node.declaration.declarations.forEach(declarator => {
        if (declarator.id.type === 'Identifier') {
          names.push(declarator.id.name);
        }
      });
    }
  });
  return names;
}

// Returns the canonical ordered list of contract symbols, parsed from the
// committed `.custom.js`. Asserts the count is exactly 166 so a dropped/added
// passthrough in the canon itself fails loudly rather than silently shifting
// what every downstream consumer treats as the contract.
function getCanonicalSymbols() {
  const customPath = path.join(FORKS_DIR, 'ReactFiberConfig.custom.js');
  const symbols = getForkExports(customPath);
  if (symbols.length !== CANONICAL_SYMBOL_COUNT) {
    throw new Error(
      `Expected ${CANONICAL_SYMBOL_COUNT} canonical host-config symbols in ` +
        `ReactFiberConfig.custom.js, parsed ${symbols.length}. If the contract ` +
        `surface legitimately changed, update CANONICAL_SYMBOL_COUNT in ` +
        `scripts/shared/hostConfigForkSurface.js.`
    );
  }
  return symbols;
}

module.exports = {
  CANONICAL_SYMBOL_COUNT,
  FORKS_DIR,
  getForkExports,
  getCanonicalSymbols,
};
