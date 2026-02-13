# Payments Implementation Status

## Current State: Infrastructure Complete, No Payment Processor

`REQUIRE_PAYMENT` is `False` in `config.py` — all gating is bypassed.

## What's Built

### Backend

| Component | File | Status |
|-----------|------|--------|
| `Subscription` model (`user_id`, `paid_until`, `created_at`) | `models.py` | Done |
| `requires_subscription` decorator (returns 402 when expired) | `app.py` | Done |
| `REQUIRE_PAYMENT` feature flag | `config.py` | Done (set to `False`) |
| `/api/subscription/status` endpoint (ungated) | `app.py` | Done |
| Decorator applied to all server-gated routes | `app.py` | Done |

**Gated routes:** `/api/sync`, `/api/chart` (DELETE), `/api/chart/leave` (DELETE), `/api/share/edit`, `/api/chart/<id>/poll`, `/api/chart/<id>/shared`, `/api/account-link` (POST + GET), and the Socket.IO `subscribe_chart` handler.

### Client-Side

| Component | File | Status |
|-----------|------|--------|
| `paid_until` cached in IndexedDB | `static/Server/init.js` | Done |
| Fresh status fetched from server on init | `static/Server/init.js` | Done |
| `body[data-subscription]` attribute (`active` / `expired`) | `static/Server/init.js` | Done |
| 402 responses emit `SUBSCRIPTION_EXPIRED` event | `static/Server/client-api.js` | Done |
| `SUBSCRIPTION_EXPIRED` listener locks client immediately | `static/Server/init.js` | Done |

### Flow When Enabled

1. Client boots, loads cached `paid_until` from IndexedDB (no flicker).
2. Background fetch to `/api/subscription/status` refreshes the value.
3. `body.dataset.subscription` set to `active` or `expired`.
4. If any API call returns 402, `SUBSCRIPTION_EXPIRED` fires and `paid_until` is set to `0`.
5. Server checks `Subscription.paid_until` against current Unix time on every gated route.

## What's Missing

### Payment Processor (not started)

- No Stripe (or alternative) SDK, API keys, or config.
- No checkout session creation endpoint.
- No webhook handler to create/update `Subscription` rows.
- No billing portal or subscription management route.

### UI (not started)

- `body[data-subscription="expired"]` is set but nothing consumes it.
- No paywall banner, upgrade prompt, or feature-degradation styles.
- No pricing page or checkout redirect.

### Operational

- No mechanism to populate `Subscription` rows (manual DB insert is the only option today).
- No subscription expiry notifications or grace period logic.
- No trial period support.

## Enabling Payments

Flipping `REQUIRE_PAYMENT = True` without a payment processor would 402-block all sync and sharing for every user. The minimum to go live:

1. Integrate a payment processor (Stripe recommended) with a checkout endpoint and webhook.
2. Webhook creates/updates `Subscription` rows with `paid_until` timestamps.
3. Add UI that reacts to `body[data-subscription="expired"]` to show an upgrade prompt.
4. Set `REQUIRE_PAYMENT = True`.
