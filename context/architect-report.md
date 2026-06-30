# Raport architektoniczny — Moduł 4 (10xArchitect)

> Synteza czterech artefaktów z **jednego** repozytorium (React). Twierdzenia strukturalne oparte na artefaktach (weryfikacja ast-grep tam, gdzie zaznaczono). Tam gdzie czegoś brak — napisane wprost „BRAK".

## 1. Opisane projekty

Wszystkie artefakty modułu 4 powstały na **jednym** repo — nie pochodzą z różnych projektów.

| Repo | Stack | Skala (orientacyjnie) | Gdzie użyte |
|---|---|---|---|
| **React** (monorepo) | JS/Flow (runtime), TS (`compiler/`), Rust (`compiler/crates`) | 1016 commitów / 12 mies. na `main`; 899 modułów first-party w grafie importów; ~65 feature flag, 7 forków host-config | **L2, L3, L4, L5** |

> BRAK artefaktów z innych repozytoriów — moduł przerobiony w całości na React.

## 2. Mapa projektu (z L2 — `context/map/repo-map.md`, React)

1. **Trzy serca, jeden pivot.** DevTools + Compiler(JS) + runtime; ostatni kwartał (Q2-2026) to wyraźny pivot na `compiler/crates` (Rust), zgodny z gałęzią `rust-research`.
2. **Strefa ryzyka #1 — `packages/shared`.** „Semantyczny przełącznik" runtime'u (ReactFeatureFlags) — jedyne błędy o sile `error` w grafie; przecieka **w górę** przez `*SharedInternals`.
3. **Dwa wielkie sploty cykli (SCC).** SCC=119 w DevTools i SCC=77 w `reconciler`+`react`+`shared`; `ReactFiberWorkLoop.js` = 46/59 zależności w cyklu — epicentrum, testowalne tylko e2e.
4. **Most o najwyższym sprzężeniu — `ReactFiberConfigDOM.js`** (20 zależności cross-area). Wybrany jako wejście do L3.
5. **Najważniejszy unknown:** `compiler/crates` (Rust) poza grafem dependency-cruiser — to **brak danych o sprzężeniach**, NIE „brak sprzężeń".

## 3. Analiza ficzera (z L3 — `context/changes/host-config-seam/research.md`, React)

**Co badano i dlaczego.** Szew **host-config** (`ReactFiberConfig` shim → fork → `ReactFiberConfigDOM`) — wybrany, bo mapa wskazała `ReactFiberConfigDOM.js` jako most o najwyższym sprzężeniu cross-area (strefa ryzyka §4).

**Feature overview.** Reconciler nigdy nie importuje API hosta wprost — importuje abstrakcyjny kontrakt z `ReactFiberConfig.js`, którego body to celowy `throw` (`:20`). Trzy niezależne toolchainy (Rollup/Jest/Flow) podmieniają ten import w czasie buildu na dokładnie jeden z **7 forków**; `.dom` re-eksportuje `ReactFiberConfigDOM.js`. Stan „zmienia się" przez wybór forka per renderer (źródło prawdy: `scripts/shared/inlinedHostConfigs.js`); wraca komplet operacji hosta + capability flags konsumowanych przez 29 plików reconcilera.

**Technical debt (top 3):**
- **T2/T4 — luka kompletności (potwierdzona ast-grep).** Brak codegenu: `.custom.js` ma **166** ręcznych passthroughów `export const X = $$$config.X` (ast-grep=166; naiwny grep zaniżał do 135 przez multiline), `.noop.js` te same 166. **Brak testu parzystości** — jedynym strażnikiem 7 forków jest Flow.
- **T7 — blast radius kontraktu.** Płaski kontrakt importowany przez **29 plików** (25 value + 4 type-only, potwierdzone ast-grep); dodanie metody = ~7–12 plików w 5+ pakietach.
- **T6 — kruche sprzężenie.** DOM↔reconciler to **realny cykl** (back-import `WithNoPersistence` `:297` + wartości `:34,:144,:145`), wbrew „jednokierunkowości" z mapy. `dependency-cruiser no-circular` istnieje, ale **NIE jest wpięty w CI**.

## 4. Plan refaktoryzacji (z L4 — `archive/2026-06-21-refactor-opportunities/plan.md`, React)

**Co refaktoryzowane.** Trzy najtańsze, odwracalne osłony długu host-config, sekwencja **T4 → T2 → T1**. Docelowy kształt: runtime'owy test parzystości 166 symboli + codegen `.custom`/`.noop` (byte-identyczny) + jeden wspólny selektor forka. Wszystko w `scripts/` — **zero zmian w runtime `packages/`**.

**Czego świadomie NIE robimy.** T5 (knot kontrolowanych komponentów — to redesign semantyki, nie szwu), T6 (cykl load-bearing — co najwyżej guard widoczności w CI), T7 (segmentacja kontraktu — jej *ból* znika po T4+T2), T3 (unit-test DOM). Bez zmian w `$$$config`, kształcie kontraktu i strukturze 3 toolchainów.

