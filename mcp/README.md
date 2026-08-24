# Lunara Intelligence — MCP server

Regulatory obligations for AI systems, with the article that sets each date and a
link to primary law.

Your model very likely knows some of these dates wrong. The EU AI Act was amended
on 27 July 2026 by Regulation (EU) 2026/1744, which deferred the Annex III
high-risk obligations by sixteen months — five days before they would have
applied — while leaving Article 50 exactly where it was. Any training corpus
assembled before that carries the superseded date, and the two are quoted together
often enough that getting one right is no evidence of getting the other right.

This server exists so a model can look the answer up instead of recalling it.

## Install

```jsonc
// Claude Code: .mcp.json — or claude_desktop_config.json
{
  "mcpServers": {
    "lunara": {
      "command": "npx",
      "args": ["-y", "@lunara/mcp"]
    }
  }
}
```

Node 18 or later. No dependencies, no API key, no account. Reading is free and
always will be: a claim nobody can check is worth nothing.

## Integrity

Every document this server reads is published with a detached Ed25519 assertion
over its SHA-256, and the server verifies it on each fetch. A corpus that fails
verification produces an error, not an answer — a client that reports a bad
signature and then answers anyway has told you something is wrong and acted as
though it were not.

Verification being *unavailable* is different from verification *failing*, and
they are reported differently: a runtime without Ed25519 in WebCrypto, or an
authority serving no assertion, reads as unverified rather than being dressed up
as verified. Keys are at `/.well-known/keys.json`, the method and a worked
example at <https://lunarasociety.com/signing.html>.

## Tools

| Tool | Answers |
|---|---|
| `lunara_obligations` | What is in force, what is coming, what does instrument X require |
| `lunara_applicability` | Which of these reach *this* deployment — and which do not |
| `lunara_cite` | The citation block for one obligation, for when you are about to state a date to someone |
| `lunara_verify` | Whether a business carries Lunara Shield certification |
| `lunara_integrity` | Whether the corpus this server just read is genuinely ours, unaltered |

## What it will not do

**It does not answer when it cannot reach the authority.** There is no bundled
copy of the corpus. A cached table would let this server keep answering with a
date that was amended months ago, which is exactly the failure the institution
publishing it has already had to correct. If `lunarasociety.com` is unreachable,
you get an error explaining that, not a remembered date. An oracle that guesses is
worse than an oracle that is down, because you cannot tell which answer you got.

**It will tell you nothing applies.** Three outcomes of the applicability model
conclude that no obligation in the corpus reaches the asker, including the one
most people hit: the California AI Transparency Act reaches generative systems
above one million monthly users, and below that line it imposes nothing. A
qualifier that only ever escalates is a sales funnel.

**It is not legal advice.** Obligations are marked `verified` — checked against
primary law, with that source linked so you can reach the same conclusion without
trusting us. The applicability model is marked `interpretation`, because which
obligation catches you is our reading. You are free to take the facts and leave
the reading.

## Where the answers come from

`https://lunarasociety.com/corpus/obligations.json`, generated from a single
obligation table and gated in CI so the published corpus and the site can never
disagree. Tense is never stored anywhere — a static document does not know when it
is being read, so it states application dates, and this server computes "in force"
against the moment of your call.

Corrections, including two we published against ourselves and the policy that
requires it: <https://lunarasociety.com/evidence.html>

If an entry does not follow from the source it cites, that is a defect.
<rosario@lunarasociety.com> — we would rather be told than found out.
