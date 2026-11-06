// التشغيل من جذر المشروع:  node scratch/fix_markers_muqattaat.js   (بعد fix_tasmee_header.js)
const fs = require('fs');

function patchFile(file, fn) {
  if (!fs.existsSync(file)) throw new Error('لم أجد ' + file + ' — شغّل السكربت من جذر المشروع');
  const raw = fs.readFileSync(file, 'utf8');
  const eol = (raw.match(/\r\n/g) || []).length > (raw.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  fs.writeFileSync(file, fn(raw, (t) => t.replace(/\n/g, eol)), 'utf8');
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n');
function rep(s, E, oldPlain, newPlain, what) {
  const n = (s.match(new RegExp(esc(oldPlain), 'g')) || []).length;
  if (n !== 1) throw new Error('تعذّر العثور على (' + what + ') — عدد التطابقات: ' + n);
  return s.replace(new RegExp(esc(oldPlain)), () => E(newPlain));
}

const NEW_SYNC = `function syncQcfWordsDisplay() {
    if (!dom.qcfContainer) return;
    const isMasked = MushafState.maskMode && MushafState.maskMode !== 'none';
    const totalWords = (MushafState.targetWords || []).length;

    dom.qcfContainer.querySelectorAll('.qcf-word').forEach(span => {
      const sNum = parseInt(span.getAttribute('data-surah'), 10);
      const aNum = parseInt(span.getAttribute('data-ayah'), 10);
      const wIdx = parseInt(span.getAttribute('data-word-idx'), 10);
      const isEnd = span.getAttribute('data-type') === 'end'; // رقم الآية
      const verseKey = sNum + ':' + aNum;
      const isActive = sNum === MushafState.activeSurahId && aNum === MushafState.activeAyahNum;

      // Check errors
      const errSet = MushafState.wordErrors.get(verseKey);
      if (errSet && errSet.has(wIdx) && !isEnd) {
        span.classList.add('word-error');
      } else {
        span.classList.remove('word-error');
      }

      if (!isMasked) {
        span.classList.remove('revealed', 'current-recite-word', 'selected-ayah-word', 'reciting-ayah-word');
        if (isActive) {
          span.classList.add(MushafState.isReciting ? 'reciting-ayah-word' : 'selected-ayah-word');
        }
        return;
      }

      // In Mask / Blind Recitation mode:
      span.classList.remove('qcf-unmasked', 'selected-ayah-word', 'reciting-ayah-word');

      if (MushafState.unmaskedVerses && MushafState.unmaskedVerses.has(verseKey)) {
        span.classList.add('revealed');
        span.classList.remove('current-recite-word');
        return;
      }

      if (isActive) {
        // رقم الآية يظهر بعد كشف آخر كلمة، والكلمات تظهر كلمة بكلمة
        const shown = isEnd ? (totalWords > 0 && MushafState.wordPointerIndex >= totalWords) : wIdx < MushafState.wordPointerIndex;
        span.classList.toggle('revealed', shown);
        span.classList.toggle('current-recite-word', !isEnd && wIdx === MushafState.wordPointerIndex);
      } else {
        span.classList.remove('revealed', 'current-recite-word');
      }
    });
  }
`;

const HELPERS = `// --- الحروف المقطّعة (الم، حم، يس، ...): المتعرّف الصوتي يكتبها بأسماء الحروف (حميم، الف لام ميم) ---
  const MUQATTAAT_WORDS = new Set(['الم', 'المص', 'الر', 'المر', 'كهيعص', 'طه', 'طسم', 'طس', 'يس', 'ص', 'حم', 'عسق', 'ق', 'ن']);
  const LETTER_NAMES = {
    'ا': ['الف'], 'ل': ['لام'], 'م': ['ميم'], 'ص': ['صاد'], 'ر': ['را', 'راء'], 'ك': ['كاف'],
    'ه': ['ها', 'هاء'], 'ي': ['يا', 'ياء'], 'ع': ['عين'], 'ط': ['طا', 'طاء'], 'س': ['سين'],
    'ح': ['حا', 'حاء'], 'ق': ['قاف'], 'ن': ['نون']
  };

  function withinOneEdit(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }

  function muqattaatVariants(target) {
    let variants = [''];
    for (const ch of target) {
      const names = LETTER_NAMES[ch];
      if (!names) return [target];
      const next = [];
      variants.forEach(v => names.forEach(n => next.push(v + n)));
      variants = next;
    }
    variants.push(target);
    return variants;
  }

  // يعيد عدد الكلمات المنطوقة المستهلكة (0 = لا تطابق)
  function matchMuqattaat(spoken, si, target) {
    if (!MUQATTAAT_WORDS.has(target)) return 0;
    const variants = muqattaatVariants(target);
    for (let n = 1; n <= 4 && si + n <= spoken.length; n++) {
      const joined = spoken.slice(si, si + n).join('');
      if (variants.some(v => joined === v || (joined.length >= 3 && withinOneEdit(joined, v)))) return n;
    }
    return 0;
  }

  // نص آية من أي مصدر متاح (الخريطة المحلية ثم الذاكرة ثم آيات الصفحة)
  function lookupAyahText(surahId, ayahNum) {
    const key = surahId + ':' + ayahNum;
    if (typeof localQuranTextMap === 'object' && localQuranTextMap && localQuranTextMap[key]) return localQuranTextMap[key];
    if (MushafState.verseTextCache && MushafState.verseTextCache.has(key)) return MushafState.verseTextCache.get(key);
    const v = (MushafState.pageVerses || []).find(x => x.verse_key === key);
    return v ? (v.text_imlaei || v.text_uthmani_simple || '') : '';
  }

  `;

patchFile('js/mushaf.js', (s, E) => {
  if (s.includes('function matchMuqattaat')) { console.log('mushaf.js: already patched'); return s; }

  // 1) دالة العرض: رقم الآية لا يأخذ current-recite-word، وإزالة تظليل التحديد عند الإخفاء
  const reSync = /function syncQcfWordsDisplay\(\) \{[\s\S]*?\r?\n  \}\r?\n(?=\r?\n  async function loadPage)/;
  if (!reSync.test(s)) throw new Error('تعذّر العثور على syncQcfWordsDisplay');
  s = s.replace(reSync, () => E(NEW_SYNC));

  // 2) نسب الكلمة لآيتها من verse_key و position (لا تعتمد على location الذي قد يغيب عن علامة النهاية)
  s = rep(s, E,
`      v.words.forEach(w => {
        const lineNum = w.line_number || 1;`,
`      v.words.forEach(w => {
        w._vk = v.verse_key;
        const lineNum = w.line_number || 1;`, 'verse key tagging');
  s = rep(s, E,
`        const locParts = (word.location || '').split(':');
        const sNum = parseInt(locParts[0] || '1', 10);
        const aNum = parseInt(locParts[1] || '1', 10);
        const wIdx = parseInt(locParts[2] || '1', 10) - 1;`,
`        const locParts = (word.location || '').split(':');
        const vkParts = (word._vk || '').split(':');
        const sNum = parseInt(vkParts[0] || locParts[0] || '1', 10);
        const aNum = parseInt(vkParts[1] || locParts[1] || '1', 10);
        const wIdx = word.position ? word.position - 1 : parseInt(locParts[2] || '1', 10) - 1;`, 'word location');

  // 3) الحروف المقطعة + دالة نص الآية
  s = rep(s, E, 'function matchWordsAt(spoken, si, words, ti) {', HELPERS + 'function matchWordsAt(spoken, si, words, ti) {', 'matchWordsAt');
  s = rep(s, E,
`    const t0 = words[ti].normalized;
    if (wordsMatch(s0, t0) || isNearWord(s0, t0)) return { s: 1, t: 1 };`,
`    const t0 = words[ti].normalized;
    if (wordsMatch(s0, t0) || isNearWord(s0, t0)) return { s: 1, t: 1 };
    const mq = matchMuqattaat(spoken, si, t0);
    if (mq) return { s: mq, t: 1 };`, 'muqattaat hook');

  // 4) تخطي بداية الآية لا يعتمد على تحميل الخريطة المحلية
  s = rep(s, E,
`    if (!progressed && cur === 0 && words[0].stumbled && typeof localQuranTextMap === 'object' && localQuranTextMap) {
      const nextText = localQuranTextMap[surah + ':' + (ayah + 1)];`,
`    if (!progressed && cur === 0 && words[0].stumbled) {
      const nextText = lookupAyahText(surah, ayah + 1);`, 'resync text');

  // 5) عند بدء التسميع: تحميل النص المحلي + التأكد أن الآية النشطة ضمن الصفحة المعروضة
  s = rep(s, E,
`  function startRecitation() {
    pauseReciterAudio();
`,
`  function startRecitation() {
    pauseReciterAudio();
    loadLocalQuranText();

    // الآية النشطة يجب أن تكون ضمن الصفحة المعروضة وإلا ينتظر التطبيق آية من صفحة أخرى
    const onPage = (MushafState.pagePolygons || []).some(p => p.surahNumber === MushafState.activeSurahId && p.ayahNumber === MushafState.activeAyahNum);
    if (!onPage && MushafState.pagePolygons && MushafState.pagePolygons.length) {
      const first = MushafState.pagePolygons[0];
      selectActiveAyah(first.surahNumber, first.ayahNumber, false);
    }
`, 'startRecitation');

  console.log('mushaf.js patched');
  return s;
});

/* ---------- ب) استمرار التسميع بين الآيات دون فقدان الكلمات ---------- */
patchFile('js/mushaf.js', (s, E) => {
  if (s.includes('carryCursor')) { console.log('mushaf.js carry: already patched'); return s; }

  // لا نُعيد تشغيل الميكروفون بعد كل آية (كان يضيّع أول كلمات الآية التالية عند القراءة المتصلة)
  s = rep(s, E,
`    MushafState.spokenCursor = 0;
    MushafState.lastSpokenCount = 0;
    // Restart recognition session smoothly for the new Ayah to clear buffer
    if (MushafState.recognition && MushafState.isReciting) {
      try {
        MushafState.recognition.abort();
        setTimeout(() => {
          if (MushafState.isReciting) {
            try { MushafState.recognition.start(); } catch (e) { }
          }
        }, 120);
      } catch (e) { }
    }
`,
`    // تبقى جلسة الميكروفون مفتوحة بين الآيات، وتُطابَق الكلمات المنطوقة بعد الآية المنتهية مع الآية التالية (carryCursor)
`, 'advanceToNextAyah restart');

  // مؤشر الكلمات المنطوقة يبدأ من حيث انتهت الآية السابقة، ثم يُعاد تحليل آخر نص مسموع
  s = rep(s, E,
`    MushafState.spokenCursor = MushafState.lastSpokenCount || 0;`,
`    const carry = MushafState.carryCursor;
    MushafState.carryCursor = null;
    MushafState.spokenCursor = (typeof carry === 'number') ? carry : (MushafState.lastSpokenCount || 0);`, 'loadAyahWords cursor');
  s = rep(s, E,
`    updateRecitationStatus();
    renderWordMasksForActiveAyah();
  }

  function advanceWordPointer() {`,
`    updateRecitationStatus();
    renderWordMasksForActiveAyah();

    if (typeof carry === 'number' && MushafState.isReciting && MushafState.lastTranscript) {
      setTimeout(() => {
        if (MushafState.isReciting) processSpokenTranscript(MushafState.lastTranscript, { tentativeLast: !!MushafState.lastTentative });
      }, 0);
    }
  }

  function advanceWordPointer() {`, 'loadAyahWords reprocess');

  // حفظ آخر نص مسموع (حتى أثناء الانتقال بين الآيات) وتحديد نقطة المتابعة عند الإكمال
  s = rep(s, E,
`    if (!transcript || isAyahTransitioning) return;
`,
`    if (!transcript) return;
    MushafState.lastTranscript = transcript;
    MushafState.lastTentative = !!(opts && opts.tentativeLast);
    if (isAyahTransitioning) return;
`, 'process head');
  s = rep(s, E,
`    if (cur >= words.length) {
      handleAyahCompleted();
      return;
    }`,
`    if (cur >= words.length) {
      MushafState.carryCursor = cursor;
      handleAyahCompleted();
      return;
    }`, 'process completion');
  s = rep(s, E,
`            MushafState.spokenCursor = 0;
            MushafState.lastSpokenCount = 0;
            renderWordErrorMarks();
            handleAyahCompleted();`,
`            MushafState.carryCursor = i;
            renderWordErrorMarks();
            handleAyahCompleted();`, 'resync carry');

  // جلسة تعرّف جديدة (النص أقصر مما استُهلك): نبدأ من أول كلمة
  s = rep(s, E,
`    let cursor = Math.min(MushafState.spokenCursor || 0, spoken.length);`,
`    let cursor = (MushafState.spokenCursor || 0) > spoken.length ? 0 : (MushafState.spokenCursor || 0);`, 'cursor reset');
  s = rep(s, E,
`      MushafState.isReciting = true;
      MushafState.spokenCursor = 0;
      MushafState.lastSpokenCount = 0;`,
`      MushafState.isReciting = true;
      MushafState.spokenCursor = 0;
      MushafState.lastSpokenCount = 0;
      MushafState.carryCursor = null;
      MushafState.lastTranscript = '';`, 'onstart reset');

  console.log('mushaf.js carry patched');
  return s;
});
