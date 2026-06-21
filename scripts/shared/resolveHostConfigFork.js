/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

// Returns the ordered list of fork-selection candidates for a renderer's
// `shortName`, from the longest prefix (the full name) down to the shortest
// single segment. A `shortName` is split on `-`, and each successively shorter
// dash-joined prefix is a candidate.
//
//   getForkCandidates('dom-node-webpack')
//     => ['dom-node-webpack', 'dom-node', 'dom']
//
// This is the one piece genuinely triplicated across the three host-config
// toolchains — rollup (`scripts/rollup/forks.js`), jest
// (`scripts/jest/setupHostConfigs.js`), and flow
// (`scripts/flow/createFlowConfigs.js`). Each call-site iterates this list and
// keeps its OWN existence check, return value, and not-found behavior: rollup
// catches all errors and returns a path-or-`null`; jest rethrows non-ENOENT,
// returns `jest.requireActual(...)`, and throws on exhaustion; flow checks
// `Set.has`, performs a `forks.set(...)` side effect, and throws on exhaustion.
// Folding those control flows together would change their error/not-found
// policy, so the shared unit is the candidate sequence only — a pure function
// with no fs, no Set, no side effects, no throw.
function getForkCandidates(shortName) {
  const segments = shortName.split('-');
  const candidates = [];
  while (segments.length) {
    candidates.push(segments.join('-'));
    segments.pop();
  }
  return candidates;
}

module.exports = {
  getForkCandidates,
};
