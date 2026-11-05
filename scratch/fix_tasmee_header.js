// التشغيل من جذر المشروع:  node scratch/fix_tasmee_header.js
// يعدّل js/mushaf.js و css/style.css (آمن التكرار)
const fs = require('fs');

function patchFile(file, fn) {
  if (!fs.existsSync(file)) throw new Error('لم أجد ' + file + ' — شغّل السكربت من جذر المشروع');
  const raw = fs.readFileSync(file, 'utf8');
  const eol = (raw.match(/\r\n/g) || []).length > (raw.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  fs.writeFileSync(file, fn(raw, (t) => t.replace(/\n/g, eol)), 'utf8');
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n');
function rep(s, E, oldPlain, newPlain, what) {
  const re = new RegExp(esc(oldPlain));
  const n = (s.match(new RegExp(esc(oldPlain), 'g')) || []).length;
  if (n !== 1) throw new Error('تعذّر العثور على (' + what + ') — عدد التطابقات: ' + n);
  return s.replace(re, () => E(newPlain));
}

patchFile('js/mushaf.js', (s, E) => {
  if (s.includes('[TASMEE]')) { console.log('mushaf.js: already patched'); return s; }

  // 1) مطابقة لا تتأثر بالألف (الرحمٰن / الرحمان، العالمين / العلمين)
  s = rep(s, E,
    `    if (sNoTanween === tNoTanween && sNoTanween.length > 1) return true;

    return false;
  }`,
    `    if (sNoTanween === tNoTanween && sNoTanween.length > 1) return true;

    // اختلاف الألف الخنجرية/الصريحة بين المتعرّف الصوتي ونص المصحف
    const sNoAlif = spoken.replace(/ا/g, '');
    const tNoAlif = target.replace(/ا/g, '');
    if (sNoAlif === tNoAlif && sNoAlif.length > 1) return true;

    return false;
  }`, 'wordsMatch');

  // 2) الآية 1:1 (البسملة في الفاتحة) آية حقيقية: تُخفى وتُكشف بالتسميع مثل غيرها
  s = rep(s, E, "    if (key === '1:1') return false;\n", '', 'isWordTrackingActive 1:1');
  s = rep(s, E, "    if (key === '1:1') return;\n", '', 'resetAyahMaskState 1:1');
  s = rep(s, E,
    `      if (sNum === 1 && aNum === 1) {
        span.classList.add('qcf-unmasked');
        return;
      }
`,
    `      span.classList.remove('qcf-unmasked');
`, 'syncQcfWordsDisplay 1:1');

  // 3) استئناف التسميع من آخر آية/كلمة بدل التصفير
  s = rep(s, E,
    `    resetAyahMaskState(MushafState.activeSurahId, MushafState.activeAyahNum);
    MushafState.wordPointerIndex = 0;
    MushafState.spokenCursor = 0;
    MushafState.lastSpokenCount = 0;
    (MushafState.targetWords || []).forEach(w => { w.matched = false; w.stumbled = false; });
`,
    `    // الاستئناف من آخر آية/كلمة وصل إليها المستخدم (لا تصفير). التصفير فقط إن كانت الآية مكشوفة بالكامل
    if (MushafState.unmaskedVerses.has(\`\${MushafState.activeSurahId}:\${MushafState.activeAyahNum}\`)) {
      resetAyahMaskState(MushafState.activeSurahId, MushafState.activeAyahNum);
      MushafState.wordPointerIndex = 0;
      (MushafState.targetWords || []).forEach(w => { w.matched = false; w.stumbled = false; });
    }
    MushafState.spokenCursor = 0;   // جلسة صوتية جديدة: عدّاد الكلمات المنطوقة فقط
    MushafState.lastSpokenCount = 0;
`, 'startRecitation reset');

  // 4) استمرار الميكروفون: 'aborted' (ينتج عن abort() بين الآيات) لا يوقف الجلسة
  s = rep(s, E,
    "      if (event.error === 'no-speech') return;\n",
    "      if (event.error === 'no-speech' || event.error === 'aborted') return;\n", 'onerror');

  s = rep(s, E,
    `        speechRestartTimeout = setTimeout(() => {
          if (MushafState.isReciting) {
            try {
              rec.start();
            } catch (err) { }
          }
        }, 150);`,
    `        speechRestartTimeout = setTimeout(() => {
          if (!MushafState.isReciting) return;
          try {
            rec.start();
          } catch (err) {
            // الجلسة السابقة لم تُغلق بعد: أعد المحاولة بعد قليل
            speechRestartTimeout = setTimeout(() => {
              if (MushafState.isReciting) { try { rec.start(); } catch (e2) { } }
            }, 400);
          }
        }, 150);`, 'onend');

  // 5) المطابقة: إعادة المزامنة إذا أسقط المتعرّف كلمة (الكلمتان التاليتان تطابقان) + سجل تشخيص
  s = rep(s, E,
    `      if (tentativeLast && cursor === spoken.length - 1) break; // كلمة لم تكتمل بعد
      words[cur].stumbled = true; // كلمة خاطئة: لا تُكشف الكلمة وننتظر التصحيح
      cursor++;`,
    `      if (tentativeLast && cursor === spoken.length - 1) break; // كلمة لم تكتمل بعد

      // أسقط المتعرّف كلمة؟ إن طابقت الكلمتان المنطوقتان التاليتان ما بعد الحالية، نتجاوزها ونعلّمها خطأً
      if (cur + 1 < words.length) {
        const m1 = matchWordsAt(spoken, cursor, words, cur + 1);
        if (m1) {
          const nextTarget = cur + 1 + m1.t;
          const nextSpoken = cursor + m1.s;
          const confirmed = nextTarget >= words.length || nextSpoken >= spoken.length || !!matchWordsAt(spoken, nextSpoken, words, nextTarget);
          if (confirmed) {
            words[cur].matched = true;
            markWordError(surah, ayah, cur);
            cur += 1;
            progressed = true;
            continue;
          }
        }
      }

      if (!words[cur].stumbled) {
        console.debug('[TASMEE] متوقع:', words[cur].normalized, '| مسموع:', spoken[cursor], '| الآية', surah + ':' + ayah);
      }
      words[cur].stumbled = true; // كلمة خاطئة: لا تُكشف الكلمة وننتظر التصحيح
      cursor++;`, 'process loop');

  // 5ب) المتعرّف أسقط بداية الآية (مثل البسملة)؟ إن بدأ المنطوق بأول كلمتين من الآية التالية نتخطى الحالية
  s = rep(s, E,
    `    MushafState.spokenCursor = cursor;
    MushafState.wordPointerIndex = cur;`,
    `    if (!progressed && cur === 0 && words[0].stumbled && typeof localQuranTextMap === 'object' && localQuranTextMap) {
      const nextText = localQuranTextMap[surah + ':' + (ayah + 1)];
      const nw = normalizeArabicText(nextText || '').split(/\\s+/).filter(Boolean);
      if (nw.length >= 2) {
        for (let i = 0; i + 1 < spoken.length; i++) {
          if (wordsMatch(spoken[i], nw[0]) && wordsMatch(spoken[i + 1], nw[1])) {
            console.info('[TASMEE] لم يُسمع أول الآية ' + surah + ':' + ayah + ' — يُتخطى للآية التالية');
            words.forEach((w, idx) => { w.matched = true; markWordError(surah, ayah, idx); });
            MushafState.spokenCursor = 0;
            MushafState.lastSpokenCount = 0;
            renderWordErrorMarks();
            handleAyahCompleted();
            return;
          }
        }
      }
    }

    MushafState.spokenCursor = cursor;
    MushafState.wordPointerIndex = cur;`, 'cross-ayah resync');

  // 6) ترويسة السورة: إطار CSS + اسم السورة بخط surah-name-v4 فقط
  s = rep(s, E,
    `      // نفس بنية QUL: إطار الترويسة (ligature: header) واسم السورة (ligature: surahNNN) فوقه
      row.innerHTML =
        '<div class="quran-icon surah-header"><span class="surah-header-frame">header</span>' +
        '<div class="surah-icon"><span class="surah-name-v4-icon me-2">surah' + id3 + '</span>' +
        '<span class="surah-name-v4-icon">surah-icon</span></div></div>';`,
    `      // إطار CSS + اسم السورة بخط surah-name-v4 (ligature: surahNNN). خط إطار QUL (header) لا يتشكّل خارج QUL
      row.innerHTML =
        '<div class="qcf-surah-header-box"><span class="surah-name-v4-icon">surah' + id3 + '</span></div>';`, 'header markup');

  const reFit = /function fitSurahHeaders\(\) \{[\s\S]*?\r?\n  \}\r?\n(?=\r?\n  if \(!window\.__qcfHeaderFitBound\))/;
  if (!reFit.test(s)) throw new Error('تعذّر العثور على fitSurahHeaders');
  s = s.replace(reFit, () => E(`function fitSurahHeaders() {
    if (!dom.qcfContainer) return;
    dom.qcfContainer.querySelectorAll('.qcf-surah-header-line.glyph').forEach(row => {
      const box = row.querySelector('.qcf-surah-header-box');
      const name = row.querySelector('.surah-name-v4-icon');
      if (!box || !name) return;
      const size = box.clientHeight * 0.78;
      name.style.fontSize = size.toFixed(1) + 'px';
      const maxW = box.clientWidth * 0.62;
      const w = name.getBoundingClientRect().width;
      if (w > maxW && w > 0) name.style.fontSize = (size * maxW / w).toFixed(1) + 'px';
    });
  }
`));

  s = rep(s, E,
    "MushafState.surahHeaderFontsReady = hasLoadedFontFace('surah-header') && hasLoadedFontFace('surah-name-v4');",
    "MushafState.surahHeaderFontsReady = hasLoadedFontFace('surah-name-v4');", 'header fonts ready');
  s = rep(s, E, "      await Promise.race([\n        Promise.all([", "      await Promise.race([\n        Promise.allSettled([", 'allSettled');

  console.log('mushaf.js patched');
  return s;
});

patchFile('css/style.css', (s, E) => {
  if (s.includes('/* QCF surah name */')) { console.log('style.css: already patched'); return s; }
  console.log('style.css patched');
  return s + E(`

/* QCF surah name */
.qcf-page-container .qcf-surah-header-line.glyph .surah-name-v4-icon {
  font-family: 'surah-name-v4', serif !important;
  color: #14532d;
  line-height: 1;
  white-space: nowrap;
}

[data-theme="dark"] .qcf-page-container .qcf-surah-header-line.glyph .surah-name-v4-icon {
  color: #86efac;
}
`);
});
