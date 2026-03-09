# Repository Guidelines

## Project Structure & Module Organization
This repository is a static frontend travel-map prototype with a small Python toolchain.

- `index.html`, `style.css`: page shell and global styling.
- `src/`: frontend modules. Keep orchestration in `main.js`; map setup in `map-view.js`; route rendering in `route-layer.js`; markers and popups in `marker-layer.js`; data parsing and formatting in focused utility modules.
- `data/`: source-of-truth content files such as `locations.csv`, `itinerary.json`, `schema.json`, `icons.json`, and `route_cache.json`.
- `assets/`: static media and vendored frontend libraries. Keep Leaflet under `assets/vendor/leaflet/`; put real trip photos in `assets/images/`; keep fallback art in `assets/placeholders/`.
- `tools/`: local developer scripts like `serve.py`, `validate_data.py`, `prefetch_routes.py`, and `scaffold_trip.py`.

## Build, Test, and Development Commands
- `.\.venv\Scripts\Activate.ps1`: activate the local Python environment.
- `python tools\prefetch_routes.py`: fetch and cache route data into `data/route_cache.json`.
- `python tools\serve.py`: run a local static server at `http://127.0.0.1:8000`.
- `python tools\validate_data.py`: validate CSV/JSON structure, IDs, coordinates, route cache coverage, and cross-file references.
- `python -m py_compile tools\serve.py tools\scaffold_trip.py tools\validate_data.py tools\prefetch_routes.py`: quick syntax check for Python tools.

Use local HTTP serving, not `file://`, because the app loads data with `fetch`.

## Coding Style & Naming Conventions
- Use 4 spaces for Python, 2 spaces for HTML/CSS/JSON formatting already present in repo files.
- JavaScript modules use ES modules and `camelCase` for functions and variables.
- File names use lowercase kebab or plain lowercase by existing pattern: `map-view.js`, `data-loader.js`.
- IDs in `data/locations.csv` and `data/itinerary.json` must be stable, lowercase, and underscore-separated, for example `intercontinental_hotel`.
- Keep comments short and only where logic is not obvious.

## Testing Guidelines
There is no formal browser test suite yet. Minimum contribution bar:

- Run `python tools\validate_data.py` after any data change.
- Re-run `python tools\serve.py` and smoke test the affected day view in a browser.
- If you change Python tooling, run `py_compile` as above.

## Commit & Pull Request Guidelines
This folder currently has no Git history, so use a simple convention:

- Commit format: `type: brief summary` such as `feat: add day 3 candidate stops` or `fix: swap AMap SDK for Leaflet`.
- Keep commits scoped to one concern.
- PRs should include: what changed, affected files, manual test steps, and screenshots for UI changes.

## Security & Configuration Tips
- Do not commit real AMap keys. Only `tools/prefetch_routes.py` should consume `AMAP_API_KEY`, and only for route prefetch.
- Keep runtime frontend assets local. The final page should only depend on network for map tiles.
- Respect AMap rate limits. Batch route or geocoding work should go through a throttled helper, not parallel bursts.

## Collaboration Expectations
- Use first-principles thinking. Start from the raw requirement and problem, not from assumptions about user intent.
- Do not assume the user already knows the exact goal or the shortest path to it.
- If motivation or target state is unclear, stop and discuss before implementing.
- If the requested path is workable but not the shortest or safest, say so and recommend a better option.
