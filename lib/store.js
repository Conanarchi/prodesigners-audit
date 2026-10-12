// Tiny JSON store for submissions. Each record is also mirrored to Nextcloud
// (_submission.json inside the project folder), so the index can be rebuilt
// from Nextcloud if the server's disk is ever wiped.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const file = path.join(config.dataDir, 'submissions.json');
fs.mkdirSync(config.dataDir, { recursive: true });

let db = { submissions: [] };
try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
if (!Array.isArray(db.submissions)) db.submissions = [];

let writing = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(db, null, 2);
  writing = writing.then(() => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, snapshot);
    fs.renameSync(tmp, file);
  }).catch(e => console.error('[store] save failed', e));
  return writing;
}

const store = {
  all() {
    return [...db.submissions].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },
  get(ref) {
    return db.submissions.find(s => s.ref === ref) || null;
  },
  upsert(rec) {
    const i = db.submissions.findIndex(s => s.ref === rec.ref);
    rec.updatedAt = new Date().toISOString();
    if (i >= 0) db.submissions[i] = rec; else db.submissions.push(rec);
    save();
    return rec;
  },
  isEmpty() { return db.submissions.length === 0; },
  /** AS-26-0001 style, sequential per year */
  nextRef() {
    const yy = String(new Date().getFullYear()).slice(-2);
    const prefix = `AS-${yy}-`;
    const max = db.submissions
      .filter(s => s.ref && s.ref.startsWith(prefix))
      .reduce((m, s) => Math.max(m, parseInt(s.ref.slice(prefix.length), 10) || 0), 0);
    const ref = prefix + String(max + 1).padStart(4, '0');
    // reserve immediately so parallel requests don't collide
    db.submissions.push({ ref, reserved: true, createdAt: new Date().toISOString() });
    return ref;
  },
  release(ref) {
    db.submissions = db.submissions.filter(s => !(s.ref === ref && s.reserved));
  },
  importMany(recs) {
    for (const r of recs) if (r && r.ref && !store.get(r.ref)) db.submissions.push(r);
    save();
  },
};

module.exports = store;
