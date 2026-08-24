# Lunara Society

> Constitutional governance authority for the autonomous economy.

Lunara Society is the trust infrastructure layer between AI systems and the business world — the same way HTTPS became mandatory for web security, Lunara is becoming mandatory for AI-to-business trust.

## What We Do

- **Shield Certification** — Human-reviewed business identity and governance verification
- **Compliance Intelligence** — Risk scoring for EU AI Act Article 50 and California SB 942
- **Public Registry** — Free, open API for real-time entity verification
- **Constitutional Framework** — Seven pillars of AI governance (CC BY 4.0)

## Deadlines

Not restated here. No page on this site states a date; they live in one table
that computes tense at the moment of reading, and are published at
[`corpus/obligations.json`](https://lunarasociety.com/corpus/obligations.json).

The nearest one is worth naming anyway because most published summaries get it
wrong: machine-readable marking under Article 50(2) falls due for generative
systems already on the market on **2 December 2026** — the Omnibus grants four
months, not six. See [/marking.html](https://lunarasociety.com/marking.html), and
the [correction](https://lunarasociety.com/evidence.html) we published for having
carried February ourselves.

## Lunara Intelligence — the regulatory corpus

Every obligation this institution tracks, machine-readable, each carrying the
instrument, the article that sets the date, and a link to primary law.

```bash
curl https://lunarasociety.com/corpus/obligations.json
```

No tense is stored. A static document does not know when it is being read, so it
states application dates and callers compute "in force" against the moment of the
call. The corpus is generated from a single obligation table in `lunara-clock.js`
and the deploy fails while the two disagree — two hand-maintained tables mean two
answers, which is the failure that produced our first published correction.

| | |
|---|---|
| Corpus | https://lunarasociety.com/corpus/obligations.json |
| Schema | https://lunarasociety.com/corpus/obligations.schema.json |
| Applicability model | https://lunarasociety.com/corpus/applicability.json |
| Index | https://lunarasociety.com/corpus/index.json |

## MCP server

```jsonc
POST JSON-RPC to https://xkriotfcoialxmqvherb.supabase.co/functions/v1/lunara-mcp
(the npm package @lunara/mcp is written and tested but not published yet)
```

Four tools: `lunara_obligations`, `lunara_applicability`, `lunara_cite`,
`lunara_verify`. Node 18+, zero dependencies, no key, no account.

It ships no bundled copy of the corpus and does not answer when the authority is
unreachable. A cached table is how a server keeps confidently serving a date that
was amended months ago. Source: [`mcp/server.mjs`](mcp/server.mjs) — one file,
readable in full by whoever is deciding whether to trust it.

## Registry API — free & open

```bash
curl -X POST https://base44.app/api/apps/6a46cea2687503d2d6d4ecd1/functions/shieldRegistryLookup \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
```

No authentication required. Full spec: [openapi.yaml](https://lunarasociety.com/openapi.yaml)

## AI Discovery Files

| File | URL | Purpose |
|------|-----|---------|
| llms.txt | https://lunarasociety.com/llms.txt | Primary AI context file |
| ai.json | https://lunarasociety.com/ai.json | Institutional identity graph |
| agent-manifest.json | https://lunarasociety.com/agent-manifest.json | AI agent operational manifest |
| identity.json | https://lunarasociety.com/identity.json | Canonical organization identity |
| openapi.yaml | https://lunarasociety.com/openapi.yaml | Full API specification |
| sitemap.xml | https://lunarasociety.com/sitemap.xml | Site map with priorities |
| ai.txt | https://lunarasociety.com/ai.txt | Plain text summary |
| faq-ai.txt | https://lunarasociety.com/faq-ai.txt | FAQ for AI systems |
| corpus/index.json | https://lunarasociety.com/corpus/index.json | The regulatory corpus, and how to read it |
| mcp.html | https://lunarasociety.com/mcp.html | MCP server for AI systems |
| developer-ai.txt | https://lunarasociety.com/developer-ai.txt | Developer reference |

## The Seven Pillars

1. Sovereign Identity
2. Declared Governance Framework
3. Transparency of Contact
4. Accountability for Actions
5. Audit Accessibility
6. Revocation Protocol
7. Constitutional Alignment

## Website

Live at **https://lunarasociety.com**

## Evidence standard

Every claim carries one of four marks — verified, reported, interpretation,
hypothesis — and where a mark is ambiguous we take the lower one. Four
corrections are published against ourselves at
[evidence.html](https://lunarasociety.com/evidence.html), three of them found by
something other than our own review.

If an entry does not follow from the source it cites, that is a defect.
rosario@lunarasociety.com — we would rather be told than found out.

## Development

```bash
node tools/build-corpus.mjs    # emit corpus/obligations.json from the table
node tools/verify-corpus.mjs   # fail if they have drifted, or a citation is missing
node mcp/test/smoke.mjs        # exercise the MCP server over real stdio
```

Both gates run in CI before the site deploys.

## License

The Lunara Constitution is published under CC BY 4.0. All other content is copyright Lunara Society.

## Contact

- Email: lunarasociety@gmail.com
- Instagram: @lunarasociety
- AI Gateway: https://lunarasociety.com/ai-gateway.html
