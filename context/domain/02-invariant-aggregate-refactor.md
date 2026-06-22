---
title: Refaktor agregatu-strażnika — niezmiennik Host Config (capability ⊕ exclusivity)
created: 2026-06-22
type: refactor-plan
---

# Refaktor agregatu-strażnika — niezmiennik Host Config

> **Produkt:** PLAN refaktoru, nie kod produkcyjny.
> **Konwencja dowodów:** **[E]** zweryfikowane `plik:linia` (sprawdzone w tej sesji) · **[I]** interpretacja · **[U]** biała plama.
> **Fail-fast:** nielegalna konfiguracja renderera zatrzymuje build/test, nie loguje-i-jedzie dalej.

## KROK 0 — Kontekst (odkrycie)

**Stack/warstwy.** React = biblioteka JS/Flow; brak warstwy API/serwis/persystencja. „Domena" = model wykonania UI. Logika niezmiennika żyje w trzech warstwach mechanizmu host-config:
- **kontrakt** `packages/react-reconciler/src/ReactFiberConfig.js` (shim rzucający) [E `:20`],
- **forki** `packages/react-reconciler/src/forks/ReactFiberConfig.{dom,art,fabric,markup,noop,test,custom}.js` — **7** [E `ls`],
- **implementacje renderera** (`ReactFiberConfigDOM.js`, `…Fabric.js`, `…ART.js`, `…TestHost.js`, `createReactNoop.js`).

