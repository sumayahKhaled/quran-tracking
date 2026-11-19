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
    scope: 'current_surah', // 'current_surah' | 'all_memorized' | 'custom_surah'
    customSurahId: 1,
    questionCount: 5, // 5 | 10 | 0 (0 = infinite / continuous)
    testType: 'complete_verse', // 'complete_verse' | 'next_verse'
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
    recognition: null,
    isListening: false,
    matchedIndices: new Set(),
    isRevealed: false
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

  // Populate the 114 surahs in the custom surah dropdown
  function populateSurahSelect() {
    const sel = document.getElementById('surpriseSurahSelect');
    if (!sel || sel.children.length > 0) return;
    if (!window.QURAN_SURAHS) return;

    window.QURAN_SURAHS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية)`;
      sel.appendChild(opt);
    });

    // Default to current surah if possible
    let defId = 1;
    if (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) {
      const found = getSurahByNameOrId(window.AppState.surahConfig.name);
      if (found) defId = found.id;
    }
    sel.value = String(defId);
    State.customSurahId = defId;
  }

  // Build pool of eligible verses based on scope and test type
  function buildVersePool(scope, testType, customSurahId) {
    const pool = [];
    if (!window.QURAN_SURAHS) return pool;

    if (scope === 'current_surah') {
      let curName = (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) || 'البقرة';
      let surahObj = getSurahByNameOrId(curName) || window.QURAN_SURAHS[1];
      const maxVerses = surahObj.verses;
      const progress = (window.AppState && window.AppState.surahConfig && parseInt(window.AppState.surahConfig.currentVerse, 10)) || 0;
      const endAyah = (progress > 0 && progress < maxVerses) ? progress : maxVerses;
      const limit = (testType === 'next_verse') ? Math.min(endAyah, maxVerses - 1) : endAyah;

      for (let a = 1; a <= limit; a++) {
        pool.push({ surahId: surahObj.id, ayahNum: a, surahName: surahObj.name, maxVerses: maxVerses });
      }
    } else if (scope === 'all_memorized') {
      const memorizedNames = new Set();
      if (window.AppState && Array.isArray(window.AppState.completedSurahs)) {
        window.AppState.completedSurahs.forEach(c => memorizedNames.add(c.name));
      }
      if (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) {
        memorizedNames.add(window.AppState.surahConfig.name);
      }

      // If user hasn't memorized surahs yet, fallback to Juz 30 and Al-Fatiha
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
          const limit = (testType === 'next_verse') ? Math.min(endAyah, maxVerses - 1) : endAyah;
          for (let a = 1; a <= limit; a++) {
            pool.push({ surahId: surahObj.id, ayahNum: a, surahName: surahObj.name, maxVerses: maxVerses });
          }
        }
      });
    } else if (scope === 'custom_surah') {
      const surahObj = getSurahByNameOrId(customSurahId) || window.QURAN_SURAHS[0];
      const maxVerses = surahObj.verses;
      const limit = (testType === 'next_verse') ? Math.max(1, maxVerses - 1) : maxVerses;
      for (let a = 1; a <= limit; a++) {
        pool.push({ surahId: surahObj.id, ayahNum: a, surahName: surahObj.name, maxVerses: maxVerses });
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

  // Generate question list
  function generateQuestions(scope, testType, customSurahId, count) {
    const pool = buildVersePool(scope, testType, customSurahId);
    if (!pool.length) return [];

    const shuffled = shuffleArray(pool);
    const questions = [];

    for (let i = 0; i < shuffled.length; i++) {
      const item = shuffled[i];
      const sId = item.surahId;
      const aNum = item.ayahNum;
      const sName = item.surahName;

      if (testType === 'complete_verse') {
        const text = getVerseText(sId, aNum);
        if (!text) continue;
        const words = text.trim().split(/\s+/).filter(Boolean);
        if (words.length < 3 && shuffled.length > count) continue;

        // Prompt is first 3-4 words (or 1/3 of verse)
        const promptWordCount = Math.min(4, Math.max(2, Math.floor(words.length / 3)));
        const promptText = words.slice(0, promptWordCount).join(' ') + '...';

        questions.push({
          type: 'complete_verse',
          surahId: sId,
          ayahNum: aNum,
          surahName: sName,
          promptText: promptText,
          audioAyahNum: aNum,
          answerText: text,
          answerWords: words
        });
      } else {
        // next_verse: show Ayah N, ask for Ayah N+1
        const promptText = getVerseText(sId, aNum);
        const targetText = getVerseText(sId, aNum + 1);
        if (!promptText || !targetText) continue;
        const targetWords = targetText.trim().split(/\s+/).filter(Boolean);

        questions.push({
          type: 'next_verse',
          surahId: sId,
          promptAyahNum: aNum,
          targetAyahNum: aNum + 1,
          surahName: sName,
          promptText: promptText,
          audioAyahNum: aNum,
          answerText: targetText,
          answerWords: targetWords
        });
      }

      if (count > 0 && questions.length >= count) {
        break;
      }
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

    // Badges & Progress
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
      const pct = (State.questionCount > 0)
        ? Math.min(100, Math.round(((State.currentIndex) / totalQ) * 100))
        : 100;
      progressBarFill.style.width = `${pct}%`;
    }

    // Question Box
    const qTypeLabel = document.getElementById('surpriseQuestionTypeLabel');
    const surahAyahBadge = document.getElementById('surpriseSurahAyahBadge');
    const questionTextEl = document.getElementById('surpriseQuestionText');

    if (q.type === 'complete_verse') {
      if (qTypeLabel) qTypeLabel.textContent = 'أكمل الآية الكريمة غيباً:';
      if (surahAyahBadge) surahAyahBadge.textContent = `سورة ${q.surahName} — الآية ${q.ayahNum}`;
    } else {
      if (qTypeLabel) qTypeLabel.textContent = 'ما هي الآية التالية مباشرة؟';
      if (surahAyahBadge) surahAyahBadge.textContent = `سورة ${q.surahName} — الآية ${q.promptAyahNum} ➜ المطلوبة: الآية ${q.targetAyahNum}`;
    }

    if (questionTextEl) {
      questionTextEl.textContent = q.promptText;
    }

    // Reset Audio button
    const btnListen = document.getElementById('btnListenQuestion');
    const btnListenText = document.getElementById('btnListenQuestionText');
    if (btnListen) btnListen.classList.remove('playing');
    if (btnListenText) btnListenText.textContent = 'استمع للسؤال';

    // Reset Answer Area & Cover
    const answerCover = document.getElementById('surpriseAnswerCover');
    const answerContent = document.getElementById('surpriseAnswerContent');
    const answerWordsContainer = document.getElementById('surpriseAnswerWords');
    const accuracyBadge = document.getElementById('surpriseAccuracyBadge');
    const spokenLive = document.getElementById('surpriseSpokenLive');
    const selfAssessWrap = document.getElementById('surpriseSelfAssessWrap');

    if (answerCover) answerCover.style.display = 'block';
    if (answerContent) answerContent.style.display = 'none';
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

    // Populate words spans for answer
    if (answerWordsContainer) {
      answerWordsContainer.innerHTML = '';
      q.answerWords.forEach((w, idx) => {
        const span = document.createElement('span');
        span.className = 'surprise-word';
        span.id = `surpriseWord-${idx}`;
        span.textContent = w;
        answerWordsContainer.appendChild(span);
        answerWordsContainer.appendChild(document.createTextNode(' '));
      });
      const endMarker = document.createElement('span');
      endMarker.className = 'surprise-verse-end';
      const ayahNo = (q.type === 'complete_verse') ? q.ayahNum : q.targetAyahNum;
      endMarker.textContent = `﴿${ayahNo}﴾`;
      answerWordsContainer.appendChild(endMarker);
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
    if (selfAssessWrap) selfAssessWrap.style.display = 'block';

    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
  }

  // Audio Playback
  function toggleAudioPlayback() {
    if (State.isAudioPlaying) {
      stopAudio();
      return;
    }

    if (!State.currentQuestion) return;
    const q = State.currentQuestion;
    const surah = q.surahId;
    const ayah = q.audioAyahNum;
    const reciter = State.reciter || 'Alafasy_128kbps';

    const btnListen = document.getElementById('btnListenQuestion');
    const btnListenText = document.getElementById('btnListenQuestionText');
    if (btnListenText) btnListenText.textContent = 'جاري التحميل...';

    resolveAudioSource(reciter, surah, ayah).then(src => {
      audioPlayer.src = src;
      audioPlayer.play().then(() => {
        State.isAudioPlaying = true;
        if (btnListen) btnListen.classList.add('playing');
        if (btnListenText) btnListenText.textContent = 'إيقاف الصوت ⏸';
      }).catch(err => {
        console.warn('Audio playback error:', err);
        stopAudio();
      });
    });

    audioPlayer.onended = () => {
      stopAudio();
    };
  }

  function stopAudio() {
    try {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    } catch (_) {}
    State.isAudioPlaying = false;
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
      if (micLabel) micLabel.textContent = 'جاري الاستماع... اضغط للإيقاف';

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
      if (micLabel) micLabel.textContent = 'تسميع صوتي غيباً';

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
    if (micLabel) micLabel.textContent = 'تسميع صوتي غيباً';
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
      if (titleEl) titleEl.textContent = 'ما شاء الله! إتقان تام واستحضار راسخ 🏆';
      if (descEl) descEl.textContent = 'أظهرت قوة استحضار عالية للآيات وربطها غيباً دون تردد. هنيئاً لك هذا الإتقان!';
    } else if (pct >= 70) {
      if (titleEl) titleEl.textContent = 'أداء رائع ومحاولة ممتازة! 🌟';
      if (descEl) descEl.textContent = 'استحضارك طيب ومتماسك، وبإعادة اختبار المواضع المتعثرة سيرسخ الحفظ تماماً.';
    } else {
      if (titleEl) titleEl.textContent = 'يحتاج تثبيتاً ومراجعة ↻';
      if (descEl) descEl.textContent = 'المباغتة وسيلة ذكية لاكتشاف مواضع الضعف لتقويتها. استعن بالله وأعد اختبار المواضع المتعثرة.';
    }

    // Render stumbled list
    if (State.stumbledQuestions.length > 0 && stumbledWrap && stumbledList) {
      stumbledWrap.style.display = 'block';
      stumbledList.innerHTML = '';

      State.stumbledQuestions.forEach(q => {
        const card = document.createElement('div');
        card.className = 'surprise-stumbled-card';
        const ayahNo = (q.type === 'complete_verse') ? q.ayahNum : q.targetAyahNum;
        const qLabel = (q.type === 'complete_verse') ? 'إكمال الآية' : 'الآية التالية';
        card.innerHTML = `
          <div class="surprise-stumbled-header">
            <span>سورة ${q.surahName} — الآية ${ayahNo}</span>
            <span class="stumbled-type-badge">${qLabel}</span>
          </div>
          <div class="surprise-stumbled-text">${q.answerText} ﴿${ayahNo}﴾</div>
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
    if (State.scope === 'current_surah') {
      const curName = (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) || 'البقرة';
      hint.textContent = `سيتم اختيار الأسئلة عشوائياً من سورة ${curName} الحالية`;
    } else if (State.scope === 'all_memorized') {
      const count = (window.AppState && Array.isArray(window.AppState.completedSurahs)) ? window.AppState.completedSurahs.length : 0;
      hint.textContent = `سيتم توليد أسئلة مباغتة تشمل جميع السور المحفوظة السابقة (${count} سورة مكتملة)`;
    } else {
      const sel = document.getElementById('surpriseSurahSelect');
      const opt = sel ? sel.options[sel.selectedIndex] : null;
      hint.textContent = `سيتم اختيار الأسئلة من ${opt ? opt.textContent : 'السورة المحددة'}`;
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
      alert('لم يتم العثور على آيات كافية ضمن النطاق المختار. يرجى تجربة سورة أخرى أو نطاق مختلف.');
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
      const customSurahWrap = document.getElementById('surpriseCustomSurahWrap');
      scopeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          scopeBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          State.scope = btn.dataset.scope;
          if (customSurahWrap) {
            customSurahWrap.style.display = (State.scope === 'custom_surah') ? 'block' : 'none';
          }
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

  window.SurpriseTest = {
    init: initSurpriseTest,
    start: startQuizSession,
    reset: resetToConfigScreen
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSurpriseTest);
  } else {
    initSurpriseTest();
  }

})();
