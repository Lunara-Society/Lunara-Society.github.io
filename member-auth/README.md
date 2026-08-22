# Member authentication

The member area's sign-in and registration.

## What was wrong

`member.html` called four Base44 functions — `lunaraGoogleAuth`,
`lunaraLogin`, `lunaraSignup` and `lunaraVerifySession`. Every one of
them returned:

```
404  {"error":"Backend function not found or not deployed"}
```

Not a bug in the form. There was no server on the other end of it, and
there never had been. Nobody could register and nobody could sign in.
`shieldMemberStatus` in the same app does answer, which is why the
dashboard half of the page looked alive.

## What replaced it

A Supabase edge function on the project `xkriotfcoialxmqvherb`:

```
https://xkriotfcoialxmqvherb.supabase.co/functions/v1/lunara-auth
```

| Route      | Body                                            | Answers                |
|------------|-------------------------------------------------|------------------------|
| `/google`  | `{ id_token }`                                  | a session, or 401      |
| `/signup`  | `{ email, password, full_name, paypal_txn }`    | a session, or 400/409  |
| `/login`   | `{ identifier, password }`                      | a session, or 401      |
| `/session` | `{ session_token }`                             | who it belongs to      |

`identifier` takes either an email address or a Lunara ID, because the
form asks for "Lunara ID or email". The action may also travel in the
body as `{ "action": "login", ... }`.

A session is `{ success, session_token, lunara_id, full_name, tier,
email, member_since, is_new }`. Nothing else is ever returned about a
member — no hash, no salt, no PayPal reference, no Google subject, and
there is a test that fails if any of them start appearing.

## The Lunara ID

    LUNA-7K2M-94RT

It was `LUN-BUS-2026-00001284`, and that was wrong three ways.

`BUS` was meant to read "business". It reads "bus". It also encodes a
category into a permanent identifier, which breaks the first time a
person registers rather than a company — which is exactly what the
Google button does. An identifier that has to change when the thing it
names is reclassified is not a permanent identifier.

And `00001284` is a counter. A sequential number tells every holder,
and everyone they show the card to, how many registrations came before
them. This institution has already published one correction about
overstating its size. A number that understates it in public,
permanently, on every member's credential, is the same mistake pointing
the other way.

The alphabet is Crockford's base 32 — the digits and the letters with
**I, L, O and U** removed. I and L cannot be misread as 1, O cannot be
misread as 0, and without U the groups cannot spell anything anyone
would rather not read aloud. Each group additionally carries at least
one digit, which rules out the rest. About 6.6 × 10¹¹ identifiers.

Minting checks for collision before issuing. At this scale a clash is
vanishingly unlikely, which is exactly why it would never be caught by
testing and exactly why it would be catastrophic — the symptom is one
member signing in as another.

The prefix is `LUNA`, the institution's name rather than an
abbreviation of it.

`LUN-XXXX-XXXX`, `LUN-BUS-…` and `LUN-MEM-…` are all still accepted at
sign-in. Nothing was ever issued under any of them; the table was empty
at each change. They are accepted so that anyone who wrote one down off
an old screen meets a sign-in failure rather than a validation error,
which is a different and more confusing thing. The branches cannot
collide — `LUNA-7K2M-94RT` has a letter where the `LUN-` branch
requires its first separator.

## The files

| | |
|---|---|
| `auth-core.mjs` | All of the logic. Plain JavaScript over Web Crypto and `fetch`, with storage injected. |
| `index.ts` | The Deno entry point. Only two things: where members are kept, and where the signing key comes from. |
| `test_auth.mjs` | 84 tests. `node member-auth/test_auth.mjs`. Runs in CI on every deploy. |

The split exists so that the code the tests run is the code that
serves the site. The deployed function hands `auth-core.mjs` a
Postgres-backed store; the suite hands it a `Map`. Neither one is a
different program.

## Decisions worth knowing

