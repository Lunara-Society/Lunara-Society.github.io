/* ═══════════════════════════════════════════════════════════════════
   THE LUNARA LETTER: the email template, in the site's materials
   ═══════════════════════════════════════════════════════════════════

   An ivory letter laid on obsidian, framed in champagne gold: the
   paper of a certificate rather than white text on black. Dark ink on
   paper reads well on every screen and in every client, and the
   obsidian frame keeps it unmistakably Lunara.

     import { renderLetter } from './lunara-letter.mjs';
     const { html, text } = renderLetter(spec);

   node emails/lunara-letter.mjs spec.json out.html   writes html and
   out.txt (the plain-text twin every message is sent with).

   Email is not the web: tables for layout, every style inline, a
   bgcolor under every gradient, web-safe fonts behind the brand ones,
   a 600px column that narrows on a phone, images hosted on
   lunarasociety.com with alt text, and nothing that needs JavaScript.

   spec: {
     preheader   the line inboxes show after the subject
     kicker      small gold capitals above the headline
     headline    the serif headline on obsidian
     chip        optional: a short dated mark, e.g. "2 December 2026 · 47 days"
     greeting    "Hello Hippocratic AI team,"
     paragraphs  [string]  plain text; *word* becomes bold, [text](url) a link
     panel       optional: { title, grade, score, outOf, caption, rows: [{ ok, label, detail }], link: { text, url } }
     cta         optional: { text, url }
     after       [string]  paragraphs after the button
     signoff     { closing, name, role, email }
     footer      [string]  small print under the letter
   }
   ═══════════════════════════════════════════════════════════════════ */

const C = {
  obsidian: '#07080A', frame: '#0E1014', paper: '#F4EFE5', paper2: '#EBE3D5', ink: '#1C1B18', ink2: '#4A463E', ink3: '#7A7466',
  gold: '#C6A15B', goldHi: '#F0D99B', goldLo: '#8C6A2E', titanium: '#8D877C', ivory: '#F6F0E2'
};
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono',Menlo,Consolas,monospace";
const SITE = 'https://lunarasociety.com';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// *bold* and [text](url), escaped first so nothing from a spec can inject markup
function inline(s, linkColor = C.goldLo) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" style="color:${linkColor};text-decoration:underline">${t}</a>`)
    .replace(/\*([^*]+)\*/g, '<strong style="color:' + C.ink + ';font-weight:600">$1</strong>');
}
const plain = (s) => String(s).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)').replace(/\*([^*]+)\*/g, '$1');

function gradeColor(g) {
  if (/^A/.test(g)) return '#2E7D5B';
  if (/^B/.test(g)) return '#9A7A34';
  if (/^C/.test(g)) return '#B4712A';
  return '#A84646';
}

function para(p, i) {
  return `<p style="margin:${i ? 16 : 0}px 0 0;font:400 15px/1.68 ${SANS};color:${C.ink2}">${inline(p)}</p>`;
}

