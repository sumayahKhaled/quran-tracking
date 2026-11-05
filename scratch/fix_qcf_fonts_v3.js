// التشغيل من جذر المشروع:  node scratch/fix_qcf_fonts_v3.js
// السبب: قاعدة  *, span, ... { font-family: var(--font-arabic) !important }  في style.css تلغي خط صفحة QCF.
// الحل: تعيين خط الصفحة بـ !important عبر الجافاسكربت + قواعد CSS مخصصة بأولوية أعلى.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

for (const f of ['fix_qcf_fonts_v2.js']) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) throw new Error('الملف مفقود بجانب هذا السكربت: ' + f + ' (ومعه fix_qcf_fonts.js و fix_surah_headers.js)');
  execFileSync(process.execPath, [p], { stdio: 'inherit' });
}

function patchFile(file, fn) {
  if (!fs.existsSync(file)) throw new Error('لم أجد ' + file + ' — شغّل السكربت من جذر المشروع');
  const raw = fs.readFileSync(file, 'utf8');
  const eol = (raw.match(/\r\n/g) || []).length > (raw.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  fs.writeFileSync(file, fn(raw, (t) => t.replace(/\n/g, eol)), 'utf8');
}

let patchedNow = false;

/* ---------- js/mushaf.js ---------- */
patchFile('js/mushaf.js', (s, E) => {
  if (s.includes("setProperty('font-family'")) { console.log('mushaf.js v3: already patched'); return s; }

  const reContainer = /dom\.qcfContainer\.style\.fontFamily = fontOk\s*\r?\n\s*\? ("[^\r\n]*"),?\s*\r?\n\s*: ("[^\r\n]*");/;
  if (!reContainer.test(s)) throw new Error('container font assignment not found (شغّل fix_qcf_fonts.js أولاً)');
  s = s.replace(reContainer, (m, a, b) =>
    E("dom.qcfContainer.style.setProperty('font-family', fontOk\n      ? " + a.replace(/,\s*$/, '') + "\n      : " + b + ", 'important');"));

  const spanA = `span.style.fontFamily = "'" + fontName + "'";`;
  const spanB = `span.style.fontFamily = "'UthmanicHafs', serif";`;
  if (!s.includes(spanA) || !s.includes(spanB)) throw new Error('span font assignment not found');
  s = s.replace(spanA, `span.style.setProperty('font-family', "'" + fontName + "'", 'important');`);
  s = s.replace(spanB, `span.style.setProperty('font-family', "'UthmanicHafs', serif", 'important');`);

  patchedNow = true;
  console.log('mushaf.js v3 patched');
  return s;
});

/* ---------- css/style.css ---------- */
patchFile('css/style.css', (s, E) => {
  if (s.includes('/* QCF font override */')) { console.log('style.css v3: already patched'); return s; }
  patchedNow = true;
  console.log('style.css v3 patched');
  return s + E(`

/* QCF font override */
/* قاعدة "*" العامة أعلاه تفرض IBM Plex بـ !important وتلغي خطوط المصحف، فنعيد الأولوية لعناصر المصحف فقط */
.qcf-page-container .qcf-line,
.qcf-page-container .qcf-word {
  font-family: inherit !important; /* يرث خط الصفحة pN-v1 المعيَّن على الحاوية */
}

.qcf-page-container .quran-icon.surah-header,
.qcf-page-container .surah-header-frame {
  font-family: 'surah-header', serif !important;
}

.qcf-page-container .surah-name-v4-icon {
  font-family: 'surah-name-v4', serif !important;
}

.qcf-page-container .qcf-bismillah-line {
  font-family: 'quran-common', serif !important;
}

.qcf-page-container .qcf-surah-title-text {
  font-family: var(--font-arabic) !important;
}
`);
});

if (patchedNow && fs.existsSync('sw.js')) {
  patchFile('sw.js', (s) => s.replace(/(CACHE_NAME\s*=\s*'[^']*-v)(\d+)(')/, (m, a, n, c) => a + (parseInt(n, 10) + 1) + c));
  console.log('sw.js: CACHE_NAME version bumped');
}
