---
title: Anti-Corruption Layer — przeciekająca zależność acorn-loose w warstwie RSC/Flight (bundler loadery)
created: 2026-06-22
type: refactor-plan
---

# Anti-Corruption Layer — `acorn-loose` w loaderach Flight

> **Produkt:** PLAN refaktoru, nie kod produkcyjny.
> **Konwencja dowodów:** **[E]** zweryfikowane `plik:linia` (sprawdzone w tej sesji) · **[I]** interpretacja · **[U]** biała plama.
> **Łańcuch:** `01-domain-distillation.md` (Flight = rdzeń, A3) → `02` (host-config N4) → **`03` (ACL: zależność zewnętrzna przeciekająca przez granice)**.

## KROK 0 — Kontekst (odkrycie)

**Stack/warstwy.** React = monorepo JS/Flow; brak warstwy API/serwis/persystencja. „Domena" = model wykonania UI. Subdomena RSC/Flight (`01` KROK 2 → **CORE**) realizuje „Write Anywhere" na granicy serwer↔klient. W jej obrębie istnieje rodzina pakietów integracji z bundlerami: `react-server-dom-{webpack,turbopack,esm,unbundled,parcel,fb}` [E `ls packages/react-server-dom-*/`].

**Deklaracja wymienialności [E].** Sama wielość forków bundlerowych jest deklaracją intencji: integracja z bundlerem ma być **wymienialna** (webpack ⊕ turbopack ⊕ esm ⊕ parcel…). Każdy pakiet to adapter pod jeden ekosystem builda. To kontekst, w którym „przeciek tej samej biblioteki przez wszystkie adaptery" jest szczególnie groźny — niweczy obietnicę wymienialności.

**Brak dokumentów wymagań [U].** Potwierdzone w `01` KROK 0: brak `prd.md`/`tech-stack.md`/wizji. Materiał: `README.md`, `context/changes/rsc-flight-*/` (badanie szwów Flight), `01`/`02`.

**Zależności runtime (manifesty, nie devDeps) [E].** Przegląd `packages/*/package.json` ujawnia, że pakiety Flight-bundler deklarują zewnętrzne parsery:
- `react-server-dom-esm` → `acorn-loose`, `webpack-sources` [E]
- `react-server-dom-unbundled` → `acorn-loose`, `webpack-sources` [E]
- `react-server-dom-webpack` → `acorn-loose`, `neo-async`, `webpack-sources` [E]
- `react-server-dom-turbopack` → `acorn-loose`, `neo-async` [E]
- `react-server-dom-parcel` → **brak zależności** [E `deps={}`]

---

## KROK 1 — Identyfikacja przeciekających zależności

Kandydaci (zewnętrzne, przecinające granice plików/pakietów w warstwie Flight):

| Zależność | Gdzie | Sygnał przecieku |
|---|---|---|
| **`acorn-loose`** | 6 plików w 3 pakietach | ten sam parser AST importowany w wielu adapterach; **kształt AST (`node.type`, `node.declaration`, `loc`…) rozlany po ~800-liniowych blokach logiki**, zduplikowanych niemal bajt-w-bajt |
| `webpack-sources/lib/helpers/*` | 3 loadery | głęboki import *wnętrza* paczki (`/lib/helpers/readMappings.js`) — ścisłe sprzężenie z prywatną strukturą biblioteki |
| `neo-async` | 1 plik (`WebpackPlugin`) | lokalny util async — 1 miejsce, nie przecieka przez granice |

**Pełny inwentarz `acorn-loose` (plik:linia) [E grep]:**

| # | Plik | Sposób | Linia |
|---|---|---|---|
| 1 | `react-server-dom-esm/src/ReactFlightESMNodeLoader.js` | `import * as acorn` | `:10` |
| 2 | `react-server-dom-unbundled/src/ReactFlightUnbundledNodeLoader.js` | `import * as acorn` | `:10` |
| 3 | `react-server-dom-unbundled/src/ReactFlightUnbundledNodeRegister.js` | `require('acorn-loose')` | `:10` |
| 4 | `react-server-dom-webpack/src/ReactFlightWebpackNodeLoader.js` | `import * as acorn` | `:10` |
| 5 | `react-server-dom-webpack/src/ReactFlightWebpackNodeRegister.js` | `require('acorn-loose')` | `:10` |
| 6 | `react-server-dom-webpack/src/ReactFlightWebpackPlugin.js` | `import * as acorn` | `:15` |

