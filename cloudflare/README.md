# Life Activities Worker

Backend spike for GitHub issue #3.

## Routes
- `GET /health`
- `POST /v1/devices` — register the ActivityKit push-to-start token.
- `POST /v1/activity-token` — register the per-activity update token after remote start.
- `POST /webhooks/notion` — map Notion `In Progress` to APNs start and `Done` to APNs end.

## Secrets
Set with `wrangler secret put <NAME>`:
- `API_SECRET`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY` — contents of the APNs .p8 private key.
- `APPLE_BUNDLE_ID`
- `NOTION_WEBHOOK_SECRET` — optional extra shared secret if the Notion delivery path can attach it.

Set `APNS_ENVIRONMENT=production` only for production-signed device tokens; otherwise sandbox is used.

## First deployment
Cloudflare can provision the D1 binding declared in `wrangler.jsonc` on deploy. After the database exists, apply `migrations/0001_initial.sql`.

The worker deliberately keeps Notion authoritative. D1 stores only delivery/lifecycle metadata and idempotency records.
