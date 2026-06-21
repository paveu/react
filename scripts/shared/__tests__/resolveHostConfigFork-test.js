/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const {getForkCandidates} = require('../resolveHostConfigFork');

// Characterization test pinning the ordered candidate sequence a `shortName`
// expands to (longest prefix → shortest). This is the piece extracted from the
// three host-config toolchains; the per-call-site resolution loop (existence
// check, return value, not-found behavior) stays in place and is covered by the
// existing `yarn flow` / `yarn test` / `yarn build` guards.
describe('getForkCandidates', () => {
  it('expands a multi-segment name longest-prefix → shortest', () => {
    expect(getForkCandidates('dom-node-webpack')).toEqual([
      'dom-node-webpack',
      'dom-node',
      'dom',
    ]);
  });

  it('returns a single-segment name unchanged as the only candidate', () => {
    expect(getForkCandidates('custom')).toEqual(['custom']);
  });

  it('handles the empty/edge input as the split semantics dictate', () => {
    // `''.split('-')` is `['']` (length 1), so the loop yields one `''`
    // candidate then exhausts — matching the original `split('-')`/`pop()`
    // call-site behavior verbatim.
    expect(getForkCandidates('')).toEqual(['']);
  });
});
