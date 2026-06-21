# Host-Config-Seam Refactor Opportunities — Implementation Plan

## Overview

Implement the three highest-ranked refactor opportunities from `refactor-opportunities/research.md` against the host-config seam: **T4** (a runtime fork-parity test), **T2** (codegen for the `.custom`/`.noop` passthrough forks), and **T1** (extraction of the triplicated fork-selector logic). All three are build-time changes confined to `scripts/` and generated fork files — **zero `packages/` runtime code changes**. They are sequenced T4 → T2 → T1: T4 is the safety net that makes T2's codegen provable; T1 is independent.

The deeper structural items the research deferred — T5 (controlled-components knot), T6 (DOM↔reconciler cycle), T7 (contract segmentation) — are explicitly out of scope and recorded as follow-ups.

## Current State Analysis

The host-config seam is a **build-time module substitution**: each renderer gets a fork of `ReactFiberConfig` swapped in by three independent toolchains (rollup, jest, flow). The research (verified by ast-grep at commit `f5baba3ad`) established:

- **7 forks** in `packages/react-reconciler/src/forks/ReactFiberConfig.{dom,art,fabric,markup,noop,test,custom}.js`. Five (`dom/art/fabric/markup/test`) are thin `export *` re-exports; `.custom.js` has **166** manual `export const X = $$$config.X;` passthroughs (LHS==RHS, verified — naive grep undercounts at 135 due to multiline `$$$config` wrapping); `.noop.js` has the same 166 plus a leading `export * from 'react-noop-renderer/src/ReactFiberConfigNoop'` (`:25`).
- **No canonical symbol list exists.** The contract surface is the union of fork exports + Flow types. `.custom.js` is the de-facto canon (166 symbols).
- **Flow is the only fork-parity guard.** A missing passthrough surfaces only as a Flow error in one matrix cell. `dependency-cruiser` is a devDependency but **not wired into CI** (no `depcruise` script, zero `.github/` references).
- **The fork-selector logic is triplicated**: the same longest-prefix `shortName.split('-')` algorithm is independently reimplemented in `scripts/rollup/forks.js:29-43` (`findNearestExistingForkFile`), `scripts/jest/setupHostConfigs.js:194-206`, and `scripts/flow/createFlowConfigs.js:43-51`. All three `require` the single data source `scripts/shared/inlinedHostConfigs.js` — only the *list* is shared, not the *logic*. No drift has occurred yet (all read one list), so this is latent, not realized, debt.

**Existing assets the plan builds on:**
- `scripts/shared/__tests__/` already exists (`evalToString-test.js`) — Node-side Jest tests, CommonJS `require('../module')`, picked up by `yarn test` via `scripts/jest/config.base.js` (`roots: ['<rootDir>/packages', '<rootDir>/scripts']`, `testRegex: '/__tests__/[^/]*\.js$'`).
- **Codegen patterns to mirror**: `scripts/flow/createFlowConfigs.js` (read template → `fs.writeFileSync` → change detection vs old content) and `scripts/rollup/generate-inline-fizz-runtime.js` (build output string → prettier format → write, with generated-header comment + `yarn generate-inline-fizz-runtime` invocation in `package.json`).
- All three toolchains run in the same Node context — a shared `require` is feasible (research sub-agent 3 confirmed).

## Desired End State

- A Jest test under `scripts/shared/__tests__/` (or `packages/.../__tests__/`) guards the contract surface on two axes: (a) a **count self-check** that `.custom.js` still parses to exactly 166 symbols (catches a dropped/added passthrough in the canon itself, since the canon is *derived from* `.custom.js` a direct custom-vs-canon set-equality would be tautological), and (b) **set-equality of `.noop.js` against that canon** modulo a documented allowlist (the leading `export *` and the `.noop`-specific opaque types at `:27-35`). It runs in the existing `yarn test` and fails if `.noop` drifts from `.custom` or the canon symbol count changes. **The 5 thin `export *` forks (dom/art/fabric/markup/test) are carry-through**: their fork file has no own bindings to parse, so they are *not* directly asserted here — their per-fork parity remains guarded by `yarn flow` (the existing matrix), which this test does not replace. This honest scope still delivers the one thing T2 needs: a runtime net proving `.noop`/`.custom` codegen didn't silently drop a symbol (Flow catches that only in one matrix cell).
- `.custom.js` and `.noop.js` are **generated** from the canonical symbol set by a new `scripts/` generator, emitting output **byte-identical** to the currently committed files (proven by diff), invoked via a `yarn generate-*` script and verified fresh in CI.
- The longest-prefix fork-selector logic lives in one module `scripts/shared/resolveHostConfigFork.js`, unit-tested, and `require`d by all three call-sites (rollup/jest/flow); the three toolchains remain separate (load-bearing) — only the selection *logic* is shared.

