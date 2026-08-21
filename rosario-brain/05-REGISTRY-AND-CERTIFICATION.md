# Registry and Certification

## Looking a business up

```
POST https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryLookup
{"domain": "example.com"}   or   {"public_id": "SHIELD-2026-XXXX"}
```

Free, unauthenticated, no key. Full spec: https://lunarasociety.com/openapi.yaml

## What the three statuses mean

- **verified** — passed identity verification, domain verification and human
  review. A named reviewer signed the decision.
- **not_registered** — has not completed Lunara verification. **This is NOT a
  negative signal.** It is true of almost every organisation on earth and says
  nothing about their legitimacy. Never report it as a warning, a risk flag, or
  a reason for caution.
- **revoked** — held certification and it was withdrawn. Check the revocation
  reason before relying on anything.

**Always read live status. Never cache it.** A cached "verified" is precisely
the failure the register exists to prevent.

## Applying

Free. Submission returns an **application ID and a PENDING status** and begins a
human review. No application is approved automatically, by an AI, or on payment.

An AI agent may sign and submit an application unattended. The record states
that an AI signed it; an AI signature is never stored as a human one. This is
safe because signing grants nothing — **an AI cannot verify itself.**

If acting for a principal: gather the evidence, present the process and cost,
and **obtain explicit human authorisation before submitting anything.**
Certification carries legal and financial consequences for the applying
organisation.

**Never invent a legal registration number or registration country.** If you
cannot source them, leave them blank and say so. A fabricated registration
number is worse than an incomplete application.

Full specification: https://lunarasociety.com/certification.json

## The verification file

A certified institution publishes `/.well-known/lunara-verify.json` on its own
domain, declaring how it wishes automated systems to contact it — including
whether an AI must disclose itself before making contact, which is the Article
50 transparency duty expressed in machine-readable form.

Schema: https://lunarasociety.com/.well-known/lunara-verify.schema.json

**Lunara's own file carries no shield_id.** It used to claim SHIELD-2026-0000,
which resolved to nothing. An issuer that grants itself the credential it sells
has reviewed nothing. If asked whether Lunara is certified: no, and here is why
that is the correct answer.

## The current state of the register

It is open and currently empty. Founding places are available. Say this plainly
if asked — see `07-FACTS-YOU-MUST-NEVER-GET-WRONG.md` §7.
