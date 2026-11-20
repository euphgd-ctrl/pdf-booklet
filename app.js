(function () {
  'use strict';
  const VERSION = 'v1.0.0';
  const $ = (id) => document.getElementById(id);
  const els = {
    file: $('file'), drop: $('drop'), dropText: $('drop-text'),
    paper: $('paper'), sig: $('sig'), margin: $('margin'), gutter: $('gutter'), flip: $('flip'),
    result: $('result'), summary: $('summary'), sheets: $('sheets'),
    download: $('download'), share: $('share'), hint: $('print-hint'), status: $('status'),
  };
  $('version').textContent = VERSION;

  let srcBytes = null, srcName = 'document.pdf', outUrl = null, outFile = null, busy = 0;

  // Restore saved options.
  const OPTS = ['paper', 'sig', 'margin', 'gutter'];
  try {
    const saved = JSON.parse(localStorage.getItem('booklet-opts') || '{}');
    OPTS.forEach((k) => { if (saved[k] != null) els[k].value = saved[k]; });
    if (saved.flip != null) els.flip.checked = saved.flip;
  } catch (_) { /* storage unavailable */ }

  function saveOpts() {
    try {
      const o = { flip: els.flip.checked };
      OPTS.forEach((k) => { o[k] = els[k].value; });
      localStorage.setItem('booklet-opts', JSON.stringify(o));
    } catch (_) { /* ignore */ }
  }

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.classList.toggle('error', !!isError);
  }

  async function loadFile(file) {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setStatus('That does not look like a PDF.', true);
      return;
    }
    srcName = file.name || 'document.pdf';
    els.dropText.textContent = srcName;
    srcBytes = new Uint8Array(await file.arrayBuffer());
    generate();
  }

  async function generate() {
    saveOpts();
    if (!srcBytes) return;
    const ticket = ++busy;
    setStatus('Building booklet…');
    try {
      const flipBacks = els.flip.checked;
      const res = await Booklet.build(srcBytes.slice(), {
        paper: els.paper.value,
        sigSheets: parseInt(els.sig.value, 10),
        margin: parseFloat(els.margin.value),
        gutter: parseFloat(els.gutter.value),
        flipBacks,
        title: srcName.replace(/\.pdf$/i, '') + ' (booklet)',
      });
      if (ticket !== busy) return; // superseded by a newer run
      render(res, flipBacks);
      setStatus('');
    } catch (err) {
      console.error(err);
      if (ticket !== busy) return;
      els.result.hidden = true;
      setStatus('Could not process this PDF: ' + (err && err.message ? err.message : err), true);
    }
  }

  function render(res, flipBacks) {
    const { plan, pageCount, bytes } = res;
    const outName = srcName.replace(/\.pdf$/i, '') + '-booklet.pdf';
    if (outUrl) URL.revokeObjectURL(outUrl);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    outUrl = URL.createObjectURL(blob);
    outFile = new File([blob], outName, { type: 'application/pdf' });
    els.download.href = outUrl;
    els.download.download = outName;

    const blanks = plan.padded - pageCount;
    const sigs = plan.sheets.length ? plan.sheets[plan.sheets.length - 1].sig + 1 : 0;
    els.summary.textContent =
      `${pageCount} pages → ${plan.sheets.length} sheet${plan.sheets.length === 1 ? '' : 's'}` +
      ` (${plan.sheets.length * 2} printed sides)` +
      (blanks ? `, ${blanks} blank page${blanks === 1 ? '' : 's'} added` : '') +
      (sigs > 1 ? `, ${sigs} signatures` : '') + '.';

    els.sheets.textContent = '';
    const label = (i) => (i >= pageCount ? '–' : String(i + 1));
    plan.sheets.forEach((sh, i) => {
      const d = document.createElement('div');
      d.className = 'sheet';
      const side = (name, pair, flipped) => {
        const cap = document.createElement('div');
        cap.textContent = name;
        const row = document.createElement('div');
        row.className = 'side';
        const order = flipped ? [pair[1], pair[0]] : pair;
        order.forEach((p) => {
          const c = document.createElement('div');
          c.className = 'pg' + (p >= pageCount ? ' blank' : '') + (flipped ? ' flipped' : '');
          c.textContent = label(p);
          row.appendChild(c);
        });
        d.append(cap, row);
      };
      side(`Sheet ${i + 1}${sigs > 1 ? ` · sig ${sh.sig + 1}` : ''} front`, sh.front, false);
      side('back', sh.back, flipBacks);
      els.sheets.appendChild(d);
    });

    els.hint.textContent = flipBacks
      ? 'Print double-sided, flip on LONG edge, landscape. Then fold the stack in half.'
      : 'Print double-sided, flip on SHORT edge, landscape. Then fold the stack in half.';

    els.share.hidden = !(navigator.canShare && navigator.canShare({ files: [outFile] }));
    els.result.hidden = false;
  }

  els.share.addEventListener('click', async () => {
    try {
      await navigator.share({ files: [outFile], title: outFile.name });
    } catch (err) {
      if (err && err.name !== 'AbortError') setStatus('Share failed: ' + err.message, true);
    }
  });

  els.file.addEventListener('change', () => loadFile(els.file.files[0]));
  ['paper', 'sig', 'margin', 'gutter', 'flip'].forEach((k) =>
    els[k].addEventListener('change', generate));

  // Drag & drop (desktop).
  ['dragenter', 'dragover'].forEach((ev) => els.drop.addEventListener(ev, (e) => {
    e.preventDefault(); els.drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => els.drop.addEventListener(ev, (e) => {
    e.preventDefault(); els.drop.classList.remove('over');
  }));
  els.drop.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

  // Files shared to the installed app (Android share target).
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (params.files && params.files.length) loadFile(await params.files[0].getFile());
    });
  }

  // PDFs shared from another Android app (manifest share_target → sw.js).
  if (new URLSearchParams(location.search).has('shared') && 'caches' in window) {
    (async () => {
      try {
        const c = await caches.open('booklet-share');
        const res = await c.match('shared.pdf');
        if (!res) return;
        const name = decodeURIComponent(res.headers.get('X-Filename') || 'shared.pdf');
        const blob = await res.blob();
        await c.delete('shared.pdf');
        history.replaceState(null, '', location.pathname);
        loadFile(new File([blob], name, { type: 'application/pdf' }));
      } catch (err) { setStatus('Could not open shared file: ' + err.message, true); }
    })();
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
