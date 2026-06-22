---
title: Destylacja domeny React — Ubiquitous Language, subdomeny, agregaty, niezmienniki
created: 2026-06-22
type: domain-distillation
---

# Destylacja domeny — React

> **Produkt:** mapa domeny, nie kod. Odkrycie → analiza → klasyfikacja.
> **Konwencja dowodów:** **[E]** zweryfikowane w kodzie (`plik:linia`) · **[I]** interpretacja · **[U]** białe plamy.

## KROK 0 — Kontekst projektu (odkrycie)

**Stack i struktura.** React to monorepo JS/Flow (runtime) + TS (`compiler/`) + Rust (`compiler/crates`). Logika biznesowa runtime'u żyje w `packages/*/src/`; nie ma klasycznej warstwy API/serwis/persystencja — to **biblioteka**, więc „domena" = model wykonania UI (reconciliation, renderery, protokół RSC, feature flags, DevTools), a nie encje CRUD.

**Dokumenty wymagań — ograniczenie [E/U].** Brak `prd.md`, `tech-stack.md`, dokumentu wizji czy roadmapy w repo (`find` po `prd*`/`tech-stack*`/`vision*` = 0 trafień; `context/foundation/` ma tylko `README.md` konwencji). **W konsekwencji destylacja opiera się na:**
- `README.md` — jedyne źródło „wizji produktu" (3 cele: Declarative, Component-Based, Learn Once Write Anywhere). [E `README.md:3-7`]
- `CLAUDE.md` — aktywna praca (port Rust kompilatora, gałąź `rust-research`). [E]
- **Mapa onboardingowa** `context/map/` (3 artefakty git+graf+kontrybutorzy) — prior o aktywności i strukturze.
- **Trzy ukończone badania szwów** w `context/changes/` (feature-flags, host-config, RSC/Flight) — najgłębsze źródło niezmienników, każde z weryfikacją ast-grep.

To **ograniczenie metodyczne**: nie ma deklaratywnego „success criteria / non-goals", więc klasyfikacja Core/Supporting/Generic (KROK 2) jest zakotwiczona w **3 celach README + sygnale aktywności z mapy**, nie w formalnej wizji. Oznaczone [I] tam, gdzie to wnioskowanie.

---

## KROK 1 — Ubiquitous Language

