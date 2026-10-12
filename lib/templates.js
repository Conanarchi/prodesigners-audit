// Email + document templates (inline-styled HTML that works in Gmail/Outlook/phones).
const config = require('./config');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RED = '#D11F26';
const INK = '#1F2326';
const MUTED = '#5C6166';

function money(amount, currency = config.quote.currency) {
  const n = Number(amount);
  if (!isFinite(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function waLink(text, number = config.company.whatsapp) {
  if (!number) return '';
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** Human readable rows describing a submission */
function summaryRows(s) {
  const p = s.project || {}, c = s.client || {};
  const area = p.area ? `${p.area} ${p.areaUnit || 'm²'}` : '';
  const floors = [p.basement ? 'Basement' : '', p.floors || '', p.roof ? '+ Roof/Penthouse' : ''].filter(Boolean).join(' ');
  return [
    ['Reference', s.ref],
    ['Project name', p.name],
    ['Project type', p.type],
    ['Design stage', p.stage],
    ['Disciplines in drawings', (p.disciplines || []).join(', ')],
    ['Built-up area', area],
    ['Plot area', p.plotArea ? `${p.plotArea} ${p.areaUnit || 'm²'}` : ''],
    ['Floors', floors],
    ['Municipality', p.municipality],
    ['Area / district', p.district],
    ['Plot / PIN number', p.plot],
    ['Map location', p.mapUrl],
    ['Construction start', p.timeline],
    ['Original design firm', p.designer],
    ['Large-file link', p.filesLink],
    ['Notes', p.notes],
    ['Client name', c.name],
    ['Company', c.company],
    ['Phone', c.phone],
    ['WhatsApp', c.whatsapp],
    ['Email', c.email],
    ['Preferred contact', c.preferred],
    ['Files uploaded', (s.files || []).length ? (s.files || []).map(f => f.name).join(', ') : 'None'],
    ['Submitted', new Date(s.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' }) + ' (Doha)'],
  ].filter(([, v]) => v);
}

function projectInfoText(s) {
  const lines = ['PRODESIGNERS — PRE-CONSTRUCTION AUDIT REQUEST', '='.repeat(48), ''];
  for (const [k, v] of summaryRows(s)) lines.push(`${k.padEnd(24)}: ${v}`);
  if (s.quote) {
    lines.push('', 'QUOTATION', '-'.repeat(48));
    lines.push(`Amount                  : ${money(s.quote.amount, s.quote.currency)}`);
    lines.push(`Sent                    : ${s.quote.sentAt}`);
    if (s.quote.acceptedAt) lines.push(`Accepted                : ${s.quote.acceptedAt}`);
  }
  lines.push('', `Status: ${s.status}`);
  return lines.join('\n');
}

function shell(title, inner, preheader = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#F1F2F3;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F2F3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:6px;overflow:hidden;border:1px solid #E1E3E5">
<tr><td style="padding:22px 28px;border-bottom:3px solid ${RED}">
  <img src="${config.publicUrl}/assets/logo.png" width="170" alt="ProDesigners" style="display:block;border:0">
  <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};margin-top:8px">Pre-Construction Audit · BIM Coordination &amp; Clash Detection</div>
</td></tr>
<tr><td style="padding:28px">${inner}</td></tr>
<tr><td style="padding:18px 28px;background:#F7F7F8;font-size:12px;line-height:1.6;color:${MUTED}">
  <strong style="color:${INK}">${esc(config.company.name)}</strong><br>
  ${esc(config.company.address)}<br>
  Tel ${esc(config.company.phone)}${config.company.whatsapp ? ` · WhatsApp +${esc(config.company.whatsapp)}` : ''} · <a href="mailto:${esc(config.company.email)}" style="color:${RED}">${esc(config.company.email)}</a><br>
  <a href="${esc(config.company.website)}" style="color:${RED}">See our projects</a>
</td></tr></table></td></tr></table></body></html>`;
}

function table(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) =>
    `<tr><td style="padding:7px 10px 7px 0;color:${MUTED};vertical-align:top;width:40%;border-bottom:1px solid #EEF0F1">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid #EEF0F1;word-break:break-word">${/^https?:\/\//.test(v) ? `<a href="${esc(v)}" style="color:${RED}">${esc(v)}</a>` : esc(v)}</td></tr>`).join('')}</table>`;
}

const button = (href, label, color = RED) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:4px;margin:4px 8px 4px 0">${esc(label)}</a>`;

function clientAck(s) {
  const first = (s.client.name || '').split(' ')[0] || 'there';
  const inner = `
  <h1 style="font-size:22px;margin:0 0 12px">We received your drawings, ${esc(first)}.</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Thank you for choosing ProDesigners. Your request <strong>${esc(s.ref)}</strong> for <strong>${esc(s.project.name)}</strong> is with our BIM coordination team.</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 6px"><strong>What happens next</strong></p>
  <ol style="font-size:15px;line-height:1.7;margin:0 0 18px;padding-left:20px">
    <li>We check your files and confirm the scope.</li>
    <li>You receive your quotation by email${s.client.whatsapp ? ' and WhatsApp' : ''}, usually within 1–2 working days.</li>
    <li>Once you confirm, your audit report is ready in about one week.</li>
  </ol>
  ${table(summaryRows(s).filter(([k]) => !['Client name', 'Company', 'Phone', 'WhatsApp', 'Email', 'Preferred contact'].includes(k)))}
  <p style="font-size:14px;line-height:1.6;margin:18px 0 0;color:${MUTED}">Your drawings are kept confidential and used only to prepare your audit.</p>
  <div style="margin-top:18px">${config.company.whatsapp ? button(waLink(`Hello ProDesigners, about my audit request ${s.ref}`), 'Chat with us on WhatsApp', '#1F8F4E') : ''}${button(config.company.website, 'See our projects', INK)}</div>`;
  return {
    subject: `We received your project — ${s.ref} · ProDesigners Pre-Construction Audit`,
    html: shell('Request received', inner, `Reference ${s.ref}. Your quotation follows within 1–2 working days.`),
    text: `Hello ${first},\n\nWe received your Pre-Construction Audit request ${s.ref} (${s.project.name}). You will receive your quotation within 1–2 working days.\n\n${config.company.name}\n${config.company.phone} · ${config.company.email}`,
  };
}

function teamNotify(s, folderLink) {
  const inner = `
  <h1 style="font-size:20px;margin:0 0 6px">New audit request · ${esc(s.ref)}</h1>
  <p style="font-size:15px;margin:0 0 18px;color:${MUTED}">${esc(s.client.name)} · ${esc(s.project.type || '')} · ${esc(s.project.municipality || '')}</p>
  <div style="margin-bottom:18px">${button(`${config.publicUrl}/admin#${s.ref}`, 'Open & send quotation')}${folderLink ? button(folderLink, 'Open Nextcloud folder', INK) : ''}</div>
  ${table(summaryRows(s))}`;
  return {
    subject: `New audit request ${s.ref} — ${s.client.name} — ${s.project.name}`,
    html: shell('New request', inner),
    text: summaryRows(s).map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nDashboard: ${config.publicUrl}/admin#${s.ref}\nFolder: ${folderLink}`,
  };
}

function quoteBlock(s, q) {
  const scope = (q.scope || '').split(/\n|\|/).map(x => x.trim()).filter(Boolean);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E1E3E5;border-radius:6px;margin:6px 0 18px">
   <tr><td style="padding:18px 20px;border-bottom:1px solid #E1E3E5">
     <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${MUTED}">Quotation ${esc(s.ref)} · ${esc(s.project.name)}</div>
     <div style="font-size:32px;font-weight:700;margin-top:6px;color:${INK}">${esc(money(q.amount, q.currency))}</div>
     <div style="font-size:13px;color:${MUTED};margin-top:2px">${q.vatNote ? esc(q.vatNote) : 'Fixed fee for this project'}</div>
   </td></tr>
   <tr><td style="padding:16px 20px;font-size:14px;line-height:1.6">
     <strong>Included</strong>
     <ul style="margin:6px 0 12px;padding-left:18px">${scope.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
     <strong>Delivery:</strong> ${esc(q.deliveryDays)} working days after confirmation and receipt of complete drawings<br>
     <strong>Valid until:</strong> ${esc(q.validUntil)}<br>
     ${q.terms ? `<strong>Terms:</strong> ${esc(q.terms)}<br>` : ''}
     ${q.message ? `<p style="margin:12px 0 0">${esc(q.message).replace(/\n/g, '<br>')}</p>` : ''}
   </td></tr>
  </table>`;
}

function quoteEmail(s, q, link) {
  const first = (s.client.name || '').split(' ')[0] || '';
  const inner = `
  <h1 style="font-size:22px;margin:0 0 12px">Your audit quotation is ready${first ? ', ' + esc(first) : ''}.</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 12px">We reviewed the drawings you shared for <strong>${esc(s.project.name)}</strong>. Here is our fixed fee for the pre-construction audit (BIM coordination and clash detection).</p>
  ${quoteBlock(s, q)}
  <div>${button(link, 'Accept quotation')}${config.company.whatsapp ? button(waLink(`Hello ProDesigners, about quotation ${s.ref}`), 'Ask on WhatsApp', '#1F8F4E') : ''}</div>
  <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:18px 0 0">You can also reply to this email or call ${esc(config.company.phone)}.</p>`;
  return {
    subject: `Your quotation ${s.ref} — ${money(q.amount, q.currency)} · ProDesigners Pre-Construction Audit`,
    html: shell('Your quotation', inner, `${money(q.amount, q.currency)} · delivery in ${q.deliveryDays} working days`),
    text: `Hello ${first},\n\nYour Pre-Construction Audit quotation ${s.ref} for ${s.project.name}: ${money(q.amount, q.currency)}.\nDelivery: ${q.deliveryDays} working days. Valid until ${q.validUntil}.\n\nView and accept: ${link}\n\n${config.company.name} · ${config.company.phone}`,
  };
}

function quoteWhatsappText(s, q, link) {
  const first = (s.client.name || '').split(' ')[0] || '';
  return `Hello ${first}, this is ProDesigners.\n\nYour Pre-Construction Audit quotation for *${s.project.name}* (ref ${s.ref}) is ready:\n\n*${money(q.amount, q.currency)}*\nDelivery: ${q.deliveryDays} working days after confirmation\nValid until: ${q.validUntil}\n\nView details and accept here:\n${link}\n\nReply here with any question.`;
}

function acceptedNotify(s) {
  const inner = `<h1 style="font-size:20px;margin:0 0 10px">Quotation accepted · ${esc(s.ref)}</h1>
  <p style="font-size:15px;line-height:1.6">${esc(s.client.name)} accepted ${esc(money(s.quote.amount, s.quote.currency))} for ${esc(s.project.name)}.</p>
  <p>${button(`${config.publicUrl}/admin#${s.ref}`, 'Open in dashboard')}</p>${table(summaryRows(s))}`;
  return { subject: `✅ Accepted: ${s.ref} — ${s.client.name} — ${money(s.quote.amount, s.quote.currency)}`, html: shell('Accepted', inner), text: `${s.client.name} accepted quotation ${s.ref}.` };
}

function quoteDocument(s, q) {
  return shell(`Quotation ${s.ref}`, `<h1 style="font-size:22px;margin:0 0 12px">Quotation ${esc(s.ref)}</h1>
  <p style="font-size:14px;color:${MUTED};margin:0 0 12px">Issued ${new Date(q.sentAt).toLocaleDateString('en-GB')} to ${esc(s.client.name)}${s.client.company ? ', ' + esc(s.client.company) : ''}</p>${quoteBlock(s, q)}`);
}

module.exports = { esc, money, waLink, summaryRows, projectInfoText, clientAck, teamNotify, quoteEmail, quoteWhatsappText, acceptedNotify, quoteDocument };
