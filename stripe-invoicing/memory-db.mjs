/* The storage interface the edge function implements over Postgres,
   kept in memory. The test suite and sandbox-check use it, so both run
   handleInvoicing exactly as the function does. */
export function memoryDb() {
  const invoices = new Map(), events = new Set(), adjustments = [], requests = [];
  return {
    invoices, events, adjustments,
    async openInvoice(email, product, livemode) {
      for (const r of invoices.values()) {
        if (r.email === email && r.product === product && r.status === 'open' && r.livemode === livemode) return r;
      }
      return null;
    },
    async recentRequests(email, ipHash, since) {
      const rs = requests.filter((r) => r.at >= since);
      return { email: rs.filter((r) => r.email === email).length, ip: rs.filter((r) => r.ip_hash === ipHash).length };
    },
    async upsertInvoice(row) {
      const prev = invoices.get(row.invoice_id) || {};
      const next = { ...prev, ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined)) };
      invoices.set(row.invoice_id, next);
      if (row.ip_hash && !prev.invoice_id) requests.push({ email: row.email, ip_hash: row.ip_hash, at: new Date().toISOString() });
      return next;
    },
    async claimEvent(id) {
      if (events.has(id)) return false;
      events.add(id); return true;
    },
    async noteAdjustment(row) { adjustments.push(row); }
  };
}