**Dokumenty wymagań — ograniczenie [U].** Brak `prd.md`/`tech-stack.md`/wizji (potwierdzone w `01-domain-distillation.md` KROK 0). Materiał źródłowy: `README.md` (3 cele), `context/changes/host-config-seam/research.md` (badanie z weryfikacją ast-grep), oraz `01-domain-distillation.md` (destylacja, która wskazała A1 jako #1).

**Najważniejsze odkrycie kontekstowe [E git].** Rekomendowany w destylacji kierunek dla A1 — *test parzystości forków + deduplikacja selektora + codegen* — **został już zaimplementowany** w (zarchiwizowanej) zmianie `refactor-opportunities`:
- **T1** dedup selektora → `scripts/shared/resolveHostConfigFork.js` (`getForkCandidates`), importowany przez wszystkie 3 toolchainy [E `scripts/rollup/forks.js:6`, `scripts/jest/setupHostConfigs.js:6`, `scripts/flow/createFlowConfigs.js:15`] (commit `15fbae4e0`).
- **T2** codegen → `scripts/generate-host-config-forks.js` regeneruje body `.custom`/`.noop` z kanonu (commit `e0ddc873e`).
- **T4** parzystość powierzchni → `scripts/shared/hostConfigForkSurface.js` + `__tests__/hostConfigForkSurface-test.js`, 166 symboli `export const` (commit `0f42d0a37`).

**Konsekwencja dla tego planu [I]:** nie powtarzam T1/T2/T4. Skupiam się na **części niezmiennika A1, która NADAL jest nieegzekwowana** — i to jest właściwy „najsłabiej egzekwowany rdzeń".

---

## KROK 1 — Niezmienniki biznesowe (lista)

Reguły, które w domenie host-config MUSZĄ być zawsze prawdziwe (z `01` KROK 3 + zweryfikowane tu):

| # | Niezmiennik | Źródło | Status egzekwowania |
|---|---|---|---|
| **N1** | Shim `ReactFiberConfig` **nigdy** nie rozwiązuje się w runtime — każdy build podmienia go na 1 z 7 forków. | `ReactFiberConfig.js:12-20` [E] | **Egzekwowany twardo** — body to `throw new Error(...)` [E `:20`]. |
| **N2** | Powierzchnia eksportów `.custom`/`.noop` jest identyczna z kanonem (166 symboli). | `hostConfigForkSurface.js:22` [E] | **Egzekwowany od `refactor-opportunities`** — test set-equality + codegen [E]. |
| **N3** | Reguła wyboru forka (longest-prefix `shortName` split `-`) jest jednym źródłem. | `resolveHostConfigFork.js:29` [E] | **Egzekwowany** — 1 helper, 3 importery, własny test [E]. |
| **N4** | **Każdy *realny* renderer wybiera dokładnie jedną z `supportsMutation` ⊕ `supportsPersistence`.** | `research.md` §1 „mutual exclusivity"; `ReactFiberCompleteWork.js:469/481` [E] | **NIE egzekwowany** — patrz KROK 2-3. |
| **N5** | `packages/shared` jest liściem (nie zależy w górę). | `.dependency-cruiser.js` reguła `shared-is-foundation` | Egzekwowany regułą `error`, łamany świadomie (2 pliki) — to A4, inny agregat. |

---

## KROK 2 — Klasyfikacja i wybór #1

Trzy osie (rdzeniowość × rozsmarowanie × egzekwowanie):

| Niezmiennik | (a) rdzeniowy? | (b) rozsmarowany? | (c) egzekwowany? | Wybór |
|---|---|---|---|---|
| N1 shim-throw | tak (rdzeń „Learn Once") | 1 plik | **twardo** (`throw`) | — (już zabezpieczony) |
| N2 surface parity | tak | 2 forki + kanon | **tak** (test+codegen, świeże) | — (już zabezpieczony) |
| N3 selector | pośrednio (mechanizm) | 3 toolchainy | **tak** (dedup) | — (już zabezpieczony) |
| **N4 capability ⊕** | **tak — wybiera ścieżkę reconcilera** | **6 plików renderer-impl + 2 stuby + reconciler** | **NIE — tylko Flow widzi *istnienie* flag, nie *liczbę true*** | **#1** |
| N5 shared-leaf | średnio | 2 pliki | regułą `error` | — (A4) |

**Wybór #1: N4 — capability mutual-exclusivity.** Uzasadnienie [I]: po wdrożeniu T1/T2/T4 to **jedyny pozostały człon niezmiennika A1, który jest jednocześnie rdzeniowy i nieegzekwowany**. Jest rdzeniowy, bo flaga `supportsMutation`/`supportsPersistence` nie jest kosmetyką — **przełącza całą ścieżkę completion-work reconcilera** (`ReactFiberCompleteWork.js:469` mutation vs `:481` persistence [E]); renderer z dwiema flagami `true` lub zerem `true` to renderer, który „uruchamia inny reconciler" albo żaden. Jest nieegzekwowany, bo Flow sprawdza tylko, że flaga *istnieje* (kształt nazwy), nie że dokładnie jedna jest `true`. To dokładnie wzorzec „niezmiennik istnieje w głowach/dokumentacji, egzekwuje go najwyżej Flow na poziomie kształtu nazw" z `01` KROK 4 wniosek.

---

## KROK 3 — Diagnoza niezmiennika N4

### 3.1 Gdzie dziś żyje reguła (cytaty `plik:linia`)

**Konsumpcja (gdzie reguła „działa"):** reconciler rozgałęzia się na flagach — jedna flaga przełącza całą ścieżkę:

| Miejsce | Co robi | Dowód |
|---|---|---|
| `ReactFiberCompleteWork.js:112-113` | importuje `supportsMutation, supportsPersistence` z kontraktu | [E] |
| `ReactFiberCompleteWork.js:469` | `if (supportsMutation) { … markUpdate … }` — ścieżka mutacji in-place | [E] |
| `ReactFiberCompleteWork.js:481` | `} else if (supportsPersistence) { … clone-on-write … }` | [E] |
| (te same flagi) `:209,250,287,365,437,679` | dalsze rozgałęzienia | [E grep] |

**Deklaracja per renderer (gdzie wartość jest ustalana):** każdy *realny* renderer ustala flagi w dwóch krokach — dodatnia flaga lokalnie, ujemna przez re-eksport „WithNo*" stuba z reconcilera:

| Renderer | `supportsMutation` | `supportsPersistence` | Dowód |
|---|---|---|---|
| **DOM** | `= true` (`ReactFiberConfigDOM.js:882`) | `= false` via `export * … WithNoPersistence` (`:297`) | [E] |
| **ART** | `= true` (`ReactFiberConfigART.js:415`) | `false` via WithNoPersistence (`:252`) | [E] |
| **TestHost** | `= true` (`ReactFiberConfigTestHost.js:278`) | `false` via WithNoPersistence (`:59`) | [E] |
| **Fabric** | `false` via `export * … WithNoMutation` (`ReactFiberConfigFabric.js:166`) | `= true` (`:480`) | [E] |
| **stub** `WithNoPersistence.js:22` | — | `export const supportsPersistence = false;` | [E] |
| **stub** `WithNoMutation.js:22` | `export const supportsMutation = false;` | — | [E] |
| **noop (WYJĄTEK)** | `mutationHostConfig.supportsMutation: true` (`createReactNoop.js:718`) | `persistenceHostConfig.supportsPersistence: true` (`:915`) | [E] |

noop celowo definiuje **oba** host-configi i wybiera jeden w czasie konstrukcji (`createReactNoop.js:990-991` `? {...mutationHostConfig} : {...persistenceHostConfig}`) [E]. To **legalna** dwoistość per *konstrukcja*, nie per *fork* — strażnik musi ją jawnie dopuścić.

### 3.2 Gdzie niezmiennik NIE jest egzekwowany

- **Brak testu liczącego `true`.** `grep` po teście asercjującym „dokładnie jedna z flag" → 0 trafień w `scripts/` i `packages/*/__tests__/` [E]. Istniejący `hostConfigForkSurface-test.js` sprawdza **obecność** symboli (parity powierzchni), **nie ich wartości** — to jawnie udokumentowane w pliku (`:18-29` „differences in the *value passthrough* … surface specifically") [E].
- **Flow nie liczy `true`.** Typ flagi to `boolean`; dwa `true` lub zero `true` przechodzi typecheck. (Wniosek z mechanizmu: flagi to `export const … = $$$config.…`/`true`/`false`, typ `boolean` — brak typu-sumy wymuszającego XOR.) [I]
- **Codegen tego nie pilnuje.** `generate-host-config-forks.js` grupuje symbole w sekcje (`SECTION_BLOCKS`, m.in. `appendChild`→Mutation `:49`, `cloneInstance`→Persistence `:56`) [E], ale generuje tylko **przepustki `$$$config.X`** dla `.custom`/`.noop` — nie dotyka wartości w realnych rendererach ani nie sprawdza wzajemnej wyłączności.
- **„Połykanie" zamiast zatrzymania:** dziś renderer z błędną kombinacją flag nie zatrzymuje buildu — po prostu reconciler wykona złą gałąź completion-work (cichy bug renderowania), bo `if (supportsMutation) … else if (supportsPersistence)` przy obu `false` **nie wykona żadnej** ścieżki commit-update [E `:469/:481`], a przy obu `true` zignoruje persistence. To jest „log-i-jedź dalej" w najgorszej formie: brak logu, zła ścieżka.

**Wniosek diagnozy [I]:** klient-strażnik nie istnieje na żadnej warstwie — ani build, ani Flow, ani test. Jedyny „strażnik" to dyscyplina autora renderera + przegląd PR.

---

## KROK 4 — Projekt agregatu-strażnika

> **Uwaga o naturze domeny.** To biblioteka, nie aplikacja CRUD — „agregat" nie jest klasą z bazą danych, lecz **jednym modułem, który jest JEDYNYM miejscem wiedzy o niezmienniku N4** i jedynym miejscem, które potrafi go odrzucić. Egzekucja przenosi się z „dyscypliny autora forka" (dziś rozproszonej po 6 plikach renderer-impl) na jeden strażnik uruchamiany w teście/CI. To odpowiednik „przeniesienia egzekucji z klienta na serwer".

### 4.1 Root agregatu — `RendererCapabilityProfile`

Agregat = **profil zdolności jednego renderera**, zbudowany przez odczyt jego rozwiązanych flag. Granica spójności: zestaw flag jednego renderera. Niezmiennik egzekwowany w konstrukcji (precondition), nie po fakcie.

**Lokalizacja (proponowana):** `scripts/shared/rendererCapabilityProfile.js` — obok istniejącego `hostConfigForkSurface.js`, bo to ten sam rejon „strażników kontraktu host-config" i ten sam runner (Jest na `scripts/shared/__tests__/`). **Nie** w `packages/` — to narzędzie weryfikacji kontraktu, nie kod runtime.

**Sygnatury (pseudokod, Flow-style):**

```js
// scripts/shared/rendererCapabilityProfile.js

// Nazwany błąd domenowy — nielegalna kombinacja ZATRZYMUJE, nie loguje.
class CapabilityInvariantError extends Error {}

// Value object: rozwiązany profil jednego renderera.
//   resolveCapabilities(shortName) -> { supportsMutation, supportsPersistence, modes? }
// Czyta wartości flag PO złożeniu fork + WithNo* stuby (patrz 4.3 — jak ładujemy).
type Capabilities = {|
  supportsMutation: boolean,
  supportsPersistence: boolean,
|};

// Precondition: dokładnie jedna z {mutation, persistence} === true.
// Wyjątek dopuszczony JAWNIE: renderery o wielu trybach (noop) — lista trybów.
function assertCapabilityExclusivity(
  shortName: string,
  caps: Capabilities | Array<Capabilities>, // tablica = renderer wielotrybowy
): void {
  const profiles = Array.isArray(caps) ? caps : [caps];
  profiles.forEach((c, i) => {
    const n = (c.supportsMutation ? 1 : 0) + (c.supportsPersistence ? 1 : 0);
    if (n !== 1) {
      throw new CapabilityInvariantError(
        `Renderer "${shortName}"${profiles.length > 1 ? ` mode #${i}` : ''} ` +
        `must enable exactly one of supportsMutation ⊕ supportsPersistence, ` +
        `got mutation=${String(c.supportsMutation)} ` +
        `persistence=${String(c.supportsPersistence)}.`
      );
    }
  });
}
```

**Metody domenowe (preconditions, fail-fast):**
- `RendererCapabilityProfile.of(shortName)` → ładuje flagi i **w konstruktorze** woła `assertCapabilityExclusivity`; nielegalny profil rzuca `CapabilityInvariantError` (nie zwraca obiektu w złym stanie).
- `.mode()` → `'mutation' | 'persistence'` — pochodna, dostępna tylko gdy niezmiennik spełniony (z konstrukcji).
- Renderery wielotrybowe (noop) rejestrowane przez **jawną listę dozwolonych**, nie przez wyłączenie reguły (patrz 4.2).

### 4.2 Rejestr legalnych wyjątków (zamiast „wyłącz regułę")

Jedyny dozwolony wyjątek to noop (oba host-configi, wybór w konstrukcji). Kodujemy go jako **dane, nie jako `if` rozsiany po kodzie**:

```js
// Renderery, które LEGALNIE definiują wiele profili (jeden per tryb konstrukcji).
// Każdy profil z osobna nadal musi spełniać ⊕. Źródło prawdy dla wyjątku.
const MULTI_MODE_RENDERERS = {
  noop: ['mutation', 'persistence'], // createReactNoop.js:718 / :915 / wybór :990-991
};
```

To zamienia „noop łamie regułę" na „noop ma dwa legalne profile, każdy spełnia ⊕" — wyjątek jest *jawny i testowalny*, nie cichym `skip`.

### 4.3 „Repozytorium" — skąd agregat czyta flagi (jedno miejsce ładowania)

Dziś wiedza o wartości flag jest rozproszona (lokalny `= true` + re-eksport `WithNo*`). Agregat potrzebuje **jednego loadera**, który zwraca rozwiązane wartości per renderer. Dwie opcje [I — do rozstrzygnięcia w planie]:

| Opcja | Jak | Zaleta | Wada |
|---|---|---|---|
| **R-A: statyczna mapa renderer→impl** | loader zna ścieżki impl per shortName (z `inlinedHostConfigs.js`) i parsuje `supports*` przez hermes-parser (jak `hostConfigForkSurface.js:29`), rozwijając `export * … WithNo*` | spójne z istniejącym `hostConfigForkSurface.js`; zero runtime | musi podążać za `export *` (rozwiązać re-eksport stuba) |
| **R-B: import w teście Jest** | test importuje rozwiązany moduł host-config przez `setupHostConfigs` i czyta `supportsMutation`/`supportsPersistence` z modułu | używa prawdziwego mechanizmu podmiany | trudniej objąć wszystkie renderery w jednym pliku testu |

**Rekomendacja [I]: R-A** — parsowanie statyczne hermes-parserem, bo (a) jest izomorficzne z już zaakceptowanym wzorcem `hostConfigForkSurface.js`, (b) nie wymaga bootowania 7 środowisk Jest, (c) podążanie za `export * … WithNoPersistence/WithNoMutation` to skończony, znany zbiór 2 stubów [E `WithNoPersistence.js:22`, `WithNoMutation.js:22`]. Decyzję zakodować w loaderze, nie w teście.

### 4.4 Cienki „route" — test konformancji jako punkt wejścia

Odpowiednik „parse wejścia → metoda agregatu → mapowanie błędu":

```js
// scripts/shared/__tests__/rendererCapabilityProfile-test.js
const REAL_RENDERERS = ['dom-browser','fabric','art','test','markup', ...]; // z inlinedHostConfigs
describe('renderer capability exclusivity (N4)', () => {
  REAL_RENDERERS.forEach(shortName => {
    it(`${shortName} enables exactly one of mutation ⊕ persistence`, () => {
      // parse -> metoda agregatu (rzuca CapabilityInvariantError) -> asercja
      expect(() => RendererCapabilityProfile.of(shortName)).not.toThrow();
    });
  });
  it('noop is a registered multi-mode renderer, each mode satisfies ⊕', () => {
    MULTI_MODE_RENDERERS.noop.forEach(mode => { /* assert per-mode ⊕ */ });
  });
});
```

Build/CI „route": dorzucić job freshness/konformancji obok istniejącego `check_generated_host_config_forks` (wzorzec z `runtime_build_and_test.yml`, dodany w commicie `e0ddc873e`) [E].

---

## KROK 5 — Before/after, plan faz, testy

### 5.1 Before / after per dzisiejsze miejsce reguły

| Miejsce dzisiaj | Before (stan) | After (po refaktorze) |
|---|---|---|
| `ReactFiberConfigDOM.js:882` + `:297` | `supportsMutation=true` + WithNoPersistence — poprawne, ale **nikt tego nie sprawdza** | bez zmian w kodzie renderera; profil DOM weryfikowany przez `RendererCapabilityProfile.of('dom-browser')` |
| `ReactFiberConfigFabric.js:480` + `:166` | persistence=true + WithNoMutation — niesprawdzane | profil Fabric weryfikowany; błąd = `CapabilityInvariantError` zamiast cichej złej ścieżki |
| `ReactFiberConfigART.js:415/:252`, `TestHost.js:278/:59` | mutation=true + WithNoPersistence — niesprawdzane | objęte tym samym testem konformancji |
| `createReactNoop.js:718/:915/:990-991` | oba host-configi; „wyjątek" tylko w głowie | wyjątek **jawny** w `MULTI_MODE_RENDERERS.noop`; każdy tryb z osobna sprawdzany |
| Flow typecheck | flaga to `boolean` — 2×`true`/0×`true` przechodzi | bez zmian (Flow zostaje); test domyka lukę wartości |
| Build/CI | brak bramki kombinacji flag | nowy job konformancji = bramka zatrzymująca PR z błędną kombinacją |

**Zysk [I]:** renderer z błędną kombinacją flag dziś = cichy bug renderowania (zła gałąź `CompleteWork`); po refaktorze = **głośny, nazwany błąd `CapabilityInvariantError` w teście/CI**, z komunikatem wskazującym renderer i odczytane wartości.

### 5.2 Plan faz (zgodny z dyscypliną test-first projektu)

Projekt ma runner Jest i wzorzec „test najpierw" w `scripts/shared/__tests__/` (T4 wszedł jako test + helper). Fazy:

- **Faza 1 (test-first) — czerwony test konformancji.** Napisz `rendererCapabilityProfile-test.js` z listą realnych rendererów; na starcie część asercji może wymagać loadera (poniżej). Cel: test, który **dziś** by przeszedł dla poprawnych rendererów, ale **złapałby** sztucznie zepsuty profil (test z fixture: renderer z dwoma `true` → oczekiwany `CapabilityInvariantError`).
- **Faza 2 — agregat + loader (R-A).** `rendererCapabilityProfile.js`: `resolveCapabilities` (hermes-parser, rozwijanie `WithNoPersistence`/`WithNoMutation`), `assertCapabilityExclusivity`, `RendererCapabilityProfile.of`, `MULTI_MODE_RENDERERS`. Test z Fazy 1 zielony.
- **Faza 3 — bramka CI.** Job konformancji w `runtime_build_and_test.yml` obok `check_generated_host_config_forks`.
- **Faza 4 (opcjonalna) — domknięcie 0-`true`.** Rozszerzyć precondition o jawny komunikat dla „zero flag true" (dziś `else if` po prostu nic nie robi — `CompleteWork.js:469/481`); to czyni regułę „dokładnie jedna", nie tylko „nie dwie".

> **Co NIE wchodzi (już zrobione):** test parzystości powierzchni (T4), codegen `.custom`/`.noop` (T2), dedup selektora (T1). Ten plan ich nie dotyka.

### 5.3 Przypadki testowe niezmiennika N4

**Legalne (mają przejść):**
1. DOM → `{mutation:true, persistence:false}` → 1 → OK.
2. Fabric → `{mutation:false, persistence:true}` → 1 → OK.
3. ART, TestHost, markup → mutation-only → OK.
4. noop tryb `mutation` → OK; noop tryb `persistence` → OK (każdy z osobna).

**Nielegalne (mają rzucić `CapabilityInvariantError`):**
5. Fixture: `{mutation:true, persistence:true}` → 2 → rzuca.
6. Fixture: `{mutation:false, persistence:false}` → 0 → rzuca.
7. Renderer wielotrybowy **niezarejestrowany** w `MULTI_MODE_RENDERERS`, a definiujący 2 profile → rzuca (wymusza jawną rejestrację wyjątku).

### 5.4 Load-bearing names do rejestracji

Projekt nie ma formalnego rejestru kontraktów ([U] — `find` po „contract"/„load-bearing"/„registry" w `context/` = 0). Gdyby powstał, zarejestrować:
- `CapabilityInvariantError` — nazwany błąd domenowy (fail-fast N4).
- `RendererCapabilityProfile` / `assertCapabilityExclusivity` — root agregatu + precondition.
- `MULTI_MODE_RENDERERS` — jawny rejestr legalnych wyjątków (dziś: tylko `noop`).
- `scripts/shared/rendererCapabilityProfile.js` — JEDYNE miejsce wiedzy o N4.

---

## Ograniczenia artefaktu

- **Soczewka DDD na bibliotekę** — „agregat" = moduł-strażnik kontraktu build-time, nie encja z persystencją. Egzekucja żyje w teście/CI, nie w runtime (flagi są statycznie eliminowane per build — `01` Architecture Insights).
- **R-A vs R-B nierozstrzygnięte twardo** — rekomendacja R-A oparta na izomorfizmie z `hostConfigForkSurface.js`; ostateczny wybór loadera w Fazie 2.
- **Flow typu-sumy nie wprowadzam** — teoretycznie XOR dałoby się wyrazić typem wariantowym, ale to przepisanie kontraktu flag w 6+ plikach (duży blast radius `01`/research T7); test konformancji to tańsza, lokalna bramka o tym samym efekcie.
- **Cytaty [E]** zweryfikowane w tej sesji: `ReactFiberConfig.js:20`; 7 forków (`ls`); `CompleteWork.js:112-113,469,481`; `ConfigDOM.js:882,297`; `Fabric.js:166,480`; `ART.js:415,252`; `TestHost.js:278,59`; `WithNoPersistence.js:22`, `WithNoMutation.js:22`; `createReactNoop.js:718,915,990-991`; `hostConfigForkSurface.js:22,29` + jego test `:18-29`; `resolveHostConfigFork.js:29` + 3 importery; `generate-host-config-forks.js:31-86`; commity `0f42d0a37`/`e0ddc873e`/`15fbae4e0`.

## Podsumowanie

Niezmiennik #1 z destylacji (A1 Host Config) okazał się **w większości już zabezpieczony**: zmiana `refactor-opportunities` dostarczyła dedup selektora (T1 → `resolveHostConfigFork.js`), codegen przepustek `.custom`/`.noop` (T2 → `generate-host-config-forks.js`) i test parzystości powierzchni 166 symboli (T4 → `hostConfigForkSurface.js`). Dlatego ten plan celuje w **jedyny pozostały, naprawdę nieegzekwowany człon A1: wzajemną wyłączność `supportsMutation` ⊕ `supportsPersistence` per realny renderer**, która statycznie przełącza ścieżkę completion-work reconcilera (`ReactFiberCompleteWork.js:469` vs `:481`), a dziś nie jest pilnowana ani przez Flow (typ `boolean`), ani przez żaden test, ani przez codegen. Diagnoza pokazuje, że błędna kombinacja flag nie zatrzymuje buildu, lecz cicho prowadzi reconciler złą gałęzią — „log-i-jedź dalej" bez logu. Projekt agregatu wprowadza moduł-strażnik `RendererCapabilityProfile` z preconditions rzucającymi nazwany `CapabilityInvariantError`, jednym loaderem flag (R-A, hermes-parser jak w T4) oraz jawnym rejestrem legalnego wyjątku `noop` (`MULTI_MODE_RENDERERS`) zamiast cichego pominięcia. Egzekucja przenosi się z dyscypliny autora forka na test konformancji + bramkę CI obok istniejącego `check_generated_host_config_forks`. Plan jest test-first w 4 fazach z kompletem przypadków legalnych i nielegalnych, świadomie nie dotyka już-ukończonych T1/T2/T4.
