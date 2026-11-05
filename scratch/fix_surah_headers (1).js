// تشغيل من مجلد scratch:  node fix_surah_headers.js
const fs = require('fs');

// يحافظ على نهايات الأسطر كما هي (الملف قد يحوي CRLF و LF معاً) فلا يتغير إلا ما نضيفه
function patchFile(file, fn) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = (raw.match(/\r\n/g) || []).length > (raw.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  const out = fn(raw, (t) => t.replace(/\n/g, eol));
  fs.writeFileSync(file, out, 'utf8');
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n');

/* ======================= js/mushaf.js ======================= */
const HELPERS = `// --- ترويسة السورة والبسملة (QUL glyph-based) ---

  // تحديد أسطر الترويسة والبسملة من الأسطر الفارغة التي تسبق أول كلمة في أول آية من أي سورة (8:1:1 مثلاً)
  function buildQcfLineMeta(lines) {
    const meta = {};
    let l = 1;
    while (l <= 15) {
      if ((lines[l] || []).length) { l++; continue; }
      let e = l;
      while (e < 15 && !(lines[e + 1] || []).length) e++;
      const first = e < 15 ? lines[e + 1][0] : null;
      const loc = first && first.location ? String(first.location).split(':') : null;
      for (let k = l; k <= e; k++) meta[k] = { type: 'blank' };
      if (loc && loc[1] === '1' && loc[2] === '1') {
        const surahId = parseInt(loc[0], 10);
        const needsBismillah = surahId !== 1 && surahId !== 9; // الفاتحة بسملتها آية، والتوبة بلا بسملة
        if (needsBismillah && e - l + 1 >= 2) {
          meta[e - 1] = { type: 'header', surahId };
          meta[e] = { type: 'bismillah', surahId };
        } else {
          meta[e] = { type: 'header', surahId };
        }
      }
      l = e + 1;
    }
    return meta;
  }

  function hasLoadedFontFace(family) {
    try {
      return Array.from(document.fonts).some(f => f.family.replace(/["']/g, '') === family && f.status === 'loaded');
    } catch (_) { return false; }
  }

  async function loadSurahHeaderFonts() {
    if (typeof MushafState.surahHeaderFontsReady === 'boolean') return MushafState.surahHeaderFontsReady;
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load("40px 'surah-header'", 'header'),
          document.fonts.load("40px 'surah-name-v4'", 'surah001')
        ]),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
      ]);
    } catch (e) {
      console.warn('Surah header fonts unavailable, using text fallback:', e);
    }
    MushafState.surahHeaderFontsReady = hasLoadedFontFace('surah-header') && hasLoadedFontFace('surah-name-v4');
    return MushafState.surahHeaderFontsReady;
  }

  function buildSurahHeaderLine(surahId) {
    const row = document.createElement('div');
    row.className = 'qcf-surah-header-line';
    row.setAttribute('data-surah-header', surahId);
    if (MushafState.surahHeaderFontsReady) {
      const id3 = String(surahId).padStart(3, '0');
      row.classList.add('glyph');
      // نفس بنية QUL: إطار الترويسة (ligature: header) واسم السورة (ligature: surahNNN) فوقه
      row.innerHTML =
        '<div class="quran-icon surah-header"><span class="surah-header-frame">header</span>' +
        '<div class="surah-icon"><span class="surah-name-v4-icon me-2">surah' + id3 + '</span>' +
        '<span class="surah-name-v4-icon">surah-icon</span></div></div>';
    } else {
      row.innerHTML = '<div class="qcf-surah-header-box"><span class="qcf-surah-title-text">سورة ' + getAudioSurahName(surahId) + '</span></div>';
    }
    return row;
  }

  // ملاءمة عرض إطار الترويسة لعرض السطر
  function fitSurahHeaders() {
    if (!dom.qcfContainer) return;
    dom.qcfContainer.querySelectorAll('.qcf-surah-header-line.glyph').forEach(row => {
      const head = row.querySelector('.surah-header');
      const frame = row.querySelector('.surah-header-frame');
      if (!head || !frame) return;
      head.style.fontSize = '100px';
      const w = frame.getBoundingClientRect().width;
      const avail = row.clientWidth;
      if (w > 0 && avail > 0) head.style.fontSize = (100 * avail / w).toFixed(2) + 'px';
    });
  }

  if (!window.__qcfHeaderFitBound) {
    window.__qcfHeaderFitBound = true;
    let fitTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(fitSurahHeaders, 120);
    });
  }

  `;

const NEW_LOOP_HEAD = `// الترويسة والبسملة تُستنتج من بيانات الأسطر نفسها (تعمل لأي سورة وفي أي موضع بالصفحة)
    const lineMeta = buildQcfLineMeta(lines);
    if (Object.values(lineMeta).some(m => m.type === 'header')) {
      await loadSurahHeaderFonts();
    }

    for (let l = 1; l <= 15; l++) {
      const lineWords = lines[l] || [];
      const meta = lineMeta[l];

      if (meta) {
        if (meta.type === 'header') {
          dom.qcfContainer.appendChild(buildSurahHeaderLine(meta.surahId));
        } else if (meta.type === 'bismillah') {
          const bismillahRow = document.createElement('div');
          bismillahRow.className = 'qcf-bismillah-line';
          bismillahRow.setAttribute('data-line', l);
          bismillahRow.textContent = '﷽';
          dom.qcfContainer.appendChild(bismillahRow);
        } else {
          const blank = document.createElement('div');
          blank.className = 'qcf-line';
          blank.setAttribute('data-line', l);
          dom.qcfContainer.appendChild(blank); // يحفظ الإيقاع العمودي للأسطر الخمسة عشر
        }
        continue;
      }

      `;

patchFile('js/mushaf.js', (s, E) => {
  if (s.includes('function buildQcfLineMeta')) {
    console.log('mushaf.js: already patched');
    return s;
  }

  // 1) الدوال المساعدة قبل renderQCFPage15Lines
  const fnMarker = 'async function renderQCFPage15Lines(pageNum) {';
  if (!s.includes(fnMarker)) throw new Error('renderQCFPage15Lines not found');
  s = s.replace(fnMarker, () => E(HELPERS) + fnMarker);

  // 2) استبدال منطق الترويسة/البسملة القديم (المبني على startPage وأسطر 1-2 فقط)
  const re = /\/\/ Surahs starting on this page\r?\n[ \t]*const startingSurahs = getSurahsStartingOnPage\(pageNum\);\r?\n\r?\n[ \t]*for \(let l = 1; l <= 15; l\+\+\) \{\r?\n[ \t]*const lineWords = lines\[l\] \|\| \[\];\r?\n[\s\S]*?(?=const lineRow = document\.createElement\('div'\);\r?\n[ \t]*lineRow\.className = 'qcf-line';)/;
  if (!re.test(s)) throw new Error('old header block not found');
  s = s.replace(re, () => E(NEW_LOOP_HEAD));

  // 3) ملاءمة الترويسات بعد بناء الصفحة
  const tail = "    if (dom.pageWrapper) {\n      dom.pageWrapper.classList.add('qcf-mode-active');\n    }\n\n    syncQcfWordsDisplay();";
  const tailRe = new RegExp(esc(tail));
  if (!tailRe.test(s)) throw new Error('render tail not found');
  s = s.replace(tailRe, (m) => E("    requestAnimationFrame(fitSurahHeaders);\n\n") + m);
  console.log('mushaf.js patched');
  return s;
});

/* ======================= css/style.css ======================= */
const CSS = `

/* ===== ترويسة السورة (QUL glyph-based: خطا surah-header و surah-name-v4) ===== */
.qcf-surah-header-line.glyph {
  padding: 0;
  overflow: visible;
}

.quran-icon.surah-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'surah-header', serif;
  line-height: 1;
  white-space: nowrap;
  font-size: 40px; /* تُضبط تلقائياً بـ fitSurahHeaders */
}

.surah-header-frame {
  display: inline-block;
  line-height: 1;
}

.surah-header .surah-icon {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: calc(var(--surah-name-scale, 0.6) * 1em); /* حجم الاسم نسبةً لحجم الإطار - عدّل القيمة إن لزم */
}

.surah-name-v4-icon {
  font-family: 'surah-name-v4', serif;
  line-height: 1;
}

.surah-name-v4-icon.me-2 {
  margin-inline-end: 0.5rem;
}

.qcf-bismillah-line {
  flex: 0 0 auto;
}
`;

patchFile('css/style.css', (s, E) => {
  if (s.includes('.quran-icon.surah-header')) {
    console.log('style.css: already patched');
    return s;
  }
  console.log('style.css patched');
  return s + E(CSS);
});
