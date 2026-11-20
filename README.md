# PDF Booklet Maker

Turn any PDF into a print-ready, fold-in-half booklet — right from your phone.

**Live app:** https://euphgd-ctrl.github.io/pdf-booklet/

Everything runs in the browser (via [pdf-lib](https://pdf-lib.js.org/)); your PDF never leaves the device.

## Use it on Android
1. Open the live link in Chrome.
2. Menu ⋮ → **Add to Home screen** / **Install app**.
3. Pick a PDF (or, once installed, **Share** a PDF from Files/Drive/Gmail → *Booklet*).
4. Download or Share the result, print **double-sided, flip on short edge, landscape**, fold.

## Features
- Correct saddle-stitch page order, blank pages padded automatically
- Paper: match source, A4, Letter, Legal, A3
- Signatures (split thick documents into several folded sections)
- Outer margin and spine gap
- "Rotate back sides" for printers that only flip on the long edge
- Honors rotated pages and crop boxes
- Works offline (service worker) and as an Android share target

## Develop
No build step — it's static files.
```sh
python3 -m http.server 8000      # then open http://localhost:8000
deno run --allow-read --allow-write test/build_test.js   # generates test/out-*.pdf
```
When you ship changes, bump `CACHE` in `sw.js` (and `VERSION` in `app.js`) so installed copies update.

Files: `booklet.js` (imposition + PDF building), `app.js` (UI), `sw.js` (offline/share target).