**Wywołania `acorn.parse` (jedyna używana powierzchnia API) [E grep]:**
- `ESMNodeLoader.js:534, :669` · `UnbundledNodeLoader.js:534, :669` · `WebpackNodeLoader.js:534, :669`
- `UnbundledNodeRegister.js:41` · `WebpackNodeRegister.js:41` · `WebpackPlugin.js:410`

**Kluczowa obserwacja [E].** `turbopack` **deklaruje** `acorn-loose` w manifeście, ale `grep` po `acorn` w jego `src/` = **0 trafień** [E]. To martwa deklaracja — sygnał, że zależność jest kopiowana z manifestu do manifestu rytualnie, bez kontroli, kto jej realnie używa.

---

## KROK 2 — Klasyfikacja i wybór #1

| Oś | `acorn-loose` | `webpack-sources/*` | `neo-async` |
|---|---|---|---|
| (a) warstw/plików dotkniętych | **6 plików / 3 pakiety** | 3 pliki / 2 pakiety | 1 plik |
| (b) koszt/ryzyko wymiany dziś | **wysoki** — kształt AST rozlany po 3×800 l. duplikatu; wymiana = 6 edycji w lockstepie | średni (deep-import, 6 l.) | niski |
| (c) deklaracja wymienialności vs kod | **mocny rozjazd** — pakiety mają być wymienialnymi adapterami bundlera, a dzielą skopiowany rdzeń parsera | słaby | brak |

**Wybór #1: `acorn-loose`.** Uzasadnienie [I]: to najgorszy przeciek na wszystkich trzech osiach. Najszerszy (6 plików / 3 pakiety), najdroższy w wymianie (kształt zwracanego AST — `node.type`, `node.declaration.type`, `node.specifiers`, `loc.start.line` — jest *wczytany* w ~800-liniowy algorytm transformacji, zduplikowany 3×), i najsilniej kłóci się z deklarowaną intencją (adaptery bundlera mają być wymienne, a w praktyce współdzielą skopiowany rdzeń zależny od konkretnego parsera). `webpack-sources` i `neo-async` to drobne, lokalne sprzężenia — ujmę je jako poboczne w tym samym ACL, ale rdzeniem refaktoru jest `acorn-loose`.

---

## KROK 3 — Diagnoza

### 3.1 Duplikacja — trzy loadery niemal bajt-identyczne

`*NodeLoader.js` w esm / unbundled / webpack mają **dokładnie po 804 linie** [E `wc -l`]. `diff` ujawnia:

- **esm vs unbundled** — różnią się **tylko 2 liniami** (nazwa pakietu w stringu generowanego importu): `:411` i `:588` (`react-server-dom-esm/server` vs `…webpack/server`) [E `diff`].
- **webpack vs unbundled** — **identyczne** (`diff` = pusty) [E].

Czyli ~800-liniowy algorytm — `transformServerModule`, `transformClientModule`, `parseExportNamesInto`, mapowanie source-map — jest **potrojony**. Cała ta logika operuje na surowym AST z `acorn.parse`:

| Cytat (z `WebpackNodeLoader.js`, identyczny w pozostałych) | Co czyta z biblioteki |
|---|---|
| `:534` `acorn.parse(source, {ecmaVersion:'2024', sourceType:'module'})` | wywołanie parsera (export-scan) |
| `:669` `acorn.parse(source, {…, locations:true, onComment(…)})` | wywołanie parsera (główne, z source-map) |
| `:200` `switch (node.type) { case 'ExportAllDeclaration' … }` | kształt węzła AST |
| `:205,214,231,241,255` `node.declaration.type`, `node.specifiers`, `…id.name` | wewnętrzna struktura węzłów acorn |
| `:291` `exportedEntries[…].loc.start.line/column` | kontrakt `loc` acorn |

`*NodeRegister.js` (webpack, unbundled) — **po 109 linii**, różnią się **1 linią** (`require('react-server-dom-webpack/server')` vs `…unbundled/server`, `:17`) [E `diff`]. Każdy wywołuje `acorn.parse(content, {ecmaVersion:'2024', sourceType:'source'})` (`:41`) [E].

`WebpackPlugin.js:410` — trzeci wariant wywołania: `acorn.parse(source, {ecmaVersion:'2024', sourceType:'module'})` wewnątrz `hasUseClientDirective` [E].

