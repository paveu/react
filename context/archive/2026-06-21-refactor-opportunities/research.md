---
date: 2026-06-21T19:05:00+0200
researcher: Pawel Stepak
git_commit: f5baba3ad81829e8cc3c8389802ac223c7fb3837
branch: main
repository: react
topic: "Ranking documented tech-debt (host-config-seam) into prioritized refactor opportunities"
tags: [research, refactor-opportunities, host-config, react-reconciler, react-dom-bindings, tech-debt, verified]
status: complete
last_updated: 2026-06-21
last_updated_by: Pawel Stepak
verification_commit: f5baba3ad81829e8cc3c8389802ac223c7fb3837
prior_evidence: context/changes/host-config-seam/research.md (T1–T7), context/map/repo-map.md, context/map/artifact-2-structure.md
method: 3 read-only sub-agents (current shape / history-intent / migration feasibility), each covering all candidates
---

# Research: Refactor opportunities — ranking the host-config-seam tech debt

**Date**: 2026-06-21T19:05:00+0200
**Researcher**: Pawel Stepak
**Git Commit**: f5baba3ad81829e8cc3c8389802ac223c7fb3837
**Branch**: main
**Repository**: react

## Research Question

Analiza `context/changes/host-config-seam/research.md` dokumentuje dług techniczny i ryzyka strukturalne. To pytanie: KTÓRE z tych problemów warto naprawić, w jakim docelowym kształcie i w jakiej kolejności. Eksploracja, nie decyzja — produktem jest ranking opcji z trade-offami dla osobnej sesji planowania.

Ustalenia raportu host-config-seam traktowane jako zebrane dowody (nie wyprowadzane na nowo). Priory przeczytane: `context/map/repo-map.md` (strefy ryzyka §4), `context/map/artifact-2-structure.md` (graf zależności, SCC).

## Summary

Raport host-config-seam odnotowuje **7 pozycji długu (T1–T7)**. Po klasyfikacji: **5 kandydatów strukturalnych** (T1, T2, T5, T6, T7) i **2 nie-kandydatów** (T3, T4 — braki testów, które są wejściem do oceny wykonalności, nie problemami strukturalnymi).

Trzy sub-agenty (obecny kształt / historia-intencjonalność / wykonalność) zbadały każdego kandydata. Kluczowe ustalenia:

