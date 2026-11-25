/**
 * Seraj - Surprise Test & Verse Completion Tool (اختبار المباغتة وإكمال الآيات)
 * Enables random verse recall tests (complete the verse, or recall the next verse)
 * with audio preview, voice speech recognition, and stumbled verses re-test.
 */
(function () {
  'use strict';

  let quranTextMap = null;
  const audioPlayer = new Audio();
  audioPlayer.preload = 'auto';

  // State Management
  const State = {
    scope: 'current_surah', // 'current_surah' | 'weekly_memo' | 'weekly_review' | 'weekly_all' | 'all_memorized' | 'custom_surah' | 'surah_range'
    customSurahId: 1,
    rangeFromId: 1,
    rangeToId: 114,
    questionCount: 5, // 5 | 10 | 0 (0 = infinite / continuous)
    spanMode: '1', // '1' | '3' | '5' | 'page'
    testType: 'complete_verse', // 'complete_verse' | 'next_verse' | 'sections' | 'mutashabihat' | 'locate_verse' | 'surah_transitions'
    reciter: 'Alafasy_128kbps',
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    score: {
      mastered: 0,
      stumbled: 0,
      totalAnswered: 0
    },
    stumbledQuestions: [],
    isAudioPlaying: false,
    audioQueue: [],
    audioQueueIdx: 0,
    recognition: null,
    isListening: false,
    matchedIndices: new Set(),
    isRevealed: false,
    mcqAnswered: false
  };

  // Helper: Normalize Arabic text for speech matching
  function normalizeArabicText(str) {
    if (!str) return '';
    return str
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // Remove Tashkeel & stop marks
      .replace(/\u0640/g, '') // Remove Tatweel
      .replace(/[أإآٱ]/g, 'ا') // Normalize Hamzas to Alif
      .replace(/ة/g, 'ه') // Normalize Taa Marbuta
      .replace(/ى/g, 'ي') // Normalize Alif Maqsoora
      .replace(/[^\u0621-\u064A\s]/g, ' ') // Strip non-Arabic letters
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Fuzzy word matching
  function wordsMatch(spoken, target) {
    if (!spoken || !target) return false;
    if (spoken === target) return true;

    // Check without leading conjunctions (و or ف)
    const cleanS = spoken.replace(/^[وف]/, '');
    const cleanT = target.replace(/^[وف]/, '');
    if (cleanS === cleanT && cleanS.length > 2) return true;

    // Check without trailing alif tanween
    const sNoTanween = spoken.replace(/ا$/, '');
    const tNoTanween = target.replace(/ا$/, '');
    if (sNoTanween === tNoTanween && sNoTanween.length > 1) return true;

    // Check without internal alif dagger
    const sNoAlif = spoken.replace(/ا/g, '');
    const tNoAlif = target.replace(/ا/g, '');
    if (sNoAlif === tNoAlif && sNoAlif.length > 1) return true;

    return false;
  }

  // Load Quran Text
  async function loadQuranText() {
    if (quranTextMap) return quranTextMap;
    if (window.localQuranTextMap) {
      quranTextMap = window.localQuranTextMap;
      return quranTextMap;
    }
    try {
      const res = await fetch('data/quran_text.json');
      if (res.ok) {
        quranTextMap = await res.json();
      }
    } catch (e) {
      console.warn('Failed to load quran text for surprise test:', e);
    }
    return quranTextMap;
  }

  function getVerseText(surah, ayah) {
    const key = `${surah}:${ayah}`;
    if (quranTextMap && quranTextMap[key]) {
      return quranTextMap[key];
    }
    return '';
  }

  function getAyahAudioUrl(reciter, surah, ayah) {
    const sPad = String(surah).padStart(3, '0');
    const aPad = String(ayah).padStart(3, '0');
    return `https://everyayah.com/data/${reciter}/${sPad}${aPad}.mp3`;
  }

  async function resolveAudioSource(reciter, surah, ayah) {
    const url = getAyahAudioUrl(reciter, surah, ayah);
    if ('caches' in window) {
      try {
        const cache = await caches.open('tibyan-audio-v1');
        const match = await cache.match(url);
        if (match) {
          const blob = await match.blob();
          return URL.createObjectURL(blob);
        }
      } catch (_) {}
    }
    return url;
  }

  function getSurahByNameOrId(val) {
    if (!window.QURAN_SURAHS) return null;
    if (typeof val === 'number' || /^\d+$/.test(val)) {
      const id = parseInt(val, 10);
      return window.QURAN_SURAHS.find(s => s.id === id) || null;
    }
    const clean = String(val).replace(/^سورة\s+/, '').trim();
    return window.QURAN_SURAHS.find(s => s.name === clean || s.name === val) || null;
  }

  // Populate the 114 surahs in custom & range dropdowns
  function fillSurahDropdown(sel, defaultId) {
    if (!sel || sel.children.length > 0 || !window.QURAN_SURAHS) return;
    window.QURAN_SURAHS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية)`;
      sel.appendChild(opt);
    });
    if (defaultId) sel.value = String(defaultId);
  }

  function populateSurahSelect() {
    if (!window.QURAN_SURAHS) return;
    let defId = 1;
    if (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) {
      const found = getSurahByNameOrId(window.AppState.surahConfig.name);
      if (found) defId = found.id;
    }

    const sel = document.getElementById('surpriseSurahSelect');
    fillSurahDropdown(sel, defId);
    if (sel) State.customSurahId = parseInt(sel.value, 10) || defId;

    const fromSel = document.getElementById('surpriseRangeFromSelect');
    const toSel = document.getElementById('surpriseRangeToSelect');
    fillSurahDropdown(fromSel, 1);
    fillSurahDropdown(toSel, 114);
    if (fromSel) State.rangeFromId = parseInt(fromSel.value, 10) || 1;
    if (toSel) State.rangeToId = parseInt(toSel.value, 10) || 114;
  }

  // Build pool of eligible verses based on scope and test type
  function buildVersePool(scope, testType, customSurahId) {
    const pool = [];
    if (!window.QURAN_SURAHS) return pool;
    const needsNext = (testType === 'next_verse');

    if (scope === 'weekly_memo') {
      if (typeof window.getWeeklyHarvestData === 'function') {
        const harvest = window.getWeeklyHarvestData();
        if (harvest && Array.isArray(harvest.memoVersePool) && harvest.memoVersePool.length > 0) {
          const poolItems = harvest.memoVersePool;
          const limitItems = needsNext ? poolItems.filter(item => item.ayahNum < item.maxVerses) : poolItems;
          pool.push(...limitItems);
        }
      }
      if (pool.length === 0) return buildVersePool('current_surah', testType, customSurahId);
    } else if (scope === 'weekly_review') {
      if (typeof window.getWeeklyHarvestData === 'function') {
        const harvest = window.getWeeklyHarvestData();
        if (harvest && Array.isArray(harvest.reviewVersePool) && harvest.reviewVersePool.length > 0) {
          const poolItems = harvest.reviewVersePool;
          const limitItems = needsNext ? poolItems.filter(item => item.ayahNum < item.maxVerses) : poolItems;
          pool.push(...limitItems);
        }
      }
      if (pool.length === 0) return buildVersePool('all_memorized', testType, customSurahId);
    } else if (scope === 'weekly_all') {
      if (typeof window.getWeeklyHarvestData === 'function') {
        const harvest = window.getWeeklyHarvestData();
        if (harvest && Array.isArray(harvest.allVersePool) && harvest.allVersePool.length > 0) {
          const poolItems = harvest.allVersePool;
          const limitItems = needsNext ? poolItems.filter(item => item.ayahNum < item.maxVerses) : poolItems;
          pool.push(...limitItems);
        }
      }
      if (pool.length === 0) return buildVersePool('current_surah', testType, customSurahId);
    } else if (scope === 'current_surah') {
      const curName = (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) || 'البقرة';
      const surahObj = getSurahByNameOrId(curName) || window.QURAN_SURAHS[1];
      const maxVerses = surahObj.verses;
      const progress = (window.AppState && window.AppState.surahConfig && parseInt(window.AppState.surahConfig.currentVerse, 10)) || 0;
      const endAyah = (progress > 0 && progress < maxVerses) ? progress : maxVerses;
      const limit = needsNext ? Math.min(endAyah, maxVerses - 1) : endAyah;

      for (let a = 1; a <= limit; a++) {
        pool.push({ surahId: surahObj.id, ayahNum: a, surahName: surahObj.name, maxVerses });
      }
    } else if (scope === 'all_memorized') {
      const memorizedNames = new Set();
      if (window.AppState && Array.isArray(window.AppState.completedSurahs)) {
        window.AppState.completedSurahs.forEach(c => memorizedNames.add(c.name));
      }
      if (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) {
        memorizedNames.add(window.AppState.surahConfig.name);
      }

      if (memorizedNames.size === 0) {
        window.QURAN_SURAHS.slice(77).forEach(s => memorizedNames.add(s.name));
        memorizedNames.add('الفاتحة');
      }

      memorizedNames.forEach(name => {
        const surahObj = getSurahByNameOrId(name);
        if (surahObj) {
          const maxVerses = surahObj.verses;
          let endAyah = maxVerses;
          if (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name === surahObj.name) {
            const p = parseInt(window.AppState.surahConfig.currentVerse, 10) || 0;
            if (p > 0 && p < maxVerses) endAyah = p;
          }
          const limit = needsNext ? Math.min(endAyah, maxVerses - 1) : endAyah;
          for (let a = 1; a <= limit; a++) {
            pool.push({ surahId: surahObj.id, ayahNum: a, surahName: surahObj.name, maxVerses });
          }
        }
      });
    } else if (scope === 'surah_range') {
      const f = Math.min(State.rangeFromId || 1, State.rangeToId || 114);
      const t = Math.max(State.rangeFromId || 1, State.rangeToId || 114);
      window.QURAN_SURAHS
        .filter(s => s.id >= f && s.id <= t)
        .forEach(surahObj => {
          const maxVerses = surahObj.verses;
          const limit = needsNext ? Math.max(1, maxVerses - 1) : maxVerses;
          for (let a = 1; a <= limit; a++) {
            pool.push({ surahId: surahObj.id, ayahNum: a, surahName: surahObj.name, maxVerses });
          }
        });
    } else if (scope === 'custom_surah') {
      const surahObj = getSurahByNameOrId(customSurahId) || window.QURAN_SURAHS[0];
      const maxVerses = surahObj.verses;
      const limit = needsNext ? Math.max(1, maxVerses - 1) : maxVerses;
      for (let a = 1; a <= limit; a++) {
        pool.push({ surahId: surahObj.id, ayahNum: a, surahName: surahObj.name, maxVerses });
      }
    }

    return pool;
  }

  // Shuffle array using Fisher-Yates
  function shuffleArray(arr) {
    const res = arr.slice();
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = res[i];
      res[i] = res[j];
      res[j] = tmp;
    }
    return res;
  }

  function getPageForAyah(surahId, ayahNum) {
    if (typeof window.getAyahPageNumber === 'function') {
      return window.getAyahPageNumber(surahId, ayahNum);
    }
    const s = getSurahByNameOrId(surahId);
    return (s && s.startPage) || 1;
  }

  function getPageEndAyahForSurah(surahId, ayahNum, maxVerses) {
    const targetPage = getPageForAyah(surahId, ayahNum);
    const map = window.QURAN_AYAH_PAGE_MAP;
    if (map && map[surahId]) {
      const entries = map[surahId];
      for (let i = 0; i < entries.length; i++) {
        if (entries[i][1] === targetPage) {
          return Math.min(maxVerses, Math.max(ayahNum, entries[i][0]));
        }
      }
    }
    return Math.min(maxVerses, ayahNum + 5);
  }

  function resolveEndAyahBySpan(surahId, startAyah, maxVerses, spanMode) {
    if (spanMode === 'page') return getPageEndAyahForSurah(surahId, startAyah, maxVerses);
    const count = parseInt(spanMode, 10) || 1;
    return Math.min(maxVerses, startAyah + Math.max(1, count) - 1);
  }

  function collectVersesRange(surahId, fromA, toA) {
    const parts = [];
    const tokens = [];
    const ayahList = [];
    for (let a = fromA; a <= toA; a++) {
      const txt = getVerseText(surahId, a);
      if (!txt) continue;
      const wList = txt.trim().split(/\s+/).filter(Boolean);
      parts.push({ ayah: a, text: txt, words: wList });
      tokens.push(...wList);
      ayahList.push(a);
    }
    return {
      parts,
      combinedText: parts.map(p => `${p.text} ﴿${p.ayah}﴾`).join(' '),
      wordsList: tokens,
      ayahList
    };
  }

  function getVerseLocationDetails(surahId, ayahNum) {
    const page = getPageForAyah(surahId, ayahNum);
    const juzObj = (typeof window.getJuzForPage === 'function') ? window.getJuzForPage(page) : { juz: 1 };
    const juzNum = juzObj ? juzObj.juz : 1;
    const juzStart = (window.JUZ_DATA && window.JUZ_DATA.find(j => j.juz === juzNum)) ? window.JUZ_DATA.find(j => j.juz === juzNum).startPage : 1;
    const nextJuzEntry = window.JUZ_DATA ? window.JUZ_DATA.find(j => j.juz === juzNum + 1) : null;
    const juzEnd = nextJuzEntry ? nextJuzEntry.startPage - 1 : 604;
    const midPage = juzStart + Math.floor((juzEnd - juzStart) / 2);
    const hizb = (page <= midPage) ? (juzNum * 2 - 1) : (juzNum * 2);

    let quarterIdx = 1;
    const qMap = window.QURAN_SURAH_QUARTERS && window.QURAN_SURAH_QUARTERS[surahId];
    if (Array.isArray(qMap)) {
      for (let i = 0; i < qMap.length; i++) {
        if (ayahNum >= qMap[i][0] && ayahNum <= qMap[i][1]) {
          quarterIdx = i + 1;
          break;
        }
      }
    }
    return { juz: juzNum, hizb, quarterInSurah: quarterIdx, page };
  }

  // Generate question list for all 6 test types
  function generateQuestions(scope, testType, customSurahId, count) {
    const pool = buildVersePool(scope, testType, customSurahId);
    if (!pool.length) return [];

    const shuffled = shuffleArray(pool);
    const questions = [];
    const targetTotal = count > 0 ? count : 15;

    if (testType === 'mutashabihat') {
      const db = window.SERAJ_MUTASHABIHAT_DB || {};
      const poolKeys = new Set(pool.map(p => `${p.surahId}:${p.ayahNum}`));
      const poolSurahs = new Set(pool.map(p => p.surahId));
      const matchedEntries = shuffleArray(
        Object.values(db).filter(entry => entry && (poolKeys.has(`${entry.surah}:${entry.ayah}`) || (scope !== 'current_surah' && poolSurahs.has(entry.surah))))
      );

      for (let i = 0; i < matchedEntries.length; i++) {
        const entry = matchedEntries[i];
        const fullText = getVerseText(entry.surah, entry.ayah) || entry.text || '';
        if (!fullText) continue;
        const words = fullText.trim().split(/\s+/).filter(Boolean);
        let promptText = '';
        if (entry.phrase && fullText.includes(entry.phrase)) {
          promptText = fullText.replace(entry.phrase, ' [ ..... ] ');
        } else {
          const cut = Math.min(5, Math.max(2, Math.floor(words.length / 3)));
          promptText = words.slice(0, cut).join(' ') + ' ...';
        }

        let mcqChoices = null;
        if (Array.isArray(entry.counterparts) && entry.counterparts.length > 0 && entry.phrase) {
          const seenPhrases = new Set([normalizeArabicText(entry.phrase)]);
          const opts = [{ label: entry.phrase, isCorrect: true }];
          entry.counterparts.forEach(cp => {
            if (cp && cp.phrase) {
              const norm = normalizeArabicText(cp.phrase);
              if (!seenPhrases.has(norm)) {
                seenPhrases.add(norm);
                opts.push({ label: cp.phrase, isCorrect: false });
              }
            }
          });
          if (opts.length >= 2) mcqChoices = shuffleArray(opts.slice(0, 4));
        }

        questions.push({
          type: 'mutashabihat',
          typeLabel: 'المتشابهات اللفظية',
          surahId: entry.surah,
          ayahNum: entry.ayah,
          surahName: entry.surahName,
          topic: entry.topic || '',
          rule: entry.rule || entry.note || '',
          promptText,
          audioItems: [{ surahId: entry.surah, ayahNum: entry.ayah }],
          answerText: fullText,
          answerParts: [{ ayah: entry.ayah, text: fullText, words }],
          answerWords: words,
          mcqChoices,
          summaryLocation: `سورة ${entry.surahName} — الآية ${entry.ayah}`
        });

        if (questions.length >= targetTotal) break;
      }
      return questions;
    }

    if (testType === 'locate_verse') {
      const subModes = ['surah', 'juz_quarter', 'adjacent'];
      for (let i = 0; i < shuffled.length; i++) {
        const item = shuffled[i];
        const sId = item.surahId;
        const aNum = item.ayahNum;
        const sName = item.surahName;
        const maxV = item.maxVerses;
        const verseTxt = getVerseText(sId, aNum);
        if (!verseTxt) continue;

        let subMode = subModes[questions.length % subModes.length];
        if (subMode === 'adjacent' && maxV <= 1) subMode = 'surah';

        const loc = getVerseLocationDetails(sId, aNum);
        let questionLabel = 'في أي سورة وردت هذه الآية؟';
        let choices = [];
        let feedbackText = `سورة ${sName} — الآية ${aNum} • الجزء ${loc.juz} • الحزب ${loc.hizb} • الربع ${loc.quarterInSurah} (ص ${loc.page})`;

        if (subMode === 'surah') {
          questionLabel = 'تحديد السورة: في أي سورة وردت هذه الآية؟';
          const distractors = shuffleArray(window.QURAN_SURAHS.filter(s => s.id !== sId)).slice(0, 3);
          choices = shuffleArray([
            { label: `سورة ${sName}`, isCorrect: true },
            ...distractors.map(d => ({ label: `سورة ${d.name}`, isCorrect: false }))
          ]);
        } else if (subMode === 'juz_quarter') {
          questionLabel = `تحديد الجزء والحزب والربع — سورة ${sName} (الآية ${aNum}):`;
          const correctLbl = `الجزء ${loc.juz} • الحزب ${loc.hizb} • الربع ${loc.quarterInSurah} (ص ${loc.page})`;
          const seenLbl = new Set([correctLbl]);
          const dist = [];
          const candidates = [
            { juz: Math.max(1, loc.juz - 1), hizb: Math.max(1, loc.hizb - 1), q: loc.quarterInSurah, p: Math.max(1, loc.page - 20) },
            { juz: Math.min(30, loc.juz + 1), hizb: Math.min(60, loc.hizb + 1), q: Math.max(1, loc.quarterInSurah + 1), p: Math.min(604, loc.page + 20) },
            { juz: loc.juz, hizb: (loc.hizb % 2 === 1 ? loc.hizb + 1 : loc.hizb - 1), q: (loc.quarterInSurah === 1 ? 2 : 1), p: Math.min(604, Math.max(1, loc.page + 8)) },
            { juz: Math.min(30, loc.juz + 2), hizb: Math.min(60, loc.hizb + 3), q: 1, p: Math.min(604, loc.page + 35) }
          ];
          candidates.forEach(c => {
            const lbl = `الجزء ${c.juz} • الحزب ${c.hizb} • الربع ${c.q} (ص ${c.p})`;
            if (!seenLbl.has(lbl) && dist.length < 3) {
              seenLbl.add(lbl);
              dist.push({ label: lbl, isCorrect: false });
            }
          });
          choices = shuffleArray([{ label: correctLbl, isCorrect: true }, ...dist]);
        } else {
          const askNext = aNum < maxV ? (aNum === 1 || Math.random() > 0.45) : false;
          const targetAyah = askNext ? aNum + 1 : aNum - 1;
          const targetTxt = getVerseText(sId, targetAyah);
          if (!targetTxt) continue;
          questionLabel = askNext
            ? `ما هي الآية اللاحقة مباشرة؟ (سورة ${sName} — بعد الآية ${aNum})`
            : `ما هي الآية السابقة مباشرة؟ (سورة ${sName} — قبل الآية ${aNum})`;
          const distOpts = shuffleArray(pool.filter(p => !(p.surahId === sId && p.ayahNum === targetAyah) && !(p.surahId === sId && p.ayahNum === aNum))).slice(0, 3);
          const distChoices = distOpts.map(d => {
            const dt = getVerseText(d.surahId, d.ayahNum);
            return dt ? { label: `${dt.split(/\s+/).slice(0, 10).join(' ')} (${d.ayahNum})`, isCorrect: false } : null;
          }).filter(Boolean);
          if (distChoices.length < 2) {
            const extraSurah = shuffleArray(window.QURAN_SURAHS.filter(s => s.id !== sId)).slice(0, 3 - distChoices.length);
            extraSurah.forEach(es => {
              const et = getVerseText(es.id, 1);
              if (et) distChoices.push({ label: `${et.split(/\s+/).slice(0, 10).join(' ')} (سورة ${es.name})`, isCorrect: false });
            });
          }
          choices = shuffleArray([
            { label: `${targetTxt.split(/\s+/).slice(0, 10).join(' ')} (${targetAyah})`, isCorrect: true },
            ...distChoices.slice(0, 3)
          ]);
        }

        if (choices.length < 2) continue;
        const correctChoice = choices.find(c => c.isCorrect);
        questions.push({
          type: 'locate_verse',
          typeLabel: 'تحديد المواضع',
          questionLabel,
          surahId: sId,
          ayahNum: aNum,
          surahName: sName,
          promptText: verseTxt,
          audioItems: [{ surahId: sId, ayahNum: aNum }],
          mcqChoices: choices,
          mcqOnly: true,
          rule: feedbackText,
          answerText: correctChoice ? correctChoice.label : feedbackText,
          answerWords: [],
          summaryLocation: `سورة ${sName} — الآية ${aNum}`
        });
        if (questions.length >= targetTotal) break;
      }
      return questions;
    }

    if (testType === 'surah_transitions') {
      const seenSurahIds = new Set();
      const uniqueSurahs = [];
      pool.forEach(p => {
        if (!seenSurahIds.has(p.surahId)) {
          seenSurahIds.add(p.surahId);
          const sObj = getSurahByNameOrId(p.surahId);
          if (sObj) uniqueSurahs.push(sObj);
        }
      });

      const candidates = [];
      shuffleArray(uniqueSurahs).forEach(sObj => {
        if (sObj.id < 114) {
          const nextS = getSurahByNameOrId(sObj.id + 1);
          if (nextS) {
            candidates.push({ mode: 'next_surah', sObj, nextS });
          }
        }
        if (uniqueSurahs.length <= 2) {
          candidates.push({ mode: 'surah_start', sObj, nextS: sObj });
        }
      });

      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c.mode === 'next_surah') {
          const endTxt = getVerseText(c.sObj.id, c.sObj.verses);
          const nextStartTxt = getVerseText(c.nextS.id, 1);
          if (!endTxt || !nextStartTxt) continue;
          const nextWords = nextStartTxt.trim().split(/\s+/).filter(Boolean);
          const distSurahs = shuffleArray(window.QURAN_SURAHS.filter(s => s.id !== c.nextS.id && s.id !== c.sObj.id)).slice(0, 3);
          const mcqChoices = shuffleArray([
            { label: `${nextStartTxt} (سورة ${c.nextS.name})`, isCorrect: true },
            ...distSurahs.map(ds => ({ label: `${getVerseText(ds.id, 1)} (سورة ${ds.name})`, isCorrect: false }))
          ]);

          questions.push({
            type: 'surah_transitions',
            typeLabel: 'أواخر وبدايات السور',
            questionLabel: `خاتمة سورة ${c.sObj.name} — اذكر أو اختر بداية السورة التالية (${c.nextS.name}):`,
            surahId: c.sObj.id,
            ayahNum: c.sObj.verses,
            surahName: c.sObj.name,
            targetSurahName: c.nextS.name,
            targetAyahNum: 1,
            promptText: endTxt,
            audioItems: [{ surahId: c.sObj.id, ayahNum: c.sObj.verses }],
            answerText: nextStartTxt,
            answerParts: [{ ayah: 1, text: nextStartTxt, words: nextWords }],
            answerWords: nextWords,
            mcqChoices,
            rule: `بعد خاتمة سورة ${c.sObj.name} (الآية ${c.sObj.verses}) تأتي سورة ${c.nextS.name} مباشرة في ترتيب المصحف.`,
            summaryLocation: `خاتمة ${c.sObj.name} ➔ بداية ${c.nextS.name}`
          });
        } else {
          const startTxt = getVerseText(c.sObj.id, 1);
          if (!startTxt) continue;
          const startWords = startTxt.trim().split(/\s+/).filter(Boolean);
          const distSurahs = shuffleArray(window.QURAN_SURAHS.filter(s => s.id !== c.sObj.id)).slice(0, 3);
          const mcqChoices = shuffleArray([
            { label: startTxt, isCorrect: true },
            ...distSurahs.map(ds => ({ label: getVerseText(ds.id, 1), isCorrect: false }))
          ]);
          questions.push({
            type: 'surah_transitions',
            typeLabel: 'أواخر وبدايات السور',
            questionLabel: `استحضار مطلع السورة: ما أول آية في سورة ${c.sObj.name}؟`,
            surahId: c.sObj.id,
            ayahNum: 1,
            surahName: c.sObj.name,
            targetSurahName: c.sObj.name,
            targetAyahNum: 1,
            promptText: `سورة ${c.sObj.name} (${c.sObj.verses} آية)`,
            audioItems: [{ surahId: c.sObj.id, ayahNum: 1 }],
            answerText: startTxt,
            answerParts: [{ ayah: 1, text: startTxt, words: startWords }],
            answerWords: startWords,
            mcqChoices,
            summaryLocation: `بداية سورة ${c.sObj.name} — الآية 1`
          });
        }
        if (questions.length >= targetTotal) break;
      }
      return questions;
    }

    // complete_verse, next_verse, sections (respecting State.spanMode)
    for (let i = 0; i < shuffled.length; i++) {
      const item = shuffled[i];
      const sId = item.surahId;
      const aNum = item.ayahNum;
      const sName = item.surahName;
      const maxV = item.maxVerses;

      if (testType === 'sections' || testType === 'complete_verse') {
        const text = getVerseText(sId, aNum);
        if (!text) continue;
        const firstWords = text.trim().split(/\s+/).filter(Boolean);
        if (firstWords.length < 2 && shuffled.length > targetTotal) continue;

        const effectiveSpan = (testType === 'sections' && State.spanMode === '1') ? '3' : State.spanMode;
        const endAyah = resolveEndAyahBySpan(sId, aNum, maxV, testType === 'sections' ? State.spanMode : effectiveSpan);
        const collected = collectVersesRange(sId, aNum, endAyah);
        if (!collected.parts.length) continue;

        const promptWordCount = Math.min(4, Math.max(2, Math.floor(firstWords.length / 3)));
        const promptText = firstWords.slice(0, promptWordCount).join(' ') + '...';
        const stopPage = getPageForAyah(sId, endAyah);
        const stopBadge = (endAyah > aNum || testType === 'sections')
          ? (State.spanMode === 'page'
            ? `إشارة التوقف: نهاية الصفحة ${stopPage} (عند الآية ${endAyah})`
            : `إشارة التوقف: عند نهاية الآية ${endAyah}`)
          : '';

        questions.push({
          type: testType,
          typeLabel: testType === 'sections' ? 'اختبار المقاطع' : 'إكمال الآية',
          surahId: sId,
          ayahNum: aNum,
          endAyahNum: endAyah,
          surahName: sName,
          promptText,
          stopBadge,
          audioItems: collected.ayahList.map(a => ({ surahId: sId, ayahNum: a })),
          answerText: collected.combinedText,
          answerParts: collected.parts,
          answerWords: collected.wordsList,
          summaryLocation: endAyah > aNum ? `سورة ${sName} — الآيات ${aNum}–${endAyah}` : `سورة ${sName} — الآية ${aNum}`
        });
      } else {
        // next_verse
        const promptText = getVerseText(sId, aNum);
        const targetStart = aNum + 1;
        if (!promptText || targetStart > maxV) continue;
        const endAyah = resolveEndAyahBySpan(sId, targetStart, maxV, State.spanMode);
        const collected = collectVersesRange(sId, targetStart, endAyah);
        if (!collected.parts.length) continue;

        questions.push({
          type: 'next_verse',
          typeLabel: 'الآية التالية',
          surahId: sId,
          promptAyahNum: aNum,
          targetAyahNum: targetStart,
          endAyahNum: endAyah,
          surahName: sName,
          promptText,
          stopBadge: endAyah > targetStart ? `إشارة التوقف: عند نهاية الآية ${endAyah}` : '',
          audioItems: [{ surahId: sId, ayahNum: aNum }],
          answerText: collected.combinedText,
          answerParts: collected.parts,
          answerWords: collected.wordsList,
          summaryLocation: endAyah > targetStart ? `سورة ${sName} — الآيات ${targetStart}–${endAyah}` : `سورة ${sName} — الآية ${targetStart}`
        });
      }

      if (questions.length >= targetTotal) break;
    }

    return questions;
  }

  // Render question UI
  function renderCurrentQuestion() {
    stopAudio();
    stopListening();

    const q = State.questions[State.currentIndex];
    State.currentQuestion = q;
    State.matchedIndices.clear();
    State.isRevealed = false;
    State.mcqAnswered = false;

    const totalQ = State.questionCount > 0 ? State.questionCount : State.questions.length;
    const progressBadge = document.getElementById('surpriseProgressBadge');
    const scoreBadge = document.getElementById('surpriseScoreBadge');
    const progressBarFill = document.getElementById('surpriseProgressBarFill');

    if (progressBadge) {
      progressBadge.textContent = (State.questionCount > 0)
        ? `السؤال ${State.currentIndex + 1} من ${totalQ}`
        : `السؤال ${State.currentIndex + 1} (مفتوح)`;
    }

    if (scoreBadge) {
      scoreBadge.textContent = `الإتقان: ${State.score.mastered}/${State.score.totalAnswered}`;
    }

    if (progressBarFill) {
      const pct = (State.questionCount > 0) ? Math.min(100, Math.round((State.currentIndex / totalQ) * 100)) : 100;
      progressBarFill.style.width = `${pct}%`;
    }

    const qTypeLabel = document.getElementById('surpriseQuestionTypeLabel');
    const surahAyahBadge = document.getElementById('surpriseSurahAyahBadge');
    const questionTextEl = document.getElementById('surpriseQuestionText');
    const stopBadgeEl = document.getElementById('surpriseStopBadge');

    if (q.type === 'complete_verse') {
      if (qTypeLabel) qTypeLabel.textContent = 'أكمل الآية الكريمة غيباً:';
      if (surahAyahBadge) surahAyahBadge.textContent = q.summaryLocation || `سورة ${q.surahName} — الآية ${q.ayahNum}`;
    } else if (q.type === 'sections') {
      if (qTypeLabel) qTypeLabel.textContent = 'اسرد المقطع غيباً حتى إشارة التوقف:';
      if (surahAyahBadge) surahAyahBadge.textContent = q.summaryLocation;
    } else if (q.type === 'mutashabihat') {
      if (qTypeLabel) qTypeLabel.textContent = `أكمل المتشابهة اللفظية${q.topic ? ` (${q.topic})` : ''}:`;
      if (surahAyahBadge) surahAyahBadge.textContent = q.summaryLocation;
    } else if (q.type === 'locate_verse') {
      if (qTypeLabel) qTypeLabel.textContent = q.questionLabel || 'حدد موضع الآية:';
      if (surahAyahBadge) surahAyahBadge.textContent = 'تحديد المواضع';
    } else if (q.type === 'surah_transitions') {
      if (qTypeLabel) qTypeLabel.textContent = q.questionLabel || 'أواخر وبدايات السور:';
      if (surahAyahBadge) surahAyahBadge.textContent = q.summaryLocation;
    } else {
      if (qTypeLabel) qTypeLabel.textContent = 'ما هي الآية التالية مباشرة؟';
      if (surahAyahBadge) surahAyahBadge.textContent = `سورة ${q.surahName} — الآية ${q.promptAyahNum} ➜ المطلوبة: ${q.targetAyahNum}`;
    }

    if (questionTextEl) questionTextEl.textContent = q.promptText || '';
    if (stopBadgeEl) {
      if (q.stopBadge) {
        stopBadgeEl.textContent = q.stopBadge;
        stopBadgeEl.style.display = 'block';
      } else {
        stopBadgeEl.style.display = 'none';
      }
    }

    const btnListen = document.getElementById('btnListenQuestion');
    const btnListenText = document.getElementById('btnListenQuestionText');
    if (btnListen) btnListen.classList.remove('playing');
    if (btnListenText) btnListenText.textContent = 'استمع للسؤال';

    // MCQ Area
    const mcqWrap = document.getElementById('surpriseMcqWrap');
    const mcqOptions = document.getElementById('surpriseMcqOptions');
    const mcqFeedback = document.getElementById('surpriseMcqFeedback');
    const btnNextMcq = document.getElementById('btnNextMcqQuestion');

    if (mcqWrap && mcqOptions) {
      if (Array.isArray(q.mcqChoices) && q.mcqChoices.length > 0) {
        mcqWrap.style.display = 'block';
        if (mcqFeedback) {
          mcqFeedback.style.display = 'none';
          mcqFeedback.textContent = '';
        }
        if (btnNextMcq) btnNextMcq.style.display = 'none';
        mcqOptions.innerHTML = '';

        q.mcqChoices.forEach(choice => {
          const optDiv = document.createElement('div');
          optDiv.className = 'surprise-mcq-option';
          optDiv.setAttribute('role', 'button');
          optDiv.setAttribute('tabindex', '0');
          optDiv.textContent = choice.label;

          const pickChoice = () => {
            if (State.mcqAnswered) return;
            State.mcqAnswered = true;
            const allOpts = mcqOptions.querySelectorAll('.surprise-mcq-option');
            allOpts.forEach((el, idx) => {
              el.classList.add('is-locked');
              if (q.mcqChoices[idx] && q.mcqChoices[idx].isCorrect) {
                el.classList.add('is-correct');
              }
            });
            if (!choice.isCorrect) optDiv.classList.add('is-wrong');

            State.score.totalAnswered++;
            if (choice.isCorrect) {
              State.score.mastered++;
              if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
            } else {
              State.score.stumbled++;
              State.stumbledQuestions.push(q);
              if (typeof window.triggerHaptic === 'function') window.triggerHaptic(25);
            }

            if (scoreBadge) scoreBadge.textContent = `الإتقان: ${State.score.mastered}/${State.score.totalAnswered}`;
            if (mcqFeedback) {
              const statusTxt = choice.isCorrect ? 'إجابة صحيحة.' : 'إجابة غير صحيحة.';
              mcqFeedback.textContent = q.rule ? `${statusTxt} ${q.rule}` : statusTxt;
              mcqFeedback.style.display = 'block';
            }
            if (btnNextMcq) btnNextMcq.style.display = 'inline-flex';
            if (!q.mcqOnly) revealAnswer();
          };

          optDiv.addEventListener('click', pickChoice);
          optDiv.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pickChoice();
            }
          });
          mcqOptions.appendChild(optDiv);
        });
      } else {
        mcqWrap.style.display = 'none';
      }
    }

    // Standard / Recitation Answer Card
    const answerCard = document.getElementById('surpriseAnswerCard');
    const answerCover = document.getElementById('surpriseAnswerCover');
    const answerContent = document.getElementById('surpriseAnswerContent');
    const answerWordsContainer = document.getElementById('surpriseAnswerWords');
    const ruleBox = document.getElementById('surpriseRuleBox');
    const accuracyBadge = document.getElementById('surpriseAccuracyBadge');
    const spokenLive = document.getElementById('surpriseSpokenLive');
    const selfAssessWrap = document.getElementById('surpriseSelfAssessWrap');

    if (answerCard) answerCard.style.display = q.mcqOnly ? 'none' : 'block';
    if (answerCover) answerCover.style.display = 'block';
    if (answerContent) answerContent.style.display = 'none';
    if (ruleBox) {
      if (q.rule && !q.mcqOnly) {
        ruleBox.textContent = `الضابط: ${q.rule}`;
        ruleBox.style.display = 'block';
      } else {
        ruleBox.style.display = 'none';
      }
    }
    if (accuracyBadge) {
      accuracyBadge.style.display = 'none';
      accuracyBadge.textContent = '0% دقة';
      accuracyBadge.className = 'surprise-accuracy-badge';
    }
    if (spokenLive) {
      spokenLive.style.display = 'none';
      spokenLive.textContent = '';
    }
    if (selfAssessWrap) selfAssessWrap.style.display = 'none';

    if (answerWordsContainer && !q.mcqOnly) {
      answerWordsContainer.innerHTML = '';
      let globalWordIdx = 0;
      const parts = Array.isArray(q.answerParts) && q.answerParts.length
        ? q.answerParts
        : [{ ayah: q.ayahNum || q.targetAyahNum || 1, words: q.answerWords || [] }];

      parts.forEach(part => {
        (part.words || []).forEach(w => {
          const span = document.createElement('span');
          span.className = 'surprise-word';
          span.id = `surpriseWord-${globalWordIdx++}`;
          span.textContent = w;
          answerWordsContainer.appendChild(span);
          answerWordsContainer.appendChild(document.createTextNode(' '));
        });
        const endMarker = document.createElement('span');
        endMarker.className = 'surprise-verse-end';
        endMarker.textContent = `﴿${part.ayah}﴾ `;
        answerWordsContainer.appendChild(endMarker);
      });
    }
  }

  // Reveal Answer
  function revealAnswer() {
    State.isRevealed = true;
    stopListening();

    const answerCover = document.getElementById('surpriseAnswerCover');
    const answerContent = document.getElementById('surpriseAnswerContent');
    const selfAssessWrap = document.getElementById('surpriseSelfAssessWrap');

    if (answerCover) answerCover.style.display = 'none';
    if (answerContent) answerContent.style.display = 'block';
    if (selfAssessWrap && !State.mcqAnswered) selfAssessWrap.style.display = 'block';

    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
  }

  // Sequential Audio Playback across 1 or multiple Ayahs
  function playNextAudioInQueue() {
    if (!State.isAudioPlaying || State.audioQueueIdx >= State.audioQueue.length) {
      stopAudio();
      return;
    }
    const item = State.audioQueue[State.audioQueueIdx];
    const reciter = State.reciter || 'Alafasy_128kbps';
    const btnListen = document.getElementById('btnListenQuestion');
    const btnListenText = document.getElementById('btnListenQuestionText');

    resolveAudioSource(reciter, item.surahId, item.ayahNum).then(src => {
      if (!State.isAudioPlaying) return;
      audioPlayer.src = src;
      audioPlayer.play().then(() => {
        if (btnListen) btnListen.classList.add('playing');
        if (btnListenText) btnListenText.textContent = 'إيقاف الصوت';
      }).catch(err => {
        console.warn('Audio playback error:', err);
        stopAudio();
      });
    });

    audioPlayer.onended = () => {
      State.audioQueueIdx++;
      playNextAudioInQueue();
    };
  }

  function toggleAudioPlayback() {
    if (State.isAudioPlaying) {
      stopAudio();
      return;
    }
    if (!State.currentQuestion) return;
    const q = State.currentQuestion;
    const items = (Array.isArray(q.audioItems) && q.audioItems.length)
      ? q.audioItems
      : [{ surahId: q.surahId, ayahNum: q.ayahNum || 1 }];

    State.audioQueue = items;
    State.audioQueueIdx = 0;
    State.isAudioPlaying = true;
    const btnListenText = document.getElementById('btnListenQuestionText');
    if (btnListenText) btnListenText.textContent = 'جاري التحميل...';
    playNextAudioInQueue();
  }

  function stopAudio() {
    try {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    } catch (_) { }
    State.isAudioPlaying = false;
    State.audioQueue = [];
    State.audioQueueIdx = 0;
    const btnListen = document.getElementById('btnListenQuestion');
    const btnListenText = document.getElementById('btnListenQuestionText');
    if (btnListen) btnListen.classList.remove('playing');
    if (btnListenText) btnListenText.textContent = 'استمع للسؤال';
  }

  // Speech Recognition Handling
  function toggleSpeechRecognition() {
    if (State.isListening) {
      stopListening();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('ميزة التسميع الصوتي غير مدعومة في هذا المتصفح. ينصح باستخدام متصفح يدعم التعرف الصوتي (مثل Google Chrome أو Edge).');
      revealAnswer();
      return;
    }

    if (State.recognition) {
      try { State.recognition.abort(); } catch (_) {}
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'ar-SA';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      State.isListening = true;
      const micBtn = document.getElementById('btnSurpriseMic');
      const micLabel = document.getElementById('surpriseMicLabel');
      if (micBtn) micBtn.classList.add('listening');
      if (micLabel) micLabel.textContent = 'إيقاف التسميع';

      // Ensure answer words are visible for live coloring
      const answerCover = document.getElementById('surpriseAnswerCover');
      const answerContent = document.getElementById('surpriseAnswerContent');
      const accuracyBadge = document.getElementById('surpriseAccuracyBadge');
      const spokenLive = document.getElementById('surpriseSpokenLive');

      if (answerCover) answerCover.style.display = 'none';
      if (answerContent) answerContent.style.display = 'block';
      if (accuracyBadge) accuracyBadge.style.display = 'inline-block';
      if (spokenLive) spokenLive.style.display = 'block';

      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
    };

    rec.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i] && event.results[i][0]) {
          transcript += event.results[i][0].transcript + ' ';
        }
      }

      const raw = transcript.trim();
      const spokenLive = document.getElementById('surpriseSpokenLive');
      if (spokenLive && raw) {
        spokenLive.textContent = `المسموع: "${raw}"`;
      }

      processSpokenText(raw);
    };

    rec.onerror = (event) => {
      console.warn('Speech recognition event error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        stopListening();
      }
    };

    rec.onend = () => {
      State.isListening = false;
      const micBtn = document.getElementById('btnSurpriseMic');
      const micLabel = document.getElementById('surpriseMicLabel');
      if (micBtn) micBtn.classList.remove('listening');
      if (micLabel) micLabel.textContent = 'تسميع صوتي';

      const selfAssessWrap = document.getElementById('surpriseSelfAssessWrap');
      if (selfAssessWrap) selfAssessWrap.style.display = 'block';
    };

    State.recognition = rec;
    try {
      rec.start();
    } catch (e) {
      console.warn('Error starting speech recognition:', e);
    }
  }

  function stopListening() {
    if (State.recognition) {
      try { State.recognition.stop(); } catch (_) {}
    }
    State.isListening = false;
    const micBtn = document.getElementById('btnSurpriseMic');
    const micLabel = document.getElementById('surpriseMicLabel');
    if (micBtn) micBtn.classList.remove('listening');
    if (micLabel) micLabel.textContent = 'تسميع صوتي';
  }

  function processSpokenText(raw) {
    if (!State.currentQuestion) return;
    const targetWords = State.currentQuestion.answerWords;
    const spokenTokens = normalizeArabicText(raw).split(/\s+/).filter(Boolean);
    if (!spokenTokens.length) return;

    let matchedCount = 0;
    let spokenIdx = 0;

    for (let j = 0; j < targetWords.length; j++) {
      const normTarget = normalizeArabicText(targetWords[j]);
      let found = false;

      for (let k = spokenIdx; k < spokenTokens.length; k++) {
        if (wordsMatch(spokenTokens[k], normTarget)) {
          found = true;
          spokenIdx = k + 1;
          break;
        }
      }

      const wordEl = document.getElementById(`surpriseWord-${j}`);
      if (found || State.matchedIndices.has(j)) {
        State.matchedIndices.add(j);
        matchedCount++;
        if (wordEl) wordEl.classList.add('word-matched');
      }
    }

    const accuracyBadge = document.getElementById('surpriseAccuracyBadge');
    const selfAssessWrap = document.getElementById('surpriseSelfAssessWrap');
    const pct = Math.min(100, Math.round((matchedCount / targetWords.length) * 100));

    if (accuracyBadge) {
      accuracyBadge.style.display = 'inline-block';
      accuracyBadge.textContent = `${pct}% دقة`;
      if (pct >= 85) {
        accuracyBadge.classList.add('badge-success');
      }
    }

    if (pct >= 85) {
      if (selfAssessWrap) selfAssessWrap.style.display = 'block';
      if (pct === 100) {
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic([25, 40, 25]);
        const spokenLive = document.getElementById('surpriseSpokenLive');
        if (spokenLive) spokenLive.textContent = 'ما شاء الله! تلاوة متقنة واستحضار تام 🌟';
      }
    }
  }

  // Assessment & Progression
  function handleAssessment(isMastered) {
    stopAudio();
    stopListening();

    State.score.totalAnswered++;
    if (isMastered) {
      State.score.mastered++;
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
    } else {
      State.score.stumbled++;
      State.stumbledQuestions.push(State.currentQuestion);
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(25);
    }

    State.currentIndex++;
    const maxQ = State.questionCount > 0 ? State.questionCount : Infinity;

    if (State.currentIndex >= maxQ || State.currentIndex >= State.questions.length) {
      finishQuiz();
    } else {
      renderCurrentQuestion();
    }
  }

  // Finish Quiz and Render Results
  function finishQuiz() {
    stopAudio();
    stopListening();

    const activeScreen = document.getElementById('surpriseTestActiveScreen');
    const resultScreen = document.getElementById('surpriseTestResultScreen');
    const configBox = document.getElementById('surpriseTestConfigBox');

    if (configBox) configBox.style.display = 'none';
    if (activeScreen) activeScreen.style.display = 'none';
    if (resultScreen) resultScreen.style.display = 'block';

    const total = State.score.totalAnswered;
    const mastered = State.score.mastered;
    const stumbled = State.score.stumbled;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    const titleEl = document.getElementById('surpriseResultTitle');
    const scoreBadge = document.getElementById('surpriseResultScoreBadge');
    const descEl = document.getElementById('surpriseResultDesc');
    const statTotal = document.getElementById('surpriseStatTotal');
    const statMastered = document.getElementById('surpriseStatMastered');
    const statReview = document.getElementById('surpriseStatReview');
    const stumbledWrap = document.getElementById('surpriseStumbledListWrap');
    const stumbledList = document.getElementById('surpriseStumbledList');

    if (statTotal) statTotal.textContent = String(total);
    if (statMastered) statMastered.textContent = String(mastered);
    if (statReview) statReview.textContent = String(stumbled);

    if (scoreBadge) {
      scoreBadge.textContent = `${pct}% إتقان (${mastered} من ${total})`;
    }

    if (pct >= 90) {
      if (titleEl) titleEl.textContent = 'ما شاء الله! إتقان تام واستحضار راسخ';
      if (descEl) descEl.textContent = 'أظهرت قوة استحضار عالية للآيات وربطها غيباً دون تردد. هنيئاً لك هذا الإتقان!';
    } else if (pct >= 70) {
      if (titleEl) titleEl.textContent = 'أداء رائع ومحاولة ممتازة';
      if (descEl) descEl.textContent = 'استحضارك طيب ومتماسك، وبإعادة اختبار المواضع المتعثرة سيرسخ الحفظ تماماً.';
    } else {
      if (titleEl) titleEl.textContent = 'يحتاج تثبيتاً ومراجعة';
      if (descEl) descEl.textContent = 'المباغتة وسيلة ذكية لاكتشاف مواضع الضعف لتقويتها. استعن بالله وأعد اختبار المواضع المتعثرة.';
    }

    // Render stumbled list
    if (State.stumbledQuestions.length > 0 && stumbledWrap && stumbledList) {
      stumbledWrap.style.display = 'block';
      stumbledList.innerHTML = '';

      State.stumbledQuestions.forEach(q => {
        const card = document.createElement('div');
        card.className = 'surprise-stumbled-card';
        const locTitle = q.summaryLocation || `سورة ${q.surahName} — الآية ${q.ayahNum || q.targetAyahNum || 1}`;
        const qLabel = q.typeLabel || 'موضع للمراجعة';
        card.innerHTML = `
          <div class="surprise-stumbled-header">
            <span>${locTitle}</span>
            <span class="stumbled-type-badge">${qLabel}</span>
          </div>
          <div class="surprise-stumbled-text">${q.answerText || q.promptText || ''}</div>
        `;
        stumbledList.appendChild(card);
      });
    } else if (stumbledWrap) {
      stumbledWrap.style.display = 'none';
    }

    if (typeof window.triggerHaptic === 'function') window.triggerHaptic([30, 50, 30]);
  }

  // Reset to initial config screen
  function resetToConfigScreen() {
    stopAudio();
    stopListening();

    const configBox = document.getElementById('surpriseTestConfigBox');
    const activeScreen = document.getElementById('surpriseTestActiveScreen');
    const resultScreen = document.getElementById('surpriseTestResultScreen');

    if (configBox) configBox.style.display = 'block';
    if (activeScreen) activeScreen.style.display = 'none';
    if (resultScreen) resultScreen.style.display = 'none';

    populateSurahSelect();
    updateScopeHint();
  }

  // Update scope hint text
  function updateScopeHint() {
    const hint = document.getElementById('surpriseScopeHint');
    if (!hint) return;
    if (State.scope === 'weekly_memo') {
      let memoTxt = 'مقرر الحفظ للأسبوع';
      if (typeof window.getWeeklyHarvestData === 'function') {
        const h = window.getWeeklyHarvestData();
        if (h && h.memoRangeText) memoTxt = h.memoRangeText;
      }
      hint.textContent = `اختبار حصيلة الحفظ الجديد للأسبوع: ${memoTxt}`;
    } else if (State.scope === 'weekly_review') {
      let revTxt = 'مقرر المراجعة للأسبوع';
      if (typeof window.getWeeklyHarvestData === 'function') {
        const h = window.getWeeklyHarvestData();
        if (h && h.reviewRangeText) revTxt = h.reviewRangeText;
      }
      hint.textContent = `اختبار حصيلة المراجعة الدورية للأسبوع: ${revTxt}`;
    } else if (State.scope === 'weekly_all') {
      hint.textContent = `اختبار حصيلة الأسبوع الشاملة (الحفظ الجديد + المراجعة الدورية معاً)`;
    } else if (State.scope === 'current_surah') {
      const curName = (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) || 'البقرة';
      hint.textContent = `سيتم اختيار الأسئلة عشوائياً من سورة ${curName} الحالية`;
    } else if (State.scope === 'all_memorized') {
      const count = (window.AppState && Array.isArray(window.AppState.completedSurahs)) ? window.AppState.completedSurahs.length : 0;
      hint.textContent = `سيتم توليد أسئلة مباغتة تشمل جميع السور المحفوظة السابقة (${count} سورة مكتملة)`;
    } else if (State.scope === 'surah_range') {
      const f = Math.min(State.rangeFromId || 1, State.rangeToId || 114);
      const t = Math.max(State.rangeFromId || 1, State.rangeToId || 114);
      const sFrom = getSurahByNameOrId(f);
      const sTo = getSurahByNameOrId(t);
      hint.textContent = `نطاق السور: من سورة ${sFrom ? sFrom.name : f} إلى سورة ${sTo ? sTo.name : t}`;
    } else {
      const sel = document.getElementById('surpriseSurahSelect');
      const opt = sel ? sel.options[sel.selectedIndex] : null;
      hint.textContent = `سيتم اختيار الأسئلة من ${opt ? opt.textContent : 'السورة المحددة'}`;
    }
  }

  function syncScopeDropdownVisibility() {
    const customSurahWrap = document.getElementById('surpriseCustomSurahWrap');
    const surahRangeWrap = document.getElementById('surpriseSurahRangeWrap');
    if (customSurahWrap) {
      customSurahWrap.style.display = (State.scope === 'custom_surah') ? 'block' : 'none';
    }
    if (surahRangeWrap) {
      surahRangeWrap.style.display = (State.scope === 'surah_range') ? 'grid' : 'none';
    }
  }

  // Start Session
  async function startQuizSession(customQuestions = null) {
    await loadQuranText();

    if (customQuestions && customQuestions.length) {
      State.questions = customQuestions;
      State.questionCount = customQuestions.length;
    } else {
      State.questions = generateQuestions(State.scope, State.testType, State.customSurahId, State.questionCount);
    }

    if (!State.questions.length) {
      const msg = State.testType === 'mutashabihat'
        ? 'لا توجد متشابهات لفظية مسجلة في النطاق المختار، يرجى اختيار سورة أخرى أو نطاق أوسع.'
        : (State.testType === 'surah_transitions'
          ? 'لا توجد انتقالات كافية في هذا النطاق، يرجى اختيار نطاق أوسع أو سورة قبل سورة الناس.'
          : 'لم يتم العثور على آيات كافية ضمن النطاق المختار. يرجى تجربة سورة أخرى أو نطاق مختلف.');
      alert(msg);
      return;
    }

    State.currentIndex = 0;
    State.score = { mastered: 0, stumbled: 0, totalAnswered: 0 };
    State.stumbledQuestions = [];

    const configBox = document.getElementById('surpriseTestConfigBox');
    const activeScreen = document.getElementById('surpriseTestActiveScreen');
    const resultScreen = document.getElementById('surpriseTestResultScreen');

    if (configBox) configBox.style.display = 'none';
    if (resultScreen) resultScreen.style.display = 'none';
    if (activeScreen) activeScreen.style.display = 'block';

    renderCurrentQuestion();
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
  }

  // Setup DOM Event Listeners
  function initSurpriseTest() {
    try {
      const cardOpen = document.getElementById('cardOpenSurpriseTest');
      const subpage = document.getElementById('surpriseTestSubpage');
      const mainPanel = document.getElementById('toolsMainPanel');
      const btnBack = document.getElementById('btnBackFromSurpriseTest');

      if (cardOpen) {
        cardOpen.addEventListener('click', () => {
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
          if (typeof window.showToolsSubpage === 'function') {
            window.showToolsSubpage('surpriseTestSubpage');
          } else {
            if (mainPanel) mainPanel.style.display = 'none';
            if (subpage) {
              subpage.removeAttribute('hidden');
              subpage.style.display = 'flex';
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
          resetToConfigScreen();
        });
      }

      if (btnBack) {
        btnBack.addEventListener('click', () => {
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
          stopAudio();
          stopListening();
          if (typeof window.hideToolsSubpages === 'function') {
            window.hideToolsSubpages();
          } else {
            if (subpage) {
              subpage.style.display = 'none';
              subpage.setAttribute('hidden', '');
            }
            if (mainPanel) {
              mainPanel.removeAttribute('hidden');
              mainPanel.style.display = 'flex';
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
        });
      }

      // Scope Tabs
      const scopeBtns = document.querySelectorAll('.surprise-scope-btn');
      scopeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          scopeBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          State.scope = btn.dataset.scope;
          syncScopeDropdownVisibility();
          updateScopeHint();
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
        });
      });

      const surahSelect = document.getElementById('surpriseSurahSelect');
      if (surahSelect) {
        surahSelect.addEventListener('change', () => {
          State.customSurahId = parseInt(surahSelect.value, 10) || 1;
          updateScopeHint();
        });
      }

      const rangeFromSel = document.getElementById('surpriseRangeFromSelect');
      const rangeToSel = document.getElementById('surpriseRangeToSelect');
      if (rangeFromSel) {
        rangeFromSel.addEventListener('change', () => {
          State.rangeFromId = parseInt(rangeFromSel.value, 10) || 1;
          updateScopeHint();
        });
      }
      if (rangeToSel) {
        rangeToSel.addEventListener('change', () => {
          State.rangeToId = parseInt(rangeToSel.value, 10) || 114;
          updateScopeHint();
        });
      }

      // Question Count Chips
      const countChips = document.querySelectorAll('.surprise-count-chip');
      countChips.forEach(chip => {
        chip.addEventListener('click', () => {
          countChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          State.questionCount = parseInt(chip.dataset.count, 10);
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
        });
      });

      // Recitation Span Chips (1, 3, 5 verses or full page)
      const spanChips = document.querySelectorAll('.surprise-span-chip');
      spanChips.forEach(chip => {
        chip.addEventListener('click', () => {
          spanChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          State.spanMode = chip.dataset.span || '1';
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
        });
      });

      // Test Type Radios / Cards
      const typeCards = document.querySelectorAll('.surprise-type-card');
      typeCards.forEach(card => {
        card.addEventListener('click', () => {
          typeCards.forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          const radio = card.querySelector('input[name="surpriseTestType"]');
          if (radio) {
            radio.checked = true;
            State.testType = radio.value;
          }
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
        });
      });

      // Next Question for MCQ modes
      const btnNextMcq = document.getElementById('btnNextMcqQuestion');
      if (btnNextMcq) {
        btnNextMcq.addEventListener('click', () => {
          stopAudio();
          stopListening();
          State.currentIndex++;
          const maxQ = State.questionCount > 0 ? State.questionCount : Infinity;
          if (State.currentIndex >= maxQ || State.currentIndex >= State.questions.length) {
            finishQuiz();
          } else {
            renderCurrentQuestion();
          }
        });
      }

      // Start Button
      const btnStart = document.getElementById('btnStartSurpriseTest');
      if (btnStart) {
        btnStart.addEventListener('click', () => {
          startQuizSession();
        });
      }

      // Listen Question Audio
      const btnListen = document.getElementById('btnListenQuestion');
      if (btnListen) {
        btnListen.addEventListener('click', toggleAudioPlayback);
      }

      // Reveal Answer
      const btnReveal = document.getElementById('btnRevealAnswer');
      if (btnReveal) {
        btnReveal.addEventListener('click', revealAnswer);
      }

      // Mic Speech Recognition
      const btnMic = document.getElementById('btnSurpriseMic');
      if (btnMic) {
        btnMic.addEventListener('click', toggleSpeechRecognition);
      }

      // Self Assessment Buttons
      const btnMastered = document.getElementById('btnSelfAssessMastered');
      if (btnMastered) {
        btnMastered.addEventListener('click', () => handleAssessment(true));
      }

      const btnReview = document.getElementById('btnSelfAssessReview');
      if (btnReview) {
        btnReview.addEventListener('click', () => handleAssessment(false));
      }

      // End Early Button
      const btnEndEarly = document.getElementById('btnEndSurpriseEarly');
      if (btnEndEarly) {
        btnEndEarly.addEventListener('click', () => {
          if (confirm('هل ترغب في إنهاء الاختبار الآن وعرض النتيجة الحالية؟')) {
            finishQuiz();
          }
        });
      }

      // Retry Stumbled Only
      const btnRetryStumbled = document.getElementById('btnRetryStumbledOnly');
      if (btnRetryStumbled) {
        btnRetryStumbled.addEventListener('click', () => {
          if (State.stumbledQuestions.length > 0) {
            startQuizSession([...State.stumbledQuestions]);
          }
        });
      }

      // New Test Button
      const btnNewTest = document.getElementById('btnNewSurpriseTest');
      if (btnNewTest) {
        btnNewTest.addEventListener('click', resetToConfigScreen);
      }

      // Back to tools from results
      const btnBackTools = document.getElementById('btnBackToToolsMenu');
      if (btnBackTools) {
        btnBackTools.addEventListener('click', () => {
          if (btnBack) btnBack.click();
        });
      }

    } catch (e) {
      console.error('Error initializing Surprise Test module:', e);
    }
  }

  function openSurpriseTestWithScope(targetScope) {
    // 1. الانتقال إلى تبويب الأدوات أولاً إن لم يكن نشطاً
    const toolsTabBtn = document.querySelector('.nav-item-btn[data-tab="view-tools"]');
    if (toolsTabBtn && !toolsTabBtn.classList.contains('active')) {
      toolsTabBtn.click();
    }

    // 2. فتح صفحة اختبار المباغتة
    if (typeof window.showToolsSubpage === 'function') {
      window.showToolsSubpage('surpriseTestSubpage');
    } else {
      const cardOpen = document.getElementById('cardOpenSurpriseTest');
      if (cardOpen) cardOpen.click();
    }

    resetToConfigScreen();

    // 3. ضبط النطاق المحدد
    State.scope = targetScope || 'weekly_all';
    const scopeBtns = document.querySelectorAll('.surprise-scope-btn');
    scopeBtns.forEach(b => {
      if (b.dataset.scope === State.scope) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    const customSurahWrap = document.getElementById('surpriseCustomSurahWrap');
    if (customSurahWrap) {
      customSurahWrap.style.display = (State.scope === 'custom_surah') ? 'block' : 'none';
    }
    const surahRangeWrap = document.getElementById('surpriseSurahRangeWrap');
    if (surahRangeWrap) {
      surahRangeWrap.style.display = (State.scope === 'surah_range') ? 'grid' : 'none';
    }

    updateScopeHint();

    // 4. التمرير إلى أعلى الصندوق
    const configBox = document.getElementById('surpriseTestConfigBox');
    if (configBox) {
      configBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  window.openSurpriseTestWithScope = openSurpriseTestWithScope;

  window.SurpriseTest = {
    init: initSurpriseTest,
    start: startQuizSession,
    reset: resetToConfigScreen,
    openWithScope: openSurpriseTestWithScope
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSurpriseTest);
  } else {
    initSurpriseTest();
  }

})();