**Wniosek [I]:** istnieją **trzy warianty opcji `acorn.parse`** (`sourceType: 'module'` / `'source'`, z/bez `locations`+`onComment`) rozsiane po 9 wywołaniach, a każdy z nich plus cała obróbka AST jest skopiowana między pakietami. Zmiana wersji acorn lub przejście na inny parser (np. ujednolicenie z `hermes-parser`, którego repo już używa w `hostConfigForkSurface.js` — `01`/`02`) wymaga **synchronicznej edycji 6 plików**, z których 3 to 800-liniowe klony.

### 3.2 Przeciek przez granice — biblioteka w wielu adapterach

- **Brak izolacji w adapterze.** Intencja: każdy `react-server-dom-*` to wymienny adapter bundlera. Rzeczywistość: webpack, unbundled i esm dzielą *ten sam* rdzeń parsujący — różnica między „adapterami" to 1–2 linie nazwy pakietu. Adapter, który miał kapsułkować różnice ekosystemu, w istocie kopiuje rdzeń.
- **Martwa deklaracja zależności.** `turbopack` deklaruje `acorn-loose` w `package.json`, lecz nie importuje go w `src/` (0 trafień) [E]. Manifest „wie" o zależności, której kod nie używa — typowy objaw braku jednego właściciela wiedzy o tej zależności.
- **Deep-import wnętrza paczki (poboczne).** Trzy loadery importują `webpack-sources/lib/helpers/readMappings.js` i `…/createMappingsSerializer.js` (`:12-13`) [E] — sprzężenie z *prywatną* strukturą katalogów biblioteki, nie z jej publicznym API. Wymiana/upgrade `webpack-sources` może to złamać bez ostrzeżenia typów.
- **Niezmiennik domenowy rozlany razem z parserem.** Reguła „plik nie może mieć równocześnie `use client` i `use server`" jest **skopiowana w 5 miejscach** (`ESMNodeLoader.js:721`, `UnbundledNodeLoader.js:721`, `WebpackNodeLoader.js:721`, `UnbundledNodeRegister.js:71`, `WebpackNodeRegister.js:71`) [E grep]. Razem z parserem przecieka też **wiedza domenowa o dyrektywach** — to ona, nie acorn, jest tu sednem.

### 3.3 Co jest groźne

- **Klient ↔ serwer.** Loadery działają server-side (Node loader / `Module._compile` hook), więc nie ma tu ryzyka „biblioteka serwerowa w bundlu klienta" w sensie A1. Groźba jest inna: **dryf semantyczny między adapterami** — trzy kopie mogą rozejść się przy patchu (jak turbopack zdryfował w testach Flight, `01` D6), dając różne zachowanie skanowania `use client`/`use server` per bundler. To cichy bug serializacji granicy RSC.
- **Brak typowanej granicy.** `acorn.parse(...)` zwraca `any`-kształtny AST; cała obróbka (`node: any` — np. `addLocalExportedNames(…, node: any)` `:144`) jest nietypowana [E]. Flow nie chroni żadnego z tych 8 wywołań przed zmianą kształtu AST.

**Wniosek diagnozy [I]:** nie istnieje żadne miejsce, które „wie o acorn". Wiedza o (a) opcjach parsowania, (b) kształcie AST, (c) regule dyrektyw jest *rozmazana i potrojona* po 6 plikach w 3 pakietach, plus martwa w 4. tym (turbopack). To wzorzec brata bliźniaka z `01` KROK 4: niezmiennik/kontrakt żyje w wielu kopiach, nie w jednym strażniku.

---

## KROK 4 — Projekt ACL

> **Uwaga o naturze domeny.** To biblioteka, nie aplikacja CRUD. „Value object" = moduł, który jest JEDYNYM miejscem wiedzy o kształcie zależności `acorn-loose`; „port" = wąski interfejs domenowy (skan dyrektyw + odczyt eksportów), którego reszta loaderów używa, nie wiedząc, że pod spodem jest acorn. Granica „persystencji" nie istnieje — granicą jest **wire RSC** (transformowane źródło modułu), a „typem biblioteki" jest **AST acorn**.

### 4.1 Value object / encja domenowa — `ModuleDirectives` + `ModuleExports`

Dziś loader operuje na surowym `program` z acorn. ACL wprowadza **domenowe VO**, które są jedynym wynikiem parsowania widzianym przez resztę kodu:

