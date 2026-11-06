const fs = require('fs');

let js = fs.readFileSync('js/mushaf.js', 'utf8');

// 1. Update onerror and onend in setupSpeechRecognition
const oldOnError = `    rec.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      // Stop recitation to prevent infinite error loop
      stopRecitation();`;

const newOnError = `    rec.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      // no-speech or aborted should never stop the recitation session
      if (event.error === 'no-speech' || event.error === 'aborted') {
        if (MushafState.isReciting) {
          clearTimeout(speechRestartTimeout);
          speechRestartTimeout = setTimeout(() => {
            if (MushafState.isReciting) {
              try { rec.start(); } catch (e) { }
            }
          }, 150);
        }
        return;
      }

      // Stop recitation for real critical permission/network errors
      stopRecitation();`;

if (js.includes(oldOnError)) {
  js = js.replace(oldOnError, newOnError);
  console.log('Updated rec.onerror');
} else {
  console.warn('oldOnError not matched directly');
}

const oldOnEnd = `    rec.onend = () => {
      if (MushafState.isReciting) {
        // Continuous flow (مسار السرد السريع - الحدر): keep listening across verses
        clearTimeout(speechRestartTimeout);
        speechRestartTimeout = setTimeout(() => {
          if (!MushafState.isReciting) return;
          try {
            rec.start();
          } catch (err) {
            // الجلسة السابقة لم تُغلق بعد: أعد المحاولة بعد قليل
            speechRestartTimeout = setTimeout(() => {
              if (MushafState.isReciting) { try { rec.start(); } catch (e2) { } }
            }, 400);
          }
        }, 150);
      } else {
        updateRecitationStatus();
        highlightActiveAyahPolygon();
      }
    };`;

const newOnEnd = `    rec.onend = () => {
      if (MushafState.isReciting) {
        // إعادة استدعاء rec.start() فوراً طالما أن جلسة التسميع نشطة لمنع التوقف المفاجئ
        clearTimeout(speechRestartTimeout);
        speechRestartTimeout = setTimeout(() => {
          if (!MushafState.isReciting) return;
          try {
            rec.start();
          } catch (err) {
            speechRestartTimeout = setTimeout(() => {
              if (MushafState.isReciting) {
                try { rec.start(); } catch (e2) { }
              }
            }, 250);
          }
        }, 50);
      } else {
        updateRecitationStatus();
        highlightActiveAyahPolygon();
      }
    };`;

if (js.includes(oldOnEnd)) {
  js = js.replace(oldOnEnd, newOnEnd);
  console.log('Updated rec.onend');
} else {
  console.warn('oldOnEnd not matched directly');
}

