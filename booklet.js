// Booklet imposition logic. Pure functions + a pdf-lib based builder.
// Exposed on window.Booklet so it works without a bundler.
(function (global) {
  'use strict';

  const PAPER = {
    a4: [841.89, 595.28],      // landscape
    letter: [792, 612],
    legal: [1008, 612],
    a3: [1190.55, 841.89],
  };

  /**
   * Compute the imposition plan.
   * @param {number} pageCount  number of source pages
   * @param {number} sigSheets  sheets per signature (0 = one signature for everything)
   * @returns {{padded:number, sheets:Array<{sig:number, front:[number,number], back:[number,number]}>}}
   *   Page indices are 0-based; indices >= pageCount are blanks.
   */
  function plan(pageCount, sigSheets) {
    const padded = Math.max(4, Math.ceil(pageCount / 4) * 4);
    const sigPages = sigSheets > 0 ? sigSheets * 4 : padded;
    const sheets = [];
    let sig = 0;
    for (let start = 0; start < padded; start += sigPages, sig++) {
      const m = Math.min(sigPages, padded - start);
      for (let s = 0; s < m / 4; s++) {
        sheets.push({
          sig,
          front: [start + m - 1 - 2 * s, start + 2 * s],
          back: [start + 2 * s + 1, start + m - 2 - 2 * s],
        });
      }
    }
    return { padded, sheets };
  }

  // Rotate point (x,y) by deg (CCW, multiple of 90).
  function rot(x, y, deg) {
    switch (((deg % 360) + 360) % 360) {
      case 0: return [x, y];
      case 90: return [-y, x];
      case 180: return [-x, -y];
      case 270: return [y, -x];
    }
    throw new Error('bad angle ' + deg);
  }

  /**
   * Build a booklet PDF.
   * @param {ArrayBuffer|Uint8Array} srcBytes
   * @param {object} opts {paper:'auto'|'a4'|..., sigSheets:number, flipBacks:boolean,
   *                       margin:number (pt, outer), gutter:number (pt, between halves)}
   * @returns {Promise<{bytes:Uint8Array, plan:object, pageCount:number}>}
   */
  async function build(srcBytes, opts) {
    const { PDFDocument, degrees } = global.PDFLib;
    const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const srcPages = src.getPages();
    const n = srcPages.length;
    if (n === 0) throw new Error('PDF has no pages');

    const out = await PDFDocument.create();
    const boxes = srcPages.map((p) => {
      const b = p.getCropBox();
      return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height };
    });
    const embedded = await out.embedPages(srcPages, boxes);

    // Effective (displayed) size of each source page, honoring /Rotate.
    const info = srcPages.map((p, i) => {
      const r = ((p.getRotation().angle % 360) + 360) % 360;
      const w = boxes[i].right - boxes[i].left;
      const h = boxes[i].top - boxes[i].bottom;
      return r % 180 ? { w: h, h: w, r } : { w, h, r };
    });

    let sheetW, sheetH;
    if (opts.paper === 'auto') {
      sheetW = info[0].w * 2;
      sheetH = info[0].h;
    } else {
      [sheetW, sheetH] = PAPER[opts.paper];
    }
    const margin = opts.margin || 0;
    const gutter = opts.gutter || 0;
    const halfW = (sheetW - 2 * margin - gutter) / 2;
    const halfH = sheetH - 2 * margin;

    const p = plan(n, opts.sigSheets || 0);

    function drawInto(page, idx, slotX, slotY, extraRot, align) {
      if (idx >= n) return; // blank
      const e = embedded[idx];
      const { w, h, r } = info[idx];
      const s = Math.min(halfW / w, halfH / h);
      const dw = w * s, dh = h * s;
      // Align content toward the spine so the gutter stays tight.
      let X = slotX + (align === 'right' ? halfW - dw : align === 'left' ? 0 : (halfW - dw) / 2);
      const Y = slotY + (halfH - dh) / 2;
      // /Rotate is clockwise; pdf-lib rotates CCW about the draw origin.
      const theta = -r + extraRot;
      const ew = e.width * s, eh = e.height * s;
      const pts = [[0, 0], [ew, 0], [0, eh], [ew, eh]].map(([a, b]) => rot(a, b, theta));
      const minX = Math.min(...pts.map((q) => q[0]));
      const minY = Math.min(...pts.map((q) => q[1]));
      page.drawPage(e, {
        x: X - minX,
        y: Y - minY,
        xScale: s,
        yScale: s,
        rotate: degrees(((theta % 360) + 360) % 360),
      });
    }

    function sheetSide(pair, flip) {
      const page = out.addPage([sheetW, sheetH]);
      const leftX = margin, rightX = margin + halfW + gutter, y = margin;
      if (!flip) {
        drawInto(page, pair[0], leftX, y, 0, 'right');
        drawInto(page, pair[1], rightX, y, 0, 'left');
      } else {
        // Whole side rotated 180°: left page goes to the right slot upside down.
        drawInto(page, pair[0], rightX, y, 180, 'left');
        drawInto(page, pair[1], leftX, y, 180, 'right');
      }
    }

    for (const sh of p.sheets) {
      sheetSide(sh.front, false);
      sheetSide(sh.back, !!opts.flipBacks);
    }

    out.setTitle((opts.title || 'Booklet'));
    out.setProducer('PDF Booklet Maker');
    const bytes = await out.save();
    return { bytes, plan: p, pageCount: n };
  }

  global.Booklet = { plan, build, PAPER };
})(typeof window !== 'undefined' ? window : globalThis);
