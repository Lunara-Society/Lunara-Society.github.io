/* Renders the drafted letters into email HTML and a plain-text
 * alternative. Both are produced from the same JSON, so the text part
 * cannot drift into saying something the HTML does not.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/* The deadline is the whole subject of these letters, so the count of
   days to it is computed when the letter is rendered rather than typed
   into the draft. It was already wrong by one when this was written. */
const DEADLINE = Date.UTC(2026, 11, 2);
/* Counted from today's date, not from this instant. Dividing a
   timestamp difference and rounding gives 101 at midday and 102 at
   midnight — and "days from today" means calendar days to the reader,
   which is the only reading that matters in a letter about a date. */
const daysLeft = () => {
  const n = new Date();
  const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  return Math.round((DEADLINE - today) / 86400000);
};
const fill = (s) => String(s).replace(/\{\{DAYS\}\}/g, String(daysLeft()));

const strip = (s) => String(s)
  .replace(/<br\s*\/?>/gi, '\n\n')
  .replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/<[^>]+>/g, '');

export function html(raw) {
  const L = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fill(v)]));
  const P = (t) => '<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#2b2b2b">' + t + '</p>';
  return `<div style="background:#f6f4f0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${L.PREHEADER}</span>
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #e4dfd6">
<tr><td style="padding:36px 36px 8px">
  <p style="margin:0 0 4px;font-size:10px;letter-spacing:3.5px;text-transform:uppercase;color:#9a7f4e">${L.CAPTION}</p>
  <p style="margin:0 0 28px;font-size:11.5px;line-height:1.6;color:#8a8578">${L.TAGLINE}</p>
  ${P('<strong style="font-weight:600">' + L.GREETING + '</strong>,')}
  ${P(L.OPENING)}
  ${P(L.BODY)}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 26px">
    <tr><td style="border-left:2px solid #c4a46b;padding:4px 0 4px 16px;font-size:16px;line-height:1.6;color:#4a4336;font-style:italic">${L.PULL}</td></tr>
  </table>
  ${P(L.ASK)}
  <p style="margin:26px 0 30px">
    <a href="${L.CTA_URL}" style="display:inline-block;background:#1a1a1a;color:#e8d9b5;text-decoration:none;padding:13px 26px;font-size:12.5px;letter-spacing:1.4px;text-transform:uppercase">${L.CTA_LABEL}</a>
  </p>
  <p style="margin:0;padding-top:20px;border-top:1px solid #eee7db;font-size:11.5px;line-height:1.7;color:#9a9488">${L.OPTOUT}</p>
</td></tr></table>
</div>`;
}

export function text(raw) {
  const L = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fill(v)]));
  return [
    L.CAPTION.toUpperCase(), L.TAGLINE, '',
    strip(L.GREETING) + ',', '',
    strip(L.OPENING), '',
    strip(L.BODY), '',
    /* No pull quote in the text part. A pull quote is text pulled out
       of the body and set in a border; strip the border and it is just
       the same sentence twice, which is how it read. */
    strip(L.ASK), '',
    strip(L.CTA_LABEL) + ': ' + L.CTA_URL, '',
    '—', strip(L.OPTOUT)
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const dir = process.argv[2];
  for (const name of process.argv.slice(3)) {
    const L = JSON.parse(readFileSync(dir + '/' + name + '.json', 'utf8'));
    writeFileSync(dir + '/' + name + '.html', html(L));
    writeFileSync(dir + '/' + name + '.txt', text(L));
    console.log(name + ': ' + text(L).length + ' chars text, ' + html(L).length + ' html');
  }
}