Pojęcia wyciągnięte z dokumentów (README, mapa, badania) ORAZ z kodu. Każde: definicja → cytat źródłowy → gdzie żyje w kodzie (lub „BRAK w kodzie").

| Pojęcie | Definicja | Źródło (dokument) | W kodzie (`plik:linia`) |
|---|---|---|---|
| **Declarative UI** | Opisujesz widok dla stanu; React liczy aktualizację. Sens produktu. | `README.md:5` | Cały reconciler (efekt, nie pojedynczy plik) |
| **Component** | Enkapsulowana jednostka stanu + logiki, komponowalna. | `README.md:6` | `packages/react/src/` (API publiczne) |
| **Learn Once, Write Anywhere** | Jeden model, wiele hostów (DOM, Native, serwer). | `README.md:7` | Realizowane przez **host config** (niżej) |
| **Reconciler / Fiber** | Rdzeń liczący różnicę drzew i planujący pracę. | mapa §2 „centralny hub" | `packages/react-reconciler/src/ReactFiberWorkLoop.js` [E] |
| **Host Config** | Kontrakt operacji hosta, który reconciler importuje abstrakcyjnie. | host-config research §1 | `react-reconciler/src/ReactFiberConfig.js:20` (shim rzuca) [E] |
| **Fork (host config)** | Konkretna realizacja kontraktu pod renderer, wstrzykiwana w buildzie. | host-config §1 | `forks/ReactFiberConfig.{dom,art,fabric,markup,noop,test,custom}.js` — **7** [E `ls`] |
| **Capability flag** | Statyczny wymiar zachowania renderera (`supportsMutation`…). | host-config §1 | `ReactFiberConfigDOM.js:882` `supportsMutation=true` [E] |
| **Feature Flag** | Przełącznik kompilacyjny ścieżki kodu w danym buildzie. | feature-flags research | `packages/shared/ReactFeatureFlags.js` — **65** flag, **0** importów [E] |
| **Fork (feature flags)** | Wariant pliku flag pod kanał/platformę. | feature-flags §forki | `packages/shared/forks/ReactFeatureFlags*.js` — **10** [E `ls`] |
| **SharedInternals** | Singleton współdzielonego stanu (dispatcher/owner). | feature-flags §przeciek | `ReactSharedInternals.js:10`, `ReactDOMSharedInternals.js:10` [E] |
| **Flight (RSC)** | Dwukierunkowy protokół serializacji grafu React przez granicę proces↔proces. | RSC research §summary | `react-server/src/ReactFlightServer.js`, `react-client/src/ReactFlightClient.js` [E] |
| **Row / Tag** | Jednostka wire: `id:tag` + ładunek; `$`-prefix = typ specjalny. | RSC §feature overview | `parseModelString` `ReactFlightClient.js:2386` [E] |
| **Forward / Return path** | server→client (render) vs client→server (server actions/reply). | RSC §trace | `renderModelDestructive:3555` / `encodeReply` (ReplyClient) [E] |
| **DevTools backend** | Czyta żywe struktury Fiber, by zbudować drzewo dla UI. | mapa §3 | `react-devtools-shared/src/backend/fiber/renderer.js` [E z mapy] |
| **React Compiler** | Auto-memoizacja przez analizę HIR; „wyspa", port na Rust. | mapa §2, CLAUDE.md | `compiler/packages` (JS), `compiler/crates` (Rust) [E z mapy] |

> **[U]** Brak słownika domenowego w repo — powyższe to destylacja, nie cytat z istniejącego glossary. Terminy „subdomena/agregat/niezmiennik" nie występują w kodzie React (to soczewka DDD nałożona na bibliotekę).

---

## KROK 2 — Subdomeny: Core / Supporting / Generic

Kryterium rdzenia [I, zakotwiczone w `README.md:5-7`]: rdzeń = to, co realizuje **Declarative + Learn Once Write Anywhere** — czyli zdolność, by *jeden* deklaratywny model napędzał *wiele* hostów poprawnie. To przewaga i sens produktu.

| Obszar | Kategoria | Uzasadnienie (cel produktu + dowód) |
|---|---|---|
| **Reconciler / Fiber** (`react-reconciler`) | **CORE** | Silnik „Declarative" — liczy aktualizację z opisu stanu (`README.md:5`). Mapa: „centralny hub", `ReactFiberWorkLoop.js` epicentrum SCC=77. Bez niego nie ma produktu. |
| **Host-config seam** (`ReactFiberConfig` + 7 forków) | **CORE** | Bezpośrednia realizacja „Learn Once, Write Anywhere" (`README.md:7`): jeden reconciler, N hostów. host-config §1. To *mechanizm* przewagi. |
| **RSC / Flight** (`react-server`↔`react-client`) | **CORE** | Rozszerza „Write Anywhere" na granicę serwer↔klient (`README.md:7` „render on the server"). Najnowszy front rdzenia; kontrakt 50 współzmian. |
| **Feature flags** (`shared/ReactFeatureFlags` + forki) | **SUPPORTING** | Nie jest sensem produktu, ale steruje którą ścieżką rdzeń idzie w danym buildzie/kanale. „Semantyczny przełącznik runtime'u" (mapa §4). Wspiera rdzeń, nie jest nim. |
| **DOM renderer / Fizz SSR** (`react-dom`, `-bindings`) | **SUPPORTING** | Najważniejszy *konkretny* host, ale z perspektywy modelu to jedna z realizacji kontraktu (jak ART/Fabric/noop). Krytyczny biznesowo, architektonicznie wymienny. |
| **DevTools** (`react-devtools-shared`) | **SUPPORTING** | #1 aktywności (mapa §2), ale to narzędzie *obok* runtime'u — czyta Fiber jednokierunkowo (8↓/0↑). Poprawa DX, nie rdzeń wykonania. |
| **React Compiler** (`compiler/`) | **SUPPORTING** | Optymalizacja (auto-memoizacja) UX programisty; „wyspa" prawie bez sprzężeń z `packages/` (mapa §3). Produkt działa bez niego. |
| **Build/fork-substitution** (Rollup/Jest/Flow + `inlinedHostConfigs`) | **GENERIC** | Mechanika podmiany modułu w buildzie — infrastruktura, nie wiedza domenowa. Reguła „longest-prefix shortName" potrojona (host-config T1). |
| **Wire transport** (`ReactServerStreamConfig*`, bundler-warianty) | **GENERIC** | Bajty/stringi przez kanał — generyczna warstwa pod Flight. 6 bundlerów to adaptacja środowiska, nie domena. |

**Wniosek [I]:** rdzeń domeny to **trójkąt Reconciler ↔ Host-config ↔ Flight** — wszystko troje materializuje „jeden model, wiele hostów". Feature flags i DOM to najbliższe wsparcie. DevTools/Compiler, mimo dominacji w aktywności gita, są wspierające — co tłumaczy, czemu „mapa aktywności" ≠ „mapa rdzenia".

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

Agregat = granica spójności, w której reguła biznesowa MUSI być zawsze prawdziwa. Dla biblioteki „niezmiennik" = kontrakt architektoniczny, który build/typy/testy mają egzekwować.

