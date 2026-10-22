# Plan: Render Blueprint is not linked to the live service (issue #130)
Risk tier: Low. One value in render.yaml; the service type, domain and settings do not change.
Domain skills: none apply (hosting config only).

## Acceptance criteria
1. `render.yaml` names the service `mapthevote-stl`, the live service's name (owner request).
2. `src/test/render.test.js` passes; it checks the service shape, not the name.
3. After merge, a Blueprint sync updates the live service instead of trying to create one, and `npm run smoke -- https://mapthevotestl.com` passes (owner runs the sync).

## Files that change
- `render.yaml`: `name: mapthevote-stl`.

## Risks
- If the Blueprint was created under the old name, the sync could still try to create a service. The owner checks the sync preview before applying it.

## Proof
`npm test` (render.test), then the owner's sync and the production smoke test.