Verify: `yarn test` (parity test + selector unit test pass), `yarn flow` (unchanged), regenerating `.custom`/`.noop` produces zero diff, `yarn lint` clean.

### Key Discoveries:

- `.custom.js` is the canonical 166-symbol surface; parsing must handle multiline `$$$config.X` wrapping — `export const $A =\n  $B.$C;` form (research: ast-grep `export const $A = $B.$C;` on stripped source = 166, naive single-line grep = 135; 31 of the 166 wrap to two lines). See `packages/react-reconciler/src/forks/ReactFiberConfig.custom.js:88-89` (`shouldAttemptEagerTransition`) for a wrapped example.
- `.noop.js` differs from `.custom.js` by a leading `export *` (`:25`) and a different Flow opaque-type set (`:27-35`) — these are the allowlist entries.
- Thin forks (`dom/art/fabric/markup/test`) are pure `export *` (`:10-13`), 0 manual passthroughs — they carry symbols through automatically and need no codegen.
- Selector pattern: `scripts/rollup/forks.js:29-42` `findNearestExistingForkFile` splits on `-` and tries successively shorter prefixes.
- Jest picks up `scripts/**/__tests__/*.js` via `scripts/jest/config.base.js:31` `roots`.

## What We're NOT Doing

- **T5 (controlled-components knot, SCC=21).** Real fix is redesigning controlled-state restore *semantics* (event-driven, #8176), not a code seam — out of scope per the research's hard task boundary. Subject of a separate analysis.
- **T6 (DOM↔reconciler cycle).** Load-bearing, conscious limitation (#12792/#26592 + dated value back-imports). Recorded follow-up: wire `dependency-cruiser no-circular` (`.dependency-cruiser.js:18`, currently `severity: warn`, not in CI) into CI to make the cycle *visible* before anyone attempts to reverse it. **Not a refactor; not this plan.**
- **T7 (contract segmentation into capability-scoped sub-interfaces).** Highest blast radius (29 importers + 7 forks). The research's thesis is that T4+T2 remove the *pain* (sync burden) without changing contract shape; segmentation is justified only if pain persists afterward — unmeasurable until then. Target near-term shape is "generated, parity-checked flat contract," not segmentation.
- **T3 (direct unit test for `ReactFiberConfigDOM.js`).** Higher cost (must mock the T6 cycle + jsdom), covers one file vs T4's all-7-fork parity. Natural "after T4" follow-up.
- No changes to `packages/` runtime, the `$$$config` trick, the flat contract shape, or the three-toolchain structure.

## Implementation Approach

Three independently-shippable phases, each its own PR, with a manual gate between them:

1. **T4 first** — the parity test is the runtime safety net that lets T2 prove byte-identical codegen didn't silently drop a symbol (Flow only catches that in one matrix cell). Land it before touching generation.
2. **T2 second** — generate `.custom.js` first, diff against the committed file to prove zero behavior change, *then* `.noop.js`. Mirror the existing `createFlowConfigs.js` / `generate-inline-fizz-runtime.js` patterns (template + prettier + writeFileSync + change detection + `yarn generate-*` + CI freshness check).
3. **T1 last** — independent of 1 & 2. Characterize the current selector with a unit test, extract to `scripts/shared/resolveHostConfigFork.js`, swap the 3 call-sites.

The canonical symbol set is **derived from `.custom.js` at runtime** (no new source-of-truth), shared by both the T4 test and the T2 generator. A single parser helper that correctly handles the multiline wrapping serves both.

## Critical Implementation Details

- **Multiline parse correctness is load-bearing.** Any parser that reads `.custom.js` to extract the 166 symbols MUST handle the `export const X =\n  $$$config.X;` wrapped form. A line-oriented regex undercounts to 135. Use an AST parse (Babel — already a dependency, see `evalToString-test.js:10`) or a multiline-aware match, and assert the count is 166 as a self-check before trusting the set.
- **Byte-identical ordering.** The T2 generator must emit symbols in the exact order they appear in the committed `.custom.js`, with identical formatting (including which lines wrap), or the diff gate fails. Derive both the set AND the order from the committed file during the bootstrap, or match prettier's wrapping exactly.

---

## Phase 1: T4 — Fork-parity test (the unblocking guard)

### Overview

Add a Jest test that derives the canonical symbol set from `.custom.js`, self-checks its count (166), and asserts `.noop.js` matches that canon modulo a documented allowlist. The 5 thin `export *` forks are carry-through (no own bindings to parse) and stay guarded by `yarn flow`, not by this test. This closes the C4 completeness gap on the *detection* side for the two hand-maintained forks and is the prerequisite safety net for Phase 2's codegen.

### Changes Required:

#### 1. Canonical symbol parser (shared helper)

**File**: `scripts/shared/hostConfigForkSurface.js` (new)

**Intent**: Provide a single function that parses the committed `.custom.js` and returns the canonical ordered list of contract symbols, plus a function to parse the exported symbol set of any fork file. Both the T4 test and the T2 generator import this so they agree on the canon by construction.

**Contract**: Exports `getCanonicalSymbols(): string[]` (parses `forks/ReactFiberConfig.custom.js`, returns the 166 ordered names) and `getForkExports(forkPath): Set<string>` (parses a fork's `export const` / `export *` surface). Must use Babel (`@babel/parser`, as in `scripts/shared/__tests__/evalToString-test.js:10`) so multiline `export const X =\n  $$$config.X;` declarations are counted — line-regex undercounts (135 vs 166). Include an internal assertion that `getCanonicalSymbols().length === 166` to fail loudly if the parse regresses.

#### 2. Parity test

**File**: `scripts/shared/__tests__/hostConfigForkSurface-test.js` (new)

**Intent**: Self-check the canon count (166) and assert `.noop.js`'s `export const` surface matches the canon modulo a documented allowlist. Thin `export *` forks are explicitly out of the parse assertion (carry-through, guarded by Flow) — the test must *document* this gap, not paper over it.

**Contract**: A Jest test that (a) asserts `getCanonicalSymbols().length === 166` (the only meaningful check on `.custom` itself, since the canon is derived from it — a custom-vs-canon set-equality would always pass), and (b) parses `.noop.js`'s `export const` names and asserts set-equality against `getCanonicalSymbols()` after subtracting an explicit `ALLOWLIST`. The `ALLOWLIST` documents `.noop`'s leading `export *` source and its opaque-type set (`ReactFiberConfig.noop.js:27-35`) with a one-line rationale per entry. For the 5 thin `export *` forks, the test includes a comment (or a `test.skip` with rationale) stating they carry symbols through automatically and their parity is guarded by `yarn flow`, not here — so the gap is visible, not silent. Follows the CommonJS `require('../module')` + Jest convention of `evalToString-test.js`.

### Success Criteria:

#### Automated Verification:

- Parity test passes: `yarn test scripts/shared/__tests__/hostConfigForkSurface-test.js`
- Full suite unaffected: `yarn test`
- Canonical count self-check holds (166 symbols)
- Linting passes: `yarn lint`

#### Manual Verification:

- Temporarily deleting one `export const` line from `.custom.js` makes the parity test fail (the net actually catches a dropped symbol) — then revert
- The allowlist entries each have a clear, correct rationale and contain no symbols that should actually be enforced

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: T2 — Codegen for `.custom`/`.noop` passthroughs

### Overview

Replace the 166 hand-maintained `$$$config` passthrough lines in `.custom.js` and `.noop.js` with generated output, driven by the canonical symbol set from Phase 1's helper. Generate `.custom.js` first and prove byte-identical against the committed file before touching `.noop.js`. The thin `export *` forks are untouched. Depends on Phase 1 (the parity net proves no symbol was silently lost).

### Changes Required:

#### 1. Fork generator

**File**: `scripts/generate-host-config-forks.js` (new; name to match the existing `generate-inline-fizz-runtime.js` convention)

**Intent**: Read the canonical ordered symbol set (via the Phase 1 helper) and emit `.custom.js`, then `.noop.js`, with their fixed headers and Flow type blocks preserved, formatted to match the committed files exactly. Mirror `scripts/rollup/generate-inline-fizz-runtime.js` (build string → prettier → `fs.writeFileSync`) and `createFlowConfigs.js` (change detection).

**Contract**: Node script emitting two files. Output MUST be byte-identical to the committed `.custom.js`/`.noop.js` — same symbol order, same multiline wrapping, same prettier formatting. The fixed preamble (header comment + Flow type declarations: `.custom.js:1-30`, `.noop.js:1-35` incl. the leading `export *` at `:25`) is template-preserved, not generated from the symbol list. Emits a generated-file header note (as in `generate-inline-fizz-runtime.js:80-82`). The order/wrapping source: bootstrap by deriving the ordered list from the committed `.custom.js` itself so order is preserved by construction.

#### 2. yarn script + CI freshness check

**File**: `package.json` (add `generate-host-config-forks` script); CI freshness step

**Intent**: Make the generator runnable via `yarn generate-host-config-forks` (matching `yarn generate-inline-fizz-runtime`, `package.json:158`) and add a CI step that regenerates and asserts zero diff, so generated files can't go stale.

**Contract**: New `package.json` script entry. A CI assertion (regenerate → `git diff --exit-code` on the two fork files) added as a new job `check_generated_host_config_forks`, cloned from the existing `check_generated_fizz_runtime` job at `.github/workflows/runtime_build_and_test.yml:128-153` (which runs `yarn generate-inline-fizz-runtime` then `git diff --exit-code || (echo … && false)` — the exact pattern to mirror). The generated `.custom`/`.noop` stay checked in (Flow/grep operate on real files).

### Success Criteria:

#### Automated Verification:

- Generating `.custom.js` produces zero diff vs committed: `yarn generate-host-config-forks && git diff --exit-code packages/react-reconciler/src/forks/ReactFiberConfig.custom.js`
- Same for `.noop.js`
- Parity test (Phase 1) still passes: `yarn test scripts/shared/__tests__/hostConfigForkSurface-test.js`
- Flow unaffected: `yarn flow`
- Full suite passes: `yarn test`
- Linting passes: `yarn lint`

#### Manual Verification:

- Adding a symbol to the canonical source + regenerating produces a correct, well-formatted passthrough in both files (then revert)
- The generated files are visually indistinguishable from the originals (header, type blocks, ordering, wrapping)
- CI freshness step fails when a fork file is hand-edited out of sync (then revert)

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation that the manual testing was successful before proceeding to Phase 3.

---

## Phase 3: T1 — Extract the shared fork selector

### Overview

Extract the triplicated longest-prefix `shortName.split('-')` fork-selection algorithm into one module, unit-test it as characterization first, then swap the three call-sites (rollup/jest/flow) to import it. The three toolchains stay separate (load-bearing — different execution contexts); only the selection *logic* becomes shared. Independent of Phases 1–2.

### Changes Required:

#### 1. Characterization test (before extraction)

**File**: `scripts/shared/__tests__/resolveHostConfigFork-test.js` (new)

**Intent**: Pin the shared piece being extracted — the **ordered candidate sequence** a `shortName` expands to (longest prefix → shortest) — as a test before moving code, so the extraction is provably behavior-preserving. Test against representative `shortName`s from `inlinedHostConfigs.js` (e.g. `dom-node-webpack` → `['dom-node-webpack', 'dom-node', 'dom']`).

**Contract**: Jest test asserting the candidate-sequence generator produces the exact ordered list for: a multi-segment name, a single-segment name, and an empty/edge input. It does **not** test fork resolution end-to-end — the per-call-site loop (with its own existence check, return value, and not-found behavior) stays in place and is covered by the existing `yarn flow` / `yarn test` / `yarn build` guards. Write and run this against the *extracted* module (created in change #2 below) — extraction and characterization land together.

#### 2. Shared selector module

**File**: `scripts/shared/resolveHostConfigFork.js` (new)

**Intent**: House **only** the part that is genuinely triplicated and drift-prone: the `shortName.split('-')`-then-pop algorithm that produces the ordered prefix candidates. The three call-sites diverge in *more* than the existence predicate — rollup catches all errors and returns a path-or-`null`; jest rethrows non-ENOENT, returns `jest.requireActual(...)`, and throws on exhaustion; flow checks `Set.has`, performs a `forks.set(...)` side effect, and throws on exhaustion. Folding those three control flows into one resolver would change jest's/flow's not-found-throws and error policy, so the shared unit is the **candidate sequence**, not the resolution.

**Contract**: Exports a pure function `getForkCandidates(shortName): string[]` returning the ordered prefix candidates (longest → shortest), matching the `split('-')`/`pop()` semantics common to `scripts/rollup/forks.js:30-41`, `scripts/jest/setupHostConfigs.js:194-206`, and `scripts/flow/createFlowConfigs.js:43-50`. No fs, no Set, no side effects, no throw. Each call-site iterates this list and keeps its own existence check, return value, and not-found behavior unchanged.

#### 3. Swap the three call-sites

**File**: `scripts/rollup/forks.js` (~:29-43), `scripts/jest/setupHostConfigs.js` (~:194-206), `scripts/flow/createFlowConfigs.js` (~:43-51)

**Intent**: Replace each in-line `split('-')`/`pop()` loop header with a `require` of `getForkCandidates` and iterate the returned list, preserving each call-site's surrounding behavior verbatim — rollup's catch-all + path return + `null` fallback, jest's ENOENT-rethrow + `jest.requireActual` + throw-on-exhaustion, flow's `Set.has` + `forks.set(...)` side effect + throw-on-exhaustion. All three already `require('../shared/inlinedHostConfigs')`, so the shared-module import is the same pattern.

**Contract**: Each file imports `getForkCandidates`, replaces its local candidate-generation with `for (const candidate of getForkCandidates(shortName))`, and leaves its existence check, return value, and not-found behavior untouched. No change to each toolchain's inputs/outputs. Behavior parity verified by the existing end-to-end guards (jest swap, flow matrix, build) plus the new sequence unit test.

### Success Criteria:

#### Automated Verification:

- Selector unit test passes: `yarn test scripts/shared/__tests__/resolveHostConfigFork-test.js`
- Flow still resolves every config (selector swap didn't break flow): `yarn flow`
- Full suite passes (jest swap still works): `yarn test`
- A production build still resolves forks correctly: `yarn build` (or the relevant build smoke)
- Linting passes: `yarn lint`

#### Manual Verification:

- All three toolchains resolve the same fork for a representative `shortName` as before the change (spot-check rollup/jest/flow)
- No behavioral difference in fork resolution for edge cases (multi-segment names, fallback to base)

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- Canonical symbol parser returns exactly 166 ordered symbols (self-check), handling multiline `$$$config` wrapping (Phase 1).
- Fork-parity set-equality across all 7 forks with documented allowlist (Phase 1).
- Selector longest-prefix behavior: exact match, prefix fallback, no-match (Phase 3).

### Integration Tests:

- `yarn flow` (the existing fork-parity guard) remains green through all phases.
- `yarn test` full suite (exercises the jest fork swap on every shard) remains green.
- Regenerate-and-diff is the end-to-end proof for Phase 2 (`git diff --exit-code` on the two fork files).

### Manual Testing Steps:

1. Phase 1: delete one `export const` from `.custom.js` → parity test must fail → revert.
2. Phase 2: add a symbol to canon + regenerate → both files get a correct passthrough → revert; hand-edit a fork out of sync → CI freshness step fails → revert.
3. Phase 3: spot-check that rollup/jest/flow resolve the same fork for a representative multi-segment `shortName`.

## Performance Considerations

None material — all changes are build-time scripts and tests. The generator and parity test run on developer/CI machines, not in shipped runtime. Babel parsing of the fork files is trivial (a few hundred lines each).

## Migration Notes

No data or runtime migration. `.custom.js`/`.noop.js` become generated artifacts that stay checked in — the only behavioral expectation is that contributors run `yarn generate-host-config-forks` after changing the contract surface (enforced by the CI freshness check), analogous to the existing `yarn generate-inline-fizz-runtime` workflow.

**Prettier-version dependency (byte-identity gate):** The zero-diff gate relies on prettier reproducing the committed wrapping exactly (31 of 166 passthroughs wrap at `printWidth: 80`, deterministic from symbol-name length per `.prettierrc.js`). `package.json` pins `prettier` with a caret (`^3.3.3`), so determinism comes from the committed lockfile, not the manifest. A future major/minor prettier bump that changes reflow could flip the diff gate red on an otherwise-unrelated dependency update — the failure would surface as a `check_generated_host_config_forks` diff, fixable by regenerating. No pin change is required, but a contributor bumping prettier should expect to re-run `yarn generate-host-config-forks`.

## References

- Research: `context/changes/refactor-opportunities/research.md`
- Prior evidence: `context/changes/host-config-seam/research.md` (T1–T7)
- Canonical surface: `packages/react-reconciler/src/forks/ReactFiberConfig.custom.js` (166 symbols), `ReactFiberConfig.noop.js:25` (leading `export *`)
- Selector to extract: `scripts/rollup/forks.js:29-43`, `scripts/jest/setupHostConfigs.js:194-206`, `scripts/flow/createFlowConfigs.js:43-51`
- Codegen patterns to mirror: `scripts/flow/createFlowConfigs.js`, `scripts/rollup/generate-inline-fizz-runtime.js`
- Test harness: `scripts/shared/__tests__/evalToString-test.js`, `scripts/jest/config.base.js:28,31`
- CI freshness precedent to clone: `.github/workflows/runtime_build_and_test.yml:128-153` (`check_generated_fizz_runtime` — regenerate + `git diff --exit-code`); `.dependency-cruiser.js:18` (`no-circular`, not wired in)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: T4 — Fork-parity test

#### Automated

- [x] 1.1 Parity test passes (`yarn test scripts/shared/__tests__/hostConfigForkSurface-test.js`) — 0f42d0a37
- [x] 1.2 Full suite unaffected (`yarn test`) — 0f42d0a37
- [x] 1.3 Canonical count self-check holds (166 symbols) — 0f42d0a37
- [x] 1.4 Linting passes (`yarn lint`) — 0f42d0a37

#### Manual

- [x] 1.5 Deleting an `export const` from `.custom.js` makes the parity test fail, then revert — 0f42d0a37
- [x] 1.6 Allowlist entries each have a clear, correct rationale — 0f42d0a37

### Phase 2: T2 — Codegen for `.custom`/`.noop`

#### Automated

- [x] 2.1 Generating `.custom.js` produces zero diff vs committed — e0ddc873e
- [x] 2.2 Generating `.noop.js` produces zero diff vs committed — e0ddc873e
- [x] 2.3 Parity test still passes — e0ddc873e
- [x] 2.4 Flow unaffected (`yarn flow`) — e0ddc873e
- [x] 2.5 Full suite passes (`yarn test`) — e0ddc873e
- [x] 2.6 Linting passes (`yarn lint`) — e0ddc873e

#### Manual

- [x] 2.7 Adding a symbol + regenerating yields correct passthroughs in both files, then revert — e0ddc873e
- [x] 2.8 Generated files visually indistinguishable from originals — e0ddc873e
- [x] 2.9 CI freshness step fails on a hand-edited out-of-sync fork, then revert — e0ddc873e

### Phase 3: T1 — Extract the shared fork selector

#### Automated

- [x] 3.1 Selector unit test passes — 15fbae4e0
- [x] 3.2 Flow resolves every config (`yarn flow`) — 15fbae4e0
- [x] 3.3 Full suite passes (`yarn test`) — 15fbae4e0
- [x] 3.4 Production build resolves forks correctly (`yarn build`) — 15fbae4e0
- [x] 3.5 Linting passes (`yarn lint`) — 15fbae4e0

#### Manual

- [x] 3.6 All three toolchains resolve the same fork for a representative `shortName` — 15fbae4e0
- [x] 3.7 No behavioral difference for edge cases (multi-segment names, base fallback) — 15fbae4e0
