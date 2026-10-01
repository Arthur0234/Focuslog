# Life Activities Worker

Backend spike for GitHub issue #3.

## Routes
- `GET /health`
- `POST /v1/devices` — register the ActivityKit push-to-start token.
- `POST /v1/activity-token` — register the per-activity update token after remote start.
- `POST /webhooks/notion` — receive `page.properties_updated`, fetch the authoritative page from Notion, then map `In Progress` to APNs start and `Done` to APNs end.

## Secrets
Set with `wrangler secret put <NAME>`:
- `API_SECRET`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY` — contents of the APNs .p8 private key.
- `APPLE_BUNDLE_ID`
- `NOTION_API_KEY`
- `NOTION_VERIFICATION_TOKEN` — the one-time token Notion sends while creating the webhook subscription; it is then used to verify `X-Notion-Signature`.

Set `APNS_ENVIRONMENT=production` only for production-signed device tokens; otherwise sandbox is used.

## Notion webhook setup
Subscribe only to `page.properties_updated` for the spike. Notion webhook events are signals rather than full page snapshots, so the Worker retrieves the changed page with the Notion API and reads its current Status/Title.

On initial subscription creation, the Worker logs `NOTION_VERIFICATION_TOKEN`. Copy that value into Notion's verification dialog and then store the same value as the Worker secret `NOTION_VERIFICATION_TOKEN`.

## First deployment
Cloudflare can provision the D1 binding declared in `wrangler.jsonc` on deploy. After the database exists, apply `migrations/0001_initial.sql`.

The Worker deliberately keeps Notion authoritative. D1 stores only delivery/lifecycle metadata and idempotency records.

## Current spike limitations
- Single-user / latest registered device only.
- One Notion Status property named `Status` (case-insensitive fallback included) and title property named `Name`, `Title`, or `title`.
- No reconciliation cron yet; that belongs to the recovery workstream after the physical-device vertical slice.
