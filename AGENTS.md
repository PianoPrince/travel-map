# Repository Guidelines

## Project Structure & Module Organization
- `index.html`, `style.css`: page shell and global styling.
- `src/`: frontend code. Keep page orchestration in `main.js`; map setup in `map-view.js`; markers and popups in `marker-layer.js`; route rendering in `route-layer.js`; shared helpers in `formatters.js`.
- `data/`: source-of-truth content files such as `locations.csv`, `itinerary.json`, `icons.json`, and `route_cache.json`.
- `assets/`: static media and vendored frontend libraries. Keep Leaflet under `assets/vendor/leaflet/`; trip photos belong in `assets/images/`; placeholders go in `assets/placeholders/`.
- `tools/`: local scripts like `serve.py`, `validate_data.py`, and `prefetch_routes.py`.

## Build, Test, and Development Commands
- `.\.venv\Scripts\Activate.ps1`: activate the local Python environment.
- `python tools\prefetch_routes.py`: refresh route cache into `data/route_cache.json`.
- `python tools\serve.py`: run a local static server at `http://127.0.0.1:8000`.
- `python tools\validate_data.py`: validate IDs, coordinates, cross-file references, and route cache coverage.
- `python -m py_compile tools\serve.py tools\validate_data.py tools\prefetch_routes.py`: quick syntax check for Python tools.

Use local HTTP serving, not `file://`, because the app loads data with `fetch`.

## Coding Style & Naming Conventions
- Use 4 spaces for Python and 2 spaces for HTML/CSS/JSON formatting already present in this repo.
- JavaScript uses ES modules and `camelCase` names.
- File names stay lowercase and descriptive, for example `map-view.js` or `route-layer.js`.
- IDs in `data/locations.csv` and `data/itinerary.json` must stay stable, lowercase, and underscore-separated.
- Prefer deleting unused features over adding abstractions. Keep comments short and only where logic is not obvious.

## Testing Guidelines
- Run `python tools\validate_data.py` after any data change.
- Re-run `python tools\serve.py` and smoke test the affected day view in a browser.
- If you change Python tooling, run `py_compile` as above.

## Commit & Pull Request Guidelines
- Commit format: `type: brief summary`, for example `feat: ship travel map v1` or `fix: simplify guide toggle`.
- Keep each commit scoped to one concern.
- PRs should include what changed, affected files, manual test steps, and screenshots for UI changes.

## Security & Configuration Tips
- Do not commit real AMap keys. Only `tools/prefetch_routes.py` should consume `AMAP_API_KEY`.
- Keep runtime frontend assets local. The final page should only depend on network for map tiles.
- Respect AMap rate limits. Batch route work should go through a throttled helper, not parallel bursts.

## Collaboration Expectations
- Use first-principles thinking. Start from the raw requirement and problem, not from assumptions about user intent.
- Do not assume the user already knows the exact goal or the shortest path to it.
- If motivation or target state is unclear, stop and discuss before implementing.
- If the requested path is workable but not the shortest or safest, say so and recommend a better option.
