/* ProDesigners Pre-Construction Audit — site + request wizard */
(function () {
  'use strict';
  var SITE = window.SITE || {};
  var API = String(SITE.apiBase || '').replace(/\/+$/, ''); // empty = same server
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DRAFT_KEY = 'prd-audit-draft-v1';
  var store = {
    get: function () { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} },
  };

  $('#yr').textContent = new Date().getFullYear();
  $$('.js-maxmb').forEach(function (el) { el.textContent = SITE.maxFileMb || 500; });

  /* ---------- WhatsApp / contact links ---------- */
  var waNum = String(SITE.whatsapp || '').replace(/\D/g, '');
  function waHref(text) { return waNum ? 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(text) : 'tel:' + String(SITE.phone || '').replace(/\s/g, ''); }
  $$('.js-wa').forEach(function (a) {
    a.href = waHref(a.getAttribute('data-wa-text') || 'Hello ProDesigners');
    if (!waNum) {
      var lbl = $('.js-wa-label', a);
      if (lbl) lbl.textContent = 'Call ' + (SITE.phone || 'us');
      a.removeAttribute('target');
    }
  });
  if (waNum) {
    $('.js-wa-row').hidden = false;
    $('.js-wa-num').textContent = '+' + waNum.replace(/^(\d{3})(\d{4})(\d+)$/, '$1 $2 $3');
  } else {
    $('#fab').setAttribute('aria-label', 'Call us');
  }

  /* ---------- wizard ---------- */
  var form = $('#auditForm');
  var steps = $$('.step', form);
  var prog = $$('.progress li', form);
  var cur = 1;
  var files = []; // {file, id}
  var allowed = (SITE.allowedExt || []).map(function (x) { return x.toLowerCase(); });
  var maxBytes = (SITE.maxFileMb || 500) * 1024 * 1024;

  if (!SITE.backend) $('#demoBanner').hidden = false;
  // wake the upload server early (free hosting sleeps when idle)
  if (SITE.backend && API) { try { fetch(API + '/healthz', { mode: 'cors' }).catch(function () {}); } catch (e) {} }

  function val(name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el instanceof RadioNodeList) return el.value;
    if (el.type === 'checkbox') return el.checked;
    return (el.value || '').trim();
  }
  function multi(name) { return $$('input[name="' + name + '"]:checked', form).map(function (i) { return i.value; }); }

  function showStep(n, focus) {
    cur = n;
    steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
    prog.forEach(function (p) {
      var k = Number(p.dataset.step);
      p.classList.toggle('on', k === n);
      p.classList.toggle('done', k < n);
      if (k === n) p.setAttribute('aria-current', 'step'); else p.removeAttribute('aria-current');
    });
    $('#backBtn').hidden = n === 1;
    $('#nextBtn').hidden = n === 4;
    $('#submitBtn').hidden = n !== 4;
    $('#stepCount').textContent = 'Step ' + n + ' of 4';
    if (n === 4) renderReview();
    if (focus !== false) {
      var top = $('#start').getBoundingClientRect().top + window.scrollY - 70;
      if (Math.abs(window.scrollY - top) > 120) window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }
  prog.forEach(function (p) {
    p.addEventListener('click', function () { var k = Number(p.dataset.step); if (k < cur) showStep(k); });
  });

  function setErr(key, msg) { var e = $('[data-err="' + key + '"]', form); if (e) e.textContent = msg || ''; }

  function validate(n) {
    var ok = true;
    if (n === 1) {
      setErr('type', val('type') ? '' : 'Choose the type of project.');
      ok = !!val('type');
    }
    if (n === 3) {
      var good = files.filter(function (f) { return !f.problem; }).length;
      var has = good > 0 || /^https?:\/\//.test(val('filesLink'));
      setErr('files', has ? '' : 'Add at least one drawing, or paste a link to your files.');
      ok = has;
    }
    if (n === 4) {
      var name = !!val('cname');
      setErr('cname', name ? '' : 'Please enter your name.');
      var phone = val('phone').replace(/\D/g, '');
      var email = val('email');
      var emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      var contact = (phone.length >= 7 || email) && emailOk;
      setErr('contact', !emailOk ? 'The email address looks incomplete.' : (contact ? '' : 'Add your mobile number or email so we can send your quotation.'));
      var c = $('#consent').checked;
      setErr('consent', c ? '' : 'Please tick this box to continue.');
      $('#cname').classList.toggle('bad', !name);
      ok = name && contact && c;
    }
    if (!ok) {
      var first = $('.step:not([hidden]) .err:not(:empty)', form);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }

  $('#nextBtn').addEventListener('click', function () { if (validate(cur)) showStep(cur + 1); });
  $('#backBtn').addEventListener('click', function () { showStep(cur - 1); });
  // Enter in a text field moves forward instead of submitting
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault();
      var fields = $$('.step:not([hidden]) input[type=text], .step:not([hidden]) input[type=tel], .step:not([hidden]) input[type=email], .step:not([hidden]) input[type=url]', form).filter(function (x) { return !x.hidden; });
      var i = fields.indexOf(e.target);
      if (i >= 0 && i < fields.length - 1) fields[i + 1].focus();
      else if (cur < 4) $('#nextBtn').click();
    }
  });
  // auto-advance hint: after choosing project type on a phone, nudge the next question into view
  $$('input[name="type"]').forEach(function (r) {
    r.addEventListener('change', function () {
      setErr('type', '');
      if (window.innerWidth < 700) { var q = $('#l-stage'); if (q) setTimeout(function () { q.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150); }
    });
  });

  /* quick area chips + unit */
  $$('.quick button').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $('#' + b.parentNode.dataset.target);
      t.value = b.dataset.v;
      $$('button', b.parentNode).forEach(function (x) { x.classList.toggle('picked', x === b); });
      save();
    });
  });
  $('#area').addEventListener('input', function () { $$('.quick button').forEach(function (x) { x.classList.toggle('picked', x.dataset.v === $('#area').value); }); });
  $$('input[name="areaUnit"]').forEach(function (r) { r.addEventListener('change', function () { $('.js-unit').textContent = r.value; }); });

  /* WhatsApp same-number toggle */
  $('#waSame').addEventListener('change', function () { $('#whatsapp').hidden = this.checked; if (!this.checked) $('#whatsapp').focus(); });

  /* geolocation */
  $('#geoBtn').addEventListener('click', function () {
    var msg = $('#geoMsg');
    msg.className = 'okmsg';
    if (!navigator.geolocation) { msg.textContent = 'Location is not available on this device. Paste a Google Maps link instead.'; msg.classList.add('bad'); return; }
    msg.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
      $('#mapUrl').value = 'https://www.google.com/maps?q=' + lat + ',' + lng;
      msg.textContent = '✓ Location added (' + lat + ', ' + lng + ')';
      save();
    }, function () {
      msg.textContent = "We couldn't get your location. Paste a Google Maps link, or skip this.";
      msg.classList.add('bad');
    }, { enableHighAccuracy: true, timeout: 12000 });
  });

  /* ---------- files ---------- */
  var drop = $('#drop'), input = $('#fileInput'), list = $('#fileList');
  function fmt(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function extOf(n) { var m = /\.([a-z0-9]+)$/i.exec(n); return m ? m[1].toLowerCase() : ''; }
  function addFiles(fl) {
    Array.prototype.forEach.call(fl, function (f) {
      if (files.some(function (x) { return x.file.name === f.name && x.file.size === f.size; })) return;
      var ext = extOf(f.name), problem = '';
      if (allowed.length && allowed.indexOf(ext) < 0) problem = '.' + (ext || '?') + ' is not accepted. Zip it or use PDF / DWG.';
      else if (f.size > maxBytes) problem = 'Over ' + (SITE.maxFileMb || 500) + ' MB. Paste a link below instead.';
      else if ((SITE.maxFiles || 40) <= files.filter(function (x) { return !x.problem; }).length) problem = 'Too many files. Zip them together.';
      files.push({ file: f, id: Math.random().toString(36).slice(2), problem: problem });
    });
    renderFiles();
    setErr('files', '');
  }
  function renderFiles() {
    list.innerHTML = '';
    files.forEach(function (x) {
      var li = document.createElement('li');
      var ext = extOf(x.file.name);
      li.innerHTML = '<span class="ext ' + (ext === 'pdf' ? 'pdf' : '') + '"></span><span class="nm"><b></b><small></small></span><button type="button" class="rm" aria-label="Remove file">×</button>';
      $('.ext', li).textContent = ext.slice(0, 4) || 'file';
      $('b', li).textContent = x.file.name;
      var sm = $('small', li);
      sm.textContent = x.problem || fmt(x.file.size);
      if (x.problem) sm.className = 'bad';
      $('.rm', li).addEventListener('click', function () { files = files.filter(function (y) { return y !== x; }); renderFiles(); });
      list.appendChild(li);
    });
  }
  input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  // allow dropping anywhere on the form step
  document.addEventListener('dragover', function (e) { if (cur === 3) e.preventDefault(); });
  document.addEventListener('drop', function (e) { if (cur === 3 && e.target.closest && !e.target.closest('#drop')) { e.preventDefault(); if (e.dataTransfer) addFiles(e.dataTransfer.files); } });

  /* ---------- review ---------- */
  function collect() {
    var cc = val('cc');
    var phone = val('phone') ? cc + ' ' + val('phone').replace(/^0+/, '') : '';
    var wa = val('waSame') ? phone : val('whatsapp');
    return {
      website_url: val('website_url'),
      project: {
        name: val('pname'), type: val('type'), stage: val('stage'), disciplines: multi('disciplines'),
        area: val('area'), areaUnit: val('areaUnit') || 'm²', floors: val('floors'), basement: val('basement'), roof: val('roof'),
        municipality: val('municipality'), district: val('district'), plot: val('plot'), mapUrl: val('mapUrl'),
        timeline: val('timeline'), designer: val('designer'), filesLink: val('filesLink'), notes: val('notes'),
      },
      client: { name: val('cname'), company: val('company'), phone: phone, whatsapp: wa, email: val('email'), preferred: val('preferred') },
    };
  }
  function renderReview() {
    var d = collect(), p = d.project;
    var rows = [
      ['Project', [p.type, p.name].filter(Boolean).join(' · ')],
      ['Size', [p.area ? p.area + ' ' + p.areaUnit : '', [p.basement ? 'B+' : '', p.floors, p.roof ? '+R' : ''].join('')].filter(Boolean).join(' · ')],
      ['Location', [p.district, p.municipality].filter(Boolean).join(', ') + (p.mapUrl ? ' · pin added' : '')],
      ['Drawings', files.filter(function (f) { return !f.problem; }).length + ' file(s)' + (p.filesLink ? ' + link' : '') + (p.disciplines.length ? ' · ' + p.disciplines.join(', ') : '')],
    ];
    var box = $('#review');
    box.innerHTML = '<h4>Your project</h4><dl></dl>';
    var dl = $('dl', box);
    rows.forEach(function (r) {
      var dt = document.createElement('dt'); dt.textContent = r[0];
      var dd = document.createElement('dd'); dd.textContent = r[1] || '—';
      dl.appendChild(dt); dl.appendChild(dd);
    });
  }

  /* ---------- draft autosave ---------- */
  var saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      var data = {};
      $$('input, textarea, select', form).forEach(function (el) {
        if (!el.name || el.type === 'file' || el.name === 'website_url' || el.name === 'consent') return;
        if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
        else if (el.type === 'checkbox') { if (el.name === 'disciplines') { (data.disciplines = data.disciplines || []); if (el.checked) data.disciplines.push(el.value); } else data[el.name] = el.checked; }
        else data[el.name] = el.value;
      });
      store.set(data);
    }, 250);
  }
  function restore() {
    var d = store.get();
    if (!d) return;
    var any = false;
    Object.keys(d).forEach(function (k) {
      var v = d[k];
      if (k === 'disciplines') { $$('input[name="disciplines"]', form).forEach(function (i) { i.checked = v.indexOf(i.value) >= 0; }); return; }
      var els = $$('[name="' + k + '"]', form);
      els.forEach(function (el) {
        if (el.type === 'radio') { el.checked = el.value === v; if (el.checked) any = true; }
        else if (el.type === 'checkbox') el.checked = !!v;
        else if (v) { el.value = v; any = true; }
      });
    });
    $('#whatsapp').hidden = $('#waSame').checked;
    $('.js-unit').textContent = val('areaUnit') || 'm²';
    if (any) $('#restoreBar').hidden = false;
  }
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  $('#clearDraft').addEventListener('click', function () { store.clear(); form.reset(); files = []; renderFiles(); $('#restoreBar').hidden = true; showStep(1); });
  restore();

  /* ---------- submit + upload ---------- */
  var sub = null; // {ref, uploadToken}
  var queue = [];

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate(4)) return;
    start();
  });

  function api(method, url, body) {
    return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ').'); return j; }); });
  }

  function start() {
    var btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = 'Sending…';
    var data = collect();
    var p = SITE.backend ? api('POST', API + '/api/submissions', data) : new Promise(function (res) { setTimeout(function () { res({ ref: 'AS-' + String(new Date().getFullYear()).slice(-2) + '-DEMO', uploadToken: 'demo' }); }, 500); });
    p.then(function (r) {
      sub = r;
      form.hidden = true; $('#restoreBar').hidden = true;
      $('#sending').hidden = false;
      $('#start').scrollIntoView({ behavior: 'smooth' });
      queue = files.filter(function (f) { return !f.problem; }).map(function (f) { return { f: f, loaded: 0, state: 'wait', tries: 0 }; });
      renderUploads();
      runQueue();
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'Send my project';
      var msg = (err && err.message && !/Failed to fetch|NetworkError|Load failed/i.test(err.message)) ? err.message : 'We could not reach our server. Please try again in a minute, or call ' + (SITE.phone || 'us') + '.';
      setErr('consent', msg);
    });
  }

  function renderUploads() {
    var ul = $('#upList'); ul.innerHTML = '';
    queue.forEach(function (q) {
      var li = document.createElement('li');
      var ext = extOf(q.f.file.name);
      li.innerHTML = '<span class="ext ' + (ext === 'pdf' ? 'pdf' : '') + '"></span><span class="nm"><b></b><small></small><div class="bar"><i></i></div></span><span class="st"></span>';
      $('.ext', li).textContent = ext.slice(0, 4);
      $('b', li).textContent = q.f.file.name;
      $('small', li).textContent = fmt(q.f.file.size);
      q.li = li;
      ul.appendChild(li);
      paint(q);
    });
  }
  function paint(q) {
    var pct = q.f.file.size ? Math.round(q.loaded / q.f.file.size * 100) : 100;
    $('.bar i', q.li).style.width = (q.state === 'ok' ? 100 : pct) + '%';
    q.li.className = q.state === 'ok' ? 'ok' : q.state === 'fail' ? 'fail' : '';
    $('.st', q.li).textContent = q.state === 'ok' ? 'Done' : q.state === 'fail' ? 'Failed' : q.state === 'up' ? pct + '%' : 'Waiting';
    var total = queue.reduce(function (a, x) { return a + x.f.file.size; }, 0) || 1;
    var done = queue.reduce(function (a, x) { return a + (x.state === 'ok' ? x.f.file.size : x.loaded); }, 0);
    var tp = queue.length ? Math.min(100, Math.round(done / total * 100)) : 100;
    $('#totalBar').style.width = tp + '%';
    $('#totalPct').textContent = tp + '%';
  }

  function uploadOne(q) {
    return new Promise(function (resolve) {
      q.state = 'up'; q.loaded = 0; q.tries++; paint(q);
      if (!SITE.backend) { // preview simulation
        var t = setInterval(function () {
          q.loaded = Math.min(q.f.file.size, q.loaded + Math.max(q.f.file.size / 12, 1));
          paint(q);
          if (q.loaded >= q.f.file.size) { clearInterval(t); q.state = 'ok'; paint(q); resolve(); }
        }, 120);
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', API + '/api/submissions/' + encodeURIComponent(sub.ref) + '/files?name=' + encodeURIComponent(q.f.file.name));
      xhr.setRequestHeader('x-upload-token', sub.uploadToken);
      xhr.setRequestHeader('Content-Type', q.f.file.type || 'application/octet-stream');
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) { q.loaded = e.loaded; paint(q); } };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { q.state = 'ok'; }
        else { q.state = 'fail'; try { q.error = JSON.parse(xhr.responseText).error; } catch (e) { q.error = 'Upload failed'; } }
        paint(q); resolve();
      };
      xhr.onerror = xhr.ontimeout = function () { q.state = 'fail'; q.error = 'Connection lost'; paint(q); resolve(); };
      xhr.send(q.f.file);
    });
  }

  function runQueue() {
    $('#sendActions').hidden = true;
    $('#sendTitle').textContent = 'Sending your project…';
    $('#sendSub').textContent = 'Keep this page open until the upload finishes.';
    var pending = queue.filter(function (q) { return q.state !== 'ok'; });
    var i = 0;
    function worker() {
      if (i >= pending.length) return Promise.resolve();
      var q = pending[i++];
      return uploadOne(q).then(function () {
        if (q.state === 'fail' && q.tries < 3) { pending.push(q); } // automatic retry
        return worker();
      });
    }
    Promise.all([worker(), worker()]).then(function () {
      var failed = queue.filter(function (q) { return q.state === 'fail'; });
      if (failed.length) {
        $('#sendTitle').textContent = failed.length + ' file(s) did not upload';
        $('#sendSub').textContent = (failed[0].error || 'Check your connection') + '. Retry, or finish and send them later on WhatsApp.';
        $('#sendActions').hidden = false;
      } else finish();
    });
  }
  $('#retryBtn').addEventListener('click', function () { queue.forEach(function (q) { if (q.state === 'fail') { q.tries = 0; q.state = 'wait'; paint(q); } }); runQueue(); });
  $('#skipBtn').addEventListener('click', finish);

  function finish() {
    var p = SITE.backend ? api('POST', API + '/api/submissions/' + encodeURIComponent(sub.ref) + '/complete', { uploadToken: sub.uploadToken }) : Promise.resolve();
    p.catch(function () {}).then(function () {
      store.clear();
      $('#sending').hidden = true;
      $('#done').hidden = false;
      $('#doneRef').textContent = sub.ref;
      var d = collect();
      var via = d.client.preferred === 'Email' ? 'by email' : d.client.preferred === 'Both' ? 'by email and WhatsApp' : 'on WhatsApp';
      $('#doneMsg').textContent = 'We will send your quotation ' + via + ' within 1–2 working days.' + (d.client.email ? ' A confirmation is on its way to ' + d.client.email + '.' : '');
      var wa = $('#doneWa');
      wa.href = waHref('Hello ProDesigners, I just sent my project for a Pre-Construction Audit. My reference is ' + sub.ref + '.');
      $('#start').scrollIntoView({ behavior: 'smooth' });
    });
  }
  $('#another').addEventListener('click', function () {
    var keep = collect().client;
    form.reset(); files = []; renderFiles();
    // keep contact details for the next project
    $('#cname').value = keep.name; $('#email').value = keep.email; $('#company').value = keep.company;
    $('#done').hidden = true; form.hidden = false;
    var btn = $('#submitBtn'); btn.disabled = false; btn.textContent = 'Send my project';
    showStep(1);
  });

  /* hide the floating WhatsApp button while the form is on screen (it would cover Next) */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { $('#fab').classList.toggle('away', en[0].isIntersecting); }, { rootMargin: '0px 0px -10% 0px' }).observe($('#start'));
  }

  showStep(1, false);
})();
