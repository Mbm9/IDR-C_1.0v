# API keys (machine access)

API keys let machines such as a SIEM or a SOAR playbook push data into
Identity Radar without a user session.

## Availability

- To create keys, the organization's subscription must have `api_access = true`
  (Professional or Enterprise tier). Organizations created through onboarding
  start on the free tier, which has no API access.
- The seeded demo organization (Acme Financial Services) is on the Enterprise
  tier, so keys can be demonstrated straight away.
- Only users with the `admin` role can create or revoke keys:
  **Settings → API keys**, or `POST` / `DELETE /api/settings/api-keys`.

## Creating a key

```bash
curl -X POST https://radar.example.com/api/settings/api-keys \
  -H 'Content-Type: application/json' \
  -b '<admin session cookie>' \
  -d '{"label": "Splunk HEC forwarder", "expiresInDays": 365}'
# → {"key":"idr_3f9c…","prefix":"idr_3f9c1a2b","expiresAt":"…"}
```

- The full key (`idr_` followed by 64 hex characters) is shown **once**. Store
  it in the client's secret store. The server keeps only a bcrypt hash and the
  12-character prefix, which the UI shows so you can tell keys apart.
- `expiresInDays` is optional (1–730). A key without it stays valid until it
  is revoked.
- Creating and revoking a key are both written to the audit trail
  (`manage_api_key`).

## Using a key

Send the key as a bearer token:

```bash
curl -X POST https://radar.example.com/api/events/ingest \
  -H 'Authorization: Bearer idr_<64 hex>' \
  -H 'Content-Type: application/json' \
  -d '{"events":[{"eventType":"login_success","source":"splunk",
                  "eventTimestamp":"2026-10-13T07:00:00Z",
                  "upn":"jdoe@acmefs.local","ipAddress":"10.1.2.3"}]}'
# → {"inserted":1,"resolved":1,"unresolved":0,"skipped":0}
```

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/events/ingest` | POST | Push identity events (batches of up to 1000) |

Keys are accepted **only** on the endpoints in this table (the allow-list is
`API_KEY_PATHS` in `src/lib/auth/api-key-token.ts`). Every other `/api/*` route
still requires a dashboard session, and a key sent there gets `401`.

A key acts with **analyst-level** permission, for ingest only, inside the
organization that owns the key. Events can never be written into another
organization.

## Verification and limits

- Middleware lets a request with an `Authorization: Bearer idr_…` header
  through to allow-listed paths without a session. The route handler then
  verifies the key (`verifyApiKey` in `src/lib/auth/api-key.ts`, Node runtime). It
  looks the key up by prefix, bcrypt-compares the full key, and rejects keys
  that are revoked, expired or unknown with `401`. A request that presents a
  key is never silently treated as session-authenticated.
- `last_used_at` is updated on successful use, at most once a minute per key.
- Rate limiting applies **per key prefix** using the `api` bucket
  (`RATE_LIMIT_API_PER_MIN`, default 300 requests per minute). Exceeding it
  returns `429` with `Retry-After`.

## Rotation and revocation

1. Create a new key and deploy it to the client.
2. Confirm traffic is flowing (`lastUsedAt` in `GET /api/settings/api-keys` updates).
3. Revoke the old key (the delete button in **Settings → API keys**). Revocation takes effect
   on the next request.

If a key may have leaked, revoke it right away. The audit log
(`manage_api_key`) records who created and revoked each key.
