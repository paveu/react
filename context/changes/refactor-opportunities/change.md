---
change_id: refactor-opportunities
title: Rank documented tech-debt and structural risks into prioritized refactor opportunities
status: implemented
created: 2026-06-21
updated: 2026-06-21
archived_at: null
---

## Notes

Intencja: mamy analizę tego repozytorium, która dokumentuje dług techniczny
i ryzyka strukturalne: context/changes/host-config-seam/research.md.
Ta zmiana odpowiada na pytanie, które tamta analiza celowo zostawiła otwarte:
KTÓRE z tych problemów warto naprawić, w jakim docelowym kształcie
i w jakiej kolejności.
Eksplorujemy każdy zapisany problem w kodzie i historii,
a potem porządkujemy je jako refactor opportunities.
Zmiana przebiega etapami: eksploracja → decyzja i plan → implementacja.
Na etapie eksploracji nie dzieje się żaden refaktor i nie zapada żadna decyzja.
Wynik eksploracji: research.md tej zmiany, zakończony rankingiem opcji z trade-offami.
Najpierw przeczytam raport; decyzja, co realizujemy, zapada na etapie planowania,
a refaktor rusza dopiero według przyjętego planu.

▎ Nowa zmiana to refactor-opportunities. Bazowa analiza (host-config-seam) zostaje nietknięta jako prior — research-only nie jest sierotą, jego produktem jest raport, który czyta następna zmiana.
