// ProDesigners — Pre-Construction Audit portal
// Website + client upload (streamed to Nextcloud) + quotation dashboard (email / WhatsApp).
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('./lib/config');
const store = require('./lib/store');
const dav = require('./lib/webdav');
const T = require('./lib/templates');
const { sendEmail, sendWhatsApp, waDigits } = require('./lib/notify');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

const PUB = path.join(__dirname, 'public');
const rand = (n = 18) => crypto.randomBytes(n).toString('base64url');
const clean = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const cleanML = (v, max = 3000) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max);
const safeName = s => clean(s, 80).replace(/[\\/:*?"<>|#%{}~&]/g, '').replace(/\s+/g, ' ').replace(/^\.+/, '').trim() || 'Unnamed';

// ---------- helpers ----------
function folderFor(s) {
  return safeName(config.nextcloud.folderPattern
    .replace('{ref}', s.ref)
    .replace('{client}', safeName(s.client.name))
    .replace('{project}', safeName(s.project.name))
    .replace('{date}', s.createdAt.slice(0, 10))).slice(0, 150);
}
const ncPath = (...p) => dav.join(dav.root(), ...p);
const uploadsDir = s => ncPath(s.folder, config.nextcloud.subfolders[0] || '');

async function writeInfo(s) {
  const pub = { ...s };
  delete pub.uploadToken;
  await dav.putBuffer(ncPath(s.folder, 'Project Info.txt'), Buffer.from(T.projectInfoText(s), 'utf8'), 'text/plain; charset=utf-8');
  await dav.putBuffer(ncPath(s.folder, '_submission.json'), Buffer.from(JSON.stringify(pub, null, 2)), 'application/json');
}

function quoteLink(s) { return `${config.publicUrl}/q/${s.ref}/${s.quoteToken}`; }

// rate limit for public endpoints
const hits = new Map();
function limited(ip, max = 15, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

// ---------- admin session (signed cookie) ----------
function sign(v) { return crypto.createHmac('sha256', config.sessionSecret).update(v).digest('base64url'); }
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
function isAdmin(req) {
  const c = readCookie(req, 'prd_admin');
  const [exp, sig] = c.split('.');
  return !!(exp && sig && Number(exp) > Date.now() && sign(exp) === sig);
}
function requireAdmin(req, res, next) {
  if (!config.adminPassword) return res.status(503).json({ error: 'Set ADMIN_PASSWORD in the server settings to use the dashboard.' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

// ---------- static site ----------
app.get('/site-config.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(
    `window.SITE=${JSON.stringify({
      phone: config.company.phone, whatsapp: config.company.whatsapp, email: config.company.email,
      website: config.company.website, address: config.company.address,
      maxFileMb: config.uploads.maxFileMb, maxFiles: config.uploads.maxFiles, allowedExt: config.uploads.allowedExt,
      backend: true,
    })};`);
});
// Home page: make social-share tags absolute so LinkedIn / Instagram / WhatsApp show the preview image
const fs = require('fs');
let indexHtml = null;
app.get(['/', '/index.html'], (req, res) => {
  if (!indexHtml) {
    indexHtml = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
      .replace('content="assets/og-image.jpg"', `content="${config.publicUrl}/assets/og-image.jpg"`)
      .replace('<meta property="og:type"', `<meta property="og:url" content="${config.publicUrl}/">\n<link rel="canonical" href="${config.publicUrl}/">\n<meta property="og:type"`);
  }
  res.type('html').set('Cache-Control', 'no-cache').send(indexHtml);
});
app.use(express.static(PUB, { extensions: ['html'], maxAge: '1h', index: false }));
app.get('/admin', (req, res) => res.sendFile(path.join(PUB, 'admin.html')));
app.get(['/q/:ref', '/q/:ref/:token'], (req, res) => res.sendFile(path.join(PUB, 'quote.html')));
app.get('/healthz', (req, res) => {
  const o = req.headers.origin;
  if (o && config.allowedOrigins.includes(o)) res.set('Access-Control-Allow-Origin', o);
  res.json({ ok: true });
});

const json = express.json({ limit: '200kb' });

// CORS for the public API, so the website can also be hosted on GitHub Pages
const origins = new Set([...config.allowedOrigins, new URL(config.publicUrl).origin]);
app.use(['/api/submissions', '/api/quote'], (req, res, next) => {
  const o = req.headers.origin;
  if (o && origins.has(o)) {
    res.set('Access-Control-Allow-Origin', o);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-upload-token');
    res.set('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(o && origins.has(o) ? 204 : 403);
  next();
});

// ---------- public API: submissions ----------
app.post('/api/submissions', json, async (req, res) => {
  const b = req.body || {};
  if (b.website_url) return res.json({ ref: 'AS-00-0000', uploadToken: 'x' }); // honeypot: silently drop bots
  if (limited(req.ip)) return res.status(429).json({ error: 'Too many requests from this connection. Please try again in an hour or contact us on WhatsApp.' });

  const c = b.client || {}, p = b.project || {};
  const errors = [];
  if (!clean(c.name)) errors.push('Your name is required.');
  if (!clean(c.phone) && !clean(c.email)) errors.push('Add a phone number or an email so we can send your quotation.');
  if (clean(c.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(c.email))) errors.push('The email address looks incomplete.');
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const ref = store.nextRef();
  const s = {
    ref,
    status: 'uploading',
    createdAt: new Date().toISOString(),
    uploadToken: rand(),
    quoteToken: rand(),
    client: {
      name: clean(c.name, 120), company: clean(c.company, 120),
      phone: clean(c.phone, 40), whatsapp: clean(c.whatsapp, 40), email: clean(c.email, 160),
      preferred: clean(c.preferred, 40), lang: clean(c.lang, 10),
    },
    project: {
      name: clean(p.name, 120) || `${clean(p.type, 40) || 'Project'} ${clean(p.district, 60)}`.trim(),
      type: clean(p.type, 60), stage: clean(p.stage, 60),
      disciplines: Array.isArray(p.disciplines) ? p.disciplines.map(x => clean(x, 40)).slice(0, 10) : [],
      area: clean(p.area, 20), plotArea: clean(p.plotArea, 20), areaUnit: clean(p.areaUnit, 6) || 'm²',
      floors: clean(p.floors, 20), basement: !!p.basement, roof: !!p.roof,
      municipality: clean(p.municipality, 60), district: clean(p.district, 80), plot: clean(p.plot, 40),
      mapUrl: /^https?:\/\//.test(clean(p.mapUrl, 400)) ? clean(p.mapUrl, 400) : '',
      timeline: clean(p.timeline, 40), designer: clean(p.designer, 120),
      filesLink: /^https?:\/\//.test(clean(p.filesLink, 500)) ? clean(p.filesLink, 500) : '',
      notes: cleanML(p.notes, 2000),
    },
    files: [],
    history: [{ at: new Date().toISOString(), event: 'Submitted from website' }],
  };
  s.folder = folderFor(s);

  try {
    await dav.mkdirp(ncPath(s.folder));
    for (const sub of config.nextcloud.subfolders) await dav.mkcol(ncPath(s.folder, sub));
    await writeInfo(s);
  } catch (e) {
    console.error('[submit] Nextcloud error', e.message);
    store.release(ref);
    return res.status(502).json({ error: 'Our file storage is not reachable right now. Please try again in a few minutes, or send your drawings on WhatsApp.' });
  }
  store.release(ref);
  store.upsert(s);
  res.json({ ref: s.ref, uploadToken: s.uploadToken });
});

// Streamed upload: browser PUTs the raw file, we pipe it straight into Nextcloud.
app.put('/api/submissions/:ref/files', async (req, res) => {
  const s = store.get(req.params.ref);
  if (!s || req.get('x-upload-token') !== s.uploadToken) return res.status(403).json({ error: 'This upload link is no longer valid. Please start again.' });
  if ((s.files || []).length >= config.uploads.maxFiles) return res.status(400).json({ error: `Up to ${config.uploads.maxFiles} files per project.` });

  const name = safeName(decodeURIComponent(req.query.name || 'file')).slice(0, 120);
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!config.uploads.allowedExt.includes(ext)) return res.status(400).json({ error: `.${ext} files are not accepted. Use PDF, DWG, DXF, RVT, IFC or ZIP.` });
  const len = parseInt(req.get('content-length') || '0', 10);
  if (!len) return res.status(411).json({ error: 'Empty file.' });
  if (len > config.uploads.maxFileMb * 1024 * 1024) return res.status(413).json({ error: `This file is larger than ${config.uploads.maxFileMb} MB. Share it with a WeTransfer / Google Drive link in the form instead.` });

  req.setTimeout(0);
  try {
    await dav.putStream(dav.join(uploadsDir(s), name), req, len, req.get('content-type') || 'application/octet-stream');
    const fresh = store.get(s.ref);
    fresh.files = (fresh.files || []).filter(f => f.name !== name);
    fresh.files.push({ name, size: len, at: new Date().toISOString() });
    store.upsert(fresh);
    res.json({ ok: true, name });
  } catch (e) {
    console.error('[upload]', s.ref, name, e.message);
    if (!res.headersSent) res.status(502).json({ error: 'The upload could not be saved. Please retry this file.' });
  }
});

app.post('/api/submissions/:ref/complete', json, async (req, res) => {
  const s = store.get(req.params.ref);
  if (!s || (req.body || {}).uploadToken !== s.uploadToken) return res.status(403).json({ error: 'Invalid request.' });
  if (s.status !== 'uploading') return res.json({ ok: true, ref: s.ref });
  s.status = 'new';
  s.history.push({ at: new Date().toISOString(), event: `Upload finished (${s.files.length} files)` });
  store.upsert(s);
  res.json({ ok: true, ref: s.ref });

  // after responding: write summary + notify
  try { await writeInfo(s); } catch (e) { console.error('[complete] info', e.message); }
  const link = dav.webLink(s.folder);
  const team = T.teamNotify(s, link);
  sendEmail({ to: config.mail.teamTo, ...team, replyTo: s.client.email || undefined });
  if (s.client.email) {
    const ack = T.clientAck(s);
    sendEmail({ to: s.client.email, ...ack, replyTo: config.company.email });
  }
});

// ---------- public API: quotation page ----------
function publicQuote(s) {
  return {
    ref: s.ref, status: s.status, client: { name: s.client.name },
    project: { name: s.project.name, type: s.project.type, district: s.project.district, municipality: s.project.municipality },
    quote: s.quote, company: config.company,
  };
}
app.get('/api/quote/:ref', (req, res) => {
  const s = store.get(req.params.ref);
  if (!s || req.query.t !== s.quoteToken || !s.quote) return res.status(404).json({ error: 'Quotation not found. Please check the link in your message.' });
  if (!s.quote.viewedAt) { s.quote.viewedAt = new Date().toISOString(); s.history.push({ at: s.quote.viewedAt, event: 'Client opened the quotation' }); store.upsert(s); }
  res.json(publicQuote(s));
});
app.post('/api/quote/:ref/accept', json, async (req, res) => {
  const s = store.get(req.params.ref);
  if (!s || (req.body || {}).t !== s.quoteToken || !s.quote) return res.status(404).json({ error: 'Quotation not found.' });
  if (!s.quote.acceptedAt) {
    s.quote.acceptedAt = new Date().toISOString();
    s.status = 'accepted';
    s.history.push({ at: s.quote.acceptedAt, event: 'Client accepted the quotation' });
    store.upsert(s);
    const m = T.acceptedNotify(s);
    sendEmail({ to: config.mail.teamTo, ...m });
    writeInfo(s).catch(() => {});
  }
  res.json(publicQuote(s));
});

// ---------- admin API ----------
app.post('/api/admin/login', json, (req, res) => {
  if (!config.adminPassword) return res.status(503).json({ error: 'ADMIN_PASSWORD is not set on the server.' });
  if (limited('login:' + req.ip, 20, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  const ok = crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String((req.body || {}).password || '')).digest(),
    crypto.createHash('sha256').update(config.adminPassword).digest());
  if (!ok) return res.status(401).json({ error: 'Wrong password.' });
  const exp = String(Date.now() + 14 * 24 * 3600 * 1000);
  const secure = config.publicUrl.startsWith('https') ? '; Secure' : '';
  res.set('Set-Cookie', `prd_admin=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 3600}${secure}`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.set('Set-Cookie', 'prd_admin=; Path=/; Max-Age=0').json({ ok: true });
});

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  res.json({
    submissions: store.all().filter(s => !s.reserved).map(s => ({
      ref: s.ref, status: s.status, createdAt: s.createdAt, client: s.client,
      project: { name: s.project.name, type: s.project.type, area: s.project.area, areaUnit: s.project.areaUnit, municipality: s.project.municipality, district: s.project.district },
      files: (s.files || []).length, quote: s.quote ? { amount: s.quote.amount, currency: s.quote.currency, sentAt: s.quote.sentAt, viewedAt: s.quote.viewedAt, acceptedAt: s.quote.acceptedAt } : null,
    })),
    settings: {
      mail: config.mail.enabled, whatsappApi: config.whatsapp.enabled && !!config.whatsapp.quoteTemplate,
      whatsappApiAny: config.whatsapp.enabled, currency: config.quote.currency,
      defaults: { deliveryDays: config.quote.defaultDeliveryDays, validityDays: config.quote.defaultValidityDays, scope: config.quote.defaultScope.split('|').join('\n'), terms: config.quote.defaultTerms },
      nextcloud: { mode: config.nextcloud.mode, base: config.nextcloud.base, root: config.nextcloud.root },
    },
  });
});

app.get('/api/admin/submissions/:ref', requireAdmin, (req, res) => {
  const s = store.get(req.params.ref);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json({ ...s, uploadToken: undefined, folderLink: dav.webLink(s.folder), quoteLink: s.quote ? quoteLink(s) : null, rows: T.summaryRows(s) });
});

app.post('/api/admin/submissions/:ref/status', requireAdmin, json, (req, res) => {
  const s = store.get(req.params.ref);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const allowed = ['new', 'reviewing', 'quoted', 'accepted', 'in-progress', 'delivered', 'declined', 'archived'];
  if (req.body.status && allowed.includes(req.body.status)) {
    s.status = req.body.status;
    s.history.push({ at: new Date().toISOString(), event: `Status → ${s.status}` });
  }
  if (typeof req.body.internalNote === 'string') s.internalNote = cleanML(req.body.internalNote, 4000);
  store.upsert(s);
  writeInfo(s).catch(() => {});
  res.json({ ok: true, status: s.status });
});

app.post('/api/admin/submissions/:ref/quote', requireAdmin, json, async (req, res) => {
  const s = store.get(req.params.ref);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const amount = Number(String(b.amount || '').replace(/[, ]/g, ''));
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter the price.' });
  const deliveryDays = parseInt(b.deliveryDays, 10) || config.quote.defaultDeliveryDays;
  const validityDays = parseInt(b.validityDays, 10) || config.quote.defaultValidityDays;
  const validUntil = new Date(Date.now() + validityDays * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const q = {
    amount, currency: clean(b.currency, 6) || config.quote.currency, deliveryDays, validityDays, validUntil,
    scope: cleanML(b.scope, 3000), terms: clean(b.terms, 1000), message: cleanML(b.message, 2000), vatNote: clean(b.vatNote, 120),
    sentAt: new Date().toISOString(), channels: {},
  };
  s.quote = q;
  s.status = 'quoted';
  const link = quoteLink(s);

  // Email
  if (b.sendEmail !== false && s.client.email) {
    const m = T.quoteEmail(s, q, link);
    q.channels.email = await sendEmail({ to: s.client.email, ...m, replyTo: config.company.email });
  }
  // WhatsApp
  const waTo = s.client.whatsapp || s.client.phone;
  const waText = T.quoteWhatsappText(s, q, link);
  if (b.sendWhatsApp !== false && waTo) {
    if (config.whatsapp.enabled) {
      const first = (s.client.name || '').split(' ')[0] || 'there';
      q.channels.whatsapp = config.whatsapp.quoteTemplate
        ? await sendWhatsApp({ to: waTo, template: config.whatsapp.quoteTemplate, params: [first, s.project.name, T.money(q.amount, q.currency), s.ref], buttonParam: `${s.ref}/${s.quoteToken}` })
        : await sendWhatsApp({ to: waTo, text: waText });
    }
    // Always give the dashboard a one-tap fallback link
    q.whatsappLink = `https://wa.me/${waDigits(waTo)}?text=${encodeURIComponent(waText)}`;
  }
  s.history.push({
    at: q.sentAt,
    event: `Quotation ${T.money(q.amount, q.currency)} sent` +
      (q.channels.email ? ` · email ${q.channels.email.ok ? (q.channels.email.simulated ? 'saved (SMTP not set)' : 'sent') : 'FAILED'}` : '') +
      (q.channels.whatsapp ? ` · WhatsApp ${q.channels.whatsapp.ok ? 'sent' : 'FAILED: ' + q.channels.whatsapp.error}` : ''),
  });
  store.upsert(s);
  try {
    await dav.putBuffer(ncPath(s.folder, `Quotation ${s.ref}.html`), Buffer.from(T.quoteDocument(s, q)), 'text/html; charset=utf-8');
    await writeInfo(s);
  } catch (e) { console.error('[quote] save to nextcloud', e.message); }
  res.json({ ok: true, quote: q, quoteLink: link, whatsappLink: q.whatsappLink });
});

// Setup checks from the dashboard
app.post('/api/admin/test/nextcloud', requireAdmin, async (req, res) => {
  const p = ncPath(`_connection-test-${Date.now()}.txt`);
  try {
    if (dav.root()) await dav.mkdirp(dav.root());
    await dav.putBuffer(p, Buffer.from('ProDesigners audit portal — connection test'), 'text/plain');
    await dav.del(p);
    res.json({ ok: true, message: `Nextcloud OK — can create folders and upload in ${config.nextcloud.mode === 'user' ? 'user' : 'share-link'} mode.` });
  } catch (e) {
    res.json({ ok: false, message: e.status === 401 || e.status === 403
      ? 'Nextcloud refused access. On the share link enable "Allow upload and editing" (and set NEXTCLOUD_SHARE_PASSWORD if the link has a password).'
      : e.message });
  }
});
app.post('/api/admin/test/email', requireAdmin, json, async (req, res) => {
  const to = clean((req.body || {}).to, 160) || config.mail.teamTo;
  const r = await sendEmail({ to, subject: 'Test email — ProDesigners audit portal', html: '<p>Email sending works.</p>', text: 'Email sending works.' });
  res.json({ ok: r.ok, message: r.ok ? (r.simulated ? 'SMTP is not configured — the email was saved on the server instead of being sent.' : `Sent to ${to}.`) : r.error });
});

// Rebuild local index from Nextcloud if this server starts with an empty disk
async function rebuildFromNextcloud() {
  if (!store.isEmpty()) return;
  try {
    const items = await dav.list(dav.root());
    const recs = [];
    for (const it of items.filter(i => i.isDir && /^AS-\d{2}-\d{4}/.test(i.name))) {
      const buf = await dav.get(ncPath(it.name, '_submission.json'));
      if (buf) { const r = JSON.parse(buf.toString()); r.uploadToken = rand(); recs.push(r); }
    }
    if (recs.length) { store.importMany(recs); console.log(`[startup] restored ${recs.length} submissions from Nextcloud`); }
  } catch (e) { console.warn('[startup] could not read Nextcloud index:', e.message); }
}

const server = app.listen(config.port, () => {
  console.log(`ProDesigners audit portal on ${config.publicUrl} (port ${config.port})`);
  console.log(`  Nextcloud: ${config.nextcloud.mode} mode → ${config.nextcloud.dav} /${config.nextcloud.root}`);
  console.log(`  Email: ${config.mail.enabled ? 'SMTP ' + config.mail.host : 'NOT configured (saved to data/outbox)'} · WhatsApp API: ${config.whatsapp.enabled ? 'on' : 'off (wa.me links)'}`);
  if (!config.adminPassword) console.warn('  ⚠ ADMIN_PASSWORD not set — dashboard disabled');
  if (!config.nextcloud.base) console.warn('  ⚠ NEXTCLOUD_SHARE_URL not set — uploads will fail');
  rebuildFromNextcloud();
});
server.requestTimeout = 0;   // large uploads on slow mobile connections
server.headersTimeout = 120000;
