---
change_id: host-config-seam
title: Analyze the host-config seam between react-reconciler and concrete renderers
status: preparing
created: 2026-06-21
updated: 2026-06-21
archived_at: null
---

## Notes

Analiza szwu host-config: jak react-reconciler definiuje kontrakt renderera (ReactFiberConfig), jak Rollup/Jest/Flow podmieniają shim na konkretny fork (dom/fabric/noop/…) i jak ReactFiberConfigDOM go realizuje.