**Google ID tokens are verified, not decoded.** The signature is
checked against Google's published JWKS with Web Crypto, then the
audience, the issuer, the expiry and `email_verified`. A decoded JWT
proves nothing — anyone can mint one with any address in it. The test
suite generates a real RSA keypair and signs real tokens, including
tokens signed by the wrong key and tokens claiming `alg: none`, so a
regression in that check fails the build rather than letting anyone
sign in as anyone.

**Nothing tells a caller why it said no.** Wrong password and unknown
address give the same 401 with the same sentence; a signup on a taken
address says "that address cannot be registered", not "that address is
taken". Otherwise the endpoints are a directory of who is a member.
Rejection reasons go to the log.

**The members table is sealed.** `public.members` has row level
security enabled and no policies at all, so the anon and publishable
keys can read nothing from it. Only the edge function, holding the
service role key, can see a row. Verified by asking with both keys and
getting `42501 permission denied`. This is why the member page carries
no Supabase key: it does not need one.

**Passwords** are PBKDF2-SHA256, 210,000 iterations, 16-byte per-member
salt. The plaintext is never stored and never logged.

**Sessions** are an HMAC over `{ email, exp }`, valid 30 days. Nothing
is looked up to check one and nothing is swept up when one expires. The
signing key is derived from the service role key by HKDF with a label,
so there is no fifth secret to lose; set `LUNARA_SESSION_SECRET` to
override. Rotating the service key invalidates every session.

**`verify_jwt` is disabled on the function**, deliberately. This is how
a person obtains a token in the first place; requiring one to reach it
would be a closed loop. It authenticates its own callers.

**The PayPal transaction id is recorded, not verified.** Nothing checks
it against PayPal, so it is stored with `payment_verified: false` and
grants no tier. A field that looks validated and is not is worse than
one that openly is not — reconcile these by hand before granting a paid
tier:

```sql
select lunara_id, email, paypal_txn, created_at
from members where payment_verified = false and paypal_txn is not null;
```

## Redeploying

Deploy `index.ts` and `auth-core.mjs` together to the function
`lunara-auth`, `verify_jwt` off. Run `node member-auth/test_auth.mjs`
first; CI runs it too, but CI cannot stop a deploy made from a laptop.

## Not verified from here

Whether `https://lunarasociety.com` is listed under **Authorised
JavaScript origins** for the OAuth client
`744926178467-645eltr29q4o3lo8msnlnuqsa782feca`. That lives in the
Google Cloud console and is not readable from outside. If it is
missing, the Google button never renders and the browser console says
so in as many words:

> The given origin is not allowed for the given client ID.

That is a separate failure from the one fixed here, and it would have
been hidden behind it: with the backend answering 404, the button could
not have worked either way.


## The sign-in sequence

`member.html` carries a presentation layer around all of this, and
`lunara-member.js` puts a member indicator in the navigation of any
page that includes it.

Google's account picker is not part of either, and cannot be. It is
drawn by Google in a cross-origin popup, or by the browser itself under
FedCM. Nothing on this side can restyle it, reposition it, or wrap it —
which is the correct arrangement rather than a limitation, because a
page that could repaint an account chooser could forge one.

What is ours is the moment either side. Before: the page darkens and
names what it is waiting for, so Google's window opens into a composed
frame instead of on top of a half-filled form. It is triggered from
`renderButton`'s own `click_listener`, because a click inside Google's
iframe raises no event in this document. There is no callback for a
picker that gets closed without a choice, so the chamber lifts itself
when the window regains focus and nothing arrives.

After: the record is shown being made — the facts the server returned,
in the past tense, and the identifier settling one character at a time.
Past tense because all of the work finished before any of it is on
screen. Nothing there is a progress bar for work that is not happening,
and every line corresponds to a field in the response.

`prefers-reduced-motion: reduce` collapses the whole sequence to its
end state. It is a presentation of a result, so there is nothing to
lose by skipping to it.