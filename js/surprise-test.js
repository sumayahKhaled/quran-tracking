/**
 * Seraj - Surprise Test & Verse Completion Tool (اختبار المباغتة وإكمال الآيات)
 * Enables random verse recall tests (complete the verse, or recall the next verse)
 * with audio preview, voice speech recognition, and stumbled verses re-test.
 */
(function () {
  'use strict';

  let quranTextMap = null;
  let rubElHizbsData = null;
  let dynamicMutashabihIndex = null;
  const audioPlayer = new Audio();
  audioPlayer.preload = 'auto';

  // State Management
  const State = {
    scope: 'all_memorized', // 'all_memorized' | 'custom_surah' | 'surah_range' | (internal weekly_*)
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
    isRecording: false,
    accumulatedTranscript: '',
    currentSessionTranscript: '',
    spokenWordCount: 0,
    restartTimer: null,
    matchedIndices: new Set(),
    hasRecitedSession: false,
    autoAdvanceTimer: null,
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

  async function loadRubElHizbs() {
    if (rubElHizbsData) return rubElHizbsData;
    try {
      const res = await fetch('data/rub_el_hizbs.json');
      if (res.ok) {
        rubElHizbsData = await res.json();
      }
    } catch (e) {
      console.warn('Failed to load rub_el_hizbs.json:', e);
    }
    return rubElHizbsData;
  }

  function escapeHtmlText(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stripLeadingConj(token) {
    return (token || '').replace(/^[وفل](?=.{2})/, '');
  }

  function computeCommonPrefixLen(wordsA, wordsB, ignoreInitialConj = false) {
    let i = 0;
    while (i < wordsA.length && i < wordsB.length) {
      let a = normalizeArabicText(wordsA[i]);
      let b = normalizeArabicText(wordsB[i]);
      if (ignoreInitialConj && i === 0) {
        a = stripLeadingConj(a);
        b = stripLeadingConj(b);
      }
      if (!a || a !== b) break;
      i++;
    }
    return i;
  }

  // LCS word-level comparison for «الفرق بين المتشابهتين»
  function computeWordsLcsDiff(wordsA, wordsB) {
    const n = wordsA.length;
    const m = wordsB.length;
    const normA = wordsA.map(normalizeArabicText);
    const normB = wordsB.map(normalizeArabicText);

    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (normA[i] && normA[i] === normB[j]) {
          dp[i][j] = 1 + dp[i + 1][j + 1];
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    const inCommonA = new Set();
    const inCommonB = new Set();
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (normA[i] && normA[i] === normB[j]) {
        inCommonA.add(i);
        inCommonB.add(j);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        i++;
      } else {
        j++;
      }
    }

    const diffWordsA = [];
    const diffWordsB = [];
    let lastA = -1, lastB = -1;
    for (let x = 0; x < n; x++) {
      if (!inCommonA.has(x)) {
        diffWordsA.push(wordsA[x]);
        lastA = x;
      }
    }
    for (let y = 0; y < m; y++) {
      if (!inCommonB.has(y)) {
        diffWordsB.push(wordsB[y]);
        lastB = y;
      }
    }

    const hasFasilahDiff = (lastA >= Math.max(0, n - 2)) || (lastB >= Math.max(0, m - 2));
    let hasConjDiff = false;
    for (let p = 0; p < Math.min(diffWordsA.length, diffWordsB.length); p++) {
      if (stripLeadingConj(normA[wordsA.indexOf(diffWordsA[p])] || normalizeArabicText(diffWordsA[p])) ===
          stripLeadingConj(normB[wordsB.indexOf(diffWordsB[p])] || normalizeArabicText(diffWordsB[p]))) {
        hasConjDiff = true;
        break;
      }
    }

    const snippetA = diffWordsA.slice(0, 4).join(' ');
    const snippetB = diffWordsB.slice(0, 4).join(' ');
    let kindText = 'في الكلمات المظللة';
    if (hasConjDiff && hasFasilahDiff) kindText = 'في حرف العطف وخاتمة الآية (الفاصلة)';
    else if (hasConjDiff) kindText = 'في حرف العطف / التوكيد';
    else if (hasFasilahDiff) kindText = 'في الفاصلة (خاتمة الآية) وبعض الألفاظ';

    const detailPair = (snippetA && snippetB)
      ? ` («${snippetA}» مقابل «${snippetB}»)`
      : (snippetA ? ` (زيادة: «${snippetA}»)` : (snippetB ? ` (مقابل: «${snippetB}»)` : ''));

    return {
      inCommonA,
      inCommonB,
      diffWordsA,
      diffWordsB,
      diffNote: `تختلف الآيتان ${kindText}${detailPair} وتتفقان في باقي الكلمات.`
    };
  }

  function renderHighlightedDiffHtml(words, inCommonSet, markClass) {
    return words.map((w, idx) => {
      const safe = escapeHtmlText(w);
      return inCommonSet.has(idx) ? safe : `<mark class="${markClass}">${safe}</mark>`;
    }).join(' ');
  }

  function getMutashabihIndex() {
    if (dynamicMutashabihIndex) return dynamicMutashabihIndex;
    const byExact2 = new Map();
    const byConj2 = new Map();
    const byKey = new Map();
    const srcMap = quranTextMap || {};

    Object.entries(srcMap).forEach(([key, txt]) => {
      const [sStr, aStr] = key.split(':');
      const surahId = parseInt(sStr, 10);
      const ayahNum = parseInt(aStr, 10);
      const words = (txt || '').trim().split(/\s+/).filter(Boolean);
      if (!surahId || !ayahNum || words.length < 4) return;
      const sObj = getSurahByNameOrId(surahId);
      const item = {
        key,
        surahId,
        ayahNum,
        surahName: sObj ? sObj.name : String(surahId),
        fullText: txt.trim(),
        words,
        normFull: normalizeArabicText(txt)
      };
      byKey.set(key, item);

      const n0 = normalizeArabicText(words[0]);
      const n1 = normalizeArabicText(words[1]);
      if (!n0 || !n1) return;
      const k2 = `${n0} ${n1}`;
      const kc = `${stripLeadingConj(n0)} ${n1}`;
      if (!byExact2.has(k2)) byExact2.set(k2, []);
      byExact2.get(k2).push(item);
      if (!byConj2.has(kc)) byConj2.set(kc, []);
      byConj2.get(kc).push(item);
    });

    dynamicMutashabihIndex = { byExact2, byConj2, byKey };
    return dynamicMutashabihIndex;
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
      if (pool.length === 0) return buildVersePool('all_memorized', testType, customSurahId);
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
      if (pool.length === 0) return buildVersePool('all_memorized', testType, customSurahId);
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
        window.AppState.completedSurahs.forEach(c => {
          const nm = typeof c === 'string' ? c : (c && c.name);
          if (nm) memorizedNames.add(nm);
        });
      }
      if (typeof window.computeCompletedJuzAndMeta === 'function') {
        try {
          const profStr = localStorage.getItem('tibyan_user_profile');
          if (profStr) {
            const meta = window.computeCompletedJuzAndMeta(JSON.parse(profStr));
            if (meta && meta.allowedSurahIds) {
              meta.allowedSurahIds.forEach(sid => {
                const sObj = getSurahByNameOrId(sid);
                if (sObj) memorizedNames.add(sObj.name);
              });
            }
          }
        } catch (_) {}
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
      const idxData = getMutashabihIndex();
      const poolKeys = new Set(pool.map(p => `${p.surahId}:${p.ayahNum}`));
      const poolSurahs = new Set(pool.map(p => p.surahId));

      const candidateMap = new Map();
      // 1) إدراج المتشابهات المحررة داخل النطاق
      Object.values(db).forEach(entry => {
        if (!entry) return;
        const k = `${entry.surah}:${entry.ayah}`;
        if (poolKeys.has(k) || poolSurahs.has(entry.surah)) {
          candidateMap.set(k, {
            key: k,
            surahId: entry.surah,
            ayahNum: entry.ayah,
            surahName: entry.surahName,
            rule: entry.rule || entry.note || '',
            curatedEntry: entry,
            priority: 2
          });
        }
      });

      // 2) إضافة المتشابهات المستخلصة من مصحف النص الكامل ضمن النطاق لتغطية كافة السور والأجزاء بدون تكرار
      pool.forEach(p => {
        const k = `${p.surahId}:${p.ayahNum}`;
        if (candidateMap.has(k)) return;
        const item = idxData.byKey.get(k);
        if (!item) return;
        const n0 = normalizeArabicText(item.words[0]);
        const n1 = normalizeArabicText(item.words[1]);
        const bucket = idxData.byConj2.get(`${stripLeadingConj(n0)} ${n1}`) || idxData.byExact2.get(`${n0} ${n1}`) || [];
        const hasGenuinePair = bucket.some(b =>
          b.key !== item.key &&
          b.normFull !== item.normFull &&
          computeCommonPrefixLen(item.words, b.words, true) >= 2
        );
        if (hasGenuinePair) {
          candidateMap.set(k, {
            key: k,
            surahId: item.surahId,
            ayahNum: item.ayahNum,
            surahName: item.surahName,
            rule: '',
            curatedEntry: null,
            priority: 1
          });
        }
      });

      // ترتيب بحيث تتصدر العناصر ذات التطابق الأعلى مع تنويع عشوائي وعدم تكرار
      const allCandidates = [
        ...shuffleArray(Array.from(candidateMap.values()).filter(c => c.priority === 2)),
        ...shuffleArray(Array.from(candidateMap.values()).filter(c => c.priority === 1))
      ];

      const usedVerseKeys = new Set();
      const usedPromptNorms = new Set();

      for (let i = 0; i < allCandidates.length; i++) {
        if (questions.length >= targetTotal) break;
        const cand = allCandidates[i];
        if (usedVerseKeys.has(cand.key)) continue;

        const fullText = getVerseText(cand.surahId, cand.ayahNum) || (cand.curatedEntry && cand.curatedEntry.text) || '';
        const wordsA = fullText.trim().split(/\s+/).filter(Boolean);
        if (wordsA.length < 4) continue;

        // تجميع جميع المواضع المقابلة الحقيقية لنفس المطلع أو الموضع المتشابه
        const counterpartList = [];
        const seenCpKeys = new Set([cand.key]);

        const pushCounterpart = (cpSurahId, cpAyah, cpText, cpRule = '') => {
          const cpKey = `${cpSurahId}:${cpAyah}`;
          if (!cpSurahId || !cpAyah || seenCpKeys.has(cpKey)) return;
          const resolvedTxt = getVerseText(cpSurahId, cpAyah) || cpText || '';
          const wB = resolvedTxt.trim().split(/\s+/).filter(Boolean);
          if (wB.length < 3) return;
          if (normalizeArabicText(resolvedTxt) === normalizeArabicText(fullText)) return;
          seenCpKeys.add(cpKey);
          const sObj = getSurahByNameOrId(cpSurahId);
          const exactLcp = computeCommonPrefixLen(wordsA, wB, false);
          const conjLcp = computeCommonPrefixLen(wordsA, wB, true);
          const diffObj = computeWordsLcsDiff(wordsA, wB);
          const sharedAfterSplit = wordsA.slice(Math.max(exactLcp, conjLcp)).filter(w => {
            const nw = normalizeArabicText(w);
            return nw.length > 1 && wB.some(bw => normalizeArabicText(bw) === nw);
          }).length;
          counterpartList.push({
            surahId: cpSurahId,
            ayahNum: cpAyah,
            surahName: sObj ? sObj.name : String(cpSurahId),
            fullText: resolvedTxt.trim(),
            words: wB,
            rule: cpRule || '',
            exactLcp,
            conjLcp,
            score: (exactLcp * 4) + (conjLcp * 3) + (sharedAfterSplit * 2) + (cpSurahId !== cand.surahId ? 2 : 1),
            diffObj
          });
        };

        if (cand.curatedEntry && Array.isArray(cand.curatedEntry.counterparts)) {
          cand.curatedEntry.counterparts.forEach(cp => {
            if (cp) pushCounterpart(cp.surah, cp.ayah, cp.text, cp.rule);
          });
        }

        const n0 = normalizeArabicText(wordsA[0]);
        const n1 = normalizeArabicText(wordsA[1]);
        const bucket = [
          ...(idxData.byExact2.get(`${n0} ${n1}`) || []),
          ...(idxData.byConj2.get(`${stripLeadingConj(n0)} ${n1}`) || [])
        ];
        bucket.forEach(b => pushCounterpart(b.surahId, b.ayahNum, b.fullText));

        if (counterpartList.length === 0) continue;
        counterpartList.sort((a, b) => b.score - a.score);
        const primaryCp = counterpartList[0];

        // تحديد نقطة التفرع (المطلع المشترك قبل نقطة الاختلاف مباشرةً)
        let splitIdx = primaryCp.exactLcp >= 2
          ? primaryCp.exactLcp
          : (primaryCp.conjLcp >= 2 ? primaryCp.conjLcp : Math.min(4, Math.max(2, Math.floor(wordsA.length / 3))));
        splitIdx = Math.min(splitIdx, wordsA.length - 2);
        splitIdx = Math.max(2, splitIdx);

        const promptPrefix = wordsA.slice(0, splitIdx).join(' ');
        const promptNorm = normalizeArabicText(promptPrefix);
        if (usedPromptNorms.has(promptNorm)) continue;

        const maxCompWords = 16;
        const targetSlice = wordsA.slice(splitIdx, splitIdx + maxCompWords);
        const correctComp = targetSlice.join(' ') + (wordsA.length > splitIdx + maxCompWords ? ' ...' : '');
        if (!correctComp) continue;

        const seenOptionNorms = new Set([normalizeArabicText(correctComp)]);
        const opts = [{
          label: correctComp,
          isCorrect: true,
          surahId: cand.surahId,
          surahName: cand.surahName,
          ayahNum: cand.ayahNum,
          fullText: fullText.trim()
        }];

        // إضافة بقية التكميلات الحقيقية لنفس المطلع أو أقرب المواضع المشابهة حتى 4 خيارات
        for (let ci = 0; ci < counterpartList.length && opts.length < 4; ci++) {
          const cp = counterpartList[ci];
          let cpSplit = cp.exactLcp >= 2 ? cp.exactLcp : (cp.conjLcp >= 2 ? cp.conjLcp : Math.min(splitIdx, cp.words.length - 2));
          cpSplit = Math.min(Math.max(1, cpSplit), Math.max(1, cp.words.length - 1));
          const compTxt = cp.words.slice(cpSplit, cpSplit + maxCompWords).join(' ') + (cp.words.length > cpSplit + maxCompWords ? ' ...' : '');
          const nComp = normalizeArabicText(compTxt);
          if (compTxt && !seenOptionNorms.has(nComp)) {
            seenOptionNorms.add(nComp);
            opts.push({
              label: compTxt,
              isCorrect: false,
              surahId: cp.surahId,
              surahName: cp.surahName,
              ayahNum: cp.ayahNum,
              fullText: cp.fullText
            });
          }
        }

        // إذا قلّت الخيارات الحقيقية عن 4، اسحب مواضع قرآنية حقيقية تبدأ بنفس المفتتح
        if (opts.length < 4) {
          const fallbackStart = stripLeadingConj(normalizeArabicText(wordsA[0]));
          const allEntries = shuffleArray(Array.from(idxData.byKey.values()));
          for (let fi = 0; fi < allEntries.length && opts.length < 4; fi++) {
            const fe = allEntries[fi];
            if (seenCpKeys.has(fe.key) || fe.words.length < 4) continue;
            if (stripLeadingConj(normalizeArabicText(fe.words[0])) !== fallbackStart) continue;
            const fSplit = Math.min(2, fe.words.length - 2);
            const fComp = fe.words.slice(fSplit, fSplit + maxCompWords).join(' ') + (fe.words.length > fSplit + maxCompWords ? ' ...' : '');
            const nfComp = normalizeArabicText(fComp);
            if (fComp && !seenOptionNorms.has(nfComp)) {
              seenOptionNorms.add(nfComp);
              seenCpKeys.add(fe.key);
              opts.push({
                label: fComp,
                isCorrect: false,
                surahId: fe.surahId,
                surahName: fe.surahName,
                ayahNum: fe.ayahNum,
                fullText: fe.fullText
              });
            }
          }
        }

        if (opts.length < 2) continue;

        usedVerseKeys.add(cand.key);
        usedPromptNorms.add(promptNorm);

        questions.push({
          type: 'mutashabihat',
          typeLabel: 'المتشابهات اللفظية',
          questionLabel: `أكمل الآية كما وردت في سورة ${cand.surahName}`,
          surahId: cand.surahId,
          ayahNum: cand.ayahNum,
          surahName: cand.surahName,
          topic: (cand.curatedEntry && cand.curatedEntry.topic) || '',
          rule: cand.rule || primaryCp.diffObj.diffNote || '',
          promptText: `${promptPrefix} ...`,
          audioItems: [{ surahId: cand.surahId, ayahNum: cand.ayahNum }],
          answerText: fullText.trim(),
          answerParts: [{ ayah: cand.ayahNum, text: fullText.trim(), words: wordsA }],
          answerWords: wordsA,
          comparisonCounterpart: {
            surahId: primaryCp.surahId,
            surahName: primaryCp.surahName,
            ayahNum: primaryCp.ayahNum,
            fullText: primaryCp.fullText
          },
          selectedWrongCounterpart: null,
          mcqChoices: shuffleArray(opts),
          mcqOnly: true,
          summaryLocation: `سورة ${cand.surahName} — الآية ${cand.ayahNum}`
        });
      }
      return questions;
    }

    if (testType === 'hizb_quarters' || testType === 'locate_verse') {
      const rubs = Array.isArray(rubElHizbsData) ? rubElHizbsData : [];
      const poolKeys = new Set(pool.map(p => `${p.surahId}:${p.ayahNum}`));
      const poolSurahs = new Set(pool.map(p => p.surahId));

      let matchedRubs = [];
      rubs.forEach(r => {
        if (!r || !r.mapping) return;
        const sIds = Object.keys(r.mapping).map(Number).sort((a, b) => a - b);
        if (!sIds.length) return;
        const firstSurahId = sIds[0];
        const rangeStr = String(r.mapping[String(firstSurahId)] || '1-1');
        const startAyah = parseInt(rangeStr.split('-')[0], 10) || 1;
        if (poolKeys.has(`${firstSurahId}:${startAyah}`)) {
          matchedRubs.push({ rub: r.rub, surahId: firstSurahId, startAyah });
        }
      });

      // إذا كان النطاق سورة واحدة قصيرة لا يبدأ فيها ربع جديد، نختار أرباعها المتقاطعة معها
      if (matchedRubs.length === 0) {
        rubs.forEach(r => {
          if (!r || !r.mapping) return;
          const sIds = Object.keys(r.mapping).map(Number).filter(id => poolSurahs.has(id));
          if (!sIds.length) return;
          const sid = sIds[0];
          const rangeStr = String(r.mapping[String(sid)] || '1-1');
          const startAyah = parseInt(rangeStr.split('-')[0], 10) || 1;
          matchedRubs.push({ rub: r.rub, surahId: sid, startAyah });
        });
      }

      const uniqueRubs = shuffleArray(matchedRubs);
      const seenQuarterKeys = new Set();

      for (let i = 0; i < uniqueRubs.length; i++) {
        if (questions.length >= targetTotal) break;
        const mr = uniqueRubs[i];
        const qKey = `${mr.surahId}:${mr.startAyah}`;
        if (seenQuarterKeys.has(qKey)) continue;
        seenQuarterKeys.add(qKey);

        const sObj = getSurahByNameOrId(mr.surahId);
        if (!sObj) continue;
        const firstTxt = getVerseText(mr.surahId, mr.startAyah);
        if (!firstTxt) continue;

        const firstWords = firstTxt.trim().split(/\s+/).filter(Boolean);
        const endAyah = resolveEndAyahBySpan(mr.surahId, mr.startAyah, sObj.verses, State.spanMode);
        const collected = collectVersesRange(mr.surahId, mr.startAyah, endAyah);
        if (!collected.parts.length) continue;

        const juzNum = Math.ceil(mr.rub / 8);
        const hizbNum = Math.ceil(mr.rub / 4);
        const qInHizb = ((mr.rub - 1) % 4) + 1;
        const qName = qInHizb === 1
          ? `رأس الحزب ${hizbNum}`
          : (qInHizb === 2
            ? `الربع الثاني من الحزب ${hizbNum}`
            : (qInHizb === 3 ? `نصف الحزب ${hizbNum}` : `الربع الأخير من الحزب ${hizbNum}`));

        const promptWordCount = Math.min(4, Math.max(2, Math.floor(firstWords.length / 3)));
        const promptText = `${firstWords.slice(0, promptWordCount).join(' ')} ...`;
        const stopPage = getPageForAyah(mr.surahId, endAyah);
        const stopBadge = endAyah > mr.startAyah
          ? (State.spanMode === 'page'
            ? `إشارة التوقف: نهاية الصفحة ${stopPage} (عند الآية ${endAyah})`
            : `إشارة التوقف: عند نهاية الآية ${endAyah}`)
          : '';

        questions.push({
          type: 'hizb_quarters',
          typeLabel: 'بدايات الأحزاب والأرباع',
          questionLabel: `${qName} (الجزء ${juzNum}) — أكمل غيباً:`,
          surahId: mr.surahId,
          ayahNum: mr.startAyah,
          endAyahNum: endAyah,
          surahName: sObj.name,
          promptText,
          stopBadge,
          audioItems: collected.ayahList.map(a => ({ surahId: mr.surahId, ayahNum: a })),
          answerText: collected.combinedText,
          answerParts: collected.parts,
          answerWords: collected.wordsList,
          mcqOnly: false,
          rule: `${qName} في الجزء ${juzNum} يبدأ في سورة ${sObj.name} عند الآية ${mr.startAyah}.`,
          summaryLocation: `سورة ${sObj.name} — الآية ${mr.startAyah} (${qName})`
        });
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

          questions.push({
            type: 'surah_transitions',
            typeLabel: 'أواخر وبدايات السور',
            questionLabel: `خاتمة سورة ${c.sObj.name} — اسرد بداية السورة التالية (${c.nextS.name}):`,
            surahId: c.sObj.id,
            ayahNum: c.sObj.verses,
            surahName: c.sObj.name,
            targetSurahName: c.nextS.name,
            targetAyahNum: 1,
            promptText: endTxt,
            stopBadge: `المطلوب: أول آية من سورة ${c.nextS.name}`,
            audioItems: [{ surahId: c.sObj.id, ayahNum: c.sObj.verses }],
            answerText: nextStartTxt,
            answerParts: [{ ayah: 1, text: nextStartTxt, words: nextWords }],
            answerWords: nextWords,
            mcqOnly: false,
            rule: `بعد خاتمة سورة ${c.sObj.name} (الآية ${c.sObj.verses}) تأتي سورة ${c.nextS.name} مباشرة في ترتيب المصحف.`,
            summaryLocation: `خاتمة ${c.sObj.name} ➔ بداية ${c.nextS.name}`
          });
        } else {
          const startTxt = getVerseText(c.sObj.id, 1);
          if (!startTxt) continue;
          const startWords = startTxt.trim().split(/\s+/).filter(Boolean);
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
            stopBadge: `المطلوب: مطلع سورة ${c.sObj.name}`,
            audioItems: [{ surahId: c.sObj.id, ayahNum: 1 }],
            answerText: startTxt,
            answerParts: [{ ayah: 1, text: startTxt, words: startWords }],
            answerWords: startWords,
            mcqOnly: false,
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

  // Render question UI (Dynamic Templates + Strict Blind Mode)
  function renderCurrentQuestion() {
    clearTimeout(State.autoAdvanceTimer);
    stopAudio();
    stopListening();

    const q = State.questions[State.currentIndex];
    State.currentQuestion = q;
    State.matchedIndices.clear();
    State.accumulatedTranscript = '';
    State.currentSessionTranscript = '';
    State.spokenWordCount = 0;
    State.hasRecitedSession = false;
    State.isRevealed = false;
    State.mcqAnswered = false;

    const unifiedCard = document.getElementById('surpriseUnifiedCard');
    const comparisonCard = document.getElementById('surpriseComparisonCard');
    if (comparisonCard) comparisonCard.style.display = 'none';
    if (unifiedCard) unifiedCard.style.display = 'block';

    const totalQ = State.questionCount > 0 ? State.questionCount : State.questions.length;
    const progressBadge = document.getElementById('surpriseProgressBadge');
    const scoreBadge = document.getElementById('surpriseScoreBadge');
    const progressBarFill = document.getElementById('surpriseProgressBarFill');

    if (progressBadge) {
      progressBadge.textContent = (State.questionCount > 0)
        ? `السؤال ${State.currentIndex + 1} من ${totalQ}`
        : `السؤال ${State.currentIndex + 1}`;
    }

    if (scoreBadge) {
      scoreBadge.textContent = `الإتقان: ${State.score.mastered}/${State.score.totalAnswered}`;
    }

    if (progressBarFill) {
      const pct = (State.questionCount > 0) ? Math.min(100, Math.round(((State.currentIndex + 1) / totalQ) * 100)) : 100;
      progressBarFill.style.width = `${pct}%`;
    }

    const qTypeLabel = document.getElementById('surpriseQuestionTypeLabel');
    const surahAyahBadge = document.getElementById('surpriseSurahAyahBadge');
    const questionTextEl = document.getElementById('surpriseQuestionText');
    const stopBadgeEl = document.getElementById('surpriseStopBadge');

    if (q.type === 'complete_verse') {
      if (qTypeLabel) qTypeLabel.textContent = 'أكمل الآية غيباً:';
      if (surahAyahBadge) surahAyahBadge.textContent = q.summaryLocation || `سورة ${q.surahName} — ${q.ayahNum}`;
    } else if (q.type === 'sections') {
      if (qTypeLabel) qTypeLabel.textContent = 'اسرد المقطع حتى التوقف:';
      if (surahAyahBadge) surahAyahBadge.textContent = q.summaryLocation;
    } else if (q.type === 'mutashabihat') {
      if (qTypeLabel) qTypeLabel.textContent = q.questionLabel || `أكمل الآية كما وردت في سورة ${q.surahName}`;
      if (surahAyahBadge) surahAyahBadge.textContent = `سورة ${q.surahName}`;
    } else if (q.type === 'hizb_quarters' || q.type === 'locate_verse') {
      if (qTypeLabel) qTypeLabel.textContent = q.questionLabel || 'أكمل بداية الربع غيباً:';
      if (surahAyahBadge) surahAyahBadge.textContent = `سورة ${q.surahName} — آية ${q.ayahNum}`;
    } else if (q.type === 'surah_transitions') {
      if (qTypeLabel) qTypeLabel.textContent = q.questionLabel || 'أواخر وبدايات السور:';
      if (surahAyahBadge) surahAyahBadge.textContent = q.summaryLocation;
    } else {
      if (qTypeLabel) qTypeLabel.textContent = 'اسرد الآية التالية غيباً:';
      if (surahAyahBadge) surahAyahBadge.textContent = `سورة ${q.surahName} — آية ${q.promptAyahNum}`;
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
    if (btnListen) {
      btnListen.classList.remove('playing');
      btnListen.style.display = q.mcqOnly ? 'none' : 'inline-flex';
    }
    if (btnListenText) btnListenText.textContent = 'استمع';

    // Dynamic Template Switching: Pure MCQ vs Blind Audio Recitation
    const blindPanel = document.getElementById('surpriseBlindPanel');
    const blindStage = document.getElementById('surpriseBlindStage');
    const mcqWrap = document.getElementById('surpriseMcqWrap');

    const isMcqTemplate = Boolean(q.mcqOnly && Array.isArray(q.mcqChoices) && q.mcqChoices.length > 0);
    if (blindPanel) blindPanel.style.display = isMcqTemplate ? 'none' : 'block';
    if (mcqWrap) mcqWrap.style.display = isMcqTemplate ? 'block' : 'none';

    if (isMcqTemplate) {
      renderMutashabihOptions(q);
    }

    // Blind Recitation State Reset (Strict Zero-Spoiler: Answer Content stays hidden)
    const targetCountLabel = document.getElementById('surpriseTargetCountLabel');
    const micActionHint = document.getElementById('surpriseMicActionHint');
    const waveform = document.getElementById('surpriseWaveform');
    const answerContent = document.getElementById('surpriseAnswerContent');
    const answerWordsContainer = document.getElementById('surpriseAnswerWords');
    const ruleBox = document.getElementById('surpriseRuleBox');
    const accuracyBadge = document.getElementById('surpriseAccuracyBadge');
    const spokenLive = document.getElementById('surpriseSpokenLive');
    const selfAssessWrap = document.getElementById('surpriseSelfAssessWrap');

    if (blindStage) blindStage.style.display = 'flex';
    syncBlindRecordingUI(false, 0);
    if (targetCountLabel) {
      const versesCount = Array.isArray(q.answerParts) ? q.answerParts.length : 1;
      if (q.type === 'surah_transitions') {
        targetCountLabel.textContent = q.targetSurahName ? `استحضر مطلع سورة ${q.targetSurahName} غيباً` : 'استحضر الآية غيباً';
      } else if (State.spanMode === 'page') {
        targetCountLabel.textContent = `اسرد الصفحة حتى التوقف غيباً (${versesCount} آيات)`;
      } else {
        targetCountLabel.textContent = versesCount === 1
          ? 'اسرد آية واحدة غيباً'
          : (versesCount === 2 ? 'اسرد آيتين غيباً' : `اسرد ${versesCount} آيات غيباً`);
      }
    }

    if (answerContent) answerContent.style.display = 'none';
    if (ruleBox) {
      if (q.rule && !isMcqTemplate) {
        ruleBox.textContent = `الفائدة: ${q.rule}`;
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

    if (answerWordsContainer && !isMcqTemplate) {
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

  // Render 4 Mutashabihat choice cards, «لا أعرف», smart feedback, and comparison hooks
  function renderMutashabihOptions(q) {
    const mcqOptions = document.getElementById('surpriseMcqOptions');
    const mcqFeedback = document.getElementById('surpriseMcqFeedback');
    const mutaFeedback = document.getElementById('surpriseMutashabihatFeedback');
    const mistakeLine = document.getElementById('surpriseMistakeLine');
    const correctLine = document.getElementById('surpriseCorrectLine');
    const btnDontKnow = document.getElementById('btnMutashabihatDontKnow');
    const actionsRow = document.getElementById('surpriseMcqActionsRow');
    const btnCompare = document.getElementById('btnCompareMutashabihat');
    const btnNextMcq = document.getElementById('btnNextMcqQuestion');
    const scoreBadge = document.getElementById('surpriseScoreBadge');
    const surahAyahBadge = document.getElementById('surpriseSurahAyahBadge');

    if (!mcqOptions) return;

    State.mcqAnswered = false;
    q.selectedWrongCounterpart = null;
    if (mcqFeedback) {
      mcqFeedback.style.display = 'none';
      mcqFeedback.textContent = '';
    }
    if (mutaFeedback) mutaFeedback.style.display = 'none';
    if (mistakeLine) {
      mistakeLine.style.display = 'none';
      mistakeLine.textContent = '';
    }
    if (correctLine) correctLine.textContent = '';
    if (actionsRow) actionsRow.style.display = 'none';
    if (btnCompare) btnCompare.style.display = 'none';
    if (btnNextMcq) btnNextMcq.style.display = 'none';
    if (btnDontKnow) btnDontKnow.style.display = q.type === 'mutashabihat' ? 'block' : 'none';
    if (surahAyahBadge && q.type === 'mutashabihat') {
      surahAyahBadge.textContent = `سورة ${q.surahName}`;
    }

    mcqOptions.innerHTML = '';

    const advanceAfterMcq = () => {
      clearTimeout(State.autoAdvanceTimer);
      stopAudio();
      stopListening();
      State.currentIndex++;
      const maxQ = State.questionCount > 0 ? State.questionCount : Infinity;
      if (State.currentIndex >= maxQ || State.currentIndex >= State.questions.length) {
        finishQuiz();
      } else {
        renderCurrentQuestion();
      }
    };

    const finalizeSelection = (chosenChoice, chosenDiv, isDontKnow = false) => {
      if (State.mcqAnswered) return;
      State.mcqAnswered = true;
      if (btnDontKnow) btnDontKnow.style.display = 'none';

      const allOpts = mcqOptions.querySelectorAll('.surprise-mcq-option');
      allOpts.forEach((el, idx) => {
        el.classList.add('is-locked');
        const c = q.mcqChoices[idx];
        const markEl = el.querySelector('.mcq-opt-mark');
        if (c && c.isCorrect) {
          el.classList.add('is-correct');
          if (markEl) markEl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        }
      });

      const isRight = Boolean(!isDontKnow && chosenChoice && chosenChoice.isCorrect);
      if (!isDontKnow && chosenChoice && !chosenChoice.isCorrect && chosenDiv) {
        chosenDiv.classList.add('is-wrong');
        const wrongMark = chosenDiv.querySelector('.mcq-opt-mark');
        if (wrongMark) wrongMark.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      }

      if (surahAyahBadge && q.type === 'mutashabihat') {
        surahAyahBadge.textContent = `سورة ${q.surahName} — الآية ${q.ayahNum}`;
      }

      if (!q._scoredOnce) {
        q._scoredOnce = true;
        State.score.totalAnswered++;
        if (isRight) {
          State.score.mastered++;
        } else {
          State.score.stumbled++;
          State.stumbledQuestions.push(q);
        }
      }
      if (scoreBadge) scoreBadge.textContent = `الإتقان: ${State.score.mastered}/${State.score.totalAnswered}`;

      if (typeof window.triggerHaptic === 'function') {
        window.triggerHaptic(isRight ? 20 : 25);
      }

      if (actionsRow) actionsRow.style.display = 'flex';
      if (btnNextMcq) btnNextMcq.style.display = 'inline-flex';

      if (isRight) {
        if (mutaFeedback) mutaFeedback.style.display = 'flex';
        if (mistakeLine) mistakeLine.style.display = 'none';
        if (correctLine) {
          correctLine.textContent = `أحسنت — سورة ${q.surahName}، آية ${q.ayahNum}.`;
        }
        if (btnCompare) btnCompare.style.display = 'none';
        State.autoAdvanceTimer = setTimeout(advanceAfterMcq, 1000);
      } else {
        const compOther = (!isDontKnow && chosenChoice && chosenChoice.surahName && chosenChoice.fullText)
          ? chosenChoice
          : q.comparisonCounterpart;
        q.selectedWrongCounterpart = compOther || null;

        if (mutaFeedback) mutaFeedback.style.display = 'flex';
        if (mistakeLine) {
          if (!isDontKnow && chosenChoice && chosenChoice.surahName && chosenChoice.ayahNum) {
            mistakeLine.textContent = `اخترت موضعاً مشابهاً من سورة ${chosenChoice.surahName} (آية ${chosenChoice.ayahNum}).`;
            mistakeLine.style.display = 'block';
          } else {
            mistakeLine.style.display = 'none';
          }
        }
        if (correctLine) {
          correctLine.textContent = `الجواب الصحيح بالأخضر — سورة ${q.surahName}، آية ${q.ayahNum}.`;
        }
        if (btnCompare) {
          btnCompare.style.display = compOther ? 'inline-flex' : 'none';
        }
      }
    };

    q.mcqChoices.forEach(choice => {
      const optDiv = document.createElement('div');
      optDiv.className = 'surprise-mcq-option';
      optDiv.setAttribute('role', 'button');
      optDiv.setAttribute('tabindex', '0');

      const lblSpan = document.createElement('span');
      lblSpan.className = 'mcq-opt-label';
      lblSpan.textContent = choice.label;

      const markSpan = document.createElement('span');
      markSpan.className = 'mcq-opt-mark';
      markSpan.setAttribute('aria-hidden', 'true');

      optDiv.appendChild(lblSpan);
      optDiv.appendChild(markSpan);

      const pickChoice = () => finalizeSelection(choice, optDiv, false);
      optDiv.addEventListener('click', pickChoice);
      optDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pickChoice();
        }
      });
      mcqOptions.appendChild(optDiv);
    });

    if (btnDontKnow) {
      btnDontKnow.onclick = () => finalizeSelection(null, null, true);
    }
  }

  function openMutashabihComparisonScreen() {
    const q = State.currentQuestion;
    if (!q) return;
    const other = q.selectedWrongCounterpart || q.comparisonCounterpart;
    if (!other || !other.fullText) return;

    const unifiedCard = document.getElementById('surpriseUnifiedCard');
    const comparisonCard = document.getElementById('surpriseComparisonCard');
    const targetBadge = document.getElementById('compTargetBadge');
    const targetTextEl = document.getElementById('compTargetVerseText');
    const otherBadge = document.getElementById('compOtherBadge');
    const otherTextEl = document.getElementById('compOtherVerseText');
    const diffNoteBox = document.getElementById('surpriseDiffNoteBox');

    const wordsA = (q.answerText || '').trim().split(/\s+/).filter(Boolean);
    const wordsB = (other.fullText || '').trim().split(/\s+/).filter(Boolean);
    const diff = computeWordsLcsDiff(wordsA, wordsB);

    if (targetBadge) targetBadge.textContent = `المطلوبة — سورة ${q.surahName}، آية ${q.ayahNum}`;
    if (otherBadge) otherBadge.textContent = `التي انتقلت إليها — سورة ${other.surahName}، آية ${other.ayahNum}`;

    if (targetTextEl) targetTextEl.innerHTML = renderHighlightedDiffHtml(wordsA, diff.inCommonA, 'diff-word-target');
    if (otherTextEl) otherTextEl.innerHTML = renderHighlightedDiffHtml(wordsB, diff.inCommonB, 'diff-word-other');
    if (diffNoteBox) {
      diffNoteBox.textContent = q.rule && q.rule !== diff.diffNote
        ? `${q.rule} — ${diff.diffNote}`
        : diff.diffNote;
    }

    if (unifiedCard) unifiedCard.style.display = 'none';
    if (comparisonCard) comparisonCard.style.display = 'block';
  }

  // Reveal Answer strictly AFTER manual finish ('انتهيت') or explicit click, highlighting green matched and red missed words
  function revealAnswer() {
    if (State.isRevealed) return;
    State.isRevealed = true;
    if (State.isRecording || State.isListening) stopListening(false);

    const blindStage = document.getElementById('surpriseBlindStage');
    const answerContent = document.getElementById('surpriseAnswerContent');
    const accuracyBadge = document.getElementById('surpriseAccuracyBadge');
    const spokenLive = document.getElementById('surpriseSpokenLive');
    const selfAssessWrap = document.getElementById('surpriseSelfAssessWrap');

    if (blindStage) blindStage.style.display = 'none';
    if (answerContent) answerContent.style.display = 'block';
    if (selfAssessWrap && !State.mcqAnswered) selfAssessWrap.style.display = 'block';

    if (State.hasRecitedSession && State.currentQuestion && Array.isArray(State.currentQuestion.answerWords)) {
      const totalWords = State.currentQuestion.answerWords.length;
      const matchedCount = State.matchedIndices.size;
      const pct = totalWords > 0 ? Math.min(100, Math.round((matchedCount / totalWords) * 100)) : 0;

      for (let j = 0; j < totalWords; j++) {
        const wordEl = document.getElementById(`surpriseWord-${j}`);
        if (!wordEl) continue;
        if (State.matchedIndices.has(j)) {
          wordEl.classList.add('word-matched');
          wordEl.classList.remove('word-missed');
        } else {
          wordEl.classList.add('word-missed');
          wordEl.classList.remove('word-matched');
        }
      }

      if (accuracyBadge) {
        accuracyBadge.style.display = 'inline-block';
        accuracyBadge.textContent = `${pct}% دقة`;
        accuracyBadge.classList.toggle('badge-success', pct >= 85);
      }
      if (spokenLive && spokenLive.textContent) {
        spokenLive.style.display = 'block';
      }
    }

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
        if (btnListenText) btnListenText.textContent = 'إيقاف';
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
    if (btnListenText) btnListenText.textContent = 'تحميل...';
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
    if (btnListenText) btnListenText.textContent = 'استمع';
  }

  // Keep live blind UI synchronized without exposing Quranic words during recording
  function syncBlindRecordingUI(isRecordingActive, wordCount = 0) {
    const micBtn = document.getElementById('btnSurpriseMic');
    const micHint = document.getElementById('surpriseMicActionHint');
    const waveform = document.getElementById('surpriseWaveform');
    const liveBar = document.getElementById('surpriseLiveCaptureBar');
    const liveText = document.getElementById('surpriseLiveCaptureText');
    const btnReveal = document.getElementById('btnRevealAnswer');
    const btnFinish = document.getElementById('btnFinishRecitation');
    const answerContent = document.getElementById('surpriseAnswerContent');

    if (isRecordingActive && answerContent) {
      answerContent.style.display = 'none';
    }
    if (micBtn) micBtn.classList.toggle('listening', !!isRecordingActive);
    if (waveform) waveform.classList.toggle('is-active', !!isRecordingActive);
    if (micHint) micHint.textContent = isRecordingActive ? 'جاري التسميع الغيبي...' : 'ابدأ التسميع';
    if (liveBar) liveBar.style.display = isRecordingActive ? 'inline-flex' : 'none';
    if (liveText) liveText.textContent = `جاري الاستماع... (تم التقاط ${Math.max(0, wordCount)} كلمة)`;
    if (btnReveal) btnReveal.style.display = isRecordingActive ? 'none' : 'inline-flex';
    if (btnFinish) btnFinish.style.display = isRecordingActive ? 'inline-flex' : 'none';
  }

  // Zero-Spoiler Continuous Blind Speech Recognition (manual stop only via 'انتهيت')
  function toggleSpeechRecognition() {
    if (State.isRecording || State.isListening) {
      stopListening(true);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('التسميع الصوتي ما يشتغل هنا، جرّب Chrome أو Edge، أو اضغط كشف الإجابة.');
      return;
    }

    clearTimeout(State.restartTimer);
    if (State.recognition) {
      try { State.recognition.abort(); } catch (_) {}
    }

    // Fresh recitation session reset (only when user explicitly starts recording)
    State.accumulatedTranscript = '';
    State.currentSessionTranscript = '';
    State.spokenWordCount = 0;
    State.matchedIndices.clear();
    State.hasRecitedSession = true;
    State.isRecording = true;
    State.isListening = true;
    const spokenLiveEl = document.getElementById('surpriseSpokenLive');
    if (spokenLiveEl) {
      spokenLiveEl.textContent = '';
      spokenLiveEl.style.display = 'none';
    }
    syncBlindRecordingUI(true, 0);

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'ar-SA';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      State.isListening = true;
      if (State.isRecording) {
        syncBlindRecordingUI(true, State.spokenWordCount);
      }
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
    };

    rec.onresult = (event) => {
      if (!State.isRecording) return;
      let sessionTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i] && event.results[i][0]) {
          sessionTranscript += event.results[i][0].transcript + ' ';
        }
      }

      State.currentSessionTranscript = sessionTranscript.trim();
      const combinedTranscript = [State.accumulatedTranscript, State.currentSessionTranscript]
        .filter(Boolean)
        .join(' ')
        .trim();

      const spokenLive = document.getElementById('surpriseSpokenLive');
      if (spokenLive && combinedTranscript) {
        spokenLive.textContent = `المسموع: "${combinedTranscript}"`;
      }

      const words = normalizeArabicText(combinedTranscript).split(/\s+/).filter(Boolean);
      State.spokenWordCount = words.length;
      syncBlindRecordingUI(true, State.spokenWordCount);

      processSpokenText(combinedTranscript);
    };

    rec.onerror = (event) => {
      console.warn('Speech recognition event error:', event.error);
      if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') {
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'service-not-allowed') {
        State.isRecording = false;
        State.isListening = false;
        clearTimeout(State.restartTimer);
        syncBlindRecordingUI(false, State.spokenWordCount);
        alert('ما قدرنا نوصل للميكروفون، تأكد من السماح له وجرّب ثاني.');
      }
    };

    rec.onend = () => {
      // دمج النص المنطوق في المقطع الحالي مع السابق دون مسحه عند التوقف للتنفس
      if (State.currentSessionTranscript) {
        State.accumulatedTranscript = [State.accumulatedTranscript, State.currentSessionTranscript]
          .filter(Boolean)
          .join(' ')
          .trim();
        State.currentSessionTranscript = '';
      }

      // استمرار الاستماع تلقائياً إذا لم يضغط المستخدم زر «انتهيت» يدوياً
      if (State.isRecording && !State.isRevealed) {
        clearTimeout(State.restartTimer);
        State.restartTimer = setTimeout(() => {
          if (!State.isRecording || State.isRevealed) return;
          try {
            rec.start();
          } catch (_) {
            State.restartTimer = setTimeout(() => {
              if (State.isRecording && !State.isRevealed) {
                try { rec.start(); } catch (_2) {}
              }
            }, 200);
          }
        }, 50);
        return;
      }

      State.isListening = false;
      syncBlindRecordingUI(false, State.spokenWordCount);
    };

    State.recognition = rec;
    try {
      rec.start();
    } catch (e) {
      console.warn('Error starting speech recognition:', e);
    }
  }

  function stopListening(revealAfter = false) {
    clearTimeout(State.restartTimer);
    State.isRecording = false;
    State.isListening = false;

    if (State.currentSessionTranscript) {
      State.accumulatedTranscript = [State.accumulatedTranscript, State.currentSessionTranscript]
        .filter(Boolean)
        .join(' ')
        .trim();
      State.currentSessionTranscript = '';
    }
    if (State.accumulatedTranscript) {
      const words = normalizeArabicText(State.accumulatedTranscript).split(/\s+/).filter(Boolean);
      State.spokenWordCount = words.length;
      processSpokenText(State.accumulatedTranscript);
    }

    if (State.recognition) {
      try { State.recognition.stop(); } catch (_) {}
    }

    syncBlindRecordingUI(false, State.spokenWordCount);
    if (revealAfter && !State.isRevealed) {
      revealAnswer();
    }
  }

  // Silently evaluate spoken words without uncovering the hidden answer during recording
  function processSpokenText(raw) {
    if (!State.currentQuestion) return;
    const targetWords = State.currentQuestion.answerWords;
    if (!Array.isArray(targetWords) || !targetWords.length) return;
    const spokenTokens = normalizeArabicText(raw).split(/\s+/).filter(Boolean);
    if (!spokenTokens.length) return;

    let spokenIdx = 0;
    for (let j = 0; j < targetWords.length; j++) {
      const normTarget = normalizeArabicText(targetWords[j]);
      let found = false;
      const maxK = Math.min(spokenTokens.length, spokenIdx + 10);

      for (let k = spokenIdx; k < maxK; k++) {
        if (wordsMatch(spokenTokens[k], normTarget)) {
          found = true;
          spokenIdx = k + 1;
          break;
        }
      }

      if (found || State.matchedIndices.has(j)) {
        State.matchedIndices.add(j);
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
    clearTimeout(State.autoAdvanceTimer);
    stopAudio();
    stopListening(false);

    const activeScreen = document.getElementById('surpriseTestActiveScreen');
    const resultScreen = document.getElementById('surpriseTestResultScreen');
    const configBox = document.getElementById('surpriseTestConfigBox');
    const comparisonCard = document.getElementById('surpriseComparisonCard');

    if (comparisonCard) comparisonCard.style.display = 'none';
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
      if (titleEl) titleEl.textContent = 'ما شاء الله، إتقان وحفظ ثابت';
      if (descEl) descEl.textContent = 'استحضارك قوي ومرتّب وربطك ممتاز، بارك الله فيك.';
    } else if (pct >= 70) {
      if (titleEl) titleEl.textContent = 'أداء حلو ومحاولة طيبة';
      if (descEl) descEl.textContent = 'حفظك متماسك، وعيد المواضع اللي تعثرت فيها عشان تثبت أكثر.';
    } else {
      if (titleEl) titleEl.textContent = 'يحتاج تثبيت ومراجعة شوي';
      if (descEl) descEl.textContent = 'الاختبار يكشف لك المواضع اللي تحتاج شدّة، استعن بالله وراجعها الحين.';
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

    if (typeof window.markWeeklyTestCompleted === 'function') {
      try {
        window.markWeeklyTestCompleted(State.scope, pct);
      } catch (e) {
        console.warn('Error marking weekly test completion:', e);
      }
    }

    if (typeof window.triggerHaptic === 'function') window.triggerHaptic([30, 50, 30]);
  }

  // Reset to initial config screen
  function resetToConfigScreen() {
    clearTimeout(State.autoAdvanceTimer);
    stopAudio();
    stopListening(false);

    const configBox = document.getElementById('surpriseTestConfigBox');
    const activeScreen = document.getElementById('surpriseTestActiveScreen');
    const resultScreen = document.getElementById('surpriseTestResultScreen');
    const comparisonCard = document.getElementById('surpriseComparisonCard');
    const unifiedCard = document.getElementById('surpriseUnifiedCard');
    const testTypeSelect = document.getElementById('surpriseTestTypeSelect');

    if (comparisonCard) comparisonCard.style.display = 'none';
    if (unifiedCard) unifiedCard.style.display = 'block';
    if (configBox) configBox.style.display = 'block';
    if (activeScreen) activeScreen.style.display = 'none';
    if (resultScreen) resultScreen.style.display = 'none';
    if (testTypeSelect) State.testType = testTypeSelect.value || State.testType;

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
    await Promise.all([loadQuranText(), loadRubElHizbs()]);

    if (customQuestions && customQuestions.length) {
      State.questions = customQuestions;
      State.questionCount = customQuestions.length;
    } else {
      State.questions = generateQuestions(State.scope, State.testType, State.customSurahId, State.questionCount);
    }

    if (!State.questions.length) {
      const msg = State.scope === 'custom_surah' && !State.customSurahId
        ? 'اختر السورة أول عشان نبدأ'
        : (State.testType === 'mutashabihat'
          ? 'ما لقينا متشابهات لفظية بهذا النطاق، اختر سورة ثانية أو وسّع النطاق.'
          : (State.testType === 'surah_transitions'
            ? 'ما في انتقالات كافية بهذا النطاق، اختر نطاق أوسع أو سورة قبل الناس.'
            : 'ما لقينا آيات كافية هنا، اختر السورة أو جرّب نطاق ثاني.'));
      if (window.showToast) window.showToast(msg);
      else alert(msg);
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

      // Test Type Dropdown (<select>) & Span Mode Visibility
      const testTypeSelect = document.getElementById('surpriseTestTypeSelect');
      const spanGroupEl = document.getElementById('surpriseSpanGroup');
      const syncSpanVisibility = () => {
        if (!spanGroupEl) return;
        const usesSpan = ['complete_verse', 'next_verse', 'sections', 'hizb_quarters'].includes(State.testType);
        spanGroupEl.style.display = usesSpan ? 'block' : 'none';
      };
      if (testTypeSelect) {
        State.testType = testTypeSelect.value || 'complete_verse';
        syncSpanVisibility();
        testTypeSelect.addEventListener('change', () => {
          State.testType = testTypeSelect.value || 'complete_verse';
          syncSpanVisibility();
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
        });
      }

      // Mutashabihat Comparison Screen Actions
      const btnCompare = document.getElementById('btnCompareMutashabihat');
      if (btnCompare) {
        btnCompare.addEventListener('click', openMutashabihComparisonScreen);
      }

      const btnCloseComp = document.getElementById('btnCloseComparison');
      if (btnCloseComp) {
        btnCloseComp.addEventListener('click', () => {
          const unifiedCard = document.getElementById('surpriseUnifiedCard');
          const comparisonCard = document.getElementById('surpriseComparisonCard');
          if (comparisonCard) comparisonCard.style.display = 'none';
          if (unifiedCard) unifiedCard.style.display = 'block';
        });
      }

      const btnRetestDiff = document.getElementById('btnRetestMutashabihatDiff');
      if (btnRetestDiff) {
        btnRetestDiff.addEventListener('click', () => {
          const q = State.currentQuestion;
          const unifiedCard = document.getElementById('surpriseUnifiedCard');
          const comparisonCard = document.getElementById('surpriseComparisonCard');
          if (comparisonCard) comparisonCard.style.display = 'none';
          if (unifiedCard) unifiedCard.style.display = 'block';
          if (q && Array.isArray(q.mcqChoices)) {
            q.mcqChoices = shuffleArray(q.mcqChoices);
            renderMutashabihOptions(q);
          }
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
        });
      }

      // Next Question for MCQ modes (clears auto-advance if clicked manually)
      const btnNextMcq = document.getElementById('btnNextMcqQuestion');
      if (btnNextMcq) {
        btnNextMcq.addEventListener('click', () => {
          clearTimeout(State.autoAdvanceTimer);
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

      // Finish Blind Recitation ('انتهيت') -> stop mic & reveal/grade
      const btnFinishRecite = document.getElementById('btnFinishRecitation');
      if (btnFinishRecite) {
        btnFinishRecite.addEventListener('click', () => stopListening(true));
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
          if (confirm('تبي تنهي الاختبار الحين وتشوف نتيجتك؟')) {
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
    State.scope = targetScope || 'all_memorized';
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
