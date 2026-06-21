<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Host-Config-Seam Refactor Opportunities

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Scope**: All 3 phases (T4, T2, T1)
- **Date**: 2026-06-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence: 8/8 planned changes MATCH (0 DRIFT, 0 MISSING, 0 EXTRA); changed-file list equals plan's file list exactly with zero `packages/` runtime changes; targeted tests 5 passed / 1 skipped (documented carry-through gap); regenerate + `git diff --exit-code` on `.custom.js`/`.noop.js` → ZERO DIFF; lint passed.

## Findings

### F1 — Test comment misattributes the Set-spread quirk source

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/shared/__tests__/hostConfigForkSurface-test.js:51-55
- **Detail**: Test avoids `Set` because `[...new Set()]` collapses to length 1 in React's Jest env (behavior empirically confirmed), but the comment blamed `scripts/jest/setupTests.js`, which has no iterator monkeypatch. Cause is the regenerator/Babel transform.
- **Fix**: Reword the comment to attribute the quirk to React's Jest/Babel transform.
- **Decision**: FIXED via Fix now

### F2 — Plan said Babel + Set; impl uses hermes-parser + array

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/shared/hostConfigForkSurface.js:12, :38-55
- **Detail**: Plan §Phase1 mandated `@babel/parser` and a `Set` return from `getForkExports`. Impl uses `hermes-parser` (React's native Flow parser, handles opaque/declare cleanly) and returns an ordered array (Set avoided per F1). Both are improvements; anti-regex intent (166 vs 135) preserved. Deviation was unrecorded in plan.md.
- **Fix**: Add an addendum to plan.md noting Babel→hermes-parser and Set→array with rationale.
- **Decision**: FIXED via Fix now (addendum appended to plan.md)

### F3 — Generator preamble slice assumes rendererVersion is first symbol

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: scripts/generate-host-config-forks.js (getPreamble)
- **Detail**: Preamble sliced verbatim up to marker `\nexport const rendererVersion =`, assuming `rendererVersion` is the first passthrough. True today in both forks. If reordered, the slice silently captures the wrong span — but the byte-identical CI diff gate catches it immediately, failing loud at the right place.
- **Fix**: None required — the CI freshness check is the backstop.
- **Decision**: SKIPPED