**Fazy (status: wszystkie zakończone — patrz `Progress`):**
- **Faza 1 — T4 parzystość:** test set-equality `.noop` vs kanon (166) + self-check liczby → auto (`yarn test`) + ręczna (usuń symbol → test pada). ✅ `0f42d0a37`
- **Faza 2 — T2 codegen:** generator `.custom`/`.noop` → auto (`git diff --exit-code` = zero + nowy job CI) + ręczna (wygląd plików). ✅ `e0ddc873e`
- **Faza 3 — T1 selektor:** ekstrakcja `getForkCandidates` do `scripts/shared/`, 3 call-sites → auto (`yarn test`/`flow`/`build`) + ręczna (spot-check 3 toolchainów). ✅ `15fbae4e0`

> Odstępstwa (z impl-review): parser `@babel/parser` → `hermes-parser` (czysto obsługuje Flow); `getForkExports` zwraca tablicę, nie `Set` (środowisko Jest Reacta psuje spread `Set`).

## 5. Domena wg DDD (z L5 — `context/domain/01–03`, React)

**Ubiquitous language (5 pojęć):** Host Config (kontrakt renderer↔reconciler), Fork (realizacja kontraktu wstrzykiwana w buildzie, 7 szt.), Capability flag (`supportsMutation`/`supportsPersistence` — statyczny wymiar zachowania), Feature flag (przełącznik kompilacyjny, 65 szt.), Flight/RSC (protokół serializacji klient↔serwer).
**Rozjazdy model-vs-kod:** (D1) mapa przypisuje przeciek `shared` *flagom* — a robią go `*SharedInternals` (flagi mają 0 importów); (D2) DOM↔reconciler opisany jako jednokierunkowy, a to cykl; (D7) docs mówią o dwufazowym `prepareUpdate`+`commitUpdate` — `prepareUpdate` **nie istnieje** w kontrakcie.

**Niezmiennik #1 i agregat.** Agregat **A1 — Host Config**. Niezmiennik wybrany do refaktoru (L5/02): **N4 — każdy *realny* renderer włącza dokładnie jedną z `supportsMutation` ⊕ `supportsPersistence`**. Rdzeniowy, bo flaga przełącza całą ścieżkę completion-work reconcilera (`ReactFiberCompleteWork.js:469` vs `:481`); nieegzekwowany, bo Flow widzi typ `boolean`, nie liczbę `true` (noop to jawny wyjątek — definiuje oba host-configi). Projekt: moduł-strażnik `RendererCapabilityProfile` rzucający nazwany `CapabilityInvariantError` + jawny rejestr `MULTI_MODE_RENDERERS`. *(T1/T2/T4 z planu L4 już zabezpieczyły resztę A1 — stąd L5 celuje w jedyny pozostały, nieegzekwowany człon.)*

**Anti-Corruption Layer (L5/03).** Przeciekająca zależność: **`acorn-loose`** w subdomenie RSC/Flight — importowana w **6 plikach / 3 pakietach** (webpack, unbundled, esm) + *martwo* zadeklarowana w manifeście turbopack. Przecieka przez **~3 warstwy**: kształt AST (`node.type/declaration/loc`) wczytany w ~800-liniowy algorytm transformacji **potrojony niemal bajt-w-bajt** (`*NodeLoader.js` różnią się 1–2 liniami), plus skopiowany 5× niezmiennik „use client ⊕ use server". ACL: wąski port `FlightModuleParser` + VO + jeden adapter jako jedyne miejsce z `import acorn`.

## 6. Decyzje, które należą do mnie

AI podpowiedziało *mechanikę i dowody* — zliczyło 166 symboli, 7 forków, 29 importerów (ast-grep, z odróżnieniem 25 value / 4 type-only) i wykryło, że naiwny grep zaniża do 135. Ja rozstrzygnąłem **priorytety i granice**: że refaktor idzie nie w najdotkliwszy dług (T7), lecz w najtańsze odwracalne osłony (T4→T2→T1), oraz że T5 to redesign pojęć, a T6 to guard, nie przebudowa — świadome „osłona przed przebudową". W L5 sam zdecydowałem, że skoro plan L4 zamknął większość A1, niezmiennik #1 przesuwa się na nieegzekwowane N4 (capability ⊕), a nie na już-zabezpieczoną parzystość powierzchni. Świadomie też odrzuciłem typ-sumę Flow dla XOR capability — to przepisanie kontraktu flag w 6+ plikach (blast radius T7), więc test konformancji to tańsza, lokalna bramka o tym samym efekcie. (Dla porządku: zmiana parsera Babel→`hermes-parser` nie była moją decyzją z góry, lecz odstępstwem ujawnionym dopiero w impl-review — `plan.md` Addenda — gdy Babel nie radził sobie z `opaque type` forków; zostawiam to jako fakt wykonawczy, nie zasługę architektoniczną.)
