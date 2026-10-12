// Minimal streaming WebDAV client for Nextcloud (public share link or user account).
const http = require('http');
const https = require('https');
const { URL } = require('url');
const config = require('./config');

const nc = config.nextcloud;

function authHeader() {
  const user = nc.mode === 'user' ? nc.user : nc.shareToken;
  const pass = nc.mode === 'user' ? nc.appPassword : nc.sharePassword;
  return 'Basic ' + Buffer.from(`${user}:${pass || ''}`).toString('base64');
}

const encPath = p => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');

function join(...parts) {
  return parts.filter(Boolean).join('/').split('/').filter(Boolean).join('/');
}

/** Low level request. body may be a Buffer/string or a readable stream (then pass length). */
function request(method, path, { headers = {}, body, length } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(nc.dav.replace(/\/+$/, '') + '/' + encPath(path));
    const lib = url.protocol === 'https:' ? https : http;
    const h = {
      Authorization: authHeader(),
      'X-Requested-With': 'XMLHttpRequest',
      'OCS-APIRequest': 'true',
      ...headers,
    };
    if (body && !body.pipe) h['Content-Length'] = Buffer.byteLength(body);
    else if (body && length != null) h['Content-Length'] = length;
    const req = lib.request(url, { method, headers: h }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body && body.pipe) {
      body.on('error', err => req.destroy(err));
      body.pipe(req);
    } else {
      req.end(body);
    }
    request.lastReq = req;
  });
}

function ensureOk(res, what) {
  if (res.status >= 200 && res.status < 300) return res;
  const msg = res.body ? res.body.toString().slice(0, 300) : '';
  const err = new Error(`Nextcloud ${what} failed (${res.status}) ${msg}`);
  err.status = res.status;
  throw err;
}

async function mkcol(path) {
  const res = await request('MKCOL', path);
  // 201 created, 405 already exists
  if (res.status === 201 || res.status === 405) return true;
  ensureOk(res, `create folder "${path}"`);
}

async function mkdirp(path) {
  const parts = path.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    await mkcol(cur);
  }
}

async function putBuffer(path, buf, contentType = 'application/octet-stream') {
  return ensureOk(await request('PUT', path, { body: buf, headers: { 'Content-Type': contentType } }), `upload "${path}"`);
}

async function putStream(path, stream, length, contentType = 'application/octet-stream') {
  return ensureOk(await request('PUT', path, { body: stream, length, headers: { 'Content-Type': contentType } }), `upload "${path}"`);
}

async function get(path) {
  const res = await request('GET', path);
  if (res.status === 404) return null;
  return ensureOk(res, `read "${path}"`).body;
}

async function del(path) {
  const res = await request('DELETE', path);
  if (res.status === 404) return;
  ensureOk(res, `delete "${path}"`);
}

/** Lists direct children of a folder: [{name, isDir}] */
async function list(path) {
  const res = await request('PROPFIND', path, {
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
  });
  if (res.status === 404) return [];
  ensureOk(res, `list "${path}"`);
  const xml = res.body.toString();
  const out = [];
  const responses = xml.split(/<d:response>/i).slice(1);
  responses.forEach((r, i) => {
    if (i === 0) return; // the folder itself
    const href = (r.match(/<d:href>([^<]+)<\/d:href>/i) || [])[1] || '';
    const name = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop());
    out.push({ name, isDir: /<d:collection\s*\/>/i.test(r) });
  });
  return out;
}

/** Link that opens the folder in the Nextcloud web UI */
function webLink(folderPath) {
  const full = '/' + join(nc.root, folderPath);
  if (process.env.NEXTCLOUD_FOLDER_LINK) return process.env.NEXTCLOUD_FOLDER_LINK.replace('{path}', encodeURIComponent(full));
  if (nc.mode === 'user') return `${nc.base}/apps/files/?dir=${encodeURIComponent(full)}`;
  return `${nc.base}/s/${nc.shareToken}?path=${encodeURIComponent(full)}`;
}

module.exports = { request, mkcol, mkdirp, putBuffer, putStream, get, del, list, join, webLink, root: () => nc.root };