// 2. Add tryMidPageCatchUp helper and replace processSpokenTranscript
const midPageCatchUpCode = `  // --- البدء الذكي من أي موضع بالصفحة (Mid-Surah / Mid-Page Auto-Catchup) ---
  function tryMidPageCatchUp(spoken) {
    if (!spoken || !spoken.length) return false;
    const pageWords = MushafState.pageQcfWords || [];
    if (!pageWords.length) return false;

    // تجميع الكلمات الحقيقية المعروضة على الصفحة بالترتيب
    const nonEndWords = [];
    pageWords.forEach((w) => {
      if (w.char_type_name !== 'end') {
        const text = w.text_imlaei || '';
        const norm = normalizeArabicText(text);
        if (norm) {
          const locParts = (w.location || '').split(':');
          const vkParts = (w._vk || '').split(':');
          const sNum = parseInt(vkParts[0] || locParts[0] || '1', 10);
          const aNum = parseInt(vkParts[1] || locParts[1] || '1', 10);
          const pos = w.position || parseInt(locParts[2] || '1', 10);
          nonEndWords.push({
            surah: sNum,
            ayah: aNum,
            pos: pos,
            loc: w.location,
            vk: sNum + ':' + aNum,
            text: text,
            normalized: norm
          });
        }
      }
    });

    if (nonEndWords.length < 2) return false;

    // البحث عن مطابقة لكلمات المستخدم المنطوقة (1 أو كلمتين متتاليتين) في كل كلمات الصفحة
    let bestMatchIdx = -1;
    let bestSpokenConsumed = 0;

    for (let si = 0; si < spoken.length; si++) {
      for (let pi = 0; pi < nonEndWords.length; pi++) {
        const target = nonEndWords[pi].normalized;
        const s0 = spoken[si];
        let matched = false;
        let consumed = 1;

        if (wordsMatch(s0, target) || isNearWord(s0, target)) {
          matched = true;
        } else {
          const mq = matchMuqattaat(spoken, si, target);
          if (mq) {
            matched = true;
            consumed = mq;
          }
        }

        if (matched) {
          // تأكيد ثنائي عند إمكانية المقارنة مع الكلمة التالية
          if (si + consumed < spoken.length && pi + 1 < nonEndWords.length) {
            const nextTarget = nonEndWords[pi + 1].normalized;
            const nextSpoken = spoken[si + consumed];
            if (wordsMatch(nextSpoken, nextTarget) || isNearWord(nextSpoken, nextTarget)) {
              bestMatchIdx = pi;
              bestSpokenConsumed = consumed + 1;
              break;
            }
          }
          if (bestMatchIdx === -1) {
            bestMatchIdx = pi;
            bestSpokenConsumed = consumed;
          }
        }
      }
      if (bestMatchIdx !== -1) break;
    }

    if (bestMatchIdx === -1) return false;

    const hit = nonEndWords[bestMatchIdx];
    const isCurrentFirstWord = hit.surah === MushafState.activeSurahId &&
                               hit.ayah === MushafState.activeAyahNum &&
                               (hit.pos - 1) === 0;

    // إذا كانت البداية من أول كلمة في الآية النشطة الحالية، يستمر النمط العادي
    if (isCurrentFirstWord && (MushafState.wordPointerIndex || 0) === 0) {
      return false;
    }

    // المستخدم بدأ من موضع آخر أو آية أخرى في الصفحة: كشف كل ما قبلها تلقائياً
    const targetKey = hit.vk;
    const targetWIdx = hit.pos - 1;

    // كشف جميع الآيات السابقة للآية المستهدفة في هذه الصفحة
    const seenVerses = new Set();
    for (let i = 0; i < bestMatchIdx; i++) {
      const vk = nonEndWords[i].vk;
      seenVerses.add(vk);
    }
    seenVerses.forEach((vk) => {
      if (vk !== targetKey) {
        MushafState.unmaskedVerses.add(vk);
      }
    });

    // الانتقال للآية والكلمة المستهدفة مباشرة دون إعادة من البداية
    MushafState.activeSurahId = hit.surah;
    MushafState.activeAyahNum = hit.ayah;
    updateRecitationActiveAyahInfo();
    highlightCurrentSurahInDrawer();
    highlightActiveAyahPolygon();

    loadAyahWords(hit.surah, hit.ayah).then(() => {
      const words = MushafState.targetWords || [];
      // كشف الكلمات السابقة لنفس الآية
      for (let k = 0; k < targetWIdx && k < words.length; k++) {
        words[k].matched = true;
      }
      // كشف الكلمة التي قرأها الآن مباشرة
      if (targetWIdx < words.length) {
        words[targetWIdx].matched = true;
      }
      MushafState.wordPointerIndex = Math.min(targetWIdx + 1, words.length);
      MushafState.spokenCursor = bestSpokenConsumed;
      updateWordMasksState();
      renderWordErrorMarks();
      if (MushafState.wordPointerIndex >= words.length) {
        handleAyahCompleted();
      }
    });

    console.info('[TASMEE] قفز ذكي إلى موضع الكلمة المقروءة:', hit.vk + ' كلمة ' + hit.pos);
    return true;
  }

`;

