// تشغيل من مجلد scratch:  node fix_qcf_fonts.js   (بعد fix_surah_headers.js)
const fs = require('fs');

function patchFile(file, fn) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = (raw.match(/\r\n/g) || []).length > (raw.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  fs.writeFileSync(file, fn(raw, (t) => t.replace(/\n/g, eol)), 'utf8');
}
const NL = '\\r?\\n';
function must(re, s, what) { if (!re.test(s)) throw new Error('not found: ' + what); }

/* ======================= js/mushaf.js ======================= */
const NEW_LOADER = `// خطوط QCF V1: المصدر الرسمي (verses.quran.foundation) هو المطابق لرموز code_v1 القادمة من الـ API
  const qcfFontPromises = new Map();

  function loadQCFFont(pageNum) {
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
          MushafState.qcfFontsLoaded.add(fontName);
          return true;
        } catch (e) {
          console.warn('QCF font source failed:', url, e);
        }
      }
      return false;
    })();

    qcfFontPromises.set(fontName, p);
    p.then((ok) => { if (!ok) qcfFontPromises.delete(fontName); });
    return p;
  }

  `;

patchFile('js/mushaf.js', (s, E) => {
  if (s.includes('qcfFontPromises')) { console.log('mushaf.js: already patched'); return s; }

  // 1) محمّل الخطوط
  const reLoader = new RegExp('async function loadQCFFont\\(pageNum\\) \\{[\\s\\S]*?(?=async function fetchQCFPageData)');
  must(reLoader, s, 'loadQCFFont');
  s = s.replace(reLoader, () => E(NEW_LOADER));

  // 2) حقول إضافية من الـ API (نص احتياطي يونيكود + رقم الصفحة)
  const urlOld = 'word_fields=code_v1,text_imlaei,line_number,location&mushaf=2';
  if (!s.includes(urlOld)) throw new Error('api url not found');
  s = s.replace(urlOld, 'word_fields=code_v1,text_qpc_hafs,text_imlaei,line_number,page_number,location&mushaf=2');

  // 3) بداية الرسم: منع تداخل رسمين متزامنين + اعتماد نتيجة تحميل الخط
  const reHead = new RegExp(
    "dom\\.qcfContainer\\.innerHTML = '';" + NL + "[ \\t]*const fontName = 'p' \\+ pageNum \\+ '-v1';" + NL + NL +
    "[ \\t]*const fontLoadedPromise = loadQCFFont\\(pageNum\\);" + NL +
    "[ \\t]*const qcfData = await fetchQCFPageData\\(pageNum\\);" + NL + NL +
    "[ \\t]*if \\(!qcfData \\|\\| !qcfData\\.verses\\) \\{" + NL + "[ \\t]*return;" + NL + "[ \\t]*\\}" + NL + NL +
    "[ \\t]*await fontLoadedPromise;" + NL + NL +
    "[ \\t]*dom\\.qcfContainer\\.style\\.fontFamily = [^\\n]*" + NL +
    "[ \\t]*dom\\.qcfContainer\\.innerHTML = '';"
  );
  must(reHead, s, 'render head');
  s = s.replace(reHead, () => E(`const renderToken = (MushafState.qcfRenderToken = (MushafState.qcfRenderToken || 0) + 1);
    dom.qcfContainer.innerHTML = '';
    const fontName = 'p' + pageNum + '-v1';

    const [fontOk, qcfData] = await Promise.all([loadQCFFont(pageNum), fetchQCFPageData(pageNum)]);
    if (renderToken !== MushafState.qcfRenderToken) return; // صفحة أحدث بدأت الرسم

    if (!qcfData || !qcfData.verses) {
      return;
    }

    dom.qcfContainer.style.fontFamily = fontOk
      ? "'" + fontName + "', 'UthmanicHafs', serif"
      : "'UthmanicHafs', serif";
    dom.qcfContainer.innerHTML = '';`));

  // 4) إعادة فحص الرمز بعد انتظار خطوط الترويسة
  const reHdrAwait = new RegExp("await loadSurahHeaderFonts\\(\\);" + NL + "([ \\t]*)\\}");
  if (reHdrAwait.test(s)) s = s.replace(reHdrAwait, (m, ind) => E("await loadSurahHeaderFonts();\n" + ind + "  if (renderToken !== MushafState.qcfRenderToken) return;\n" + ind + "}"));

  // 5) رسم الكلمة: رموز QCF عبر innerHTML بخط الصفحة، وإلا نص يونيكود (لا حروف مشوهة أبداً)
  const textOld = "span.textContent = word.code_v1 || '';";
  if (!s.includes(textOld)) throw new Error('word text not found');
  s = s.replace(textOld, () => E(`if (fontOk) {
          span.style.fontFamily = "'" + fontName + "'";
          span.innerHTML = word.code_v1 || ''; // رموز QCF تتطلب innerHTML
        } else {
          span.style.fontFamily = "'UthmanicHafs', serif";
          span.textContent = word.text_qpc_hafs || word.text_imlaei || '';
        }`));

  console.log('mushaf.js patched');
  return s;
});

/* ======================= css/style.css ======================= */
patchFile('css/style.css', (s, E) => {
  if (s.includes("font-family: 'UthmanicHafs'")) { console.log('style.css: already patched'); return s; }
  console.log('style.css patched');
  return s + E(`

/* خط يونيكود احتياطي للمصحف إن تعذّر تحميل خط صفحة QCF */
@font-face {
  font-family: 'UthmanicHafs';
  src: url('https://verses.quran.foundation/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2') format('woff2'),
       url('https://verses.quran.foundation/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.ttf') format('truetype');
  font-display: swap;
}
`);
});
