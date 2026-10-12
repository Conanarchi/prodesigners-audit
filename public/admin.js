/* Dashboard: list requests, send quotations (email + WhatsApp), track status */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var data = { submissions: [], settings: {} };
  var filter = 'open';
  var STATUSES = ['new', 'reviewing', 'quoted', 'accepted', 'in-progress', 'delivered', 'declined', 'archived'];

  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401) { showLogin(); throw new Error(j.error || 'Please sign in'); } if (!r.ok) throw new Error(j.error || 'Error ' + r.status); return j; }); });
  }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3800);
  }
  function money(a, c) { return (c || data.settings.currency || 'QAR') + ' ' + Number(a).toLocaleString('en-US'); }
  function when(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

  function showLogin() { $('#login').hidden = false; $('#app').hidden = true; $('#topBtns').hidden = true; $('#pw').focus(); }
  $('#login').addEventListener('submit', function (e) {
    e.preventDefault();
    api('POST', '/api/admin/login', { password: $('#pw').value }).then(function () { $('#login').hidden = true; load(); })
      .catch(function (err) { $('#loginErr').textContent = err.message; });
  });
  $('#logoutBtn').addEventListener('click', function () { api('POST', '/api/admin/logout').then(showLogin); });

  function load() {
    return api('GET', '/api/admin/submissions').then(function (j) {
      data = j;
      $('#app').hidden = false; $('#topBtns').hidden = false;
      render();
      var h = location.hash.slice(1);
      if (h && /^AS-/.test(h) && $('#drawer').hidden) open(h);
    }).catch(function () {});
  }

  function render() {
    var s = data.submissions;
    var count = function (f) { return s.filter(f).length; };
    $('#stats').innerHTML = [
      ['New', count(function (x) { return x.status === 'new'; })],
      ['Awaiting reply', count(function (x) { return x.status === 'quoted'; })],
      ['Accepted', count(function (x) { return ['accepted', 'in-progress', 'delivered'].indexOf(x.status) >= 0; })],
      ['Total', s.length],
    ].map(function (k) { return '<div class="stat"><b>' + k[1] + '</b><span>' + k[0] + '</span></div>'; }).join('');

    var chips = [['open', 'Open'], ['new', 'New'], ['quoted', 'Quoted'], ['accepted', 'Accepted'], ['all', 'All']];
    $('#statusChips').innerHTML = chips.map(function (c) { return '<button type="button" data-f="' + c[0] + '" class="' + (filter === c[0] ? 'picked' : '') + '">' + c[1] + '</button>'; }).join('');
    Array.prototype.forEach.call($('#statusChips').querySelectorAll('button'), function (b) {
      b.style.cssText = filter === b.dataset.f ? 'background:var(--ink);color:var(--bg);border-color:var(--ink)' : '';
      b.onclick = function () { filter = b.dataset.f; render(); };
    });

    var q = ($('#q').value || '').toLowerCase();
    var rows = s.filter(function (x) {
      if (filter === 'open' && ['declined', 'archived', 'delivered'].indexOf(x.status) >= 0) return false;
      if (filter === 'accepted' && ['accepted', 'in-progress', 'delivered'].indexOf(x.status) < 0) return false;
      if (['new', 'quoted'].indexOf(filter) >= 0 && x.status !== filter) return false;
      if (q && JSON.stringify(x).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var box = $('#rows');
    if (!rows.length) { box.innerHTML = '<div class="empty">' + (s.length ? 'Nothing matches this filter.' : 'No requests yet. Share the website link and new requests will appear here.') + '</div>'; return; }
    box.innerHTML = rows.map(function (x) {
      return '<button type="button" class="row" data-ref="' + esc(x.ref) + '">' +
        '<span class="ref">' + esc(x.ref) + '<small>' + esc(when(x.createdAt)) + '</small></span>' +
        '<span class="who"><b>' + esc(x.client.name) + '</b><small>' + esc(x.project.name) + '</small></span>' +
        '<span class="c3"><small>' + esc([x.project.type, x.project.area ? x.project.area + ' ' + x.project.areaUnit : '', x.project.district || x.project.municipality].filter(Boolean).join(' · ')) + '</small><small>' + x.files + ' file(s)</small></span>' +
        '<span class="badge b-' + esc(x.status) + '">' + esc(x.status.replace('-', ' ')) + '</span>' +
        '<span class="amt">' + (x.quote ? esc(money(x.quote.amount, x.quote.currency)) + (x.quote.viewedAt && !x.quote.acceptedAt ? '<small>seen</small>' : '') : '<small>—</small>') + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.row'), function (r) { r.onclick = function () { open(r.dataset.ref); }; });
  }
  $('#q').addEventListener('input', render);

  /* ---------- detail drawer ---------- */
  function open(ref) {
    api('GET', '/api/admin/submissions/' + encodeURIComponent(ref)).then(function (s) {
      history.replaceState(null, '', '#' + ref);
      $('#drawer').hidden = false; document.body.style.overflow = 'hidden';
      $('#dTitle').textContent = s.ref + ' · ' + s.client.name;
      $('#dSub').textContent = s.project.name + ' — received ' + when(s.createdAt);
      var st = data.settings, d = st.defaults || {};
      var q = s.quote || {};
      var waTo = s.client.whatsapp || s.client.phone;
      var html = '';

      html += '<div class="sec"><h3>Quick actions</h3><div class="btns">' +
        '<a class="btn btn-dark btn-sm" target="_blank" rel="noopener" href="' + esc(s.folderLink) + '">Open Nextcloud folder ↗</a>' +
        (waTo ? '<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(waTo).replace(/\D/g, '').replace(/^00/, '')) + '">WhatsApp client</a>' : '') +
        (s.client.email ? '<a class="btn btn-ghost btn-sm" href="mailto:' + esc(s.client.email) + '?subject=' + encodeURIComponent('Your audit request ' + s.ref) + '">Email client</a>' : '') +
        (s.client.phone ? '<a class="btn btn-ghost btn-sm" href="tel:' + esc(s.client.phone.replace(/\s/g, '')) + '">Call</a>' : '') +
        '</div></div>';

      // quotation form
      html += '<div class="sec"><h3>' + (s.quote ? 'Quotation (sent ' + esc(when(q.sentAt)) + ')' : 'Send quotation') + '</h3>' +
        (q.acceptedAt ? '<p class="okmsg" style="margin:0 0 12px">✓ Accepted by the client on ' + esc(when(q.acceptedAt)) + '</p>' : q.viewedAt ? '<p style="margin:0 0 12px;color:var(--muted);font-size:14px">Client opened the quotation on ' + esc(when(q.viewedAt)) + '</p>' : '') +
        '<form id="qForm">' +
        '<div class="qgrid">' +
          '<div class="qf amtf"><label for="qAmt">Price (' + esc(st.currency) + ')</label><input id="qAmt" type="text" inputmode="decimal" required placeholder="e.g. 6500" value="' + esc(q.amount || '') + '"></div>' +
          '<div class="qf"><label for="qDays">Delivery (working days)</label><input id="qDays" type="text" inputmode="numeric" value="' + esc(q.deliveryDays || d.deliveryDays) + '"></div>' +
          '<div class="qf"><label for="qValid">Valid for (days)</label><input id="qValid" type="text" inputmode="numeric" value="' + esc(q.validityDays || d.validityDays) + '"></div>' +
        '</div>' +
        '<div class="qf"><label for="qScope">Included (one per line)</label><textarea id="qScope" rows="5">' + esc(q.scope || d.scope) + '</textarea></div>' +
        '<div class="qf"><label for="qTerms">Payment terms</label><input id="qTerms" type="text" value="' + esc(q.terms != null ? q.terms : d.terms) + '"></div>' +
        '<div class="qf"><label for="qMsg">Personal message <span class="hint">optional</span></label><textarea id="qMsg" rows="2" placeholder="e.g. We noticed the MEP drawings are missing — the price covers architecture + structure.">' + esc(q.message || '') + '</textarea></div>' +
        '<div class="chan">' +
          '<label class="tog"><input type="checkbox" id="chEmail" ' + (s.client.email ? 'checked' : 'disabled') + '><span>Email ' + (s.client.email ? esc(s.client.email) : '(no email given)') + '</span></label>' +
          '<label class="tog"><input type="checkbox" id="chWa" ' + (waTo ? 'checked' : 'disabled') + '><span>WhatsApp ' + (waTo ? esc(waTo) : '(no number given)') + '</span></label>' +
        '</div>' +
        '<button class="btn btn-red" type="submit" id="qSend">' + (s.quote ? 'Update & resend quotation' : 'Send quotation') + '</button>' +
        '<p style="font-size:13px;color:var(--muted);margin-top:10px">' +
          (st.mail ? 'Email is sent automatically.' : '⚠ Email (SMTP) is not configured yet: emails are saved on the server, not sent.') + ' ' +
          (st.whatsappApi ? 'WhatsApp is sent automatically through the WhatsApp Business API.' : 'WhatsApp opens with the message ready: just press send.') +
        '</p>' +
        '<div id="qResult"></div>' +
        (s.quoteLink ? '<p style="font-size:13px;margin-top:10px">Client quotation page: <a href="' + esc(s.quoteLink) + '" target="_blank" rel="noopener">open ↗</a></p>' : '') +
        '</form></div>';

      // details
      html += '<div class="sec"><h3>Project & client</h3><dl class="kv">' + s.rows.map(function (r) {
        var v = /^https?:\/\//.test(r[1]) ? '<a href="' + esc(r[1]) + '" target="_blank" rel="noopener">' + esc(r[1]) + '</a>' : esc(r[1]);
        return '<dt>' + esc(r[0]) + '</dt><dd>' + v + '</dd>';
      }).join('') + '</dl></div>';

      // status + note
      html += '<div class="sec"><h3>Status & internal note</h3>' +
        '<div class="qf"><label for="stSel">Status</label><select id="stSel">' + STATUSES.map(function (x) { return '<option value="' + x + '"' + (x === s.status ? ' selected' : '') + '>' + x.replace('-', ' ') + '</option>'; }).join('') + '</select></div>' +
        '<div class="qf"><label for="note">Internal note (not shared with the client)</label><textarea id="note" rows="3">' + esc(s.internalNote || '') + '</textarea></div>' +
        '<button class="btn btn-ghost btn-sm" id="saveSt" type="button">Save</button></div>';

      // history
      html += '<div class="sec"><h3>History</h3><ul class="hist">' + (s.history || []).slice().reverse().map(function (h) { return '<li><time>' + esc(when(h.at)) + '</time>' + esc(h.event) + '</li>'; }).join('') + '</ul></div>';

      $('#dBody').innerHTML = html;

      $('#qForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = $('#qSend'); btn.disabled = true; btn.textContent = 'Sending…';
        api('POST', '/api/admin/submissions/' + encodeURIComponent(s.ref) + '/quote', {
          amount: $('#qAmt').value, deliveryDays: $('#qDays').value, validityDays: $('#qValid').value,
          scope: $('#qScope').value, terms: $('#qTerms').value, message: $('#qMsg').value,
          sendEmail: $('#chEmail').checked, sendWhatsApp: $('#chWa').checked,
        }).then(function (r) {
          var ch = r.quote.channels || {};
          var out = '<div class="result">';
          if (ch.email) out += ch.email.ok ? '<span class="okk">✓ Email ' + (ch.email.simulated ? 'saved (SMTP not set up)' : 'sent') + '</span>' : '<span class="no">✕ Email failed: ' + esc(ch.email.error) + '</span>';
          if (ch.whatsapp) out += ch.whatsapp.ok ? '<span class="okk">✓ WhatsApp sent</span>' : '<span class="no">✕ WhatsApp API: ' + esc(ch.whatsapp.error) + '</span>';
          if (r.whatsappLink && !(ch.whatsapp && ch.whatsapp.ok)) out += '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + esc(r.whatsappLink) + '">Open WhatsApp with the quotation →</a>';
          out += '<span>Client quotation page: <a class="qlink" href="' + esc(r.quoteLink) + '" target="_blank" rel="noopener">open ↗</a></span>';
          out += '</div>';
          $('#qResult').innerHTML = out;
          btn.disabled = false; btn.textContent = 'Update & resend quotation';
          toast('Quotation ' + money(r.quote.amount, r.quote.currency) + ' saved');
          load();
        }).catch(function (err) { btn.disabled = false; btn.textContent = 'Send quotation'; toast(err.message); });
      });
      $('#saveSt').addEventListener('click', function () {
        api('POST', '/api/admin/submissions/' + encodeURIComponent(s.ref) + '/status', { status: $('#stSel').value, internalNote: $('#note').value })
          .then(function () { toast('Saved'); load(); }).catch(function (err) { toast(err.message); });
      });
    }).catch(function (err) { toast(err.message); });
  }
  function close() { $('#drawer').hidden = true; document.body.style.overflow = ''; history.replaceState(null, '', location.pathname); }
  $('#closeBtn').addEventListener('click', close);
  $('#drawer').addEventListener('click', function (e) { if (e.target.id === 'drawer') close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#drawer').hidden) close(); });

  /* ---------- setup checks ---------- */
  $('#setupBtn').addEventListener('click', function () {
    var st = data.settings;
    $('#drawer').hidden = false; document.body.style.overflow = 'hidden';
    $('#dTitle').textContent = 'Setup check'; $('#dSub').textContent = 'Test the connections after deployment';
    $('#dBody').innerHTML = '<div class="sec setup"><h3>Connections</h3>' +
      '<div class="line"><span class="dot on"></span> Nextcloud (' + esc(st.nextcloud.mode) + ' mode) → ' + esc(st.nextcloud.base) + (st.nextcloud.root ? ' / ' + esc(st.nextcloud.root) : '') + ' <button class="btn btn-ghost btn-sm" id="tNc" type="button">Test upload</button></div>' +
      '<div class="line"><span class="dot ' + (st.mail ? 'on' : 'off') + '"></span> Email ' + (st.mail ? 'configured' : 'not configured (SMTP)') + ' <input id="tTo" type="email" placeholder="send test to…" style="max-width:220px;min-height:40px"> <button class="btn btn-ghost btn-sm" id="tMail" type="button">Send test</button></div>' +
      '<div class="line"><span class="dot ' + (st.whatsappApi ? 'on' : 'off') + '"></span> WhatsApp ' + (st.whatsappApi ? 'Business API with template' : st.whatsappApiAny ? 'API set, template missing (free text only works within 24 h of the client writing to you)' : 'one-tap links (no API)') + '</div>' +
      '<div id="tOut" class="result" hidden></div></div>';
    var out = function (r) { var o = $('#tOut'); o.hidden = false; o.innerHTML = '<span class="' + (r.ok ? 'okk' : 'no') + '">' + esc(r.message) + '</span>'; };
    $('#tNc').onclick = function () { out({ ok: true, message: 'Testing…' }); api('POST', '/api/admin/test/nextcloud').then(out).catch(function (e) { out({ ok: false, message: e.message }); }); };
    $('#tMail').onclick = function () { api('POST', '/api/admin/test/email', { to: $('#tTo').value }).then(out).catch(function (e) { out({ ok: false, message: e.message }); }); };
  });

  load().then(function () { if ($('#app').hidden && $('#login').hidden) showLogin(); });
  setInterval(function () { if (!$('#app').hidden && $('#drawer').hidden) load(); }, 60000);
})();
