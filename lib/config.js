// Central configuration — everything comes from environment variables (.env).
require('dotenv').config();

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const bool = (k, d = false) => {
  const v = env(k, d ? 'true' : 'false').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v);
};

// Nextcloud: either a public share link (with "Allow upload and editing")
// or a Nextcloud user + app password. Share link is parsed automatically.
const shareUrl = env('NEXTCLOUD_SHARE_URL'); // set in .env / hosting settings — never commit it
let ncBase = env('NEXTCLOUD_URL');
let shareToken = env('NEXTCLOUD_SHARE_TOKEN');
if (shareUrl) {
  const m = shareUrl.match(/^(https?:\/\/[^/]+(?:\/[^?#]*?)?)\/(?:index\.php\/)?s\/([A-Za-z0-9]+)/);
  if (m) {
    ncBase = ncBase || m[1];
    shareToken = shareToken || m[2];
  }
}
ncBase = ncBase.replace(/\/+$/, '');
const ncUser = env('NEXTCLOUD_USER');
const ncMode = ncUser ? 'user' : 'share';

const config = {
  port: parseInt(env('PORT', '3000'), 10),
  publicUrl: env('PUBLIC_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  dataDir: env('DATA_DIR', require('path').join(__dirname, '..', 'data')),
  sessionSecret: env('SESSION_SECRET', 'change-me-' + (process.env.HOSTNAME || 'local')),
  adminPassword: env('ADMIN_PASSWORD'),
  // Other sites allowed to call the API (e.g. the GitHub Pages copy of the website)
  allowedOrigins: env('ALLOWED_ORIGINS', 'https://conanarchi.github.io').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean),

  company: {
    name: env('COMPANY_NAME', 'ProDesigners & Consultancy'),
    phone: env('COMPANY_PHONE', '+974 4469 9162'),
    whatsapp: env('COMPANY_WHATSAPP', ''), // digits with country code, e.g. 97455551234
    email: env('COMPANY_EMAIL', 'Contact@prodesigners-qatar.com'),
    website: env('COMPANY_WEBSITE', 'https://prodesigners-qatar.com/'),
    address: env('COMPANY_ADDRESS', 'Building 382, Office 2, Khalifa Avenue, Zone 32, Doha, Qatar'),
  },

  nextcloud: {
    mode: ncMode,
    base: ncBase,
    shareToken,
    sharePassword: env('NEXTCLOUD_SHARE_PASSWORD'),
    user: ncUser,
    appPassword: env('NEXTCLOUD_APP_PASSWORD'),
    // Folder inside the share (or user's files) where client projects are created
    root: env('NEXTCLOUD_ROOT', ncMode === 'user' ? 'Pre-Construction Audit' : ''),
    davUrl: env('NEXTCLOUD_DAV_URL'), // optional override
    folderPattern: env('FOLDER_PATTERN', '{ref} - {client} - {project}'),
    subfolders: env('PROJECT_SUBFOLDERS', '01 Client Drawings,02 BIM Model,03 Clash Detection,04 Audit Report')
      .split(',').map(s => s.trim()).filter(Boolean),
  },

  uploads: {
    maxFileMb: parseInt(env('MAX_FILE_MB', '500'), 10),
    maxFiles: parseInt(env('MAX_FILES', '40'), 10),
    allowedExt: env('ALLOWED_EXT', 'pdf,dwg,dxf,dwf,dwfx,rvt,rfa,ifc,nwd,nwc,skp,zip,rar,7z,jpg,jpeg,png,heic,webp,xlsx,xls,docx,doc')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  },

  mail: {
    host: env('SMTP_HOST'),
    port: parseInt(env('SMTP_PORT', '587'), 10),
    secure: bool('SMTP_SECURE', false),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM', 'ProDesigners Audit <Contact@prodesigners-qatar.com>'),
    teamTo: env('TEAM_EMAIL', 'Contact@prodesigners-qatar.com'),
    bcc: env('MAIL_BCC'),
  },

  whatsapp: {
    token: env('WHATSAPP_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    apiVersion: env('WHATSAPP_API_VERSION', 'v21.0'),
    quoteTemplate: env('WHATSAPP_QUOTE_TEMPLATE', ''), // approved template name, e.g. audit_quotation
    templateLang: env('WHATSAPP_TEMPLATE_LANG', 'en'),
    teamNotify: env('WHATSAPP_TEAM_NOTIFY', ''), // optional team number to alert on new submissions (template needed)
  },

  quote: {
    currency: env('QUOTE_CURRENCY', 'QAR'),
    defaultDeliveryDays: parseInt(env('QUOTE_DELIVERY_DAYS', '7'), 10),
    defaultValidityDays: parseInt(env('QUOTE_VALIDITY_DAYS', '14'), 10),
    defaultScope: env('QUOTE_SCOPE',
      'Review of architectural, structural and site/civil drawings|BIM model of the critical elements (architecture + structure)|Automated clash detection across disciplines|Audit report with clash list, screenshots and recommendations|One review meeting to walk you through the findings'),
    defaultTerms: env('QUOTE_TERMS', '50% on confirmation, 50% on delivery of the audit report. Structural calculations are not included.'),
  },
};

config.nextcloud.dav = config.nextcloud.davUrl ||
  (ncMode === 'user'
    ? `${ncBase}/remote.php/dav/files/${encodeURIComponent(ncUser)}`
    : `${ncBase}/public.php/webdav`);

// Brevo (HTTP email API) — works on hosts that block SMTP ports, e.g. Render's free plan
config.mail.brevoKey = env('BREVO_API_KEY');
config.mail.enabled = !!(config.mail.host || config.mail.brevoKey);
config.whatsapp.enabled = !!(config.whatsapp.token && config.whatsapp.phoneNumberId);

module.exports = config;
