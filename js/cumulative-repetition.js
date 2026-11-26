/**
 * Seraj - Cumulative Repetition Memorizer (محفظ التكرار التراكمي - طريقة الجمع)
 * Method of gathering/linking:
 * Step 1: Ayah A_1 (repeat N times)
 * Step 2: Ayah A_2 (repeat N times)
 * Step 3: Link A_1..A_2 (repeat N times)
 * Step 4: Ayah A_3 (repeat N times)
 * Step 5: Link A_1..A_3 (repeat N times)
 * ...
 */
(function () {
  'use strict';

  let quranTextMap = null;
  const sessionAudio = new Audio();
  sessionAudio.preload = 'auto';

  const CUMULATIVE_RECITERS = [
    { id: 'Alafasy_128kbps', name: 'مشاري راشد العفاسي' },
    { id: 'Husary_128kbps', name: 'محمود خليل الحصري (المصحف المعلم)' },
    { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'عبد الرحمن السديس' },
    { id: 'Minshawy_Murattal_128kbps', name: 'محمد صديق المنشاوي' },
    { id: 'Maher_AlMuaiqly_64kbps', name: 'ماهر المعيقلي' },
    { id: 'Abdul_Basit_Murattal_192kbps', name: 'عبد الباسط عبد الصمد' },
    { id: 'Ghamadi_40kbps', name: 'سعد الغامدي' },
    { id: 'Abu_Bakr_Ash-Shaatree_128kbps', name: 'أبو بكر الشاطري' },
    { id: 'Yasser_Ad-Dussary_128kbps', name: 'ياسر الدوسري' },
    { id: 'Saood_ash-Shuraym_128kbps', name: 'سعود الشريم' }
  ];

  const SessionState = {
    surahId: 1,
    fromAyah: 1,
    toAyah: 5,
    repeatCount: 2,
    reciter: 'Alafasy_128kbps',
    stages: [],
    currentStageIndex: 0,
    currentVerseIndex: 0, // index inside current stage's verses array
    currentRepeatCount: 1, // 1 ... repeatCount
    isPlaying: false,
    isPaused: false,
    delayTimeout: null
  };

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
      console.warn('Failed to load quran text:', e);
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
      } catch (_) { }
    }
    return url;
  }

  function playSuccessChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) { }
  }

  function generateStages(startAyah, endAyah) {
    const stages = [];
    const from = Math.min(startAyah, endAyah);
    const to = Math.max(startAyah, endAyah);

    // Stage 1: First ayah single
    stages.push({
      type: 'single',
      ayah: from,
      verses: [from],
      desc: `حفظ الآية (${from}) منفردة`
    });

    for (let i = from + 1; i <= to; i++) {
      // Step A: New single ayah
      stages.push({
        type: 'single',
        ayah: i,
        verses: [i],
        desc: `حفظ الآية (${i}) منفردة`
      });

      // Step B: Linking from start up to i
      const linkVerses = [];
      for (let v = from; v <= i; v++) linkVerses.push(v);

      stages.push({
        type: 'link',
        fromAyah: from,
        toAyah: i,
        verses: linkVerses,
        desc: `ربط الآيات (${from} إلى ${i}) متصلة`
      });
    }

    return stages;
  }

  function populateSurahSelect() {
    const select = document.getElementById('cumulativeSurahSelect');
    if (!select || !window.QURAN_SURAHS) return;
    select.innerHTML = '';

    window.QURAN_SURAHS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية - ${s.type})`;
      select.appendChild(opt);
    });

    // Default to currently active or saved surah
    const savedSurahName = (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) || 'الفاتحة';
    const cleanSaved = savedSurahName.replace(/^سورة\s+/, '').trim();
    const found = window.QURAN_SURAHS.find(s => s.name === cleanSaved);
    if (found) {
      select.value = found.id;
    } else {
      select.value = '1';
    }

    onSurahChange();
  }

  function onSurahChange() {
    const select = document.getElementById('cumulativeSurahSelect');
    const fromInput = document.getElementById('cumulativeFromAyah');
    const toInput = document.getElementById('cumulativeToAyah');
    if (!select || !window.QURAN_SURAHS) return;

    const surahId = parseInt(select.value, 10) || 1;
    const sObj = (typeof window.getSurahById === 'function') ? window.getSurahById(surahId) : window.QURAN_SURAHS.find(s => s.id === surahId);
    const maxVerses = sObj ? sObj.verses : 7;

    if (fromInput) {
      fromInput.min = 1;
      fromInput.max = maxVerses;
      fromInput.value = 1;
    }
    if (toInput) {
      toInput.min = 1;
      toInput.max = maxVerses;
      toInput.value = Math.min(maxVerses, 5);
    }
  }

  function populateReciterSelect() {
    const select = document.getElementById('cumulativeReciterSelect');
    if (!select) return;
    select.innerHTML = '';

    const savedReciter = localStorage.getItem('tibyan_current_reciter') || localStorage.getItem('tibyan_default_reciter') || 'Alafasy_128kbps';

    CUMULATIVE_RECITERS.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      if (r.id === savedReciter) opt.selected = true;
      select.appendChild(opt);
    });
  }

  async function startSession() {
    await loadQuranText();

    const surahSelect = document.getElementById('cumulativeSurahSelect');
    const fromInput = document.getElementById('cumulativeFromAyah');
    const toInput = document.getElementById('cumulativeToAyah');
    const repeatSelect = document.getElementById('cumulativeRepeatCount');
    const reciterSelect = document.getElementById('cumulativeReciterSelect');

    const surahId = parseInt(surahSelect ? surahSelect.value : 1, 10) || 1;
    const sObj = (typeof window.getSurahById === 'function') ? window.getSurahById(surahId) : null;
    const maxV = sObj ? sObj.verses : 286;

    let fromA = parseInt(fromInput ? fromInput.value : 1, 10) || 1;
    let toA = parseInt(toInput ? toInput.value : 5, 10) || 5;

    fromA = Math.max(1, Math.min(maxV, fromA));
    toA = Math.max(1, Math.min(maxV, toA));
    if (fromA > toA) {
      const tmp = fromA;
      fromA = toA;
      toA = tmp;
    }

    const repeat = parseInt(repeatSelect ? repeatSelect.value : 2, 10) || 2;
    const reciter = reciterSelect ? reciterSelect.value : 'Alafasy_128kbps';

    SessionState.surahId = surahId;
    SessionState.fromAyah = fromA;
    SessionState.toAyah = toA;
    SessionState.repeatCount = repeat;
    SessionState.reciter = reciter;
    SessionState.stages = generateStages(fromA, toA);
    SessionState.currentStageIndex = 0;
    SessionState.currentVerseIndex = 0;
    SessionState.currentRepeatCount = 1;
    SessionState.isPlaying = true;
    SessionState.isPaused = false;

    // Switch view to player
    const configBox = document.getElementById('cumulativeConfigBox');
    const playerScreen = document.getElementById('cumulativePlayerScreen');
    if (configBox) configBox.style.display = 'none';
    if (playerScreen) playerScreen.style.display = 'flex';

    // Pause any other reciter playing in app
    if (window.ReciterPlayer && typeof window.ReciterPlayer.pause === 'function') {
      window.ReciterPlayer.pause();
    }

    renderCurrentStageVisuals();
    playCurrentVerse();
  }

  function renderCurrentStageVisuals() {
    const stageBadge = document.getElementById('cumulativeStageBadge');
    const repeatBadge = document.getElementById('cumulativeRepeatBadge');
    const stageDesc = document.getElementById('cumulativeStageDesc');
    const progressFill = document.getElementById('cumulativeProgressFill');
    const versesDisplay = document.getElementById('cumulativeVersesDisplay');

    if (SessionState.currentStageIndex >= SessionState.stages.length) {
      return;
    }

    const stage = SessionState.stages[SessionState.currentStageIndex];
    const totalStages = SessionState.stages.length;

    if (stageBadge) {
      stageBadge.textContent = `المرحلة ${SessionState.currentStageIndex + 1} من ${totalStages}`;
    }

    if (repeatBadge) {
      repeatBadge.textContent = `تكرار ${SessionState.currentRepeatCount}/${SessionState.repeatCount}`;
    }

    if (stageDesc) {
      const typeLabel = stage.type === 'single' ? 'حفظ منفرد' : 'ربط المقاطع';
      stageDesc.innerHTML = `<strong>${typeLabel}:</strong> ${stage.desc} (تكرار ${SessionState.currentRepeatCount} من ${SessionState.repeatCount})`;
    }

    if (progressFill) {
      const percent = Math.min(100, Math.round((SessionState.currentStageIndex / totalStages) * 100));
      progressFill.style.width = `${percent}%`;
    }

    if (versesDisplay) {
      versesDisplay.innerHTML = '';
      const currentActiveAyah = stage.verses[SessionState.currentVerseIndex];

      stage.verses.forEach(ayahNum => {
        const item = document.createElement('div');
        const isActive = (ayahNum === currentActiveAyah);
        item.className = `cum-verse-item ${isActive ? 'active-playing' : ''}`;
        item.id = `cumVerseItem-${ayahNum}`;

        const txt = getVerseText(SessionState.surahId, ayahNum);
        item.innerHTML = `
          <span class="cum-verse-text">${txt}</span>
          <span class="cum-ayah-num">﴿${ayahNum}﴾</span>
        `;
        versesDisplay.appendChild(item);

        if (isActive) {
          setTimeout(() => {
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 60);
        }
      });
    }

    updatePlayPauseButton();
  }

  async function playCurrentVerse() {
    if (!SessionState.isPlaying || SessionState.isPaused) return;

    if (SessionState.currentStageIndex >= SessionState.stages.length) {
      finishSession();
      return;
    }

    const stage = SessionState.stages[SessionState.currentStageIndex];
    const currentAyah = stage.verses[SessionState.currentVerseIndex];

    renderCurrentStageVisuals();

    try {
      const audioSrc = await resolveAudioSource(SessionState.reciter, SessionState.surahId, currentAyah);
      sessionAudio.src = audioSrc;
      await sessionAudio.play();
    } catch (err) {
      console.warn('Playback error:', err);
      // If auto-play blocked or network error, skip to next after small delay
      SessionState.delayTimeout = setTimeout(() => {
        onVerseAudioEnded();
      }, 2500);
    }
  }

  function onVerseAudioEnded() {
    if (!SessionState.isPlaying || SessionState.isPaused) return;

    const stage = SessionState.stages[SessionState.currentStageIndex];

    // 1. More verses in current block?
    if (SessionState.currentVerseIndex + 1 < stage.verses.length) {
      SessionState.currentVerseIndex++;
      SessionState.delayTimeout = setTimeout(() => {
        playCurrentVerse();
      }, 150);
      return;
    }

    // 2. Finished block. More repeats in current stage?
    if (SessionState.currentRepeatCount < SessionState.repeatCount) {
      SessionState.currentRepeatCount++;
      SessionState.currentVerseIndex = 0;
      SessionState.delayTimeout = setTimeout(() => {
        playCurrentVerse();
      }, 450);
      return;
    }

    // 3. Stage completed!
    playSuccessChime();
    SessionState.currentStageIndex++;

    if (SessionState.currentStageIndex < SessionState.stages.length) {
      SessionState.currentRepeatCount = 1;
      SessionState.currentVerseIndex = 0;
      SessionState.delayTimeout = setTimeout(() => {
        playCurrentVerse();
      }, 700);
    } else {
      finishSession();
    }
  }

  function togglePlayPause() {
    if (!SessionState.isPlaying) {
      startSession();
      return;
    }

    if (SessionState.isPaused) {
      SessionState.isPaused = false;
      sessionAudio.play().catch(() => {});
    } else {
      SessionState.isPaused = true;
      sessionAudio.pause();
      if (SessionState.delayTimeout) clearTimeout(SessionState.delayTimeout);
    }
    updatePlayPauseButton();
  }

  function updatePlayPauseButton() {
    const playIcon = document.getElementById('cumPlayIcon');
    const pauseIcon = document.getElementById('cumPauseIcon');
    if (!playIcon || !pauseIcon) return;

    if (SessionState.isPaused || !SessionState.isPlaying) {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    } else {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    }
  }

  function skipToNextStage() {
    if (!SessionState.isPlaying) return;
    if (SessionState.delayTimeout) clearTimeout(SessionState.delayTimeout);
    sessionAudio.pause();

    if (SessionState.currentStageIndex + 1 < SessionState.stages.length) {
      SessionState.currentStageIndex++;
      SessionState.currentRepeatCount = 1;
      SessionState.currentVerseIndex = 0;
      SessionState.isPaused = false;
      playCurrentVerse();
    } else {
      finishSession();
    }
  }

  function skipToPrevStage() {
    if (!SessionState.isPlaying) return;
    if (SessionState.delayTimeout) clearTimeout(SessionState.delayTimeout);
    sessionAudio.pause();

    SessionState.currentStageIndex = Math.max(0, SessionState.currentStageIndex - 1);
    SessionState.currentRepeatCount = 1;
    SessionState.currentVerseIndex = 0;
    SessionState.isPaused = false;
    playCurrentVerse();
  }

  function stopSession() {
    if (SessionState.delayTimeout) clearTimeout(SessionState.delayTimeout);
    sessionAudio.pause();
    sessionAudio.currentTime = 0;
    sessionAudio.src = '';

    SessionState.isPlaying = false;
    SessionState.isPaused = false;

    const configBox = document.getElementById('cumulativeConfigBox');
    const playerScreen = document.getElementById('cumulativePlayerScreen');
    if (configBox) configBox.style.display = 'flex';
    if (playerScreen) playerScreen.style.display = 'none';
  }

  function finishSession() {
    SessionState.isPlaying = false;
    SessionState.isPaused = false;
    if (SessionState.delayTimeout) clearTimeout(SessionState.delayTimeout);
    sessionAudio.pause();

    playSuccessChime();
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic([30, 60, 30]);

    const versesDisplay = document.getElementById('cumulativeVersesDisplay');
    const stageDesc = document.getElementById('cumulativeStageDesc');
    const progressFill = document.getElementById('cumulativeProgressFill');
    const repeatBadge = document.getElementById('cumulativeRepeatBadge');
    const stageBadge = document.getElementById('cumulativeStageBadge');

    if (progressFill) progressFill.style.width = '100%';
    if (stageBadge) stageBadge.textContent = 'مكتمل';
    if (repeatBadge) repeatBadge.textContent = 'أتممت الجلسة';
    if (stageDesc) stageDesc.textContent = 'كفو عليك، خلّصت جلسة التكرار والربط التراكمي.';

    if (versesDisplay) {
      versesDisplay.innerHTML = `
        <div class="cumulative-celebrate-box">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#059669" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <h4 class="cumulative-celebrate-title">تم إنجاز الحفظ التراكمي والربط بنجاح</h4>
          <p class="cumulative-celebrate-desc">
            لقد كررت وربطت الآيات من (${SessionState.fromAyah} إلى ${SessionState.toAyah}) وفق طريقة الجمع المتقنة.
          </p>
          <button type="button" id="btnRestartCumulativeSession" class="btn-tool-primary" style="margin-top:10px;">
            إعادة الجلسة من البداية
          </button>
        </div>
      `;

      const restartBtn = document.getElementById('btnRestartCumulativeSession');
      if (restartBtn) {
        restartBtn.addEventListener('click', () => {
          startSession();
        });
      }
    }

    updatePlayPauseButton();
  }

  function initCumulativeRepetitionModule() {
    try {
      const cardOpen = document.getElementById('cardOpenCumulativeRepetition');
      const subpage = document.getElementById('cumulativeRepetitionSubpage');
      const mainPanel = document.getElementById('toolsMainPanel');
      const btnBack = document.getElementById('btnBackFromCumulativeRepetition');

      if (cardOpen) {
        cardOpen.addEventListener('click', () => {
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
          if (typeof window.showToolsSubpage === 'function') {
            window.showToolsSubpage('cumulativeRepetitionSubpage');
          } else {
            if (mainPanel) mainPanel.style.display = 'none';
            if (subpage) {
              subpage.removeAttribute('hidden');
              subpage.style.display = 'flex';
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
          try {
            populateSurahSelect();
            populateReciterSelect();
            loadQuranText();
          } catch (err) {
            console.error('Error opening cumulative repetition setup:', err);
          }
        });
      }

      if (btnBack) {
        btnBack.addEventListener('click', () => {
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
          try { stopSession(); } catch (_) {}
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

      const surahSelect = document.getElementById('cumulativeSurahSelect');
      if (surahSelect) {
        surahSelect.addEventListener('change', onSurahChange);
      }

      const btnStart = document.getElementById('btnStartCumulativeSession');
      if (btnStart) {
        btnStart.addEventListener('click', startSession);
      }

      const btnPlayPause = document.getElementById('btnCumulativePlayPause');
      if (btnPlayPause) {
        btnPlayPause.addEventListener('click', togglePlayPause);
      }

      const btnNext = document.getElementById('btnCumulativeNextStage');
      if (btnNext) {
        btnNext.addEventListener('click', skipToNextStage);
      }

      const btnPrev = document.getElementById('btnCumulativePrevStage');
      if (btnPrev) {
        btnPrev.addEventListener('click', skipToPrevStage);
      }

      const btnStop = document.getElementById('btnCumulativeStopSession');
      if (btnStop) {
        btnStop.addEventListener('click', stopSession);
      }

      // Audio events
      sessionAudio.addEventListener('ended', onVerseAudioEnded);
      sessionAudio.addEventListener('error', (e) => {
        console.warn('Cumulative session audio error:', e);
        if (SessionState.isPlaying && !SessionState.isPaused) {
          SessionState.delayTimeout = setTimeout(() => {
            onVerseAudioEnded();
          }, 1500);
        }
      });
    } catch (err) {
      console.error('Error initializing Cumulative Repetition Module:', err);
    }
  }

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCumulativeRepetitionModule);
  } else {
    initCumulativeRepetitionModule();
  }

  window.initCumulativeRepetitionModule = initCumulativeRepetitionModule;
})();
