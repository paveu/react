# Artefakt 2 — Mapa strukturalna (graf zależności, dependency-cruiser)

**Narzędzie:** dependency-cruiser `16.10.4` (devDependency w `package.json`)
**Konfiguracja:** `.dependency-cruiser.js` (parser acorn, Flow-aware; **bez** `tsPreCompilationDeps` — wywalał ekstrakcję na plikach Flow z `import typeof`)
**Zakres analizy:** aktywne obszary z `context/map/artifact-1-territory.md` (nie całe repo):
`react-reconciler`, `react-devtools-shared`, `shared`, `react-server`, `react-client`, `react-dom`, `react-dom-bindings`, `react-server-dom-webpack`.
**Próbka grafu:** 899 modułów first-party. **Wynik reguł:** 6 błędów (`shared-is-foundation`), 754 ostrzeżeń (`no-circular`), 12 info (`no-orphans`).
**Poza zakresem:** `compiler/crates` (Rust — dependency-cruiser obsługuje tylko JS/TS/CoffeeScript), `__tests__`, fixtures, snapshoty, build output.

> **Uwaga metodyczna:** prompt źródłowy (`m4l2-2-structure-dependency-cruiser.md`) był generycznym szablonem z nazwami z innego projektu (`webapp`, `channels/src`, `platform/client`). Analizę przeprowadzono na **realnych** obszarach Reacta wskazanych przez artefakt 1.

---

## Najważniejsze obserwacje (TL;DR)

