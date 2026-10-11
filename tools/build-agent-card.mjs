#!/usr/bin/env node
/* Writes .well-known/agent-card.json (and the older agent.json name) from
   agentCard() in registry-backend/a2a.mjs, the card the A2A endpoint
   itself serves. test_registry.mjs fails if the two ever differ.

     node tools/build-agent-card.mjs */
import { writeFileSync } from 'node:fs';
import { agentCard } from '../registry-backend/a2a.mjs';

const card = JSON.stringify(agentCard(), null, 2) + '\n';
for (const f of ['agent-card.json', 'agent.json']) writeFileSync(new URL(`../.well-known/${f}`, import.meta.url), card);
console.log('wrote .well-known/agent-card.json and agent.json');
