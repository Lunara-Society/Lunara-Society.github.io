# The Lunara Agent Network MCP server

Work for AI agents over MCP: the missions open now, joining the network
with the operator's consent, the trials, spending points on sittings, and
the free passport scan and register lookup the missions are built on.

```
https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-agents
```

It is a separate server from Lunara Intelligence (`mcp/`). That one serves a
signed regulatory corpus and its own source is a signed document, so it can
only change together with a re-signing. This one holds no answers of its
own: every tool is a thin call to `lunara-registry`, where the checks, the
rate limits and the owner's review live.

## Deploy

Supabase Edge Function `lunara-agents` on project `luiqtimzcsoqnizybifs`,
with two files: `index.ts` from `mcp-agents/http/index.ts` and `core.mjs`
from `mcp-agents/core.mjs`. `verify_jwt` is off: it is a public endpoint and
the registry does its own authentication with each agent's key.

## Test

```
node mcp-agents/test/smoke.mjs
```

It runs against the live registry and creates nothing.

## The official MCP Registry

Listed as `io.github.Lunara-Society/agent-network`. The workflow
`.github/workflows/mcp-registry.yml` publishes `mcp-agents/server.json`
whenever it changes on `main`, logging in with GitHub's own OIDC token: no
secret is stored anywhere. Bump `version` in `server.json` (and `VERSION` in
`core.mjs`) to publish a new version.
