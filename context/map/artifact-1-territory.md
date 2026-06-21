# Artefakt 1 — Mapa terytorium (historia gita)

**Zakres:** ostatnie 12 miesięcy (2025-06-21 → 2026-06-21)
**Próbka:** 1016 commitów na gałęzi `main`
**Metoda:** Wide Scan z historii gita; szum (lockfile'e, `package.json`, snapshoty `.snap`, fixtures, configy lint/prettier) odfiltrowany na poziomie agregacji folderów. Wszystkie wskazane pliki zweryfikowane jako wciąż obecne w repo.

---

## 1. Aktywność — gdzie projekt był realnie dotykany

### a) Foldery / moduły (TOP, 12 mies., szum odfiltrowany)

| # | Obszar (2 poziomy) | Commity | Co to jest |
|---|---|---|---|
| 1 | `packages/react-devtools-shared` | 979 | Rdzeń React DevTools (backend + frontend views) |
| 2 | `compiler/packages` | 916 | React Compiler (babel-plugin, eslint-plugin, snap) |
| 3 | `packages/react-reconciler` | 377 | Rdzeń reconcilera (Fiber) |
| 4 | `packages/shared` | 311 | Współdzielone (głównie feature flags + forks) |
| 5 | `packages/react-server` | 304 | Flight server (RSC) |
| 6 | `compiler/crates` | 291 | Port kompilatora do Rusta (aktywny od Q2-2026) |
| 7 | `packages/react-dom` | 202 | DOM renderer / Fizz SSR |
| 8 | `packages/react-server-dom-webpack` | 160 | RSC bindings dla webpacka |
| 9 | `packages/react-client` | 157 | Flight client (RSC) |
| 10 | `packages/react-dom-bindings` | 132 | Most DOM ↔ reconciler |

**Drążenie głębiej** (dwa obszary były zbyt ogólne):

- `react-devtools-shared/src` → dominuje `devtools/views` (470) — czyli **UI DevToolsa**, z wyraźnym hotspotem w nowej zakładce **SuspenseTab** (SuspenseRects, SuspenseTab, SuspenseTimeline). Drugi blok: `backend/fiber` (109, głównie `renderer.js`).
- `babel-plugin-react-compiler/src` → po odjęciu `__tests__` (3576 — to fixtures, nie kod ręczny) realne hands-on: `HIR` (180), `Validation` (169), `Inference` (92), `Entrypoint` (82), `ReactiveScopes` (72).

### b) Pliki (TOP, 12 mies.)

| # | Plik | Commity |
|---|---|---|
| 1 | `react-devtools-shared/src/backend/fiber/renderer.js` | 99 |
| 2 | `react-server/src/ReactFlightServer.js` | 70 |
| 3 | `react-client/src/ReactFlightClient.js` | 61 |
| 4 | `react-server/src/ReactFizzServer.js` | 42 |
| 5 | `react-dom-bindings/src/client/ReactFiberConfigDOM.js` | 41 |
| 6 | `compiler/.../HIR/Environment.ts` | 36 |
| 7 | `react-devtools-shared/src/devtools/store.js` | 35 |
| 8 | `shared/ReactFeatureFlags.js` (+ forks) | 34 |
| 9 | `react-reconciler/src/ReactFiberWorkLoop.js` | 32 |
| 10 | `devtools/views/SuspenseTab/SuspenseRects.js` | 28 |

---

## 2. Nacisk pracy w czasie (kwartalnie)

| Kwartał | #1 | #2 | #3 | Sygnał |
|---|---|---|---|---|
| **Q3-2025** | react-devtools-shared (455) | compiler/packages (413) | react-server (123) | Szczyt prac nad DevTools i kompilatorem (JS) równolegle |
| **Q4-2025** | react-devtools-shared (280) | compiler/packages (174) | shared (84) | DevTools nadal #1, RSC-webpack wchodzi do TOP |
| **Q1-2026** | compiler/packages (285) | shared (124) | react-devtools-shared (111) | **Przesunięcie**: kompilator (JS) wyprzedza DevTools |
| **Q2-2026** | **compiler/crates (291)** | react-devtools-shared (133) | react-server (105) | **Pivot na port Rust** — crates z zera na #1 |

**Wniosek narracyjny:** rok zaczyna się od dominacji DevTools (zwłaszcza nowej zakładki Suspense), środek roku to intensywne prace nad React Compilerem w JS/TS, a ostatni kwartał to wyraźny zwrot ku **przepisywaniu kompilatora na Rust** (`compiler/crates`) — co pokrywa się z aktywną gałęzią `rust-research` opisaną w CLAUDE.md.

---

## 3. Współzmiany — co zmienia się razem

### TOP sprzężenia katalogów (pary, 12 mies.)

| Para | Wspólne commity | Interpretacja |
|---|---|---|
| `react-client` ↔ `react-server` | 50 | Protokół RSC (Flight) — klient i serwer są jedną umową, zmieniają się parami |
| `react-reconciler` ↔ `shared` | 40 | Reconciler konsumuje feature flags ze `shared` |
| `react-dom` ↔ `react-reconciler` | 38 | DOM renderer jest hostem dla reconcilera |
| `react-server` ↔ `react-server-dom-webpack` | 37 | Rdzeń RSC + jego bindings |
| `react-dom` ↔ `react-server` | 35 | SSR (Fizz) łączy oba światy |

Dodatkowo wyraźny **klaster RSC-bindings**: warianty `react-server-dom-{webpack,turbopack,parcel,esm,unbundled}` zmieniają się gęsto między sobą (25–28 wspólnych commitów na parę) — zmiana w jednym bundlerze niemal zawsze propaguje się do pozostałych.

### Wnioski dla TOP 3 obszarów z rankingu aktywności

1. **react-devtools-shared (#1 aktywność)** — najsilniej sprzęga się z `react-reconciler` (22 commity). To zależność jednokierunkowa: backend DevToolsa (`renderer.js`) czyta wewnętrzne struktury Fiber, więc zmiany w reconcilerze pociągają DevTools. Poza tym obszar jest dość **samodzielny** (większość ruchu wewnątrz `devtools/views`).
2. **compiler/packages (#2)** — bardzo nisko w rankingu współzmian międzymodułowych. Kompilator to **wyspa**: zmienia się intensywnie, ale prawie wyłącznie wewnątrz własnego poddrzewa (`compiler/`). Niemal nie sprzęga się z `packages/`.
3. **react-reconciler (#3)** — **centralny hub** runtime'u: sprzęga się z `shared`, `react-dom`, `react-dom-bindings`, `react-native-renderer`, `react-server` i `react`. Każda zmiana semantyki reconcilera promieniuje na wszystkie renderery.

---

## 4. Wspólny mianownik całego repo (pliki spinające najwięcej obszarów)

Pliki dotykane razem z największą liczbą różnych katalogów (breadth, nie częstotliwość):

- **Configi/CI** (oczekiwany szum, ale realny wspólny mianownik): `package.json` (67 obszarów), `.github/workflows/runtime_build_and_test.yml` (48), `.eslintrc.js` (46).
- **Realne pliki-mianowniki kodu:**
  - `packages/shared/forks/ReactFeatureFlags.*.js` — **10 wariantów forków** (www, native-fb, native-oss, test-renderer, dynamic, readonly, eslint-plugin…), każdy spinający ~40 obszarów. To centralny przełącznik zachowań całego runtime'u; pojedyncza flaga dotyka wielu pakietów naraz.
  - `react-noop-renderer/src/createReactNoop.js` (45) — testowy renderer używany w całym runtime.
  - `react-dom-bindings/src/client/ReactFiberConfigDOM.js` (44) i `react-reconciler/src/ReactFiberHooks.js` (42) — szeroko współdzielone punkty styku.

**Najważniejszy "wspólny mianownik" to rodzina `ReactFeatureFlags`** — to ona, a nie żaden config, jest semantycznym wspólnym mianownikiem runtime'u Reacta.

---

## 5. Weryfikacja istnienia plików (anty-pułapka historii)

Wszystkie pliki, na których opiera się ta analiza, **wciąż istnieją w repo** (sprawdzone `test -f`):

✅ `renderer.js`, `ReactFlightServer.js`, `ReactFlightClient.js`, `ReactFeatureFlags.js` + forks, `ReactFiberHooks.js`, `ReactFiberConfigDOM.js`, `SuspenseRects.js`, `ReactFiberWorkLoop.js`, `ReactFlightDOMServerNode.js` — wszystkie OK, żaden nie został usunięty/przeniesiony.

Analiza nie opiera się na nieistniejących artefaktach historii.

---

## TL;DR mapy terytorium

- **Trzy serca projektu:** DevTools (UI + backend fiber), React Compiler (JS→teraz Rust), runtime reconciler+RSC.
- **Trend roczny:** DevTools → Compiler(JS) → **Compiler(Rust)**; ostatni kwartał to wyraźny pivot na `compiler/crates`.
- **Hub sprzężeń:** `react-reconciler` (promieniuje na wszystkie renderery) i protokół RSC (`react-client`↔`react-server` + klaster `*-dom-*` bindings).
- **Wspólny mianownik:** `ReactFeatureFlags` (10 forków) — semantyczny przełącznik całego runtime'u.
- **Wyspa:** React Compiler — intensywny, ale samowystarczalny, prawie bez sprzężeń z `packages/`.
