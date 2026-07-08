# cerveaubleu-drc-esm-orders-app

Custom OpenMRS 3.x frontend module for the DRC EMR distribution.

## Features

- **Home dashboards** — *Radiology and Imaging* and *Procedures* entries in the
  home left nav, each opening a lab-style fulfillment dashboard: metrics cards,
  status tabs (active orders / worklist / referred / in review / approved /
  not done), orders grouped by patient, and actions (pick, reject with reason,
  enter results, print report).
- **Patient chart tab** — *Radiology and Imaging* dashboard on the patient
  chart showing the patient's imaging orders and results.
- **Order basket panels** *(optional)* — imaging / procedure / medical-supply
  order panels with dedicated order workspaces. Distributions that already use
  the native general order types can remove them via config:

  ```json
  "@openmrs/esm-patient-orders-app": {
    "extensionSlots": {
      "order-basket-slot": {
        "remove": ["imaging-order-panel", "procedures-order-panel", "medical-supply-order-panel"]
      }
    }
  }
  ```

## Configuration

```json
"cerveaubleu-drc-esm-orders-app": {
  "imaging":       { "orderTypeUuid": "…", "conceptSetUuid": "…" },
  "procedure":     { "orderTypeUuid": "…", "conceptSetUuid": "…" },
  "medicalSupply": { "orderTypeUuid": "…", "conceptSetUuid": "…" }
}
```

Each `orderTypeUuid` is the OpenMRS OrderType to list/fulfill; each
`conceptSetUuid` is the convenience set whose members are the orderable
concepts.

## Build

Requires Node ≥ 20 and Yarn 4 (via corepack).

```sh
yarn install
yarn build     # → dist/cerveaubleu-drc-esm-orders-app.js
```

The committed `yarn.lock` pins the dependency tree the app was developed and
tested against (framework `9.0.3-pre.4092`); keep it when building for
reproducible output.

## Integrating into a distribution

Add the built `dist/` to the assembled SPA as
`cerveaubleu-drc-esm-orders-app-<version>/`, plus:

- `importmap.json` → `"cerveaubleu-drc-esm-orders-app": "./cerveaubleu-drc-esm-orders-app-<version>/cerveaubleu-drc-esm-orders-app.js"`
- `routes.registry.json` → `"cerveaubleu-drc-esm-orders-app": <contents of dist/routes.json>`

## License

MPL-2.0
