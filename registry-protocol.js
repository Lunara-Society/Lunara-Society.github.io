/* ═══════════════════════════════════════════════════════════════════
   THE REGISTRY PROTOCOL — one source, several emissions
   ═══════════════════════════════════════════════════════════════════

   Before this file existed, the site gave three different answers to
   "what does the registry return", and not one field name agreed
   across all three:

     registry.html   lunara_id · entity_name · verification_status,
                     under a heading that read "Live registry entry
                     format"
     openapi.yaml    public_id · business_name · status
     the server      success · found · status, and nothing else

   openapi.yaml is the one llms.txt points AI systems at, so the
   mismatch was aimed squarely at machines: a system reading the spec
   looked for public_id and received found. That is the same failure
   behind all four published corrections — reading one source, not
   another, and shipping two answers — so it is fixed the same way the
   obligation table and the price table were: one source here, every
   surface emitted from it, and a check in CI that stops a deploy
   where they disagree.

   Every response below carries an evidence mark, because this
   institution does not get to hold others to a standard it exempts
   itself from:

     verified    observed from the live endpoint on the date given
     unverified  expected, never observed, and labelled as such

   The registry holds no entities, so the shape of a *found* entry
   cannot be observed at all. It is recorded here as unverified rather
   than guessed at quietly. When the first entity is certified, call
   the endpoint, replace that block with what comes back, and change
   the mark.
   ═══════════════════════════════════════════════════════════════════ */

export const PROTOCOL_VERSION = 'LUNA-PROTO-1';

export const API_BASE =
  'https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions';

export const ENDPOINTS = [
  {
    name: 'shieldRegistryLookup',
    method: 'POST',
    summary: 'Look up one entity by domain or by public id.',
    request: {
      required: 'one of domain or public_id',
      fields: {
        domain:    'Business domain, e.g. "example.com"',
        public_id: 'Lunara public id, e.g. "SHIELD-2026-0001"'
      }
    },
    responses: [
      {
        when: 'the entity is not in the registry',
        status: 200,
        evidence: 'verified',
        observed: '2026-08-22',
        body: { success: true, found: false, status: 'not_registered' }
      },
      {
        when: 'neither domain nor public_id is given',
        status: 200,
        evidence: 'verified',
        observed: '2026-08-22',
        body: { error: 'public_id or domain is required' }
      },
      {
        when: 'the entity is certified',
        evidence: 'unverified',
        note: 'No entity has been certified, so this response has never '
            + 'been returned by the live endpoint and has not been '
            + 'observed. The fields below are what the implementation is '
            + 'expected to add alongside success, found and status. Do '
            + 'not build against them without checking.',
        body: {
          success: true,
          found: true,
          status: 'verified',
          lunara_id: 'LUNA-XXXX-XXXX',
          business_name: 'Your Business',
          domain: 'yourdomain.com',
          shield_status: 'active',
          verification_date: '2026-XX-XX',
          protocol_version: PROTOCOL_VERSION
        }
      }
    ]
  },
  {
    name: 'shieldRegistryList',
    method: 'POST',
    summary: 'Every certified entity. Free, and no authentication.',
    request: { required: 'nothing', fields: {} },
    responses: [
      {
        when: 'always, today',
        status: 200,
        evidence: 'verified',
        observed: '2026-08-22',
        body: { success: true, count: 0, businesses: [] }
      },
      {
        when: 'once an entity is certified',
        evidence: 'unverified',
        note: 'businesses has never been observed with anything in it, '
            + 'so the shape of an element is expected rather than known.',
        body: {
          success: true,
          count: 1,
          businesses: [{
            lunara_id: 'LUNA-XXXX-XXXX',
            business_name: 'Your Business',
            domain: 'yourdomain.com',
            status: 'verified',
            shield_status: 'active',
            verification_date: '2026-XX-XX'
          }]
        }
      }
    ]
  },
  {
    name: 'shieldFoundingCount',
    method: 'POST',
    summary: 'How much of the founding cohort remains.',
    request: { required: 'nothing', fields: {} },
    responses: [
      {
        when: 'always',
        status: 200,
        evidence: 'verified',
        observed: '2026-08-22',
        body: { success: true, cap: 80, used: 0, remaining: 80,
                sold_out: false, current_price: 80 }
      }
    ]
  },
  {
    name: 'shieldVerifyDomain',
    method: 'POST',
    summary: 'Confirm a domain against a public id.',
    request: {
      required: 'public_id',
      fields: { public_id: 'Lunara public id', domain: 'Domain to confirm' }
    },
    responses: [
      {
        when: 'public_id is missing',
        status: 200,
        evidence: 'verified',
        observed: '2026-08-22',
        body: { error: 'public_id is required' }
      },
      {
        when: 'the domain is confirmed',
        evidence: 'unverified',
        note: 'Requires a certified entity to call it against, and there '
            + 'are none. Never observed.',
        body: { success: true, verified: true, domain: 'yourdomain.com' }
      }
    ]
  }
];

/* The block the pages print. It shows the shape of a certified entry,
   which is the thing a reader wants to see — so it must carry its mark
   with it rather than sitting there looking settled. */
export function entryExample() {
  const lookup = ENDPOINTS.find((e) => e.name === 'shieldRegistryLookup');
  const found = lookup.responses.find((r) => r.body.found === true);
  return { body: found.body, evidence: found.evidence };
}