### A1 — Host Config (kontrakt renderer↔reconciler)
- **Niezmiennik:** shim `ReactFiberConfig` **nigdy nie może rozwiązać się w runtime** — każdy build musi go podmienić na dokładnie jeden z 7 forków. „We should never resolve to this file… the failure isn't silent." [E `ReactFiberConfig.js:12-20`]
- **Powiązany niezmiennik:** każdy renderer wybiera dokładnie jedną z `supportsMutation` ⊕ `supportsPersistence`. [E host-config §1]
- **Status egzekwowania:** **częściowo deklarowany, słabo egzekwowany.** Shim egzekwuje „nie-rozwiązanie" przez `throw` (twardo). Ale **kompletność i parzystość 7 forków** pilnuje *tylko Flow* — brak testu konformancji (host-config T4). Wyjątek: noop łamie mutual-exclusivity (definiuje oba host configi) [E §1].

### A2 — Feature Flags (spójność przełączników przez buildy)
- **Niezmiennik:** zestaw flag jest identyczny we wszystkich 10 forkach; kanoniczny plik jest czystym liściem (0 importów), by każdy pakiet mógł zależeć od flag bez cyklu. [E `ReactFeatureFlags.js` 0 importów]
- **Status:** **deklarowany, egzekwowany połowicznie.** Flow łapie *brak/nadmiar* nazwy flagi (asercja `null as any as ExportsType…`, 6 plików), ale **NIE dryf wartości** — fork może mieć logicznie złą wartość bez błędu. Brak dedykowanego skryptu/testu spójności (feature-flags dług #1). `yarn flags` tylko raportuje.

### A3 — Flight wire-format (kontrakt klient↔serwer)
- **Niezmiennik:** każdy tag wire ma sparowanego *pisarza* (`ReactFlightServer`) i *czytelnika* (`ReactFlightClient`); typy reply dodatkowo pisarza/czytelnika reply. Zmiana jednej strony bez drugiej = cichy bug serializacji. [E RSC §blast radius]
- **Niezmiennik 2:** zbiór tagów forward ⊇ reply (reply nie niesie `$L,$S,$Y,$P,$E,$Z`). [E RSC §summary]
- **Status:** **ignorowany przez typy.** Flow nie wiąże tagu pisarza z tagiem czytelnika; spójność trzyma się *tylko na testach i dyscyplinie* (RSC dług #3). Dodatkowo kolizja przestrzeni nazw (`S,L,D,E,W` znaczą co innego w dwóch warstwach).

### A4 — Shared jako fundament (kierunek warstwy)
- **Niezmiennik:** `packages/shared` to liść — nie zależy w górę od `react`/`react-dom`/`reconciler`. [E reguła `.dependency-cruiser.js:26` `shared-is-foundation`, `severity:error`]
- **Status:** **deklarowany regułą `error`, łamany świadomie.** 2 pliki `*SharedInternals` importują w górę (`ReactSharedInternals.js:10`→`react`, `ReactDOMSharedInternals.js:10`→`react-dom`). Jedyne błędy `error` w grafie. Intencja [U] (prawdopodobnie singleton dispatcher).

---

## KROK 4 — Rozjazdy MODEL vs KOD

Najcenniejsza część: gdzie wiedza domenowa (dokument/mapa/intencja) istnieje, a kod jej nie odwzorowuje lub jej przeczy.

| # | Dokument/model mówi X | Kod robi Y | Dowód (`plik:linia`) |
|---|---|---|---|
| D1 | Mapa: `shared` przecieka w górę **przez `ReactFeatureFlags`** (§1) | Flagi mają **0 importów** — przeciek robią `*SharedInternals`, nie flagi. Mylna atrybucja. | `ReactFeatureFlags.js` 0 import [E]; `ReactSharedInternals.js:10` [E] |
| D2 | Mapa: DOM↔reconciler to relacja **jednokierunkowa** „host" (§3, `dom→rec`) | To **realny cykl** — `ReactFiberConfigDOM` re-importuje z reconcilera (`WithNoPersistence` + wartości). | `ReactFiberConfigDOM.js:297,34,144,145` [E host-config §T6] |
| D3 | Model: kontrakt Host Config to spójna powierzchnia 7 forków | **Brak testu konformancji** — nic nie sprawdza, że 7 forków ma ten sam interfejs; tylko Flow. | host-config T4 [E: szukano, brak] |
| D4 | Model: feature flags spójne między buildami | Flow pilnuje *nazw*, nie *wartości* — dryf wartości forka przechodzi cicho; 0 dedykowanego testu. | feature-flags dług #1,#6 [E] |
| D5 | Model: kontrakt Flight jest „jedną umową" klient↔serwer | Typy **nie wiążą** pisarza z czytelnikiem; spójność tylko na testach. | RSC dług #3 [E] |
| D6 | Mapa: klaster `react-server-dom-*` to „mirror/propagacja" (§3) | Dla **testów myli**: turbopack zdryfował ≈2957 l.; parcel/esm/unbundled = 0 testów Flight. | RSC §blast radius [E `diff`/`ls`] |
| D7 | host-config lore / starsze docs: dwufazowe `prepareUpdate`+`commitUpdate` | `prepareUpdate` **nie istnieje** w kontrakcie — jednofazowy `commitUpdate`. | host-config §1 [E: 0 trafień, 5 pakietów] |
| D8 | Mapa: „WorkLoop importuje 20 flag" | **19** flag (blok importu 44-62). | feature-flags §konsumpcja [E ast-grep] |
| D9 | Mapa: `react-reconciler ↔ shared = 40` ⇒ „konsumuje feature flags" | 40 to co-change *całego* `shared`; flagowo-specyficznie tylko **19**. Nadprzypisanie. | feature-flags §blast [E git] |

**Wniosek narracyjny [I]:** trzy z czterech rdzeniowych agregatów (A1 host-config, A2 flags, A3 Flight) dzielą **jedną klasę długu**: niezmiennik *istnieje w głowach i w dokumentacji, ale egzekwuje go najwyżej Flow na poziomie kształtu nazw* — nie ma testu konformancji/parzystości/lockstepu. Mapa dodatkowo myli atrybucję (D1, D2, D6), co kieruje onboardującego w niewłaściwe pliki.

---

## KROK 5 — Ranking refaktoru

Szeregowanie kandydatów wg **wartości** (jak rdzeniowy niezmiennik) × **ryzyka** (jak słabo dziś egzekwowany).

| Ranga | Agregat | Wartość (rdzeń) | Ryzyko (egzekwowanie) | Wynik |
|---|---|---|---|---|
| **#1** | **A1 Host Config** | **Najwyższa** — bezpośrednio realizuje „Learn Once Write Anywhere" (rdzeń); 7 forków + cykl + 20 cross-area | **Wysokie** — kompletność forków pilnuje tylko Flow; 0 testu konformancji; noop łamie mutual-exclusivity; reguła potrojona (T1) | **Top** |
| #2 | A3 Flight wire-format | Wysoka — rdzeń „render on server"; kontrakt 2-4 plików lockstep | Wysokie — typy nie wiążą stron; asymetria testów bundlerów (D6) | Wysoki |
| #3 | A2 Feature Flags | Średnia — wspierający przełącznik, nie rdzeń | Wysokie — dryf wartości niepilnowany, 10 forków ręcznie | Średni |
| #4 | A4 Shared-as-foundation | Średnia — czystość warstwy | Niskie/świadome — łamane celowo, 2 znane pliki, reguła `error` już je łapie | Niski |

### #1 do refaktoru: **Host Config seam — dodać test konformancji forków**

**Dlaczego #1 [I]:** to jednocześnie *najbardziej rdzeniowy* niezmiennik (materializuje przewagę produktu — jeden model, wiele hostów) i jeden z *najsłabiej egzekwowanych* (kompletność 7 forków + mutual-exclusivity capability flag pilnuje wyłącznie Flow; brak dedykowanego testu — host-config T3/T4). Blast radius zmiany kontraktu to ~7-12 plików w 5+ pakietach, w pełni ręcznie. Najwyższy iloczyn wartość×ryzyko.

**Kierunek (bez kodu produkcyjnego):** test parzystości, który dla każdego z 7 forków asercjonuje identyczną powierzchnię eksportów względem kontraktu + sprawdza `supportsMutation ⊕ supportsPersistence` per renderer (z jawnym wyjątkiem noop). Zamienia „Flow łapie kształt nazw" na „test łapie kompletność i semantykę capability". Drugorzędnie: deduplikacja potrójnej reguły wyboru forka (T1) za jednym źródłem `inlinedHostConfigs.js`.

---

## Ograniczenia artefaktu

- **Brak formalnych wymagań** (`prd`/`tech-stack`/`vision`) — klasyfikacja Core/Supporting oparta na 3 celach `README.md` + sygnale aktywności mapy; oznaczona [I] gdzie to wnioskowanie.
- **Soczewka DDD na bibliotekę** — „agregat/niezmiennik" to nakładka analityczna; React nie używa tych terminów. Niezmienniki to kontrakty architektoniczne, nie reguły biznesowe CRUD.
- **Compiler (`compiler/crates`, Rust) poza grafem** zależności (mapa §7) — nie analizowany jako agregat; aktywny, ale „wyspa".
- **Cytaty zweryfikowane** [E] przeze mnie bezpośrednio dla kotwic: shim throw, 0 importów flag, 65 flag, 10/7/19+19 forków, linie przecieku, reguła `error`, `parseModelString:2386`, `renderModelDestructive:3555`. Pozostałe [E] pochodzą z 3 badań szwów (każde z własną weryfikacją ast-grep).
