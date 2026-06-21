/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const path = require('path');
const {
  CANONICAL_SYMBOL_COUNT,
  FORKS_DIR,
  getCanonicalSymbols,
  getForkExports,
} = require('../hostConfigForkSurface');

// Symbols present in one fork's `export const` surface but legitimately absent
// from the other, with a rationale per entry. This list is for differences in
// the *value passthrough* (`export const`) surface specifically.
//
// `.noop.js` differs from `.custom.js` only in its preamble — a leading
// `export * from 'react-noop-renderer/src/ReactFiberConfigNoop'`
// (ReactFiberConfig.noop.js:25) and a narrower opaque-type set
// (ReactFiberConfig.noop.js:27-45 vs custom:27-50). Neither of those is an
// `export const`, so neither appears in the parsed surface this test compares.
// The two `export const` surfaces are therefore exactly equal and the allowlist
// is empty. It exists to make a future intentional divergence explicit rather
// than silently accepted.
const NOOP_ALLOWLIST = [
  // (empty) — see rationale above. `export *` and opaque types are not part of
  // the `export const` passthrough surface and are excluded by getForkExports.
];

// Membership helper. We avoid `Set` here on purpose — see the note inside the
// set-equality test below.
const allowlistHas = name => NOOP_ALLOWLIST.includes(name);

describe('host config fork surface', () => {
  // (a) Self-check the canon count. The canon is *derived from* .custom.js, so a
  // direct custom-vs-canon set-equality would be tautological. Asserting the
  // count catches a dropped/added passthrough in the canon itself.
  it('parses exactly the canonical number of symbols from .custom.js', () => {
    expect(getCanonicalSymbols().length).toBe(CANONICAL_SYMBOL_COUNT);
  });

  // (b) Set-equality of .noop.js's export-const surface against the canon, modulo
  // the documented allowlist. This is the runtime net that proves .noop didn't
  // drift from .custom — Flow only catches a dropped passthrough in one matrix
  // cell.
  it('.noop.js export-const surface matches the canon (modulo allowlist)', () => {
    // NOTE: This test deliberately avoids the `Set` builtin. React's Jest
    // environment (the regenerator/Babel transform applied to test sources)
    // alters the global iterator machinery such that spreading a `Set`
    // (`[...set]`) yields `[set]` rather than its elements. We use plain
    // arrays + `includes` for membership.
    const canon = getCanonicalSymbols();
    const noop = getForkExports(
      path.join(FORKS_DIR, 'ReactFiberConfig.noop.js')
    );

    const missingFromNoop = canon.filter(
      name => !noop.includes(name) && !allowlistHas(name)
    );
    const extraInNoop = noop.filter(
      name => !canon.includes(name) && !allowlistHas(name)
    );

    expect({missingFromNoop, extraInNoop}).toEqual({
      missingFromNoop: [],
      extraInNoop: [],
    });
  });

  // The 5 thin forks (dom/art/fabric/markup/test) are pure `export *` re-exports
  // with zero own `export const` bindings — there is nothing for this test to
  // parse. Their per-fork parity is guarded by `yarn flow` (the existing host
  // config matrix), NOT by this test. This is a known, documented gap, surfaced
  // here rather than papered over.
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('thin export-* forks are guarded by `yarn flow`, not this test', () => {});
});
