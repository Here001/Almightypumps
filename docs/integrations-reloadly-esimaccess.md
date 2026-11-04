# Reloadly and eSIM Access: integration notes (not yet built)

Official docs (docs.reloadly.com, docs.esimaccess.com) are not reachable from the Claude cloud sandbox.
These notes come from public client code and doc copies on GitHub (2026-11-04). Verify every call against
the real API (sandbox keys / small test) before relying on it.

## eSIM Access (Redtea Mobile) – travel data eSIMs
- Base: `https://api.esimaccess.com/api/v1/open`, all calls `POST` with JSON body.
- Headers on every request: `RT-AccessCode`, `RT-RequestID` (uuid), `RT-Timestamp` (ms since epoch),
  `RT-Signature` = HMAC-SHA256(key = SecretKey, data = timestamp + requestId + accessCode + body), hex
  (one source says UPPERCASE hex), `Content-Type: application/json`.
- Responses: `{ success, errorCode, errorMessage, obj }`.
- `/package/list` body `{ locationCode?: "JP" | "!RG" | "!GL", type?: "BASE" | "TOPUP", packageCode?, slug?, iccid? }`
  → `obj.packageList[]`: packageCode, slug, name, price (USD × 10,000; 10000 = $1.00), currencyCode, volume (bytes),
  duration, durationUnit, location, description, activeType, unusedValidTime.
- `/esim/order` body `{ transactionId (our unique id), packageInfoList: [{ packageCode | slug, count, price? }], amount? }`
  → `obj.orderNo`. Sending price/amount makes them reject if it changed (good: protects our margin).
- `/esim/query` body `{ orderNo | iccid | esimTranNo, pager: { pageNum: 1, pageSize: 50 } }` → `obj.esimList[]`:
  esimTranNo, orderNo, iccid, ac (activation code, LPA:1$…), qrCodeUrl, smdpStatus, esimStatus (e.g. GOT_RESOURCE),
  expiredTime, totalVolume, totalDuration, durationUnit, orderUsage. Profiles may take a few seconds after ordering:
  poll, or use the ORDER_STATUS webhook (signed with RT-Signature).
- `/balance/query` → balance (USD × 10,000). `/esim/usage/query` { esimTranNoList }. `/esim/topup`.
- No sandbox reportedly: test with the cheapest package and a small deposit. Rate limit ~8 req/s.

## Reloadly – gift cards and airtime/data
- Token: `POST https://auth.reloadly.com/oauth/token` JSON `{ client_id, client_secret, grant_type: "client_credentials",
  audience }`; audience = base URL of the product (e.g. `https://giftcards-sandbox.reloadly.com`). Bearer token, cache
  until `expires_in`.
- Gift cards: base `https://giftcards[-sandbox].reloadly.com`, header `Accept: application/com.reloadly.giftcards-v1+json`.
  Products by country, place order (productId, countryCode, quantity, unitPrice, customIdentifier, senderName,
  recipientEmail), then redeem codes for the transaction (cardNumber, pinCode). Account balance endpoint.
- Airtime/data: base `https://topups[-sandbox].reloadly.com`, header `Accept: application/com.reloadly.topups-v1+json`.
  `GET /operators/auto-detect/phone/{phone}/countries/NG`, `GET /operators/countries/NG`,
  `POST /topups { operatorId, amount, useLocalAmount, customIdentifier, recipientPhone: { countryCode, number } }`.
- Env (owner adds in Vercel): RELOADLY_CLIENT_ID / RELOADLY_CLIENT_SECRET (sandbox on Preview, live on Production),
  ESIMACCESS_ACCESS_CODE / ESIMACCESS_SECRET_KEY.
