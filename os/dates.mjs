/* Whether an obligation binds yet, computed at the moment of reading.
   applies_from is a calendar date at UTC midnight (corpus reading note),
   and "today" is the reader's calendar date in UTC. Pure, so the tests
   can hold it to the edge cases: the day itself applies; the day before
   does not. */
export function status(appliesFrom, today) {
  const a = Date.parse(appliesFrom + 'T00:00:00Z'), t = Date.parse(String(today).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(t)) return { applies: false, days: null, text: 'Date unreadable' };
  const days = Math.round((a - t) / 864e5);
  if (days <= 0) return { applies: true, days, text: days === 0 ? 'Applies from today' : `Applies · for ${-days} day${days === -1 ? '' : 's'}` };
  return { applies: false, days, text: `In ${days} day${days === 1 ? '' : 's'}` };
}
