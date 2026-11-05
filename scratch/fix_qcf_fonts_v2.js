// التشغيل من جذر المشروع (المجلد الذي فيه js/ و css/ و sw.js):
//   node scratch/fix_qcf_fonts_v2.js
// يشغّل fix_surah_headers.js و fix_qcf_fonts.js تلقائياً (آمنة التكرار) ثم يضيف فحص تطابق الخط مع الرموز.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

for (const f of ['fix_surah_headers.js', 'fix_qcf_fonts.js']) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) throw new Error('الملف مفقود بجانب هذا السكربت: ' + f);
  execFileSync(process.execPath, [p], { stdio: 'inherit' });
}

function patchFile(file, fn) {
  if (!fs.existsSync(file)) throw new Error('لم أجد ' + file + ' — شغّل السكربت من جذر المشروع');
  const raw = fs.readFileSync(file, 'utf8');
  const eol = (raw.match(/\r\n/g) || []).length > (raw.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  fs.writeFileSync(file, fn(raw, (t) => t.replace(/\n/g, eol)), 'utf8');
}

const NEW_LOADER = `// تحقق أن الخط المحمَّل يحوي فعلاً الرموز القادمة من الـ API (وإلا يرسم المتصفح حروفاً مشوهة بخط النظام)
  function fontCoversGlyphs(fontName, codes) {
    if (!codes || !codes.length) return true;
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      const width = (t, f) => { ctx.font = '40px ' + f; return ctx.measureText(t).width; };
      const dec = document.createElement('textarea');
      return codes.some((code) => {
        dec.innerHTML = code;
        const ch = dec.value;
        if (!ch) return false;
        return width(ch, "'" + fontName + "', serif") !== width(ch, 'serif') ||
               width(ch, "'" + fontName + "', monospace") !== width(ch, 'monospace');
      });
    } catch (e) {
      return true;
    }
  }

  function loadQCFFont(pageNum, sampleCodes) {
    const fontName = 'p' + pageNum + '-v1';
    if (MushafState.qcfFontsLoaded.has(fontName)) return Promise.resolve(true);
    if (qcfFontPromises.has(fontName)) return qcfFontPromises.get(fontName);

    const sources = [
      'https://verses.quran.foundation/fonts/quran/hafs/v1/woff2/p' + pageNum + '.woff2',
      'https://verses.quran.foundation/fonts/quran/hafs/v1/woff/p' + pageNum + '.woff',
      'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v1-optimized/woff2/p' + pageNum + '.woff2?v=3.2'
    ];

    const p = (async () => {
      for (const url of sources) {
        try {
          const face = new FontFace(fontName, "url('" + url + "')");
          face.display = 'block';
          const loaded = await face.load();
          document.fonts.add(loaded);
          if (!fontCoversGlyphs(fontName, sampleCodes)) {
            console.warn('[QCF] الخط حُمّل لكنه لا يطابق رموز الصفحة، أجرّب المصدر التالي:', url);
            document.fonts.delete(loaded);
            continue;
          }
          console.info('[QCF] صفحة', pageNum, 'الخط يعمل من:', url);
          MushafState.qcfFontsLoaded.add(fontName);
          return true;
        } catch (e) {
          console.warn('[QCF] فشل مصدر الخط:', url, e);
        }
      }
      return false;
    })();

    qcfFontPromises.set(fontName, p);
    p.then((ok) => { if (!ok) qcfFontPromises.delete(fontName); });
    return p;
  }`;

let patchedNow = false;
patchFile('js/mushaf.js', (s, E) => {
  if (s.includes('function fontCoversGlyphs')) { console.log('mushaf.js v2: already patched'); return s; }
  patchedNow = true;

  const reLoader = /function loadQCFFont\(pageNum\) \{[\s\S]*?(?=\r?\n\s*async function fetchQCFPageData)/;
  if (!reLoader.test(s)) throw new Error('loadQCFFont not found (شغّل fix_qcf_fonts.js أولاً)');
  s = s.replace(reLoader, () => E(NEW_LOADER));

  const callOld = 'const [fontOk, qcfData] = await Promise.all([loadQCFFont(pageNum), fetchQCFPageData(pageNum)]);';
  if (!s.includes(callOld)) throw new Error('render call not found');
  s = s.replace(callOld, () => E(`const qcfData = await fetchQCFPageData(pageNum);
    const sampleCodes = (qcfData && qcfData.verses ? qcfData.verses : [])
      .flatMap((v) => (v.words || []).filter((w) => w.char_type_name !== 'end' && w.code_v1).slice(0, 4).map((w) => w.code_v1))
      .slice(0, 8);
    const fontOk = await loadQCFFont(pageNum, sampleCodes);`));
  console.log('mushaf.js v2 patched');
  return s;
});

// رفع إصدار كاش الـ Service Worker حتى لا يبقى mushaf.js القديم
if (patchedNow && fs.existsSync('sw.js')) {
  patchFile('sw.js', (s) => s.replace(/(CACHE_NAME\s*=\s*'[^']*-v)(\d+)(')/, (m, a, n, c) => a + (parseInt(n, 10) + 1) + c));
  console.log('sw.js: CACHE_NAME version bumped');
}
