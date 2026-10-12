// Email (SMTP via nodemailer) + WhatsApp (Meta Cloud API) senders.
// Without SMTP settings, emails are saved to data/outbox so nothing is lost while testing.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('./config');

let transport = null;
if (config.mail.enabled) {
  transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
}

function parseAddr(a) {
  const m = String(a).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, ''), email: m[2] } : { email: String(a).trim() };
}

async function sendViaBrevo({ to, subject, html, text, replyTo }) {
  const body = {
    sender: parseAddr(config.mail.from),
    to: String(to).split(',').map(s => s.trim()).filter(Boolean).map(email => ({ email })),
    subject, htmlContent: html, textContent: text,
  };
  if (replyTo) body.replyTo = { email: replyTo };
  if (config.mail.bcc) body.bcc = config.mail.bcc.split(',').map(email => ({ email: email.trim() }));
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.mail.brevoKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.message || `Brevo HTTP ${r.status}` };
    return { ok: true, id: j.messageId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendEmail({ to, subject, html, text, replyTo, attachments }) {
  if (!to) return { ok: false, error: 'No recipient' };
  if (config.mail.brevoKey) {
    const r = await sendViaBrevo({ to, subject, html, text, replyTo });
    if (!r.ok) console.error('[mail] Brevo failed', r.error);
    return r;
  }
  if (!transport) {
    const dir = path.join(config.dataDir, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${Date.now()}-${String(to).replace(/[^a-z0-9@.]/gi, '_')}.html`);
    fs.writeFileSync(f, `<!-- To: ${to}\nSubject: ${subject} -->\n${html}`);
    console.log(`[mail] SMTP not configured — saved "${subject}" for ${to} to ${f}`);
    return { ok: true, simulated: true };
  }
  try {
    const info = await transport.sendMail({
      from: config.mail.from, to, subject, html, text, replyTo,
      bcc: config.mail.bcc || undefined, attachments,
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    console.error('[mail] failed', e.message);
    return { ok: false, error: e.message };
  }
}

/** Normalises a phone to WhatsApp digits (country code + number) */
function waDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '974' + d; // Qatar local number
  return d;
}

/**
 * Sends a WhatsApp message through the Cloud API.
 * Business-initiated messages need an approved template (WHATSAPP_QUOTE_TEMPLATE);
 * if the client messaged you in the last 24h a free-text message also works.
 */
async function sendWhatsApp({ to, text, template, params = [], buttonParam }) {
  const w = config.whatsapp;
  if (!w.enabled) return { ok: false, notConfigured: true };
  const url = `https://graph.facebook.com/${w.apiVersion}/${w.phoneNumberId}/messages`;
  const body = template
    ? {
        messaging_product: 'whatsapp', to: waDigits(to), type: 'template',
        template: {
          name: template, language: { code: w.templateLang },
          components: [
            { type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) },
            ...(buttonParam ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: buttonParam }] }] : []),
          ],
        },
      }
    : { messaging_product: 'whatsapp', to: waDigits(to), type: 'text', text: { body: text, preview_url: true } };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error?.message || `HTTP ${r.status}` };
    return { ok: true, id: j.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendEmail, sendWhatsApp, waDigits };