function panelHtml(p) {
  const rows = (p.rows || []).map((r) => `
              <tr>
                <td width="22" valign="top" style="padding:9px 0 0;font:600 13px/1.4 ${SANS};color:${r.ok ? '#2E7D5B' : '#A84646'}">${r.ok ? '&#10003;' : '&#10005;'}</td>
                <td valign="top" style="padding:8px 0 0;font:400 14px/1.5 ${SANS};color:${C.ink}">${esc(r.label)}${r.detail ? `<br><span style="font:400 12.5px/1.5 ${SANS};color:${C.ink3}">${esc(r.detail)}</span>` : ''}</td>
              </tr>`).join('');
  const badge = p.grade ? `
                <td width="66" valign="top">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td width="58" height="58" align="center" valign="middle" bgcolor="${gradeColor(p.grade)}" style="width:58px;height:58px;border-radius:50%;background:${gradeColor(p.grade)};font:600 22px/58px ${SERIF};color:#FFFFFF">${esc(p.grade)}</td>
                  </tr></table>
                </td>` : '';
  return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0">
            <tr><td bgcolor="${C.paper2}" style="background:${C.paper2};border-left:3px solid ${C.gold};border-radius:0 10px 10px 0;padding:20px 22px 20px">
              <p style="margin:0 0 14px;font:600 10.5px/1 ${MONO};letter-spacing:2.4px;text-transform:uppercase;color:${C.goldLo}">${esc(p.title)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${badge}
                <td valign="middle">
                  ${p.score != null ? `<p style="margin:0;font:400 30px/1 ${SERIF};color:${C.ink}">${esc(p.score)}<span style="font:400 15px ${SERIF};color:${C.ink3}"> / ${esc(p.outOf || 100)}</span></p>` : ''}
                  ${p.caption ? `<p style="margin:6px 0 0;font:400 13px/1.5 ${SANS};color:${C.ink3}">${inline(p.caption)}</p>` : ''}
                </td>
              </tr></table>
              ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;border-top:1px solid #D9CFBD">${rows}</table>` : ''}
              ${p.link ? `<p style="margin:14px 0 0;font:500 13px/1.4 ${SANS}"><a href="${esc(p.link.url)}" style="color:${C.goldLo};text-decoration:underline">${esc(p.link.text)}</a></p>` : ''}
            </td></tr>
          </table>`;
}

function ctaHtml(c) {
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0">
            <tr><td align="center" bgcolor="${C.gold}" style="border-radius:999px;background:${C.gold};background-image:linear-gradient(180deg,${C.goldHi},${C.gold});box-shadow:0 6px 16px -8px rgba(140,106,46,.8)">
              <a href="${esc(c.url)}" style="display:inline-block;padding:14px 30px;font:600 14px/1 ${SANS};letter-spacing:.3px;color:${C.ink};text-decoration:none;border-radius:999px">${esc(c.text)}&nbsp;&rarr;</a>
            </td></tr>
          </table>`;
}

export function renderLetter(s) {
  const paragraphs = (s.paragraphs || []).map(para).join('');
  const after = (s.after || []).map((p, i) => para(p, i + 1)).join('');
  const so = s.signoff || {};
  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(s.headline || 'Lunara Society')}</title>
<style>
  @media (max-width:620px){
    .lx-px{padding-left:24px!important;padding-right:24px!important}
    .lx-h1{font-size:28px!important;line-height:33px!important}
    .lx-hide{display:none!important}
  }
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
</style>
</head>
<body style="margin:0;padding:0;background:${C.obsidian};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${esc(s.preheader || '')}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.obsidian}" style="background:${C.obsidian}">
  <tr><td align="center" style="padding:28px 12px 34px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

      <tr><td height="2" bgcolor="${C.gold}" style="height:2px;font-size:0;line-height:0;background:${C.gold};background-image:linear-gradient(90deg,${C.obsidian},${C.gold} 20%,${C.goldHi} 50%,${C.gold} 80%,${C.obsidian})">&nbsp;</td></tr>

      <tr><td class="lx-px" bgcolor="${C.frame}" style="background:${C.frame};padding:26px 40px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="54" valign="middle"><a href="${SITE}"><img src="${SITE}/lunara_emblem_160.png" width="44" height="44" alt="Lunara Society" style="display:block;border:0;border-radius:50%"></a></td>
          <td valign="middle" style="font:400 14px/1 ${SERIF};letter-spacing:5px;text-transform:uppercase;color:#E9D9AE;white-space:nowrap">Lunara Society</td>
          <td class="lx-hide" valign="middle" align="right" style="font:500 9.5px/1.4 ${MONO};letter-spacing:2px;text-transform:uppercase;color:${C.titanium}">Est. MMXXVI</td>
        </tr></table>
      </td></tr>

      <tr><td class="lx-px" bgcolor="${C.frame}" style="background:${C.frame};background-image:radial-gradient(120% 140% at 85% 0%,#2A2418 0%,${C.frame} 55%);padding:34px 40px 38px">
        ${s.kicker ? `<p style="margin:0 0 14px;font:600 10.5px/1.4 ${MONO};letter-spacing:3px;text-transform:uppercase;color:${C.gold}">${esc(s.kicker)}</p>` : ''}
        <h1 class="lx-h1" style="margin:0;font:400 33px/39px ${SERIF};color:${C.ivory};letter-spacing:-.2px">${esc(s.headline || '')}</h1>
        ${s.chip ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr>
          <td style="border:1px solid #6E5A33;border-radius:999px;padding:8px 16px;font:500 11px/1 ${MONO};letter-spacing:1.6px;text-transform:uppercase;color:${C.goldHi}">${esc(s.chip)}</td>
        </tr></table>` : ''}
      </td></tr>

      <tr><td height="1" bgcolor="${C.gold}" style="height:1px;font-size:0;line-height:0;background:${C.gold}">&nbsp;</td></tr>

      <tr><td class="lx-px" bgcolor="${C.paper}" style="background:${C.paper};padding:36px 40px 38px">
        <p style="margin:0 0 18px;font:400 19px/1.4 ${SERIF};color:${C.ink}">${esc(s.greeting || 'Hello,')}</p>
        ${paragraphs}
        ${s.panel ? panelHtml(s.panel) : ''}
        ${s.cta ? ctaHtml(s.cta) : ''}
        ${after}
        <p style="margin:30px 0 0;font:italic 400 17px/1.4 ${SERIF};color:${C.ink2}">${esc(so.closing || 'With respect,')}</p>
        <p style="margin:6px 0 0;font:600 15px/1.4 ${SANS};color:${C.ink}">${esc(so.name || 'Rosario Roxa')}</p>
        <p style="margin:2px 0 0;font:400 13px/1.5 ${SANS};color:${C.ink3}">${esc(so.role || 'Founding Steward, Lunara Society')}<br>
          <a href="mailto:${esc(so.email || 'lunarasociety@gmail.com')}" style="color:${C.goldLo};text-decoration:none">${esc(so.email || 'lunarasociety@gmail.com')}</a> &nbsp;&middot;&nbsp; <a href="${SITE}" style="color:${C.goldLo};text-decoration:none">lunarasociety.com</a></p>
      </td></tr>

      <tr><td class="lx-px" bgcolor="#0B0C10" style="background:#0B0C10;padding:22px 40px 24px">
        ${(s.footer || []).map((f, i) => `<p style="margin:${i ? 8 : 0}px 0 0;font:400 11.5px/1.6 ${SANS};color:${C.titanium}">${inline(f, '#BFA46A')}</p>`).join('')}
      </td></tr>

      <tr><td height="2" bgcolor="${C.gold}" style="height:2px;font-size:0;line-height:0;background:${C.gold};background-image:linear-gradient(90deg,${C.obsidian},${C.gold} 20%,${C.goldHi} 50%,${C.gold} 80%,${C.obsidian})">&nbsp;</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const lines = [];
  lines.push((s.greeting || 'Hello,'), '');
  (s.paragraphs || []).forEach((p) => lines.push(plain(p), ''));
  if (s.panel) {
    const p = s.panel;
    lines.push(p.title.toUpperCase() + (p.grade ? `: ${p.grade}` : '') + (p.score != null ? `, ${p.score}/${p.outOf || 100}` : ''));
    if (p.caption) lines.push(plain(p.caption));
    (p.rows || []).forEach((r) => lines.push(`  ${r.ok ? '[ok]' : '[x] '} ${r.label}${r.detail ? ' - ' + r.detail : ''}`));
    if (p.link) lines.push(`${p.link.text}: ${p.link.url}`);
    lines.push('');
  }
  if (s.cta) lines.push(`${s.cta.text}: ${s.cta.url}`, '');
  (s.after || []).forEach((p) => lines.push(plain(p), ''));
  lines.push(so.closing || 'With respect,', so.name || 'Rosario Roxa', so.role || 'Founding Steward, Lunara Society', `${so.email || 'lunarasociety@gmail.com'} | lunarasociety.com`, '');
  (s.footer || []).forEach((f) => lines.push(plain(f)));
  return { html, text: lines.join('\n') };
}

// CLI: node emails/lunara-letter.mjs spec.json out.html
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [specPath, out] = process.argv.slice(2);
  const { html, text } = renderLetter(JSON.parse(fs.readFileSync(specPath, 'utf8')));
  fs.writeFileSync(out, html);
  fs.writeFileSync(out.replace(/\.html?$/, '') + '.txt', text);
  console.log(`wrote ${out} (${html.length} bytes) and its text twin`);
}
