// Run: deno run --allow-read --allow-write test/build_test.js
// Builds sample PDFs and checks the booklet output.
const load = async (p) => (0, eval)(await Deno.readTextFile(new URL(p, import.meta.url)));
globalThis.self = globalThis;
await load('../vendor/pdf-lib.min.js');
await load('../booklet.js');
const { PDFDocument, StandardFonts, degrees } = globalThis.PDFLib;
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };

async function sample(n, rotateIdx = -1) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < n; i++) {
    const p = d.addPage([420, 595]);
    p.drawRectangle({ x: 5, y: 5, width: 410, height: 585, borderWidth: 3, color: PDFLib.rgb(1, 1, 1), borderColor: PDFLib.rgb(0, 0, 0) });
    p.drawText(String(i + 1), { x: 150, y: 280, size: 120, font: f });
    p.drawText('top', { x: 180, y: 540, size: 30, font: f });
    if (i === rotateIdx) p.setRotation(degrees(90));
  }
  return d.save();
}

for (const [n, opts, sheets] of [
  [8, { paper: 'auto' }, 2],
  [10, { paper: 'a4', margin: 14, gutter: 14 }, 3],
  [10, { paper: 'letter', sigSheets: 2, flipBacks: true }, 3],
  [1, { paper: 'auto' }, 1],
]) {
  const res = await Booklet.build(await sample(n, 2), opts);
  const out = await PDFDocument.load(res.bytes);
  assert(out.getPageCount() === sheets * 2, `n=${n} expected ${sheets * 2} sides, got ${out.getPageCount()}`);
  const { width, height } = out.getPage(0).getSize();
  assert(width > height, 'output should be landscape');
  const name = `test/out-${n}-${opts.paper}${opts.flipBacks ? '-flip' : ''}.pdf`;
  await Deno.writeFile(name, res.bytes);
  console.log('ok', name, out.getPageCount(), 'sides', Math.round(width), 'x', Math.round(height));
}