const newProcessSpokenTranscript = `  function processSpokenTranscript(transcript, opts) {
    if (!transcript) return;
    MushafState.lastTranscript = transcript;
    MushafState.lastTentative = !!(opts && opts.tentativeLast);
    if (isAyahTransitioning) return;

    const spoken = normalizeArabicText(transcript).split(/\\s+/).filter(Boolean);
    MushafState.lastSpokenCount = spoken.length;
    if (!spoken.length) return;

    // 1. البدء الذكي من أي موضع بالصفحة (Mid-Surah Auto-Catchup):
    // إن لم يكن هناك تقدم بعد في الآية الحالية، نتحقق إن كان المستخدم بدأ من موضع آخر في الصفحة
    if ((MushafState.wordPointerIndex || 0) === 0 && !MushafState.__midCatchupLocked) {
      if (tryMidPageCatchUp(spoken)) {
        MushafState.__midCatchupLocked = true;
        setTimeout(() => { MushafState.__midCatchupLocked = false; }, 800);
        return;
      }
    }

    const surah = MushafState.activeSurahId;
    const ayah = MushafState.activeAyahNum;
    const words = MushafState.targetWords;
    if (!words || !words.length) {
      loadAyahWords(surah, ayah);
      return;
    }

    const tentativeLast = !!(opts && opts.tentativeLast);
    let cursor = (MushafState.spokenCursor || 0) > spoken.length ? 0 : (MushafState.spokenCursor || 0);
    let cur = MushafState.wordPointerIndex || 0;
    let progressed = false;
    const skipEmpty = () => { while (cur < words.length && !words[cur].normalized) { words[cur].matched = true; cur++; } };
    skipEmpty();

    while (cursor < spoken.length && cur < words.length) {
      const m = matchWordsAt(spoken, cursor, words, cur);
      if (m) {
        // تطابق صحيح: كشف فوري للكلمة الحالية
        for (let k = 0; k < m.t; k++) {
          words[cur + k].matched = true;
          // إذا كان تعثر فيها سابقاً ثم نطقها صحيحة، نسجل علامة الخطأ
          if (words[cur + k].stumbled) {
            markWordError(surah, ayah, cur + k);
          }
        }
        cur += m.t;
        cursor += m.s;
        progressed = true;
        skipEmpty();
        continue;
      }

      // إذا كانت آخر كلمة مؤقتة غير مكتملة، ننتظر اكتمالها دون تسجيل خطأ
      if (tentativeLast && cursor === spoken.length - 1) {
        break;
      }

      // في حال نطق كلمة خاطئة: المؤشر يظل ثابتاً عند الكلمة الحالية، وتسجل كتعثر
      words[cur].stumbled = true;
      cursor++;
    }

    MushafState.spokenCursor = cursor;
    MushafState.wordPointerIndex = cur;

    // كشف الكلمات فوراً (Instant Reveal) وتحديث مواضع الخطأ
    updateWordMasksState();
    renderWordErrorMarks();

    if (cur >= words.length) {
      MushafState.carryCursor = cursor;
      handleAyahCompleted();
      return;
    }

    if (dom.recitationStatusBadge && MushafState.isReciting) {
      if (words[cur] && words[cur].stumbled && !progressed) {
        dom.recitationStatusBadge.textContent = 'كلمة غير صحيحة، أعد نطقها';
      } else {
        dom.recitationStatusBadge.textContent = \`\${cur} من \${words.length} كلمة\`;
      }
    }
  }`;

// Find processSpokenTranscript range
const pStart = js.indexOf('function processSpokenTranscript(');
const pEnd = js.indexOf('function toggleRecitation()', pStart);

if (pStart !== -1 && pEnd !== -1) {
  js = js.substring(0, pStart) + midPageCatchUpCode + newProcessSpokenTranscript + '\n\n  ' + js.substring(pEnd);
  console.log('Replaced processSpokenTranscript and added tryMidPageCatchUp');
} else {
  console.error('Could not locate processSpokenTranscript block');
}

fs.writeFileSync('js/mushaf.js', js, 'utf8');
console.log('Saved js/mushaf.js successfully');

