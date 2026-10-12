/* ═══════════════════════════════════════════════════════════════════
   THE ATLAS GRAPH — only relationships the system recorded
   ═══════════════════════════════════════════════════════════════════

   Nodes: Lunara (its own A2A agent), each operator, each listed agent,
   and the register entry of an operator a reviewer verified.
   Edges, and nothing else:
     member    agent → Lunara: the agent joined the network and holds a
               tier (recorded in network_agents)
     declared  agent → operator: what the operator stated at registration
     verified  operator → register entry: a current entry for the
               operator's email, approved by a named reviewer
     declares  Lunara → skill: a skill its own agent card declares
   Two agents with the same operator are joined through that operator,
   never to each other: no relationship between agents is recorded, so
   none is drawn. Pure, so the tests can hold it to that.
   ═══════════════════════════════════════════════════════════════════ */

export function buildGraph(agents, skills) {
  const nodes = [{ id: 'lunara', kind: 'lunara', label: 'Lunara Society' }];
  const edges = [];
  for (const sk of skills || []) {
    if (!sk || !sk.id) continue;
    nodes.push({ id: 'skill:' + sk.id, kind: 'skill', label: sk.name || sk.id, data: sk });
    edges.push({ from: 'lunara', to: 'skill:' + sk.id, kind: 'declares' });
  }
  const ops = new Map();
  for (const a of agents || []) {
    if (!a || !a.agent_id) continue;
    const opKey = 'op:' + String(a.operator || 'unknown').trim().toLowerCase();
    if (!ops.has(opKey)) {
      ops.set(opKey, { id: opKey, kind: 'operator', label: a.operator || 'Unknown operator', verified: false, registry_id: null, agents: [] });
    }
    const op = ops.get(opKey);
    op.agents.push(a.agent_id);
    if (a.operator_verified && a.operator_registry_id) { op.verified = true; op.registry_id = a.operator_registry_id; }
    nodes.push({ id: a.agent_id, kind: 'agent', label: a.name, tier: a.tier, trust: a.trust_index, data: a });
    edges.push({ from: a.agent_id, to: 'lunara', kind: 'member' });
    edges.push({ from: a.agent_id, to: opKey, kind: 'declared' });
  }
  for (const op of ops.values()) {
    nodes.push(op);
    if (op.verified) {
      const rid = 'reg:' + op.registry_id;
      if (!nodes.some((n) => n.id === rid)) nodes.push({ id: rid, kind: 'register', label: op.registry_id });
      edges.push({ from: op.id, to: rid, kind: 'verified' });
    }
  }
  return { nodes, edges };
}

/* A deterministic radial layout: Lunara at the centre, operators on a
   ring, each operator's agents fanned beyond it, a register entry just
   outside its operator. Same input, same picture. */
export function layout(graph, w, h) {
  const cx = w / 2, cy = h / 2, pos = { lunara: { x: cx, y: cy } };
  const skills = graph.nodes.filter((n) => n.kind === 'skill');
  const RS = Math.min(w, h) * 0.13;
  skills.forEach((n, i) => { const a = -Math.PI / 2 + (i + 0.5) / skills.length * Math.PI * 2; pos[n.id] = { x: cx + Math.cos(a) * RS * 1.5, y: cy + Math.sin(a) * RS }; });
  const ops = graph.nodes.filter((n) => n.kind === 'operator');
  const R1 = Math.min(w, h) * 0.24, R2 = Math.min(w, h) * 0.40;
  ops.forEach((op, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, ops.length)) * Math.PI * 2;
    pos[op.id] = { x: cx + Math.cos(a) * R1, y: cy + Math.sin(a) * R1 };
    const span = Math.min(Math.PI * 2 / Math.max(1, ops.length) * 0.8, 1.2);
    op.agents.forEach((id, j) => {
      const b = a + (op.agents.length > 1 ? (j / (op.agents.length - 1) - 0.5) * span : 0);
      pos[id] = { x: cx + Math.cos(b) * R2, y: cy + Math.sin(b) * R2 };
    });
    if (op.registry_id) pos['reg:' + op.registry_id] = { x: cx + Math.cos(a + 0.18) * (R1 * 0.62), y: cy + Math.sin(a + 0.18) * (R1 * 0.62) };
  });
  return pos;
}