```js
// packages/react-server-dom-webpack/src/shared/ (lub wspólny pakiet, patrz 4.4)

// VO #1 — werdykt dyrektyw modułu. Zamiast surowego program.body.
type ModuleDirectives = {|
  useClient: boolean,
  useServer: boolean,
|};

// VO #2 — eksport modułu, w pełni domenowy (bez node.loc/node.type acorn).
type ExportedEntry = {|
  localName: string,
  exportedName: string,
  type: null | 'function',
  loc: {start: {line: number, column: number}, end: {...}},
|};
```

Operacja domenowa (dziś rozlana po `:200-271` switchach) zamyka się w VO:

```js
// JEDYNE miejsce, które zna kształt AST acorn (node.type/declaration/specifiers/loc).
function readExportedEntries(program: AcornProgram): Array<ExportedEntry> { … }
function readDirectives(program: AcornProgram): ModuleDirectives {
  // przenosi tu skopiowaną 5× regułę „use client" ⊕ "use server"
  if (d.useClient && d.useServer) throw new ConflictingDirectivesError(url);
  return d;
}
```

Niezmiennik „nie oba naraz" przenosi się z 5 kopii do **jednej** metody VO i rzuca **nazwany** błąd domenowy `ConflictingDirectivesError` (fail-fast), zamiast 5× inline `throw new Error('Cannot have both…')`.

### 4.2 Wąski port (interfejs domenowy)

Reszta loadera zna **tylko** port — nie wie, że istnieje acorn:

```js
// Port: domenowy parser modułu Flight. Brak typów acorn w sygnaturze.
interface FlightModuleParser {
  // Tani pre-skan (dziś: source.indexOf('use client') === -1 …) + parsowanie.
  parseDirectives(source: string): ModuleDirectives;
  parseExports(source: string, opts: {locations: boolean}): {
    exports: Array<ExportedEntry>,
    sourceMappingURL: null | {url: string, start: number, end: number, lines: number},
  };
}
```

Trzy warianty opcji acorn z 3.1 zwijają się do **dwóch metod portu** (`parseDirectives` bez `locations`, `parseExports` z `locations`+`onComment`) — kontrakt domenowy, nie biblioteczny.

### 4.3 Adapter — jedyne miejsce z `import acorn`

```js
// flightModuleParser.acorn.js — JEDYNY plik z 'acorn-loose' po refaktorze.
import * as acorn from 'acorn-loose';

export const acornFlightModuleParser: FlightModuleParser = {
  parseDirectives(source) {
    if (source.indexOf('use client') === -1 && source.indexOf('use server') === -1)
      return {useClient: false, useServer: false};
    const program = acorn.parse(source, {ecmaVersion: '2024', sourceType: 'module'});
    return readDirectives(program); // VO #1
  },
  parseExports(source, {locations}) {
    const program = acorn.parse(source, {ecmaVersion: '2024', sourceType: 'module', locations, onComment: …});
    return {exports: readExportedEntries(program), sourceMappingURL: …}; // VO #2
  },
};
```

Wymiana parsera (np. na `hermes-parser`, którego repo już używa) = **napisanie drugiego adaptera implementującego ten sam port** — zero zmian w loaderach.

### 4.4 Gdzie to żyje — deduplikacja 3 loaderów przy okazji

Dziś `src/shared/ReactFlightImportMetadata.js` istnieje w unbundled i webpack [E `ls`] — jest **precedens dzielonego `shared/`** w tej rodzinie. ACL + 800-liniowy rdzeń loadera idą do jednego wspólnego modułu (parametryzowanego nazwą pakietu dla generowanego importu z `:411/:588`), z którego każdy z 3 pakietów re-eksportuje cienką powłokę. To rozwiązuje równolegle duplikację z 3.1 (potrojony loader → jeden) i przeciek z 3.2 (jeden adapter zamiast 6 importów).

> **Rozstrzygnięcie otwartego pytania kontraktowego.** Trzy warianty `sourceType` (`'module'` vs `'source'` w NodeRegister `:41`) — wg dokumentacji acorn `sourceType: 'source'` **nie istnieje** (legalne: `'script' | 'module'`); acorn-loose toleruje nieznaną wartość, traktując ją łagodnie. Decyzję — ujednolicić na `'module'` — zakodować **w adapterze** (`flightModuleParser.acorn.js`), nie w 6 wywołaniach. To dokładnie rola ACL: jedno miejsce na decyzję o kontrakcie biblioteki.