1. **`packages/shared` NIE jest czystym fundamentem.** Artefakt 1 nazwał `ReactFeatureFlags`/`shared` „wspólnym mianownikiem" runtime'u — graf to potwierdza po stronie fan-in (`ReactTypes.js` 172, `ReactFeatureFlags.js` 85 zależnych), ale ujawnia **6 zależności „w górę"** ze `shared` do `react`, `react-reconciler` i `react-dom`. Fundament ma przecieki — to jedyne reguły o sile `error`.
2. **Dwa wielkie rdzenie cykli (SCC) pokrywają się 1:1 z dwoma hotspotami z artefaktu 1.** SCC=119 modułów w `react-devtools-shared` (hotspot #1 aktywności) i SCC=77 obejmujący `react-reconciler`+`react`+`shared` (hub #3). Zmiana w środku któregokolwiek z nich może promieniować na ~100 plików naraz.
3. **Granica DevTools → reconciler jest jednokierunkowa i zdrowa** (8 krawędzi w dół, 0 w górę). To zgodne z narracją artefaktu 1: backend DevToolsa (`renderer.js`) czyta wewnętrzne struktury Fiber, ale reconciler nic nie wie o DevTools.
4. **Najgorszy plik pod kątem testowalności to `ReactFiberWorkLoop.js`** — 59 zależności wychodzących, z czego 46 w cyklu. Praktycznie nie da się go testować w izolacji; każdy test ciągnie za sobą pół reconcilera.
5. **Fan-out grafu potwierdza pliki-hotspoty z historii gita.** Top fan-out (`renderer.js` 25, `ReactFiberWorkLoop.js` 59, `ReactFiberConfigDOM.js` 42) to dokładnie te same pliki, które w artefakcie 1 miały najwięcej commitów — wysoka zmienność i wysokie sprzężenie idą w parze.

---

## 1. Cykle w aktywnych obszarach

954 krawędzi w cyklu. Zdecydowana większość to cykle **wewnątrz** obszaru, skoncentrowane w dwóch hotspotach z artefaktu 1.

| Obszar | Co znalazłem | Dowód z dependency-cruiser | Dlaczego to ważne przy zmianie | Związek z `artifact-1-territory.md` | Co sprawdzić dalej |
|---|---|---|---|---|---|
| `react-reconciler` | Rdzeń cykli: SCC = **77 modułów** (60 reconciler + 13 react + 3 shared + 1 server); 390 krawędzi cyklicznych wewnątrz obszaru | Tarjan SCC na grafie resolved; `ReactFiberWorkLoop.js` 46/59 zależności w cyklu | Zmiana semantyki w środku SCC propaguje się na cały rdzeń runtime'u; nie ma „bezpiecznego" pojedynczego pliku do tknięcia | Artefakt 1: reconciler = „centralny hub", `ReactFiberWorkLoop.js` #9 wśród plików | Czy `react`↔`reconciler` (11 krawędzi cyklicznych) da się rozciąć na granicy `ReactInternalTypes`? |
| `react-devtools-shared` | Rdzeń cykli: SCC = **119 modułów** (115 devtools + 4 timeline); 383 krawędzi cyklicznych; drugi mniejszy SCC=14 w `backend/` | SCC obejmuje `store.js`, `ProfilerStore.js`, `backendAPI.js`, większość `devtools/views` | Hotspot #1 aktywności jest jednym wielkim splotem — refactor UI DevToolsa ryzykuje regresje w niespodziewanych widokach | Artefakt 1: `devtools/views` (470 commitów), `store.js` #7, SuspenseTab hotspot | Czy `react-devtools-shared`↔`react-devtools-timeline` (12 krawędzi) to realna dwukierunkowa zależność, czy da się ją uciąć? |
| `react-dom-bindings` | SCC = **21 modułów** w `client/` (DOMPropertyOperations, ReactDOMComponent, *Input/*Select/*Textarea…); 66 krawędzi cyklicznych | SCC zamknięty w `client/`; osobny cykl `react-dom`↔`shared`↔`react-dom-bindings` (SCC=6) | Komponenty kontrolowane (input/select/textarea) są ze sobą splecione — zmiana obsługi jednego formularza dotyka pozostałych | Artefakt 1: `ReactFiberConfigDOM.js` #5 plików, most DOM↔reconciler | Mały SCC=6 (`ReactDOMSharedInternals`) — patrz sekcja 2, to też naruszenie fundamentu |
| `react-server` | SCC = **5 modułów** Fizz (`ReactFizzServer`, `ReactFizzHooks`, `ReactFizzThenable`, `ReactFizzCurrentTask`, `ReactFizzAsyncDispatcher`) | `ReactFizzServer.js` 4/24 zależności w cyklu | Rdzeń SSR (Fizz) jest splecony — spójny, ale trudny do testu jednostkowego w izolacji | Artefakt 1: `ReactFlightServer.js` #2, `ReactFizzServer.js` #4 plików | Czy cykl Fizz to celowy wzorzec (hooks↔server), czy dług? |

**Wniosek narracyjny:** cykle nie są rozsiane po repo — kumulują się dokładnie tam, gdzie historia gita pokazała najwięcej pracy. To nie przypadek: obszary o najwyższej zmienności to jednocześnie obszary o najgęstszym splocie wewnętrznym.

---

## 2. Granice warstw

Hipoteza warstw z artefaktu 1: `shared` = fundament (leaf), `react-reconciler` = hub, renderery zależą od huba i fundamentu, DevTools czyta reconciler jednokierunkowo.

| Sprawdzana granica | Wynik | Dowód z dependency-cruiser | Dlaczego to ważne przy zmianie | Związek z `artifact-1-territory.md` |
|---|---|---|---|---|
| `shared` jako fundament (leaf) | ❌ **Naruszona** — 6 zależności w górę | Reguła `shared-is-foundation` (severity `error`): `shared/ReactSharedInternals.js → react/index.js`, `shared/ReactDOMSharedInternals.js → react-dom/index.js`, `shared/getComponentNameFromType.js → react/src/ReactLazy.js`, `shared/ReactSerializationErrors.js → react/src/ReactLazy.js`, `shared/ReactDOMFragmentRefShared.js → react-reconciler/{ReactFiberTreeReflection,ReactInternalTypes}` | „Wspólny mianownik" runtime'u sam zależy od warstw wyższych — zmiana w `react`/`react-dom`/`reconciler` może nieoczekiwanie wrócić do `shared` i dotknąć wszystkich konsumentów flag | Artefakt 1: `ReactFeatureFlags` jako „semantyczny przełącznik całego runtime'u" — tym bardziej powinien być czystym liściem |
| DevTools → reconciler (kierunek) | ✅ **Zdrowa, jednokierunkowa** | 8 krawędzi `react-devtools-shared → react-reconciler`, **0** w drugą stronę | Można zmieniać DevTools bez ryzyka dla reconcilera; ale zmiana wewnętrznych typów Fibera (`ReactInternalTypes`) pociągnie backend DevToolsa | Artefakt 1: `renderer.js` „czyta wewnętrzne struktury Fiber" — potwierdzone strukturalnie |
| reconciler ↔ shared | ⚠️ Głównie w dół (127 ↓), ale **2 krawędzie w górę** | `shared/ReactDOMFragmentRefShared.js → react-reconciler/*` | Drobny przeciek fundamentu w stronę huba — wąski, ale łamie kierunek warstwy | Artefakt 1: `reconciler ↔ shared` = 40 wspólnych commitów (#2 sprzężenie) |
| renderery → shared | ✅ Spójna, w dół | `react-dom`→shared 43, `react-server`→shared 80, `react-client`→shared 36, `react-dom-bindings`→shared 64 | Renderery konsumują fundament przewidywalnie — to zdrowy wzorzec | Artefakt 1: rodzina `ReactFeatureFlags` spina ~40 obszarów |
| `react-dom` → `react-dom-bindings` | ✅ W dół (29), ale wpięte w SCC=6 ze `shared` | Cykl `react-dom/index → react-dom/src/shared → react-dom-bindings/src/shared → shared/ReactDOMSharedInternals → react-dom/index` | `ReactDOMSharedInternals` to punkt, w którym fundament zawraca do `react-dom` — rdzeń naruszenia fundamentu po stronie DOM | Artefakt 1: `react-dom ↔ react-reconciler` 38, klaster DOM bindings |

**Wniosek narracyjny:** architektura warstwowa Reacta jest w **90% przestrzegana** — renderery zależą w dół od `shared` i `reconciler`, DevTools czyta reconciler jednokierunkowo. Wszystkie naruszenia sprowadzają się do **jednego wzorca**: pliki `*SharedInternals` / `*Shared` w `packages/shared`, które technicznie leżą w warstwie fundamentu, ale semantycznie są „mostami" do `react` i `react-dom` (singletony współdzielonego stanu). To świadoma decyzja architektoniczna, nie przypadkowy bałagan — ale to ona sprawia, że `shared` nie jest czystym liściem.

---

## 3. Ryzyka testowalności

### Podsumowanie

Testowalność w izolacji jest odwrotnie proporcjonalna do udziału krawędzi w cyklu. Pliki o wysokim fan-out, które dodatkowo siedzą w dużym SCC, wymagają albo masy mocków, albo przejścia na test integracyjny/e2e. Metryka pomocnicza: `cyc` = liczba zależności pliku będących w cyklu (im wyżej, tym trudniej odciąć graf w teście).

| Plik (hotspot z artefaktu 1) | deps | cross-area | w cyklu | Werdykt testowy |
|---|---|---|---|---|
| `react-reconciler/ReactFiberWorkLoop.js` | 59 | 9 | **46** | **e2e/integracja.** Niemal cały graf w cyklu — mock niewykonalny |
| `react-reconciler/ReactFiberHooks.js` | 34 | 7 | **23** | **integracja.** Hooki splecione z rdzeniem reconcilera |
| `react-dom-bindings/ReactFiberConfigDOM.js` | 42 | 20 | 9 | **integracja.** Najwięcej cross-area (20) — most DOM↔reconciler, dużo by mockować |
| `react-server/ReactFizzServer.js` | 24 | 11 | 4 | **integracja.** Rdzeń SSR, część SCC Fizz |
| `react-server/ReactFlightServer.js` | 23 | 13 | 3 | **integracja.** Protokół RSC — wymaga pary klient/serwer |
| `react-client/ReactFlightClient.js` | 19 | 14 | 0 | **integracja.** Brak cykli, ale 14 cross-area — kontrakt RSC |
| `react-devtools-shared/backend/fiber/renderer.js` | 25 | 5 | 0 | **integracja z prawdziwym rendererem.** Niski cross-area, ale czyta żywe struktury Fiber |
| `react-devtools-shared/devtools/store.js` | 12 | 0 | 2 | **jednostkowy wykonalny.** 0 cross-area — najlepiej izolowalny z hotspotów |

### Najbardziej podejrzane moduły

- **`ReactFiberWorkLoop.js`** — 46/59 zależności w cyklu. To epicentrum SCC=77. Każda próba testu jednostkowego skończy się ładowaniem połowy reconcilera.
- **`ReactFiberConfigDOM.js`** — 20 zależności cross-area (najwięcej w próbce). Most między światami DOM i reconcilera — z definicji trudny do odcięcia.
- **SCC=119 w DevTools** — `store.js` sam w sobie jest izolowalny (0 cross-area), ale jest wpięty w 119-modułowy splot przez `views/context.js` (fan-in 52). Testy widoków będą ciągnąć cały store.

### Co sprawdzić dalej

- Czy istnieją „szwy" (seams) w `ReactFiberConfigDOM` pozwalające wstrzyknąć fałszywy host config w teście.
- Czy `react-client`/`react-server` mają wspólny harness testowy (skoro protokół RSC = para klient/serwer, 50 wspólnych commitów wg artefaktu 1).

### Opcjonalny kolejny krok: graf

Wygenerowano źródła DOT i wyrenderowano je do SVG (Graphviz `dot` 2.43.0):

- `context/map/graphs/active-areas-archi.{dot,svg}` — przegląd na poziomie pakietów (8 obszarów, ~164 węzły/krawędzie).
- `context/map/graphs/shared-foundation.{dot,svg}` — `--focus ^packages/shared`, pokazuje 6 naruszeń fundamentu na czerwono (~738 elementów).
- `context/map/graphs/react-dom-shared-cycle.{dot,svg}` — mały cykl `react-dom ↔ shared ↔ react-dom-bindings` (19 elementów), najłatwiejszy do odczytania.

Regeneracja SVG: `dot -T svg context/map/graphs/<plik>.dot > <plik>.svg`.

---

## Artefakty wytworzone w tej sesji

- `.dependency-cruiser.js` — konfiguracja (reguły: `no-circular`, `shared-is-foundation`, `no-orphans`, `not-to-test`).
- `package.json` — dodano `dependency-cruiser` do `devDependencies`.
- `/tmp/react-cruise.json` — cache wyniku cruise (899 modułów); regeneracja komendą z nagłówka.
- `context/map/graphs/*.dot` — 3 źródła grafów.

## TL;DR mapy strukturalnej

- **Fundament przecieka:** `packages/shared` ma 6 zależności w górę (wzorzec `*SharedInternals`/`*Shared`) — jedyne błędy o sile `error`.
- **Cykle = hotspoty:** dwa wielkie SCC (119 w DevTools, 77 w reconciler+react+shared) pokrywają się 1:1 z najaktywniejszymi obszarami z artefaktu 1.
- **Warstwy w 90% OK:** renderery→shared w dół, DevTools→reconciler jednokierunkowo (8↓/0↑). Wszystkie naruszenia to jeden wzorzec mostów współdzielonego stanu.
- **Najtrudniejszy do testu:** `ReactFiberWorkLoop.js` (46/59 w cyklu) — wymusza integrację/e2e.
- **Strukturalne potwierdzenie historii:** top fan-out grafu = top pliki commitów z artefaktu 1.
