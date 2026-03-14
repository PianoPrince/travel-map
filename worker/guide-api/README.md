# Guide API Worker

Cloudflare Worker + KV for shared guide overrides.

## Endpoints

- `GET /api/guides?tripId=<tripId>`
- `PUT /api/guides/<guideKey>` with JSON body:

```json
{
  "tripId": "xishuangbanna-2026-03",
  "markdown": "## New guide"
}
```

`PUT` requires header `X-Edit-Token`.

## Required env

- `GUIDE_KV` (KV namespace binding)
- `EDIT_TOKEN` (secret)
- `ALLOWED_ORIGINS` (comma-separated origins)

## Deploy

```bash
wrangler kv namespace create GUIDE_KV
wrangler secret put EDIT_TOKEN
wrangler deploy
```