---

## KROK 5 — Dowód izolacji + before/after

### 5.1 Dowód izolacji (lista plików znających acorn)

| Plik | Dziś zna `acorn-loose`? | Po ACL? |
|---|---|---|
| `react-server-dom-webpack/.../flightModuleParser.acorn.js` (nowy) | — | **TAK (jedyny)** |
| `…webpack/src/ReactFlightWebpackNodeLoader.js` `:10` | TAK | NIE (zna port) |
| `…webpack/src/ReactFlightWebpackNodeRegister.js` `:10` | TAK | NIE |
| `…webpack/src/ReactFlightWebpackPlugin.js` `:15` | TAK | NIE |
| `…esm/src/ReactFlightESMNodeLoader.js` `:10` | TAK | NIE |
| `…unbundled/src/ReactFlightUnbundledNodeLoader.js` `:10` | TAK | NIE |
| `…unbundled/src/ReactFlightUnbundledNodeRegister.js` `:10` | TAK | NIE |
| `…turbopack/package.json` | deklaruje (martwo) | usunięte z manifestu |

**Kryterium sukcesu jest sprawdzalne mechanicznie** (patrz KROK 6): `grep` po `acorn` w `packages/react-server-dom-*/src/` zwraca **wyłącznie** plik(i) adaptera.

### 5.2 Before / after — zduplikowane miejsca

| Miejsce | Before | After |
|---|---|---|
| skan dyrektyw (`Loader:669` + `Register:41` + `Plugin:410`, 3 warianty opcji) | 9 wywołań `acorn.parse` z 3 różnymi opcjami | 2 metody portu (`parseDirectives`/`parseExports`); opcje w adapterze |
| reguła „use client ⊕ use server" (5 kopii: `:721`×3, `:71`×2) | 5× inline `throw new Error('Cannot have both…')` | 1× `readDirectives` → `ConflictingDirectivesError` |
| 800-liniowy `transformServer/ClientModule` (esm≈unbundled≈webpack) | potrojony, różnica 1–2 linie | 1 wspólny moduł + cienkie re-eksporty |
| `webpack-sources/lib/helpers/*` deep-import (`:12-13`×3) | 3× import wnętrza paczki | w tym samym wspólnym module (1 miejsce) |
| konsument loadera (`transformSource`/`load`, `:759/:786`) | dostaje `program` (surowy AST acorn) | dostaje `ModuleDirectives`/`ExportedEntry` — **gotowe dane domenowe**, nie obiekt biblioteki |

**Zysk [I]:** warstwa „UI" tej domeny — czyli konsument transformacji (Node loader hook, plugin webpacka) — przestaje dotykać surowego AST. Dostaje VO. Wymiana parsera nie przecieka poza adapter.

---

## KROK 6 — Weryfikacja i plan

### 6.1 Kryterium sukcesu (sprawdzalne)

```bash
# Po refaktorze MUSI zwrócić tylko plik(i) adaptera:
grep -rln "acorn" packages/react-server-dom-*/src --include='*.js' | grep -v __tests__
# Manifesty: acorn-loose tylko w pakietach z adapterem; turbopack — usunięty (był martwy [E]).
```

Dziś (baseline [E]): 6 plików w 3 pakietach + martwa deklaracja w turbopack. Cel: 1 (lub 1 per pakiet, jeśli adapter nie jest współdzielony — patrz 4.4).

### 6.2 Plan faz (konwencja projektu)

- **Faza 1 — VO + port + adapter (bez zmiany zachowania).** Wydziel `readDirectives`/`readExportedEntries` i adapter `acornFlightModuleParser` z istniejącego `WebpackNodeLoader.js` (kanon — webpack≡unbundled). Testy Flight (`__tests__`) zielone bez zmian.
- **Faza 2 — przełącz webpack + unbundled na port.** Oba loadery i NodeRegister importują port zamiast acorn. `grep acorn` → tylko adapter w tych 2 pakietach.
- **Faza 3 — esm + Plugin + dedup 800 l.** Przenieś wspólny rdzeń do współdzielonego modułu (4.4), parametryzuj nazwą pakietu (`:411/:588`). esm i `WebpackPlugin` na port.
- **Faza 4 — manifesty.** Usuń martwy `acorn-loose` z `turbopack/package.json`; zweryfikuj kryterium 6.1.
- **Faza 5 (opcjonalna) — drugi adapter.** PoC `hermes-parser` jako dowód, że port izoluje (wymiana = 1 plik).