- **Wszystkie pięć kandydatów ma werdykt intencjonalności = ŚWIADOME OGRANICZENIE**, każdy kotwiczony konkretnym commitem (#12792 jest fundamentem dla T1/T2/T6/T7; #8176 dla T5). To NIE jest przypadkowy bałagan — to konsekwencje świadomej decyzji o szwie podmienianym w czasie buildu (statyczna substytucja modułu zamiast runtime'owego interfejsu polimorficznego).
- **T5 (knot kontrolowanych komponentów) i T6 (cykl DOM↔reconciler) to "guard, nie przebudowa".** T5 — prawdziwa naprawa to przeprojektowanie *semantyki* restore'u stanu kontrolowanego, nie szew kodu → **zatrzymanie**, to przedmiot innej analizy. T6 — back-importy `flushSyncWork`/`requestFormReset` to nośne wywołania runtime'u reconcilera, których DOM faktycznie potrzebuje; cykl jest load-bearing.
- **Najmocniejsi kandydaci to T4→T2→T1** — nie dlatego, że dług jest największy, lecz dlatego, że koszt zmiany jest najniższy, blast radius mieści się w `scripts/` + generowanych forkach (zero runtime'u `packages/`), a każdy bezpośrednio zmniejsza ból T7 (blast radius kontraktu) bez dotykania kształtu kontraktu.
- **Krytyczny fakt z CI:** `dependency-cruiser` **NIE jest wpięty w CI** (tylko devDependency, brak skryptu `depcruise`, zero referencji w `.github/`). Reguła `no-circular` istnieje w `.dependency-cruiser.js:18` na `severity: warn`, ale nigdy nie jest wywoływana. Jedynym strażnikiem parzystości powierzchni forków jest **Flow** (`yarn flow` w `runtime_build_and_test.yml:98`).

## Lista kandydatów i klasyfikacja (do audytu)

| # | Problem (host-config-seam §2) | Klasa | Uzasadnienie klasyfikacji |
|---|---|---|---|
| **T1** | Reguła swap ztriplikowana (rollup/jest/flow), zsynchronizowana tylko przez `inlinedHostConfigs.js` | **KANDYDAT** | Naprawa = wspólny moduł selektora → zmienia strukturę kodu |
| **T2** | Brak codegenu; 7 forków ręcznych; `.custom`/`.noop` po 166 linii `$$$config` | **KANDYDAT** | Naprawa = generator powierzchni → zmienia strukturę |
| **T3** | `ReactFiberConfigDOM.js` bez bezpośredniego unit-testu | **NIE-KANDYDAT** | Brak testu — wejście do wykonalności, nie zmiana struktury |
| **T4** | Brak testu parzystości/konformności forków | **NIE-KANDYDAT** | Brak testu — wejście do wykonalności (osłona dla T1/T2/T7) |
| **T5** | Knot kontrolowanych komponentów (SCC=21) bez szwu izolacji | **KANDYDAT → zatrzymany** | Strukturalny z pozoru, ale prawdziwa naprawa = redesign semantyki restore'u (patrz werdykt) |
| **T6** | Cykl DOM↔reconciler (back-import + wartości) | **KANDYDAT → guard, nie przebudowa** | Strukturalny cykl, ale load-bearing i świadomy (analog C2) |
| **T7** | Blast radius zmiany kontraktu (~7–12 plików / 5+ paczek) | **KANDYDAT** | Strukturalny (dekompozycja kontraktu); silnie nakłada się na T2/T4 |

**Kandydaci strukturalni:** T1, T2, T5, T6, T7.
**Nie-kandydaci (wejście do wykonalności):** T3, T4.

> Zgodność z mapowaniem z lekcji: **T2+T4 = archetyp C4** (luka kompletności: ręczne forki bez codegenu, brak testu parzystości); **T6 = archetyp C2** (świadoma decyzja → guard, nie przebudowa); **T3/T5 = nie-kandydaci / wejście do wykonalności**; **T7 = archetyp C3** (zawężona dekompozycja). T5 dodatkowo eskaluje poza C3 do "redesign pojęć", więc zostaje zatrzymany.

## Findings per kandydat

### T1 — Reguła swap ztriplikowana

**Obecny kształt (evidence).** Ten sam algorytm wyboru forka ("longest-prefix `shortName` split on `-`") jest niezależnie reimplementowany w trzech plikach: `scripts/rollup/forks.js:29-43` (selektor `findNearestExistingForkFile`; wołany przez handler `ReactFiberConfig.js` `:235`, call-sites `:220,250,287,324,368,412` — raport: "selektor `~:235`"), `scripts/jest/setupHostConfigs.js:194-206` (`mockAllConfigs` `:188`), `scripts/flow/createFlowConfigs.js:43-51` (`addFork` `:86`, `module.name_mapper` `:104`). Wszystkie trzy `require` jedyne źródło prawdy `scripts/shared/inlinedHostConfigs.js`. Żaden wspólny helper selekcji nie jest jeszcze wyekstrahowany — współdzielona jest tylko *lista* danych, nie *logika*. [EVIDENCE]

**Werdykt intencjonalności: ŚWIADOME OGRANICZENIE (częściowe) / UNKNOWN co do triplikacji samej logiki.** Szew narodził się w commicie `47b003a82` (#12792, "treat host config as a module") z trzema toolchainami; algorytm `split('-')` dodano do wszystkich trzech selektorów + `inlinedHostConfigs` w jednym commicie `5623f2acf` (#27205). [EVIDENCE] To, że trzy toolchainy istnieją osobno, jest nośne (rollup-plugin, jest-setup, flow-config-gen biegną w różnych kontekstach). Ale *czy logika musiała zostać skopiowana* zamiast wyekstrahowana — brak commita/komentarza tłumaczącego; sub-agent 3 potwierdza, że wszystkie trzy biegną w tym samym kontekście Node i mogłyby `require` wspólny moduł. **Triplikacja logiki = prawdopodobnie przypadkowa złożoność na nośnym fundamencie trzech toolchainów.** [INFERENCE]

**Wykonalność.** Istniejąca abstrakcja: `scripts/shared/inlinedHostConfigs.js` to już współdzielony moduł — szew jest gotowy. Nowa abstrakcja: jeden `scripts/shared/resolveHostConfigFork.js`. Wszystkie trzy call-sites mogą go `require` (ten sam kontekst Node — evidence: sub-agent 3). Osłony dziś: tylko end-to-end (zły swap w Jest → test fail; zły swap w Flow → flow fail w `runtime_build_and_test.yml:98`); brak bezpośredniego testu reguły. Blast radius: **znikomy** — tylko build-scripts, zero runtime'u `packages/`. `scripts/shared/__tests__/` już istnieje (Node-testowalny). Pierwszy krok-prerekwizyt: wyekstrahować `shortName.split('-')` longest-prefix do `scripts/shared/`, dodać test jednostkowy, podmienić 3 call-sites na import. [EVIDENCE/INFERENCE]

### T2 — Brak codegenu; ręczne forki

**Obecny kształt (evidence).** 7 forków w `packages/react-reconciler/src/forks/ReactFiberConfig.{dom,art,fabric,markup,noop,test,custom}.js`. `.dom/.art/.fabric/.markup/.test` to cienkie `export *` re-eksporty (nowy symbol płynie automatycznie). `.custom.js` ma **166** linii `export const X = $$$config.X;` (LHS==RHS każda), `.noop.js` ma **te same 166** passthroughów + wiodące `export * from 'react-noop-renderer/src/ReactFiberConfigNoop'` (`:25`). [EVIDENCE — potwierdzone ast-grep w priorze i ponownie przez sub-agenta 1] **Nie istnieje żadna kanoniczna lista symboli kontraktu** — "powierzchnia kontraktu" to unia eksportów forków + typy Flow. `scripts/flow/createFlowConfigs.js` generuje `.flowconfig`, NIE forki — brak generatora forków w `scripts/`. [EVIDENCE]

**Werdykt intencjonalności: ŚWIADOME OGRANICZENIE.** Trik `$$$config` (host config jako argument funkcji dla zewnętrznych rendererów npm) to udokumentowana decyzja z #12792; nagłówek `forks/ReactFiberConfig.custom.js:10-23` sam to dokumentuje. [EVIDENCE] Brak generatora nie ma komentarza tłumaczącego "dlaczego ręcznie" — ale cienkie forki `export *` celowo NIE wymagają edycji (carry-through), więc ręczna praca dotyczy tylko `.custom`/`.noop`. **Świadomy projekt; ręczna synchronizacja `.custom`/`.noop` to zaakceptowany koszt, nie przeoczenie.** [INFERENCE z #12792]

**Wykonalność.** Istniejąca abstrakcja: brak generatora forków (nowa abstrakcja konieczna). Osłony dziś: tylko Flow (brakujący passthrough → flow error w jednej komórce macierzy konfiguracji). Blast radius: tylko generowane `.custom`/`.noop`; cienkie forki nietknięte — niski, jeśli output byte-identyczny z obecnym. Pierwszy krok-prerekwizyt: zdefiniować kanoniczne źródło symboli (wyprowadzić z `.custom` — patrz T4), uczynić `.custom` generowanym i zdiffować względem zacommitowanego pliku, by udowodnić zero zmiany zachowania, ZANIM tknie się `.noop`. [EVIDENCE/INFERENCE]

### T5 — Knot kontrolowanych komponentów → ZATRZYMANIE (redesign pojęć, nie struktury)

**Obecny kształt (evidence).** SCC=21 w `packages/react-dom-bindings/src/client/` (`ReactDOMInput.js`, `ReactDOMSelect.js`, `ReactDOMTextarea.js`). Ścieżka restore'u biegnie przez system zdarzeń: `ReactDOMComponent.js:3374` eksponuje `restoreControlledState`, importowane bezpośrednio przez `events/ReactDOMControlledComponent.js:15` (raport: "rejestruje jako callback implementacji" — w istocie statyczny import, nie setter; brak `setRestoreImplementation`) i wołane w `:35` → `events/ReactDOMControlledComponent.js` (`enqueueStateRestore:43`, `restoreStateIfNeeded:59`, gate `needsStateRestore:55` (raport: gate `:35` — `:35` to call-site `restoreControlledState`)). Zero plików testowych pod `react-dom-bindings/`. [EVIDENCE]

**Werdykt intencjonalności: ŚWIADOME OGRANICZENIE.** Ścieżka restore'u sterowana zdarzeniami to celowy projekt z `90878df08` (#8176, "explicit-pass restore rationale"), podtrzymany w #8251/#8443 (`4804518c2`/`f1f07c4a2`). [EVIDENCE] Splot jest własnością projektu, nie przeoczeniem.

**Wykonalność → STOP.** Sub-agent 3 zweryfikował twierdzenie priora "entanglement inherent to design": ścieżka restore to **mechanizm runtime'u**, nie brakujący szew. `restoreControlledState` jest wpięty jako callback i napędzany przez system zdarzeń. Rozplątanie Input/Select/Textarea wymaga **przeprojektowania, JAK harmonogramowany jest restore stanu kontrolowanego** — to pojęcie semantyczne/biznesowe, nie szew kodu. **Zgodnie z twardą granicą zadania: prawdziwa naprawa T5 to redesign pojęć, nie struktury → zatrzymuję się. To przedmiot innej, późniejszej analizy.** Nie proponuję ścieżki strukturalnej dla T5. [EVIDENCE]

### T6 — Cykl DOM↔reconciler → guard, nie przebudowa

**Obecny kształt (evidence).** `ReactFiberConfigDOM.js` back-importuje z reconcilera: `export * from 'react-reconciler/src/ReactFiberConfigWithNoPersistence'` (`:297`) plus *wartości*: `getCurrentRootHostContainer` (`:34`), `flushSyncWork` (`:144`), `requestFormReset` (`:145`). Cykl jest **module-level**, nie tylko type-level. 9 stubów `ReactFiberConfigWithNo*.js` istnieje w reconcilerze, rozproszonych po rendererach (DOM importuje tylko 1: `WithNoPersistence`). [EVIDENCE]

**Werdykt intencjonalności: ŚWIADOME OGRANICZENIE (analog C2).** Wzorzec "capability-off defaults" (`WithNo*`) narodził się w #12792; rename HostConfig→FiberConfig + zestaw back-importów `:297` w `b55d31955` (#26592). Trzy back-importy wartości to celowe, datowane dodatki: `getCurrentRootHostContainer` `73b6435ca` (#26450), `flushSyncWork` `4c12339ce` (#28500), `requestFormReset` `374b5d26c` (#28808). [EVIDENCE] Reconciler celowo dostarcza domyślne "ta zdolność jest wyłączona", które renderery komponują; DOM celowo woła z powrotem do runtime'u reconcilera. **To świadomy szew, nie przypadkowe sprzężenie.**

**Wykonalność.** Sub-agent 3 potwierdził, że back-importy to **nośne wywołania runtime'u**, nie typy: `flushSyncWorkOnAllRoots()` wołane w `ReactFiberConfigDOM.js:4891`, `requestFormResetOnFiber(formInst)` w `:4909` (wewnątrz dispatcherów DOM `:4888-4909`), `getCurrentRootHostContainer()` w `:4864`. DOM zasadnie potrzebuje harmonogramowania reconcilera — **cykl jest load-bearing**, odwracalny tylko przez relokację tych funkcji dispatchera poza config DOM (duże, semantyczne). Osłony dziś: żadna nie łapie cyklu; Flow/testy go tolerują; `dependency-cruiser no-circular` **by go oznaczył, ale NIE biegnie w CI**. Pierwszy krok-prerekwizyt (jeśli w ogóle): wpiąć `depcruise no-circular` w CI, by uczynić cykl **widocznym**, zanim ktokolwiek spróbuje go odwracać — nie refaktoruj na ślepo. **Rekomendacja: guard (widoczność cyklu), nie przebudowa.** [EVIDENCE]

### T7 — Płaski kontrakt, szeroki blast radius

**Obecny kształt (evidence).** Kontrakt to jeden płaski moduł `./ReactFiberConfig`, importowany przez **29 plików** reconcilera (25 value + 4 type-only). Brak zawężonych pod-interfejsów (`ReactFiberConfigMutation`/`...Hydration` nie istnieją); konsumenci wybierają symbole selektywnie, ale bez izolacji na poziomie modułu. Przykład bloku importu: `ReactFiberCommitHostEffects.js:18,32-62` (~30 symboli: typy + ops). [EVIDENCE]

**Werdykt intencjonalności: ŚWIADOME OGRANICZENIE.** Płaski kontrakt to udokumentowany projekt z #12792 (host config jako moduł). Szew podmieniany w buildzie *wymaga*, by każdy fork eksponował tę samą powierzchnię (Flow typecheck każdego renderera — jedyny strażnik, patrz T4). Szeroki-ale-płytki blast radius to zaakceptowany koszt decyzji o statycznej substytucji per-build (capability branches dead-code-eliminują się). Wzorzec odtworzony identycznie w ≥6 commitach dodających symbol kontraktu: #32819, #34486, #32842, #35564, #33130, #33129. [EVIDENCE multi-package commits + INFERENCE z #12792]

**Wykonalność.** Nowa abstrakcja: capability-scoped pod-interfejsy (grupy mutation / hydration / resources). Osłony dziś: tylko typy Flow (obecność per-symbol, nic o grupowaniu); brak testu konformności. Blast radius: **WYSOKI** — 25 value + 4 type-only importerów + wszystkie 7 forków; segmentacja zmienia call-sites wszędzie. **Nakładka na T2/T4:** strażnik parzystości/codegen usuwa *ból* (ciężar synchronizacji) BEZ zmiany kształtu kontraktu — dużo taniej. Pierwszy krok-prerekwizyt: zrób najpierw T4 (test parzystości) + T2 (codegen); segmentuj tylko, jeśli ból utrzyma się potem. Adekwatny kształt docelowy w bliskim terminie to **"generowany, sprawdzany parzystością płaski kontrakt"**, NIE segmentacja. [EVIDENCE/INFERENCE]

## Nie-kandydaci jako wejście do wykonalności

### T3 — Brak bezpośredniego unit-testu `ReactFiberConfigDOM.js`

**Stan (evidence).** Zero plików testowych pod `packages/react-dom-bindings/` (`find` → 0). Pokrycie incydentalne przez pełne renderery `react-dom` e2e. Żaden commit/PR nie wyrażał chęci takiego testu od narodzin pliku w #12792. [EVIDENCE absence; UNKNOWN czy ktokolwiek go chciał]

**Wykonalność osłony.** ŚREDNIO-TRUDNO. Trzeba zamockować **cykl z T6**: `react-reconciler/src/{ReactFiberHostContext,ReactFiberWorkLoop,ReactFiberHooks,ReactFiberConfigWithNoPersistence}` (importy `:34,:144,:145,:297`) plus środowisko DOM (jsdom). Cykl T6 jest sterownikiem kosztu — ta sama zależność, która czyni T6 trudnym. [EVIDENCE/INFERENCE]

### T4 — Brak testu parzystości/konformności forków

**Stan (evidence).** Nic nie asercjonuje, że 7 forków eksponuje tę samą powierzchnię; Flow to jedyny strażnik. Najbliższy istniejący guard zbudowany przez zespół to `5e4279134` (#35944, "[noop] Typecheck react-noop-renderer against host config") — *typecheck*, nie test runtime'owy. Brak pliku testu parzystości (`find` → 0). [EVIDENCE]

**Wykonalność osłony.** NISKO. Lista symboli jest **wyliczalna**: 166 linii `export const X = $$$config.X;` w `.custom.js` to kanoniczna powierzchnia. Test Jest może sparsować eksporty każdego forka i asercjonować równość zbiorów względem bazy `.custom`. Zamyka lukę, którą Flow pokrywa niejawnie; biegnie w istniejącym `yarn test` CI (`runtime_build_and_test.yml:236`). [EVIDENCE/INFERENCE]

## Stan CI (zweryfikowany, ważny dla wszystkich kandydatów)

- **`yarn flow`** — BIEGNIE (macierz per config, job `flow:` `runtime_build_and_test.yml:98`; komenda run to `node ./scripts/tasks/flow-ci` `:125` — raport: "`yarn flow` ... `:98`"). **Jedyny strażnik parzystości powierzchni forków.** [EVIDENCE]
- **`yarn test`** — BIEGNIE, sharded + warianty `--build` (`:236` i dalej). Swap Jest ćwiczony na każdym shardzie. [EVIDENCE]
- **lint** — BIEGNIE (eslint `shared_lint.yml:60`, prettier `:39`). [EVIDENCE]
- **`dependency-cruiser` / `no-circular`** — **NIE WPIĘTY W CI.** Tylko devDependency (`package.json:63`); brak skryptu `depcruise`; zero referencji w `.github/`. Reguła `no-circular` w `.dependency-cruiser.js:18` na `severity: warn`, nigdy wywoływana. **Każdy cykl, który by oznaczył (T6), jest dziś niewidoczny dla pipeline'u.** [EVIDENCE]

## Refactor opportunities (ranking — propozycja dla sesji planowania)

Ranking oceniany kosztem długu vs koszt zmiany, na dowodach. To propozycja, nie decyzja.

### #1 — T4: Test parzystości forków (osłona, która odblokowuje resztę)

- **Obecny → docelowy kształt:** brak jakiegokolwiek strażnika parzystości poza Flow → test Jest asercjonujący równość zbioru eksportów każdego z 7 forków względem kanonicznej bazy (166 symboli `.custom`).
- **Czemu #1:** najniższy koszt zmiany (niska wykonalność-trudności, biegnie w istniejącym `yarn test`), a jest **prerekwizytem osłonowym dla T2 i T7** — codegen i jakakolwiek segmentacja są bezpieczne dopiero, gdy istnieje runtime'owa siatka parzystości niezależna od Flow. Zamyka archetyp C4 (luka kompletności) od strony wykrywania.
- **Blast radius:** znikomy — nowy plik testu, zero zmian w `packages/` runtime.
- **Szkic ścieżki:** (1) wyprowadź kanoniczną listę z `.custom.js`; (2) napisz test parsujący eksporty 7 forków; (3) asercja równości zbiorów + jawny allowlist dla znanych różnic (np. opaque types noop).
- **Pierwszy krok-prerekwizyt:** wyliczyć kanoniczny zbiór 166 symboli z `forks/ReactFiberConfig.custom.js` i potwierdzić, że Flow widzi dokładnie ten sam zbiór.

### #2 — T2: Codegen dla `.custom`/`.noop` passthrough

- **Obecny → docelowy kształt:** 166 ręcznie utrzymywanych linii `$$$config` w dwóch plikach → generowane z kanonicznej listy symboli (cienkie `export *` forki bez zmian).
- **Czemu #2:** średni koszt zmiany (nowa abstrakcja-generator), ale **wprost redukuje ból T7** (ręczna synchronizacja przy każdym dodaniu symbolu) bez dotykania kształtu kontraktu. Domyka archetyp C4 od strony zapobiegania. Zależny od #1 (test parzystości = siatka bezpieczeństwa przy weryfikacji byte-identyczności).
- **Blast radius:** tylko generowane `.custom`/`.noop`; niski, jeśli output byte-identyczny.
- **Szkic ścieżki:** (1) generator emitujący `.custom` z listy; (2) diff względem zacommitowanego `.custom` → zero zmian; (3) dopiero potem `.noop` (plus jego `export *` i opaque types).
- **Pierwszy krok-prerekwizyt:** zdefiniować kanoniczne źródło symboli (wspólne z #1) i uczynić `.custom` generowanym, dowodząc zero zmiany zachowania diffem.

### #3 — T1: Wyekstrahować wspólny selektor forka

- **Obecny → docelowy kształt:** triplikowany `split('-')` longest-prefix w 3 plikach → jeden `scripts/shared/resolveHostConfigFork.js` importowany przez rollup/jest/flow (3 toolchainy zostają osobne — nośne; współdzielona staje się tylko logika).
- **Czemu #3:** najniższy blast radius ze wszystkich (zero runtime'u `packages/`), eliminuje klasę "works in test, breaks in build". Niżej niż T4/T2, bo dług jest mniej dotkliwy (drift nie zdarzył się — wszystkie trzy czytają jedną listę) i nie odblokowuje innych kandydatów.
- **Blast radius:** znikomy — `scripts/` only; `scripts/shared/__tests__/` już istnieje.
- **Szkic ścieżki:** (1) wyekstrahuj logikę do `scripts/shared/`; (2) test jednostkowy reguły; (3) podmień 3 call-sites.
- **Pierwszy krok-prerekwizyt:** test jednostkowy obecnej reguły w `scripts/shared/__tests__/` jako charakteryzacja, ZANIM ekstrakcja.

### Kandydaci rozważeni i odrzuceni (z ranking-u top)

- **T7 (segmentacja kontraktu) — ODRZUCONY jako bezpośredni kandydat, zdegradowany do "rób po T2/T4".** Najwyższy dług (blast radius ~7–12 plików / 5+ paczek), ale też najwyższy koszt zmiany (29 importerów + 7 forków). Kluczowe: jego *ból* znika dzięki #1+#2 (parzystość + codegen) bez zmiany kształtu kontraktu. Segmentacja na capability-scoped pod-interfejsy ma sens tylko, jeśli ból utrzyma się po wprowadzeniu osłon — czego dziś nie wiemy. Adekwatny kształt docelowy: "generowany, sprawdzany parzystością płaski kontrakt", nie segmentacja. [INFERENCE]

- **T6 (cykl DOM↔reconciler) — ODRZUCONY jako refaktor; rekomendacja: guard.** Świadome ograniczenie (analog C2), kotwiczone w #12792/#26592 + datowane back-importy wartości (#26450/#28500/#28808). Back-importy `flushSyncWork`/`requestFormReset`/`getCurrentRootHostContainer` to nośne wywołania runtime'u, których DOM faktycznie potrzebuje (call-sites `:4864,:4891,:4909`). Odwracalne tylko przez dużą, semantyczną relokację. Jedyny sensowny ruch to **guard widoczności**: wpiąć `dependency-cruiser no-circular` w CI (dziś niewpięty), by cykl przestał być niewidoczny — nie przebudowa. [EVIDENCE]

- **T5 (knot kontrolowanych komponentów) — ODRZUCONY i ZATRZYMANY.** Prawdziwa naprawa to przeprojektowanie *semantyki* harmonogramowania restore'u stanu kontrolowanego (sterowanego systemem zdarzeń, #8176), nie szew kodu. Per twarda granica zadania: to redesign pojęć, nie struktury → przedmiot osobnej, późniejszej analizy. Nie proponuję ścieżki strukturalnej. [EVIDENCE]

- **T3 (unit-test `ReactFiberConfigDOM.js`) — NIE-KANDYDAT, niższy priorytet niż T4.** Wartościowy, ale koszt wyższy (mockowanie cyklu T6 + jsdom) i pokrywa jeden plik, podczas gdy T4 pokrywa parzystość wszystkich 7 forków taniej. Naturalne "po T4". [INFERENCE]

## Co bym przesunął i dlaczego (audyt własnego rankingu)

- **Ranking odwraca kolejność "dotkliwości długu".** Najdotkliwszy strukturalnie jest T7 (blast radius), ale ląduje poza top-3, bo jego ból jest pochodną braku osłon (T4) i codegenu (T2), nie kształtu kontraktu. Naprawa przyczyny (T4→T2) jest tańsza i odwracalna; segmentacja (T7) jest droga i może okazać się niepotrzebna. To świadomy wybór "osłona przed przebudową".
- **T4 przed T2** mimo że T2 jest "właściwym" domknięciem C4: bez runtime'owej siatki parzystości codegen nie ma jak udowodnić, że nie zgubił symbolu (Flow łapie to dopiero w jednej komórce macierzy). Osłona musi poprzedzać generator.
- **T1 jako #3, nie #1**, mimo najniższego blast radius: drift faktycznie się nie zdarzył (wszystkie trzy czytają jedną listę), więc dług jest potencjalny, nie zrealizowany — niższa pilność niż realna luka kompletności T4/T2.

## Code References (kotwice rankingu)

- `scripts/shared/inlinedHostConfigs.js` + `scripts/shared/__tests__/` — szew T1.
- `scripts/rollup/forks.js:29-43`, `scripts/jest/setupHostConfigs.js:194-206`, `scripts/flow/createFlowConfigs.js:43-51` — triplikacja T1.
- `packages/react-reconciler/src/forks/ReactFiberConfig.custom.js:10-23` — kanoniczna lista 166 symboli (T2/T4).
- `packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js:34,144,145,297,4864,4891,4909` — load-bearing back-importy T6.
- `packages/react-dom-bindings/src/events/ReactDOMControlledComponent.js:35,43,59` + `client/ReactDOMComponent.js:3374` — semantyczny restore T5.
- `.github/workflows/runtime_build_and_test.yml:98,236` + `shared_lint.yml:39,60` — co biegnie w CI.
- `.dependency-cruiser.js:18` + `package.json:63` — `no-circular` istnieje, NIE wpięty w CI (T6 guard).

## Historical Context (priory)

- `context/changes/host-config-seam/research.md` — źródło dowodów T1–T7; nietknięte, traktowane jako prior.
- `context/map/repo-map.md` §4 — strefy ryzyka (`ReactFiberConfigDOM.js` = 20 cross-area deps; SCC=21 knot kontrolowanych komponentów).
- `context/map/artifact-2-structure.md` §1,§3 — SCC=21 w `client/`, testowalność `ReactFiberConfigDOM.js` (integracja, nie unit) — wsparcie dla T3/T5.

## Open Questions (do sesji planowania, nie do tej eksploracji)

- Czy zespół React zaakceptuje runtime'owy test parzystości (T4), skoro dotąd celowo szedł kierunkiem "zacieśniaj bramkę Flow" (#35944)? [UNKNOWN]
- Czy codegen `.custom`/`.noop` (T2) da output byte-identyczny, czy wymaga zmiany formatu (ryzyko regresji w `$$$config`)? [UNKNOWN — do udowodnienia diffem]
- Czy po T4+T2 ból T7 faktycznie zniknie, czy segmentacja kontraktu nadal będzie uzasadniona? [UNKNOWN — mierzalne dopiero po osłonach]

## Weryfikacja twierdzeń (ast-grep)

Zweryfikowano twierdzenia STRUKTURALNE, na których stoi ranking (liczby symboli/forków, "nadpisuje X, ale nie Y", liczność importerów kontraktu, pary lustrzanych forków). Commit weryfikacji: `f5baba3ad81829e8cc3c8389802ac223c7fb3837`. Metoda: ast-grep `--lang js` na źródłach Flow **po stripie** `flow-remove-types` (gramatyka js gubi AST na typach Flow — [[ast-grep-flow-react]]); każde zero/liczba potwierdzone klasycznym grepem.

> **Pułapka multiline potwierdzona empirycznie:** w `.custom.js`/`.noop.js` naiwny grep `^export const X = $$$config\.` daje **135**, ale ast-grep (po stripie) na wzorcu `export const $A = $B.$C;` daje **166** — różnica to 31 deklaracji, w których `$$$config.X` jest zawinięte do linii kontynuacji. Liczba **166** z raportu jest poprawna; grep zaniżał, bo `$$$config` jest pojedynczym tokenem RHS rozbitym przez Flow-wrapping. Multiline perl-match potwierdził 166 par LHS==RHS, zero rozjazdów nazw.

| Twierdzenie | Werdykt | Dowód (plik:linia) | Metoda (wzorzec/reguła) |
|---|---|---|---|
| T2/T4: `.custom.js` = 166 linii `export const X = $$$config.X` (LHS==RHS) | **potwierdzone** | `forks/ReactFiberConfig.custom.js` (166 par, 0 rozjazdów) | ast-grep `export const $A = $B.$C;` (stripped) = 166; grep naiwny = 135 (multiline); perl `/export const (\w+) =\s*\$\$\$config\.(\w+)/` = 166 |
| T2: `.noop.js` = te same 166 passthroughów + wiodące `export *` | **potwierdzone** | `forks/ReactFiberConfig.noop.js:25` (`export * from 'react-noop-renderer/...'`); 166 passthroughów | ast-grep (stripped) = 166; grep `^export \* from 'react-noop` → :25 |
| T2: 7 forków `ReactFiberConfig.{dom,art,fabric,markup,noop,test,custom}.js` | **potwierdzone** | `forks/ReactFiberConfig.*.js` (7 plików) | `ls \| wc -l` = 7 |
| T2: cienkie forki (dom/art/fabric/markup/test) to czyste `export *`, 0 ręcznych passthroughów | **potwierdzone** | każdy z 5 plików: `:10-13` `export *`, 0× `export const` | grep `^export \*` (obecne) + grep `^export const` = 0 w każdym |
| T1: ten sam selektor longest-prefix `split('-')` w 3 plikach | **potwierdzone** | `rollup/forks.js:30`, `jest/setupHostConfigs.js:194`, `flow/createFlowConfigs.js:43` | grep `split('-')` + inspekcja pętli `while(...){join('-');...pop()}` w każdym |
| T1: wszystkie 3 `require` jedynego źródła `inlinedHostConfigs.js` | **potwierdzone** | `rollup/forks.js:5`, `jest/setupHostConfigs.js:5`, `flow/createFlowConfigs.js:14` | grep `require.*inlinedHostConfigs` |
| T1: rollup selektor "`~:235`" | **doprecyzowane** | selektor `findNearestExistingForkFile` `rollup/forks.js:29-43`; `:235` to handler `ReactFiberConfig.js` wołający go; call-sites `:220,250,287,324,368,412` | grep def + grep użyć `findNearestExistingForkFile` |
| T6: DOM back-importuje `export *` z `ReactFiberConfigWithNoPersistence` + 3 wartości | **potwierdzone** | `ReactFiberConfigDOM.js:34` (`getCurrentRootHostContainer`), `:144` (`flushSyncWork`), `:145` (`requestFormReset`), `:297` (`export *`) | grep dokładnych identyfikatorów (string w `export *` → grep, nie ast-grep) |
| T6: back-importy to nośne wywołania runtime'u (call-sites) | **potwierdzone** | `ReactFiberConfigDOM.js:4864` (`getCurrentRootHostContainer()`), `:4891` (`flushSyncWorkOnAllRoots()`), `:4909` (`requestFormResetOnFiber`) | grep call-sites |
| T6: 9 stubów `ReactFiberConfigWithNo*.js`, DOM importuje tylko `WithNoPersistence` | **potwierdzone** | 9 plików `react-reconciler/src/ReactFiberConfigWithNo*.js`; DOM `:297` jedyny | `find -name 'ReactFiberConfigWithNo*.js'` = 9; grep w DOM = 1 |
| T7: kontrakt `./ReactFiberConfig` importowany przez 29 plików reconcilera (25 value + 4 type-only) | **potwierdzone** | 29 plików (lista w `/tmp/rfc_all.txt`); 25 przetrwało strip (value), 4 zniknęły (type-only): `ReactFiberActivityComponent.js`, `ReactFiberTreeReflection.js`, `ReactFiberViewTransitionComponent.js`, `ReactInternalTypes.js` | grep `from '...ReactFiberConfig'` = 29; po `flow-remove-types`: value=25, type-only=4 |
| T7: brak zawężonych pod-interfejsów `ReactFiberConfigMutation`/`...Hydration` | **potwierdzone** | 0 plików, 0 referencji | `find` = 0 + grep `ReactFiberConfig(Mutation\|Hydration)` = 0 (zero potwierdzone grepem) |
| T7: blok importu `ReactFiberCommitHostEffects.js:18,32-62` (~30 symboli) | **potwierdzone** | type-block `:10-18` (7 typów), value-block `:32-62` (30 symboli) | grep `from './ReactFiberConfig'` → bloki kończące się :18 i :62; ręczne zliczenie value-bloku = 30 |
| T5: SCC files `ReactDOMInput/Select/Textarea.js` | **potwierdzone** | 3 pliki w `react-dom-bindings/src/client/` | `ls` |
| T5: ścieżka restore'u `ReactDOMComponent.js:3374` → `events/ReactDOMControlledComponent.js` (`enqueueStateRestore:43`, `restoreStateIfNeeded:59`) | **potwierdzone** | `ReactDOMComponent.js:3374`; `ReactDOMControlledComponent.js:43,59` | grep `^export function ...` exact |
| T5: `ReactDOMComponent.js:3374` "rejestruje restoreControlledState jako callback"; gate `:35` | **doprecyzowane** | `restoreControlledState` importowane statycznie w `ReactDOMControlledComponent.js:15`, wołane `:35`; brak `setRestoreImplementation`; gate to `needsStateRestore:55` (`:35` to call-site) | grep `setRestoreImplementation` = 0; grep import `:15` + `needsStateRestore:55` |
| T3/T5: zero plików testowych pod `react-dom-bindings/` | **potwierdzone** | 0 plików | `find -path '*__tests__*' -name '*.js'` = 0 (zero potwierdzone find) |
| CI: `no-circular` w `.dependency-cruiser.js:18` na `severity: warn` | **potwierdzone** | `.dependency-cruiser.js:18` (name), `:21` (`severity: 'warn'`) | grep + inspekcja bloku |
| CI: `dependency-cruiser` NIE wpięty (devDep only, brak skryptu `depcruise`, 0 ref w `.github/`) | **potwierdzone** | `package.json:63` (devDep); 0 skryptów `depcruise`; 0 ref w `.github/` | grep `"depcruise"` = 0; grep w `.github/` = 0 (zero potwierdzone grepem) |
| CI: Flow strażnik — "`yarn flow` `:98`" | **doprecyzowane** | job `flow:` `runtime_build_and_test.yml:98`; komenda run to `node ./scripts/tasks/flow-ci` `:125`, nie literalne `yarn flow` | grep `^  flow:` + inspekcja kroku run |

**Wynik dla rankingu:** żadne twierdzenie strukturalne nie zostało **obalone**. Trzy doprecyzowania (T1 rollup `:235`, T5 callback/gate, CI `yarn flow`/`flow-ci`) to korekty etykiet linii/nazewnictwa, nie liczb nośnych dla rankingu — kluczowe liczby (166 symboli, 7 forków, 29 importerów = 25+4, 9 stubów, triplikacja×3) potwierdzone w pełni. **Żaden wynik nie podważa pozycji kandydata w rankingu** (do decyzji na etapie planowania, gdyby planista uznał inaczej). Sekcje "Refactor opportunities" i werdykty intencjonalności pozostają nietknięte zgodnie z zakresem zadania.

## Werdykt końcowy

Wszystkie pięć kandydatów strukturalnych to świadome ograniczenia (każdy z dowodem-commitem). Refaktor warto skierować nie na najdotkliwszy dług (T7) ani na najgłębszy szew (T6), lecz na **najtańsze, odwracalne osłony, które redukują ból reszty: T4 → T2 → T1.** T5 i T6 to "guard, nie przebudowa"; T5 dodatkowo wykracza poza strukturę kodu i zostaje zatrzymany. Decyzja zapada w osobnej sesji planowania po lekturze tego raportu.
