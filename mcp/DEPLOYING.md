# Deploying and publishing the MCP server

Two doors, one implementation. `core.mjs` holds every answer and touches no
runtime built-in; `server.mjs` wraps it in stdio for the npm package, and
`http/index.ts` wraps it in Streamable HTTP for the hosted endpoint.

## The npm package

```
cd mcp
npm publish
```

`prepublishOnly` runs `prepublish.mjs` first, which boots the server exactly
as a client would, against the live authority, and refuses to publish unless
it lists five tools, returns obligations, and verifies the corpus signature.

This gate exists because `npx @lunara/mcp` sat on the website, in `llms.txt`
and in the corpus index for weeks while the package did not exist — every
person who followed our own install instructions got a 404. A published
instruction pointing at nothing is the same defect as a form posting into
nothing, aimed at the audience we most want to reach.

**The `@lunara` scope is not claimed yet.** First publish needs an npm
account with the scope created (`npm org create lunara`, or publish under a
user scope), then `npm publish --access public`. Nothing in this repository
holds npm credentials and nothing should: everything committed here is
served publicly, which has been checked rather than assumed.

## The hosted endpoint

Supabase Edge Function `lunara-mcp` on project `xkriotfcoialxmqvherb`:

```
https://xkriotfcoialxmqvherb.supabase.co/functions/v1/lunara-mcp
```

Deployed with two files: `index.ts` from `mcp/http/index.ts`, and `core.mjs`
from `mcp/core.mjs` — uploaded, not vendored, so no second copy sits in this
repository going stale. `verify_jwt` is off: this is a public, unauthenticated
reader, and requiring a Supabase token would make "free to read" untrue.

The first attempt imported `core.mjs` straight from
`https://lunarasociety.com/mcp/core.mjs`, which would have made drift
impossible. The edge runtime's bundler refuses imports from arbitrary hosts.
Once the npm package exists — it is not published yet — `npm:@lunara/mcp`
is the better import and removes the upload step entirely.

What is deployed can still be checked from outside: `mcp/core.mjs` is among
the signed documents, so its digest is published at
`https://lunarasociety.com/mcp/core.assertion.json`.

### Known nits

- `HEAD` answers 405. MCP clients POST, and a browser gets the GET page, so
  this only affects link checkers.
- The corpus cache is per-isolate, so a cold isolate refetches. That is the
  intended trade: fifteen minutes of cache, never longer, because a
  correction published this morning must not be invisible this afternoon.
