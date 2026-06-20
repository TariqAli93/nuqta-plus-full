# Online Commerce — Integration Extension Points (Design)

> Status: **Design + scaffolding only.** No integration is implemented. The
> registry maps every source to a 501 stub; there are no routes, controllers,
> DB migrations, or live wiring in this change. This document defines the seams
> so each future integration is a drop-in.

## 1. Goal
Let future inbound sources — **Facebook Leads, WhatsApp API, Telegram Bot,
Shopify, WooCommerce, Custom Store API** — create [online orders](./online-sales-channels-design.md)
through one uniform, well-guarded path, without touching existing modules.

## 2. The mental model (symmetry with Delivery)
The Delivery module already established a provider-adapter + registry pattern for
pushing shipments **out** to couriers. Inbound integrations are the mirror image
— pulling orders/leads **in** from channels — and reuse the exact same shape, so
the team has one model for "plug in an external provider".

```
            OUTBOUND (exists)                     INBOUND (these extension points)
  deliveryService → adapters/registry      ingestionService(future) → integrations/registry
        → Boxy / Custom / stubs                  → Shopify / WhatsApp / … (all stubs today)
```

## 3. The three seams (what's scaffolded now)

### 3a. Source-adapter contract — `src/services/integrations/sourceAdapter.js`
Every integration is a factory `create<Name>Source(integration)` returning:
- `verifyWebhook({ rawBody, headers, payload })` → `{ ok, verified }` — HMAC/secret check over the **raw** body (same approach as the delivery webhook verifier).
- `parseInbound(payload, headers)` → `{ ok, externalId, normalized }` — maps the raw provider payload to the **one normalized shape**.
- optional `pushStatus(externalId, status)` — one-way sources omit it.

Adapters are pure translators: **they never touch the DB.**

### 3b. Normalized inbound shape — `src/constants/integrations.js`
`NORMALIZED_INBOUND_ORDER_SHAPE` is the data contract every adapter emits:
`{ source, externalId, channelCode, customer{name,phone,address,province}, notes, totalAmount?, items[]?, raw, occurredAt? }`.
It maps 1:1 onto `online_orders` (+ items), so the ingestion service creates orders via the existing `onlineOrderService.create` — no new write path.

### 3c. Registry — `src/services/integrations/registry.js`
`resolveSource(integration)` / `listSources()`. All six sources are registered
as `createUnsupportedSource` (501) stubs today; `IMPLEMENTED_SOURCES` is empty.
Going live = replace one entry, register the key in `IMPLEMENTED_SOURCES`.

## 4. The ingestion pipeline (future — documented, NOT built)
A future `ingestionService.ingest(sourceKey, rawBody, headers)`:
1. `resolveSource(sourceKey)` → adapter.
2. `adapter.verifyWebhook({rawBody, headers})` → `401` on failure.
3. `adapter.parseInbound(payload)` → normalized order.
4. **Idempotency**: look up `online_orders` by `(source, external_id)` → skip if present (providers retry; e-commerce resends). DB unique index is the race-safe backstop — same technique as `delivery_events.dedupe_key` and `sales.online_order_id`.
5. Resolve `channelCode` → `sales_channels` (channels are operator-extensible, so a `SHOPIFY` channel can be added at runtime — no migration).
6. `onlineOrderService.create(normalized→payload, systemUser)`, then stamp `source`, `external_id`, `external_payload` on the order.

Entry point (future): a single unauthenticated `POST /api/integrations/:source/webhook` (verified by the adapter's signature check, **not** RBAC — exactly like the delivery webhook route).

## 5. Required schema — DEFERRED (add with the FIRST integration, not now)
These are documented here, intentionally **not migrated**, to avoid unused columns:
- `online_orders`: add `source text`, `external_id text`, `external_payload jsonb`; **partial UNIQUE (source, external_id) WHERE external_id IS NOT NULL** for idempotency.
- New `integration_sources` table (mirror of `delivery_providers`): `id, key (unique), name, is_active, config jsonb, api_key_encrypted, webhook_secret_encrypted, …`. Secrets use the existing `notifications/crypto.js` AES-GCM helper — **credentials never reach the frontend** (masked, like delivery providers).
- Suggested master gate: a `onlineCommerceIntegrations` feature flag.

## 6. Per-source notes (confirm against each provider's live docs before building)
| Source | Kind | Channel | Webhook / auth (advisory) |
|---|---|---|---|
| Facebook Leads | lead | FACEBOOK | Graph leadgen webhook; verify `X-Hub-Signature-256` HMAC; fetch lead by `leadgen_id` |
| WhatsApp API | lead | WHATSAPP | Cloud API messages webhook; `X-Hub-Signature-256`; message → manual/AI-parsed order |
| Telegram Bot | lead | TELEGRAM | `setWebhook` updates; verify `X-Telegram-Bot-Api-Secret-Token` |
| Shopify | order | WEBSITE | `orders/create`; verify base64 HMAC `X-Shopify-Hmac-Sha256` |
| WooCommerce | order | WEBSITE | `order.created`; verify base64 HMAC `X-WC-Webhook-Signature` |
| Custom Store API | order | WEBSITE | our documented contract; configurable HMAC header or bearer |

Leads (FB/WhatsApp/Telegram) typically create a `NEW` order from contact info
(few/no line items → `totalAmount` optional, items free-text — `online_orders`
already supports item-less and non-catalog lines). Store orders (Shopify/Woo/
Custom) arrive with full carts → mapped to order items.

## 7. How to add an integration (the recipe)
1. Write `src/services/integrations/sources/<name>.js` implementing the §3a contract.
2. Register it in `registry.js` and add its key to `IMPLEMENTED_SOURCES`.
3. Add the §5 schema (first integration only) + an `integration_sources` row with credentials.
4. Add the ingestion route + service (first integration only).
No change to `online_orders`, `sales`, delivery, or reports is needed beyond §5.

## 8. Risks / guardrails
- **Idempotency is mandatory** before any integration goes live (§4.4) — webhooks WILL be replayed.
- **Signature verification over the raw body** is mandatory (the webhook route is public). Reuse the delivery raw-body capture + HMAC verifier pattern.
- **Credentials stay server-side**, encrypted at rest, masked in any API response (delivery-provider precedent).
- **Channel mapping** is data-driven (no enum) — new marketplaces don't need code changes to be attributable.
- Keep adapters **side-effect free** (translate only); all DB writes funnel through `onlineOrderService` so order validation/history stay centralized.