> **Co NIE wchodzi:** zmiana protokołu wire Flight (to A3, inny refaktor) ani host-config (A1/`02`). Ten plan dotyka wyłącznie warstwy parsowania źródła modułu w loaderach bundlerowych.

### 6.3 Load-bearing names do rejestracji

Projekt nie ma formalnego rejestru kontraktów ([U], `01`). Gdyby powstał: `FlightModuleParser` (port), `acornFlightModuleParser` (adapter), `ModuleDirectives`/`ExportedEntry` (VO), `ConflictingDirectivesError` (błąd domenowy), `flightModuleParser.acorn.js` (JEDYNE miejsce wiedzy o acorn).

---

## Ograniczenia artefaktu

- **Soczewka DDD na bibliotekę** — „ACL/port/VO" to nakładka; React nie używa tych terminów. „Persystencja" = źródło modułu na wire RSC, „typ biblioteki" = AST acorn.
- **Współdzielenie kodu między pakietami** (4.4) to decyzja architektoniczna o blast-radiusie poza tym planem — pokazany precedens `shared/ReactFlightImportMetadata.js` [E], ale ostateczna granica pakietowania do rozstrzygnięcia w planie implementacji.
- **`turbopack` martwa deklaracja** [E 0 trafień] — interpretuję jako do usunięcia; możliwe, że jest pod planowaną funkcję [U].
- **Decyzja `sourceType`** oparta o dokumentację acorn (legalne `'script'|'module'`); `'source'` w NodeRegister `:41` traktuję jako tolerowany błąd do ujednolicenia w adapterze.
- **Cytaty [E]** zweryfikowane w tej sesji: 6 importów acorn (`:10`×4, `:15`); 9 `acorn.parse` (`:534/:669`×3, `:41`×2, `:410`); `wc -l` 804×3 i 109×2; `diff` esm/unbundled (2 l.), webpack/unbundled (0), NodeRegister (1 l.); `webpack-sources` deep-import `:12-13`×3; `neo-async:14`; 5× „Cannot have both" (`:721`×3, `:71`×2); turbopack 0 trafień acorn; manifesty deps; `shared/ReactFlightImportMetadata.js` w 2 pakietach.

## Podsumowanie

Najgorszym przeciekiem zależności w rdzeniowej subdomenie RSC/Flight jest `acorn-loose`: importowany w 6 plikach w 3 pakietach (webpack, unbundled, esm) i dodatkowo *martwo* zadeklarowany w manifeście turbopack, który go nie używa [E]. Przeciek jest dotkliwy, bo kształt zwracanego AST (`node.type`, `node.declaration`, `node.specifiers`, `loc`) jest wczytany w ~800-liniowy algorytm transformacji modułu, który okazał się **potrojony niemal bajt-w-bajt** — `*NodeLoader.js` różnią się tylko 1–2 liniami nazwy pakietu [E `diff`]. Razem z parserem przecieka też niezmiennik domenowy „plik nie może mieć równocześnie `use client` i `use server`", skopiowany w 5 miejscach. Stoi to w sprzeczności z deklarowaną intencją: pakiety `react-server-dom-*` mają być wymiennymi adapterami bundlera, a w praktyce współdzielą skopiowany rdzeń zależny od konkretnego parsera. ACL wprowadza wąski port `FlightModuleParser` (dwie metody domenowe: `parseDirectives`/`parseExports`), domenowe value objecty (`ModuleDirectives`/`ExportedEntry`) jako jedyny wynik parsowania widziany przez loadery, oraz jeden adapter `acornFlightModuleParser` będący JEDYNYM miejscem z importem acorn. Decyzje kontraktowe (ujednolicenie `sourceType`, opcje parsowania, deep-import `webpack-sources`) lądują w adapterze, a sprawdzalne kryterium sukcesu to `grep acorn` zwracający wyłącznie plik adaptera. Plan jest 5-fazowy (VO+port → przełączenie webpack/unbundled → dedup 800 l. + esm/Plugin → czyszczenie manifestów → opcjonalny drugi adapter jako dowód izolacji) i nie dotyka protokołu wire (A3) ani host-config (A1/`02`).
