# Artefakt 3 — Mapa kontrybutorów (historia gita)

**Zakres:** ostatnie 12 miesięcy (2025-06-21 → 2026-06-21), gałąź `main`, `--no-merges`
**Metoda:** ranking autorów per obszar z artefaktu 1; tematy z prefiksów `[Tag]` i słów kluczowych w temacie commita.
**Filtr szumu:** odrzucono boty i automatyzacje (`Facebook Community Bot`) oraz commity bez wyraźnego autorstwa człowieka. W próbce nie wystąpili agenci typu Claude / Codex / Copilot z własnym autorstwem.

> **Uwaga metodyczna:** prompt źródłowy był generycznym szablonem. Obszary podstawiono z realnych hotspotów Reacta (artefakty 1 i 2), nie z przykładów szablonu.

---

## Top 5 obszarów wymagających kontaktu z kontrybutorami

Wybrane jako przecięcie **wysokiej aktywności** (artefakt 1) i **wysokiego ryzyka zmiany** (cykle/sprzężenia z artefaktu 2):

| # | Obszar | Dlaczego wymaga kontaktu |
|---|---|---|
| 1 | **React DevTools** (`react-devtools-shared`) | #1 aktywności; SCC=119 — refactor UI ryzykuje regresje w niespodziewanych widokach |
| 2 | **React Compiler** (`compiler/packages` + `compiler/crates`) | #2 aktywności; wyspa z własnymi regułami; trwa pivot na Rust |
| 3 | **Reconciler** (`react-reconciler` + `shared`) | centralny hub; `ReactFiberWorkLoop.js` 46/59 w cyklu — nie ma „bezpiecznego" pliku |
| 4 | **RSC / Flight** (`react-server` + `react-client` + `*-dom-webpack`) | protokół klient↔serwer; kontrakt wymaga pary; 50 wspólnych commitów |
| 5 | **DOM / Fizz SSR** (`react-dom` + `react-dom-bindings`) | most DOM↔reconciler; `ReactFiberConfigDOM.js` 20 cross-area |

---

## Linia wsparcia — kto pyta o co

### 1. React DevTools

| Osoba | Commity | Specjalizacja (tematycznie) |
|---|---|---|
| **Sebastian "Sebbie" Silbermann** | 108 | SuspenseTab/Suspense (41), Timeline (9), testy (9), store, hydratacja — główny support UI/frontend DevTools |
| **Sebastian Markbåge** | 107 | Suspense + **SuspenseRects** (13), Timeline (12), drzewo komponentów, highlight, backend fiber — architektura nowej zakładki Suspense |
| **Ruslan Lesiutin** | 28 | Backend bridge, stack traces, profiler roots, gating SuspenseTab, fixy store/tree — utrzymanie i kompatybilność backendu |
| Jan Kassens | 10 | Flow → TypeScript / infrastruktura typów |

**Pierwszy kontakt:** Sebbie (frontend/UI), Markbåge (architektura SuspenseTab/Rects), Ruslan (backend/bridge).

### 2. React Compiler

| Osoba | Commity | Specjalizacja |
|---|---|---|
| **Joseph Savona** | 125 | Rdzeń: validation (9), typy (8), memoizacja (7), efekty, inference, HIR — główny właściciel kompilatora JS |
| **lauren** | 27 | **Port Rust** (`compiler/crates`: JsString/WTF-16, AST, napi), release, playground, eslint |
| **Jorge Cabiedes** | 15 | Reguły lint, zwłaszcza `no-derived-computations-in-effects` / `no-deriving-state-in-effects` |
| Michael Vitousek, Boshen | 1 ea. | Współudział w Rust crates |

**Pierwszy kontakt:** Savona (kompilator JS / HIR / walidacje), lauren (port Rust), Jorge (reguły ESLint efektów).

### 3. Reconciler (`react-reconciler` + `shared`)

| Osoba | Commity (reconciler) | Specjalizacja |
|---|---|---|
| **Sebastian Markbåge** | 47 | Semantyka rdzenia Fiber, work loop |
| **Sebastian "Sebbie" Silbermann** | 29 | Testy, Flow, utrzymanie |
| **Ricky (rickhanlonii)** | 15 | **Feature flags** (`[flags]` ×7), testy, synchronizacja RN — bramkowanie zachowań |
| Ruslan Lesiutin | 13 | Styk z DevTools backend |
| Jan Kassens | 11 | Flow (17 commitów cross-repo) |

**Pierwszy kontakt:** Markbåge (semantyka reconcilera), Ricky (feature flags w `shared`), Sebbie (testy/Flow).

### 4. RSC / Flight

| Osoba | Commity | Specjalizacja |
|---|---|---|
| **Sebastian Markbåge** | 89 | Flight (68), debug info (28), Fizz (9), owner stack, streaming — architekt protokołu RSC |
| **Hendrik Liebau** | 31 | Flight client/reply: backpressure, DoS hardening, FormData, cykliczne referencje, byte stream |
| **Josh Story** | 19 | Fizz (16), preload, prerender — SSR / float resources |
| Jan Kassens | 8 | Infra/Flow |

**Pierwszy kontakt:** Markbåge (protokół Flight), Hendrik (Flight client / edge-case'y serializacji), Josh Story (Fizz/SSR).

### 5. DOM / Fizz SSR

| Osoba | Commity | Specjalizacja |
|---|---|---|
| **Sebastian Markbåge** | 31 | Rdzeń DOM config / Fizz |
| **Josh Story** | 19 | Fizz, preload/stylesheet, hoistable resources |
| **Jack Pope** | 15 | **FragmentInstance / FragmentRef**, ViewTransition, focus management, instance handles |
| Sebbie Silbermann | 20 | Testy / utrzymanie |
| Ricky | 11 | Feature flags, RN sync |

**Pierwszy kontakt:** Jack Pope (Fragment refs / ViewTransition), Josh Story (Fizz/resources), Markbåge (host config).

---

## Macierz „kto wie najwięcej" (skrót)

| Obszar | Architektura | Backend/rdzeń | Utrzymanie/testy |
|---|---|---|---|
| DevTools | Markbåge | Ruslan | Sebbie |
| Compiler | Savona | Savona / lauren (Rust) | Jorge (lint) |
| Reconciler | Markbåge | Markbåge | Sebbie / Ricky (flags) |
| RSC/Flight | Markbåge | Hendrik | Josh Story (Fizz) |
| DOM/Fizz | Markbåge | Josh Story | Jack Pope |

**Obserwacja:** **Sebastian Markbåge** jest wspólnym mianownikiem 4 z 5 obszarów (architektura runtime + RSC + DevTools Suspense). **Sebbie Silbermann** to drugi szeroki węzeł (testy/Flow + DevTools UI). Pozostali to wyraźni specjaliści: Savona/lauren (kompilator), Hendrik (Flight edge-cases), Josh Story (Fizz/SSR), Jack Pope (Fragment/ViewTransition), Ricky (feature flags), Jorge (reguły lint efektów).
