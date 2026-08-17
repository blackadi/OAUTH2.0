# JARM-W6 — vendor report, ready to file

**Status: DRAFTED 2026-08-17. NOT FILED.** Filing is an action outside the working tree; no commit can
discharge it. This file exists so the report is *written* rather than *remembered* — the audit carried
JARM-W6 as `OWED` for three days on the strength of a paragraph in a work-item table, which is not a
report.

**To file:** Authlete support (`support@authlete.com`) or the customer console's support channel. Paste the
body below. Then mark JARM-W6 ✅ in `audit/02-findings/JARM-authorization-response-mode.md` with the ticket
reference, and update `audit/RESUME.md` §0, which names this as the single outstanding item.

**Redaction check before sending:** the body below contains a service ID and a client ID. It contains **no**
bearer token, client secret, key material or end-user data. Keep it that way.

---

## Subject

`/auth/authorization` returns `action: LOCATION` with an HTML document in `responseContent` for
`response_mode=form_post.jwt` when `authorizationSignAlg` is unset (`[A012305]`)

## Summary

For a `response_mode=form_post.jwt` authorization request against a client whose `authorizationSignAlg`
is **not set**, the `/auth/authorization` API answers:

- `action`: **`LOCATION`**
- `resultCode`: **`A012305`**
- `responseContent`: an **HTML document** beginning `<html>`

`action: LOCATION` tells the caller that `responseContent` is a **URL** to put in a `Location` header. Here
it is a complete HTML page. An authorization server that trusts `action` — which is the entire purpose of
the field — emits a `Location` header whose value is an HTML document.

**Expected:** `action: FORM`, which is what the same endpoint returns on **every** other `form_post.jwt`
path we could construct.

## Environment

| | |
|---|---|
| Authlete | 3.0 (`eu.authlete.com`), OpenAPI document 3.0.16 |
| Service | `3693555522` |
| Client | any client whose `responseModes` include `FORM_POST_JWT` and whose `authorizationSignAlg` is **unset** |
| Observed | 2026-08-12, re-characterised 2026-08-14 |

## Minimal reproduction

1. Configure a client with `responseModes` including `FORM_POST_JWT` and **`authorizationSignAlg` unset**.
2. `POST {AUTHLETE_BASE_URL}/api/{serviceId}/auth/authorization` with `parameters` containing
   `client_id=<id>&response_type=code&redirect_uri=<uri>&scope=openid&response_mode=form_post.jwt`.
3. Read `action` and the first characters of `responseContent`.

**Observed:** `action: LOCATION`, `resultCode: A012305`
(*"`authorization_signed_response_alg` … is not set"*), `responseContent` starting `<html>`.

**Expected:** `action: FORM`.

## Why we believe `FORM` is correct here

We built a six-way matrix rather than reporting the first anomaly we saw, and the result narrows the defect
to a single result code:

| Client `authorizationSignAlg` | Request | `action` | Correct? |
|---|---|---|---|
| `ES256` | `form_post.jwt`, success | `FORM` + auto-submitting HTML form | ✅ |
| `ES256` | `form_post.jwt`, unrelated error (`invalid_target`) | `FORM` | ✅ |
| `ES256` | `query.jwt`, success | `LOCATION` + a URL carrying `response=<JWS>` | ✅ |
| **unset** | **`form_post.jwt`** | **`LOCATION` + `<html>…`** | ❌ **this report** |

So the HTML body is right for the response mode, and only the `action` label is wrong. It looks like the
`[A012305]` error path builds the `form_post` body correctly and then falls through to the default
`LOCATION` label instead of `FORM`.

## Impact

Low in practice, and we want to be straightforward about that: the trigger is a **misconfiguration**, and
correcting the configuration removes it. We are reporting it because the failure is *silent and typed
wrongly* — a caller that switches on `action`, as the API intends, produces a malformed HTTP response rather
than an error. That is harder to diagnose than a plain error would be, and the misconfiguration that
triggers it (`form_post.jwt` advertised while `authorizationSignAlg` is unset) is an easy state to be in,
because `response_modes_supported` advertises all four JARM modes by Authlete default while
`authorizationSignAlg` has no default.

No workaround is needed on our deployment; we set `authorizationSignAlg = ES256` on 2026-08-12.

## One observation that may be worth more than the bug

A defect that disappears once you configure the feature is easy to mistake for a defect *in* the feature.
Our first characterisation concluded that `form_post.jwt` was broken on the error path generally. It is not
— every probe available to us at the time happened to be an `[A012305]` request, because the feature was
unconfigured, so the only error path we could reach was the one that is broken. The matrix above is what
distinguished them, and it only became constructible after a working client existed.
