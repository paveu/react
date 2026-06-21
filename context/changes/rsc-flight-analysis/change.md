---
change-id: rsc-flight-analysis
title: "Analiza przepływu RSC/Flight (react-server ↔ react-client)"
status: preparing
created: 2026-06-21
updated: 2026-06-21
---

# rsc-flight-analysis

Analiza-only: przepływ RSC/Flight (serializacja → transport → deserializacja)
między `react-server` i `react-client`. Entry pointy (z mapy):
`packages/react-server/src/ReactFlightServer.js` i
`packages/react-client/src/ReactFlightClient.js` — czytane jako para (kontrakt klient↔serwer).

Wynik: `research.md` (stan obecny repo, bez zmian w kodzie).
