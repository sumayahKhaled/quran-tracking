/**
 * Tibyan Quran Viewer & Real-time Streaming Voice Recitation Engine
 * 100% Free, Browser-native, Zero paid dependencies
 * Supports Madani Mushaf (604 pages) with SVG overlays, Ayah polygon tracking,
 * Off-canvas Surah Drawer, Mask / Blur Mode, and Modern Settings Sub-page navigation.
 */

(function () {
  'use strict';

  // --- ARABIC TEXT NORMALIZER ---
  function normalizeArabicText(str) {
    if (!str) return '';
    return str
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // Remove Tashkeel and Quranic stop marks
      .replace(/\u0640/g, '') // Remove Tatweel / Kashida
      .replace(/[أإآٱ]/g, 'ا') // Unify Hamzas to bare Alif
      .replace(/ة/g, 'ه') // Unify Taa Marbuta to Haa
      .replace(/ى/g, 'ي') // Unify Alif Maqsoora to Yaa
      .replace(/[^\u0621-\u064A\s]/g, ' ') // Strip non-Arabic letters and punctuation
      .replace(/\s+/g, ' ') // Collapse extra whitespace
      .trim();
  }

  // Fuzzy word matching for speech recognition variances
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

    return false;
  }

  // --- MUSHAF STATE ---
  const MushafState = {
    currentPage: 1,
    totalPages: 604,
    activeSurahId: 1,
    activeAyahNum: 1,
    maskMode: false,
    pageVerses: [],
    pagePolygons: [],
    pageViewBox: '0 0 345 550',
    targetWords: [],
    wordPointerIndex: 0,
    recognition: null,
    isReciting: false,
    audioCtx: null,
    cache: new Map()
  };

  // --- AUDIO CHIME GENERATOR (Web Audio API) ---
  function playSuccessChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!MushafState.audioCtx) {
        MushafState.audioCtx = new AudioContext();
      }
      if (MushafState.audioCtx.state === 'suspended') {
        MushafState.audioCtx.resume();
      }
      const ctx = MushafState.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    } catch (e) {
      // Audio playback silently ignored if blocked by browser policy
    }
  }

  // --- DOM ELEMENTS REFERENCE ---
  let dom = {};

  function initDomReferences() {
    dom = {
      view: document.getElementById('view-mushaf'),
      // Header Elements
      openSurahDrawerBtn: document.getElementById('openSurahDrawerBtn'),
      headerSurahName: document.getElementById('mushafHeaderSurahName'),
      headerJuzName: document.getElementById('mushafHeaderJuzName'),
      toggleMaskBtn: document.getElementById('toggleMaskBtn'),
      maskEyeIcon: document.getElementById('maskEyeIcon'),
      maskBtnText: document.getElementById('maskBtnText'),
      maskOptionsMenu: document.getElementById('maskOptionsMenu'),
      // Mushaf Viewer Frame
      pageWrapper: document.getElementById('mushafPageWrapper'),
      imageLayer: document.getElementById('mushafImageLayer'),
      overlaySvg: document.getElementById('mushafOverlaySvg'),
      loader: document.getElementById('mushafLoader'),
      // In-page Page Number Badge
      inpageNumber: document.getElementById('mushafInpageNumber'),
      prevPageBtn: document.getElementById('mushafPrevPageBtn'),
      nextPageBtn: document.getElementById('mushafNextPageBtn'),
      pageInput: document.getElementById('mushafPageInput'),
      // Reciter Audio Player Controls
      mushafReciterSelect: document.getElementById('mushafReciterSelect'),
      playReciterAudioBtn: document.getElementById('playReciterAudioBtn'),
      reciterPlayIcon: document.getElementById('reciterPlayIcon'),
      // Floating Glassmorphic Player & Audio Options Modal
      floatingControls: document.getElementById('mushafFloatingControls'),
      closeFloatingPlayerBtn: document.getElementById('closeFloatingPlayerBtn'),
      openFloatingPlayerBtn: document.getElementById('openFloatingPlayerBtn'),
      audioOptionsBtn: document.getElementById('audioOptionsBtn'),
      audioOptionsModal: document.getElementById('audioOptionsModal'),
      audioOptionsBackdrop: document.getElementById('audioOptionsBackdrop'),
      closeAudioOptionsBtn: document.getElementById('closeAudioOptionsBtn'),
      cancelAudioOptionsBtn: document.getElementById('cancelAudioOptionsBtn'),
      saveAudioOptionsBtn: document.getElementById('saveAudioOptionsBtn'),
      ayahRepeatChips: document.getElementById('ayahRepeatChips'),
      pageRepeatToggle: document.getElementById('pageRepeatToggle'),
      pageRepeatInputsContainer: document.getElementById('pageRepeatInputsContainer'),
      pageRepeatStartInput: document.getElementById('pageRepeatStartInput'),
      pageRepeatEndInput: document.getElementById('pageRepeatEndInput'),
      audioSpeedChips: document.getElementById('audioSpeedChips'),
      recitationStatusBadge: document.getElementById('recitationStatusBadge'),
      activeAyahMeta: document.getElementById('recitationActiveAyahMeta'),
      liveTranscript: document.getElementById('recitationLiveTranscript'),
      startRecitationBtn: document.getElementById('mushafStartRecitationBtn'),
      micIcon: document.getElementById('micIcon'),
      micBtnText: document.getElementById('micBtnText'),
      prevAyahBtn: document.getElementById('recitationPrevAyahBtn'),
      nextAyahBtn: document.getElementById('recitationNextAyahBtn'),
      resetAyahBtn: document.getElementById('recitationResetAyahBtn'),
      // Ayah Action Sheet & Note Modal
      actionSheetBackdrop: document.getElementById('actionSheetBackdrop'),
      ayahActionSheet: document.getElementById('ayahActionSheet'),
      actionSheetTitle: document.getElementById('actionSheetTitle'),
      closeActionSheetBtn: document.getElementById('closeActionSheetBtn'),
      setBookmarkAyahBtn: document.getElementById('setBookmarkAyahBtn'),
      setBookmarkBtnText: document.getElementById('setBookmarkBtnText'),
      toggleRedFlagAyahBtn: document.getElementById('toggleRedFlagAyahBtn'),
      toggleRedFlagBtnText: document.getElementById('toggleRedFlagBtnText'),
      addNoteAyahBtn: document.getElementById('addNoteAyahBtn'),
      addNoteBtnText: document.getElementById('addNoteBtnText'),
      playAyahAudioFromSheetBtn: document.getElementById('playAyahAudioFromSheetBtn'),
      startReciteFromSheetBtn: document.getElementById('startReciteFromSheetBtn'),
      ayahNoteModal: document.getElementById('ayahNoteModal'),
      noteModalTitle: document.getElementById('noteModalTitle'),
      ayahNoteInput: document.getElementById('ayahNoteInput'),
      deleteAyahNoteBtn: document.getElementById('deleteAyahNoteBtn'),
      closeAyahNoteBtn: document.getElementById('closeAyahNoteBtn'),
      saveAyahNoteBtn: document.getElementById('saveAyahNoteBtn'),
      // Off-canvas Surah Drawer
      surahDrawer: document.getElementById('mushafSurahDrawer'),
      drawerBackdrop: document.getElementById('mushafDrawerBackdrop'),
      closeSurahDrawerBtn: document.getElementById('closeSurahDrawerBtn'),
      drawerSearchInput: document.getElementById('drawerSurahSearchInput'),
      drawerList: document.getElementById('mushafDrawerList'),
      // Modern Settings Navigation & Subpages
      settingsMainPanel: document.getElementById('settingsMainPanel'),
      openReportsSubpageBtn: document.getElementById('openReportsSubpageBtn'),
      settingsReportsSubpage: document.getElementById('settingsReportsSubpage'),
      backFromReportsBtn: document.getElementById('backFromReportsBtn'),
      openSurahSettingsSubpageBtn: document.getElementById('openSurahSettingsSubpageBtn'),
      settingsSurahSubpage: document.getElementById('settingsSurahSubpage'),
      backFromSurahSettingsBtn: document.getElementById('backFromSurahSettingsBtn'),
      openPlanSettingsSubpageBtn: document.getElementById('openPlanSettingsSubpageBtn'),
      settingsPlanSubpage: document.getElementById('settingsPlanSubpage'),
      backFromPlanSettingsBtn: document.getElementById('backFromPlanSettingsBtn'),
      openBackupSubpageBtn: document.getElementById('openBackupSubpageBtn'),
      settingsBackupSubpage: document.getElementById('settingsBackupSubpage'),
      backFromBackupBtn: document.getElementById('backFromBackupBtn'),
      openDownloadMushafBtn: document.getElementById('openDownloadMushafBtn'),
      startMushafDownloadBtn: document.getElementById('startMushafDownloadBtn'),
      mushafDownloadBar: document.getElementById('mushafDownloadBar'),
      openScheduleSubpageBtn: document.getElementById('openScheduleSubpageBtn'),
      backFromScheduleBtn: document.getElementById('backFromScheduleBtn'),
      openCycleSettingsItemBtn: document.getElementById('openCycleSettingsItemBtn'),
      openUrgentExamSettingsRowBtn: document.getElementById('openUrgentExamSettingsRowBtn'),
      backFromExamBtn: document.getElementById('backFromExamBtn')
    };
  }

  // --- INITIALIZATION ---
  function initMushaf() {
    initDomReferences();
    if (!dom.view) return;

    // Restore saved page or default to 1
    const savedPage = parseInt(localStorage.getItem('tibyan_mushaf_page'), 10);
    if (savedPage && savedPage >= 1 && savedPage <= 604) {
      MushafState.currentPage = savedPage;
    } else {
      MushafState.currentPage = 1;
    }

    // Restore saved mask mode
    const savedMask = localStorage.getItem('tibyan_mushaf_mask_mode');
    MushafState.maskMode = savedMask || 'none';
    setMaskMode(MushafState.maskMode);

    initSurahDrawer();
    initSettingsSubpages();
    initMaskControls();
    initAyahActionSheetEvents();
    initReciterPlayer();
    initAudioOptionsModal();
    initMushafDownloader();
    attachEventListeners();
    setupSpeechRecognition();

    // Render initial page
    loadPage(MushafState.currentPage);
  }

  // --- OFF-CANVAS SURAH DRAWER ---

  function initSurahDrawer() {
    if (!dom.drawerList || !window.QURAN_SURAHS) return;

    renderDrawerList(window.QURAN_SURAHS);

    // Search filter input
    if (dom.drawerSearchInput) {
      dom.drawerSearchInput.addEventListener('input', (e) => {
        const query = normalizeArabicText(e.target.value);
        if (!query) {
          renderDrawerList(window.QURAN_SURAHS);
          return;
        }

        const filtered = window.QURAN_SURAHS.filter(s => {
          const normName = normalizeArabicText(s.name);
          const numStr = String(s.id);
          return normName.includes(query) || numStr === query;
        });

        renderDrawerList(filtered);
      });
    }

    // Open Drawer
    if (dom.openSurahDrawerBtn) {
      dom.openSurahDrawerBtn.addEventListener('click', openSurahDrawer);
    }

    // Close Drawer
    if (dom.closeSurahDrawerBtn) {
      dom.closeSurahDrawerBtn.addEventListener('click', closeSurahDrawer);
    }
    if (dom.drawerBackdrop) {
      dom.drawerBackdrop.addEventListener('click', closeSurahDrawer);
    }
  }

  function renderDrawerList(surahList) {
    if (!dom.drawerList) return;
    dom.drawerList.innerHTML = '';

    if (!surahList.length) {
      dom.drawerList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          لا توجد سورة مطابقة لنتيجة البحث
        </div>
      `;
      return;
    }

    surahList.forEach(s => {
      const item = document.createElement('div');
      item.className = 'drawer-surah-item';
      if (s.id === MushafState.activeSurahId) {
        item.classList.add('active');
      }
      item.setAttribute('data-id', s.id);
      item.setAttribute('data-page', s.startPage);

      const typeClass = s.type === 'مكية' ? 'makki' : 'madani';

      item.innerHTML = `
        <div class="drawer-surah-num">${s.id}</div>
        <div class="drawer-surah-info">
          <div class="drawer-surah-name">سورة ${s.name}</div>
          <div class="drawer-surah-meta">
            <span class="drawer-type-badge ${typeClass}">${s.type}</span>
            <span>${s.verses} آية</span>
          </div>
        </div>
        <span class="drawer-surah-page">ص ${s.startPage}</span>
      `;

      item.addEventListener('click', () => {
        loadPage(s.startPage);
        closeSurahDrawer();
      });

      dom.drawerList.appendChild(item);
    });
  }

  function openSurahDrawer() {
    if (!dom.surahDrawer || !dom.drawerBackdrop) return;
    dom.drawerBackdrop.hidden = false;
    dom.surahDrawer.hidden = false;
    document.body.classList.add('drawer-open-lock');

    // Small delay to trigger CSS transition
    requestAnimationFrame(() => {
      dom.surahDrawer.classList.remove('drawer-closed');
      highlightCurrentSurahInDrawer();
      if (dom.drawerSearchInput) {
        dom.drawerSearchInput.value = '';
        renderDrawerList(window.QURAN_SURAHS || []);
      }
    });
  }

  function closeSurahDrawer() {
    if (!dom.surahDrawer || !dom.drawerBackdrop) return;
    dom.surahDrawer.classList.add('drawer-closed');
    document.body.classList.remove('drawer-open-lock');
    setTimeout(() => {
      dom.surahDrawer.hidden = true;
      dom.drawerBackdrop.hidden = true;
    }, 280);
  }

  function highlightCurrentSurahInDrawer() {
    if (!dom.drawerList) return;
    dom.drawerList.querySelectorAll('.drawer-surah-item').forEach(item => {
      const sId = parseInt(item.getAttribute('data-id'), 10);
      if (sId === MushafState.activeSurahId) {
        item.classList.add('active');
        setTimeout(() => {
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      } else {
        item.classList.remove('active');
      }
    });
  }

  // --- MASK / BLUR MODE CONTROLS ---

  function initMaskControls() {
    if (dom.toggleMaskBtn) {
      dom.toggleMaskBtn.addEventListener('click', toggleMaskMode);
    }
  }

  function toggleMaskMode() {
    const nextMode = (MushafState.maskMode === 'none' || !MushafState.maskMode) ? 'verse' : 'none';
    setMaskMode(nextMode);
    if (window.showToast) {
      window.showToast(nextMode === 'verse' ? 'تم إخفاء الآيات للتسميع' : 'تم إظهار الآيات');
    }
  }

  function setMaskMode(mode) {
    MushafState.maskMode = mode;
    localStorage.setItem('tibyan_mushaf_mask_mode', mode);

    if (mode === 'none') {
      if (dom.pageWrapper) {
        dom.pageWrapper.classList.remove('mask-mode-active', 'mask-mode-word', 'mask-mode-verse');
      }
      if (dom.toggleMaskBtn) {
        dom.toggleMaskBtn.classList.remove('active');
        dom.toggleMaskBtn.title = 'إخفاء الآيات';
      }
      if (dom.maskEyeIcon) {
        dom.maskEyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    } else {
      if (dom.pageWrapper) {
        dom.pageWrapper.classList.add('mask-mode-active', 'mask-mode-verse');
        dom.pageWrapper.classList.remove('mask-mode-word');
      }
      if (dom.toggleMaskBtn) {
        dom.toggleMaskBtn.classList.add('active');
        dom.toggleMaskBtn.title = 'إظهار الآيات';
      }
      if (dom.maskEyeIcon) {
        dom.maskEyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      }
    }

    highlightActiveAyahPolygon();
  }

  function initSettingsSubpages() {
    // If showSettingsSubpage is already managed by app.js, avoid duplicate listeners
    if (typeof window.showSettingsSubpage === 'function') {
      return;
    }

    // Fallback if app.js is not loaded
    if (dom.openReportsSubpageBtn && dom.settingsReportsSubpage && dom.settingsMainPanel) {
      dom.openReportsSubpageBtn.addEventListener('click', () => {
        dom.settingsMainPanel.hidden = true;
        dom.settingsReportsSubpage.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.renderReports) window.renderReports();
      });
    }

    if (dom.backFromReportsBtn && dom.settingsReportsSubpage && dom.settingsMainPanel) {
      dom.backFromReportsBtn.addEventListener('click', () => {
        dom.settingsReportsSubpage.hidden = true;
        dom.settingsMainPanel.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (dom.openSurahSettingsSubpageBtn && dom.settingsSurahSubpage && dom.settingsMainPanel) {
      dom.openSurahSettingsSubpageBtn.addEventListener('click', () => {
        dom.settingsMainPanel.hidden = true;
        dom.settingsSurahSubpage.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.populateSettingsForm) window.populateSettingsForm();
      });
    }

    if (dom.backFromSurahSettingsBtn && dom.settingsSurahSubpage && dom.settingsMainPanel) {
      dom.backFromSurahSettingsBtn.addEventListener('click', () => {
        dom.settingsSurahSubpage.hidden = true;
        dom.settingsMainPanel.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (dom.openPlanSettingsSubpageBtn && dom.settingsPlanSubpage && dom.settingsMainPanel) {
      dom.openPlanSettingsSubpageBtn.addEventListener('click', () => {
        dom.settingsMainPanel.hidden = true;
        dom.settingsPlanSubpage.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.populatePlanSettingsForm) window.populatePlanSettingsForm();
      });
    }

    if (dom.backFromPlanSettingsBtn && dom.settingsPlanSubpage && dom.settingsMainPanel) {
      dom.backFromPlanSettingsBtn.addEventListener('click', () => {
        dom.settingsPlanSubpage.hidden = true;
        dom.settingsMainPanel.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (dom.openBackupSubpageBtn && dom.settingsBackupSubpage && dom.settingsMainPanel) {
      dom.openBackupSubpageBtn.addEventListener('click', () => {
        dom.settingsMainPanel.hidden = true;
        dom.settingsBackupSubpage.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (dom.backFromBackupBtn && dom.settingsBackupSubpage && dom.settingsMainPanel) {
      dom.backFromBackupBtn.addEventListener('click', () => {
        dom.settingsBackupSubpage.hidden = true;
        dom.settingsMainPanel.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    const openSchedBtn = dom.openScheduleSubpageBtn || dom.openCycleSettingsItemBtn;
    if (openSchedBtn) {
      openSchedBtn.addEventListener('click', () => {
        if (typeof window.showSettingsSubpage === 'function') {
          window.showSettingsSubpage('settingsScheduleSubpage');
          if (typeof window.renderTenDayScheduleTable === 'function') window.renderTenDayScheduleTable();
          if (typeof window.renderWeeklyScheduleView === 'function') window.renderWeeklyScheduleView();
        }
      });
    }

    if (dom.backFromScheduleBtn) {
      dom.backFromScheduleBtn.addEventListener('click', () => {
        if (typeof window.hideSettingsSubpages === 'function') {
          window.hideSettingsSubpages();
        }
      });
    }

    // 6. Urgent Exam Row & Subpage
    if (dom.openUrgentExamSettingsRowBtn) {
      dom.openUrgentExamSettingsRowBtn.addEventListener('click', () => {
        if (typeof window.showSettingsSubpage === 'function') {
          window.showSettingsSubpage('settingsExamSubpage');
          if (typeof window.populateExamSurahSelects === 'function') window.populateExamSurahSelects();
          if (typeof window.renderUrgentExamModal === 'function') window.renderUrgentExamModal();
        }
      });
    }

    if (dom.backFromExamBtn) {
      dom.backFromExamBtn.addEventListener('click', () => {
        if (typeof window.hideSettingsSubpages === 'function') {
          window.hideSettingsSubpages();
        }
      });
    }
  }

  // --- AYAH ACTION SHEET, BOOKMARK, RED FLAG & NOTES ---

  let selectedAyahContext = null;

  function isBookmarked(surah, ayah) {
    if (!window.AppState || !window.AppState.ayahBookmarks) return false;
    const bm = window.AppState.ayahBookmarks;
    return bm.surah === surah && bm.ayah === ayah;
  }

  function isFlagged(surah, ayah) {
    if (!window.AppState || !window.AppState.flaggedAyahs) return false;
    return window.AppState.flaggedAyahs.includes(`${surah}:${ayah}`);
  }

  function hasNote(surah, ayah) {
    if (!window.AppState || !window.AppState.ayahNotes) return false;
    const n = window.AppState.ayahNotes[`${surah}:${ayah}`];
    return typeof n === 'string' && n.trim().length > 0;
  }

  function openAyahActionSheet(surahNum, ayahNum) {
    selectedAyahContext = { surah: surahNum, ayah: ayahNum };
    selectActiveAyah(surahNum, ayahNum, false);

    const surahObj = window.getSurahById ? window.getSurahById(surahNum) : null;
    const sName = surahObj ? surahObj.name : `السورة ${surahNum}`;

    if (dom.actionSheetTitle) {
      dom.actionSheetTitle.textContent = `سورة ${sName} | الآية ${ayahNum}`;
    }

    const isBm = isBookmarked(surahNum, ayahNum);
    if (dom.setBookmarkBtnText) {
      dom.setBookmarkBtnText.textContent = isBm ? 'إزالة علامة التوقف (فاصل القراءة)' : 'وضع علامة توقف (حفظ فاصل القراءة)';
    }

    const isFl = isFlagged(surahNum, ayahNum);
    if (dom.toggleRedFlagBtnText) {
      dom.toggleRedFlagBtnText.textContent = isFl ? 'إلغاء التعليم الأحمر (تم الإتقان)' : 'تعليم باللون الأحمر (تحتاج مراجعة وتثبيت)';
    }

    const hasN = hasNote(surahNum, ayahNum);
    if (dom.addNoteBtnText) {
      dom.addNoteBtnText.textContent = hasN ? 'تعديل الملاحظة أو المتشابهات' : 'تدوين ملاحظة أو متشابهات';
    }

    if (dom.actionSheetBackdrop) dom.actionSheetBackdrop.classList.add('active');
    if (dom.ayahActionSheet) dom.ayahActionSheet.classList.add('active');
  }

  function closeAyahActionSheet() {
    if (dom.actionSheetBackdrop) dom.actionSheetBackdrop.classList.remove('active');
    if (dom.ayahActionSheet) dom.ayahActionSheet.classList.remove('active');
  }

  function closeAyahNoteModal() {
    if (dom.ayahNoteModal) {
      dom.ayahNoteModal.hidden = true;
      dom.ayahNoteModal.style.display = 'none';
    }
  }

  function refreshPolygonsDecoration() {
    if (!dom.overlaySvg) return;
    dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
      const s = parseInt(p.getAttribute('data-surah'), 10);
      const a = parseInt(p.getAttribute('data-ayah'), 10);

      if (isBookmarked(s, a)) p.classList.add('bookmarked-ayah');
      else p.classList.remove('bookmarked-ayah');

      if (isFlagged(s, a)) p.classList.add('flagged-red-ayah');
      else p.classList.remove('flagged-red-ayah');

      if (hasNote(s, a)) p.classList.add('has-note-ayah');
      else p.classList.remove('has-note-ayah');
    });
  }

  function initAyahActionSheetEvents() {
    // Backdrop click
    if (dom.actionSheetBackdrop) {
      dom.actionSheetBackdrop.addEventListener('click', closeAyahActionSheet);
    }
    // Close button
    if (dom.closeActionSheetBtn) {
      dom.closeActionSheetBtn.addEventListener('click', closeAyahActionSheet);
    }

    // Bookmark Toggle
    if (dom.setBookmarkAyahBtn) {
      dom.setBookmarkAyahBtn.addEventListener('click', () => {
        if (!selectedAyahContext) return;
        if (!window.AppState) window.AppState = {};
        const { surah, ayah } = selectedAyahContext;
        const isBm = isBookmarked(surah, ayah);
        if (isBm) {
          window.AppState.ayahBookmarks = null;
          if (window.showToast) window.showToast('تمت إزالة علامة التوقف');
        } else {
          window.AppState.ayahBookmarks = { page: MushafState.currentPage, surah, ayah };
          if (window.showToast) window.showToast('تم حفظ فاصل القراءة (علامة التوقف) بنجاح');
        }
        if (window.persistState) window.persistState();
        refreshPolygonsDecoration();
        closeAyahActionSheet();
      });
    }

    // Red Flag Toggle
    if (dom.toggleRedFlagAyahBtn) {
      dom.toggleRedFlagAyahBtn.addEventListener('click', () => {
        if (!selectedAyahContext) return;
        if (!window.AppState) window.AppState = {};
        if (!Array.isArray(window.AppState.flaggedAyahs)) window.AppState.flaggedAyahs = [];
        const key = `${selectedAyahContext.surah}:${selectedAyahContext.ayah}`;
        const idx = window.AppState.flaggedAyahs.indexOf(key);
        if (idx >= 0) {
          window.AppState.flaggedAyahs.splice(idx, 1);
          if (window.showToast) window.showToast('تمت إزالة علامة المراجعة');
        } else {
          window.AppState.flaggedAyahs.push(key);
          if (window.showToast) window.showToast('تم وضع علامة حمراء: تحتاج لمراجعة وتثبيت');
        }
        if (window.persistState) window.persistState();
        refreshPolygonsDecoration();
        closeAyahActionSheet();
      });
    }

    // Note Modal Open
    if (dom.addNoteAyahBtn) {
      dom.addNoteAyahBtn.addEventListener('click', () => {
        if (!selectedAyahContext) return;
        closeAyahActionSheet();
        const { surah, ayah } = selectedAyahContext;
        const key = `${surah}:${ayah}`;
        const surahObj = window.getSurahById ? window.getSurahById(surah) : null;
        const sName = surahObj ? surahObj.name : `السورة ${surah}`;

        if (dom.noteModalTitle) {
          dom.noteModalTitle.textContent = `ملاحظات ومتشابهات: سورة ${sName} آية ${ayah}`;
        }
        if (dom.ayahNoteInput) {
          const existing = (window.AppState && window.AppState.ayahNotes && window.AppState.ayahNotes[key]) || '';
          dom.ayahNoteInput.value = existing;
        }
        if (dom.ayahNoteModal) {
          dom.ayahNoteModal.hidden = false;
          dom.ayahNoteModal.style.display = 'flex';
          if (dom.ayahNoteInput) dom.ayahNoteInput.focus();
        }
      });
    }

    // Save Note
    if (dom.saveAyahNoteBtn) {
      dom.saveAyahNoteBtn.addEventListener('click', () => {
        if (!selectedAyahContext) return;
        const key = `${selectedAyahContext.surah}:${selectedAyahContext.ayah}`;
        const val = dom.ayahNoteInput ? dom.ayahNoteInput.value.trim() : '';
        if (!window.AppState) window.AppState = {};
        if (!window.AppState.ayahNotes) window.AppState.ayahNotes = {};

        if (val) {
          window.AppState.ayahNotes[key] = val;
          if (window.showToast) window.showToast('تم حفظ ملاحظة الآية بنجاح');
        } else {
          delete window.AppState.ayahNotes[key];
          if (window.showToast) window.showToast('تم إفراغ ملاحظة الآية');
        }
        if (window.persistState) window.persistState();
        refreshPolygonsDecoration();
        closeAyahNoteModal();
      });
    }

    // Delete Note
    if (dom.deleteAyahNoteBtn) {
      dom.deleteAyahNoteBtn.addEventListener('click', () => {
        if (!selectedAyahContext) return;
        const key = `${selectedAyahContext.surah}:${selectedAyahContext.ayah}`;
        if (window.AppState && window.AppState.ayahNotes) {
          delete window.AppState.ayahNotes[key];
        }
        if (window.persistState) window.persistState();
        refreshPolygonsDecoration();
        closeAyahNoteModal();
        if (window.showToast) window.showToast('تم حذف الملاحظة');
      });
    }

    // Close Note Modal
    if (dom.closeAyahNoteBtn) {
      dom.closeAyahNoteBtn.addEventListener('click', closeAyahNoteModal);
    }
  }

  // --- RECITER AUDIO PLAYER (REAL-TIME AYAH TRACKING, REPEAT & SPEED OPTIONS) ---

  const ReciterPlayer = {
    audio: new Audio(),
    isPlaying: false,
    currentSurah: 1,
    currentAyah: 1,
    reciter: 'Abdurrahmaan_As-Sudais_192kbps',
    ayahRepeatCount: 1,
    ayahCurrentPlayed: 0,
    speed: 1.0,
    pageRepeatEnabled: false,
    pageRepeatStart: 1,
    pageRepeatEnd: 1
  };

  let tempAudioOptions = {
    ayahRepeat: 1,
    pageRepeatEnabled: false,
    pageRepeatStart: 1,
    pageRepeatEnd: 1,
    speed: 1.0
  };

  function initReciterPlayer() {
    ReciterPlayer.audio.addEventListener('ended', onReciterAudioEnded);
    ReciterPlayer.audio.addEventListener('error', onReciterAudioError);

    if (dom.playReciterAudioBtn) {
      dom.playReciterAudioBtn.addEventListener('click', toggleReciterAudio);
    }
    if (dom.playAyahAudioFromSheetBtn) {
      dom.playAyahAudioFromSheetBtn.addEventListener('click', () => {
        if (!selectedAyahContext) return;
        closeAyahActionSheet();
        playReciterAyah(selectedAyahContext.surah, selectedAyahContext.ayah);
      });
    }
    if (dom.startReciteFromSheetBtn) {
      dom.startReciteFromSheetBtn.addEventListener('click', () => {
        if (!selectedAyahContext) return;
        closeAyahActionSheet();
        selectActiveAyah(selectedAyahContext.surah, selectedAyahContext.ayah, true);
        startRecitation();
      });
    }
  }

  function initAudioOptionsModal() {
    // Open Options Modal
    if (dom.audioOptionsBtn) {
      dom.audioOptionsBtn.addEventListener('click', openAudioOptionsModal);
    }

    // Close / Cancel Modal
    if (dom.closeAudioOptionsBtn) {
      dom.closeAudioOptionsBtn.addEventListener('click', closeAudioOptionsModal);
    }
    if (dom.cancelAudioOptionsBtn) {
      dom.cancelAudioOptionsBtn.addEventListener('click', closeAudioOptionsModal);
    }
    if (dom.audioOptionsBackdrop) {
      dom.audioOptionsBackdrop.addEventListener('click', closeAudioOptionsModal);
    }

    // Toggle Page Repeat
    if (dom.pageRepeatToggle) {
      dom.pageRepeatToggle.addEventListener('change', (e) => {
        tempAudioOptions.pageRepeatEnabled = e.target.checked;
        if (dom.pageRepeatInputsContainer) {
          dom.pageRepeatInputsContainer.style.opacity = e.target.checked ? '1' : '0.45';
          dom.pageRepeatInputsContainer.style.pointerEvents = e.target.checked ? 'auto' : 'none';
        }
      });
    }

    // Ayah Repeat Chips
    if (dom.ayahRepeatChips) {
      dom.ayahRepeatChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.opt-chip');
        if (!chip) return;
        dom.ayahRepeatChips.querySelectorAll('.opt-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const rVal = chip.getAttribute('data-repeat');
        tempAudioOptions.ayahRepeat = (rVal === 'Infinity') ? Infinity : parseInt(rVal, 10);
      });
    }

    // Audio Speed Chips
    if (dom.audioSpeedChips) {
      dom.audioSpeedChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.opt-chip');
        if (!chip) return;
        dom.audioSpeedChips.querySelectorAll('.opt-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        tempAudioOptions.speed = parseFloat(chip.getAttribute('data-speed'));
      });
    }

    // Save Options
    if (dom.saveAudioOptionsBtn) {
      dom.saveAudioOptionsBtn.addEventListener('click', saveAudioOptions);
    }

    // Close / Open Floating Player Pill
    if (dom.closeFloatingPlayerBtn) {
      dom.closeFloatingPlayerBtn.addEventListener('click', () => {
        if (dom.floatingControls) dom.floatingControls.style.display = 'none';
        if (dom.openFloatingPlayerBtn) dom.openFloatingPlayerBtn.style.display = 'inline-flex';
      });
    }

    if (dom.openFloatingPlayerBtn) {
      dom.openFloatingPlayerBtn.addEventListener('click', () => {
        if (dom.floatingControls) dom.floatingControls.style.display = 'block';
        if (dom.openFloatingPlayerBtn) dom.openFloatingPlayerBtn.style.display = 'none';
      });
    }
  }

  function openAudioOptionsModal() {
    tempAudioOptions = {
      ayahRepeat: ReciterPlayer.ayahRepeatCount,
      pageRepeatEnabled: ReciterPlayer.pageRepeatEnabled,
      pageRepeatStart: ReciterPlayer.pageRepeatStart || MushafState.currentPage,
      pageRepeatEnd: ReciterPlayer.pageRepeatEnd || MushafState.currentPage,
      speed: ReciterPlayer.speed
    };

    // Update Ayah Repeat Chips
    if (dom.ayahRepeatChips) {
      dom.ayahRepeatChips.querySelectorAll('.opt-chip').forEach(chip => {
        const r = chip.getAttribute('data-repeat');
        const isMatch = (r === 'Infinity' && tempAudioOptions.ayahRepeat === Infinity) ||
                        (parseInt(r, 10) === tempAudioOptions.ayahRepeat);
        chip.classList.toggle('active', isMatch);
      });
    }

    // Update Page Repeat Toggle & Inputs
    if (dom.pageRepeatToggle) {
      dom.pageRepeatToggle.checked = tempAudioOptions.pageRepeatEnabled;
    }
    if (dom.pageRepeatInputsContainer) {
      dom.pageRepeatInputsContainer.style.opacity = tempAudioOptions.pageRepeatEnabled ? '1' : '0.45';
      dom.pageRepeatInputsContainer.style.pointerEvents = tempAudioOptions.pageRepeatEnabled ? 'auto' : 'none';
    }
    if (dom.pageRepeatStartInput) {
      dom.pageRepeatStartInput.value = tempAudioOptions.pageRepeatStart;
    }
    if (dom.pageRepeatEndInput) {
      dom.pageRepeatEndInput.value = tempAudioOptions.pageRepeatEnd;
    }

    // Update Speed Chips
    if (dom.audioSpeedChips) {
      dom.audioSpeedChips.querySelectorAll('.opt-chip').forEach(chip => {
        const s = parseFloat(chip.getAttribute('data-speed'));
        chip.classList.toggle('active', Math.abs(s - tempAudioOptions.speed) < 0.01);
      });
    }

    if (dom.audioOptionsBackdrop) dom.audioOptionsBackdrop.hidden = false;
    if (dom.audioOptionsModal) dom.audioOptionsModal.hidden = false;
  }

  function closeAudioOptionsModal() {
    if (dom.audioOptionsBackdrop) dom.audioOptionsBackdrop.hidden = true;
    if (dom.audioOptionsModal) dom.audioOptionsModal.hidden = true;
  }

  function saveAudioOptions() {
    ReciterPlayer.ayahRepeatCount = tempAudioOptions.ayahRepeat;
    ReciterPlayer.speed = tempAudioOptions.speed;
    if (ReciterPlayer.audio) {
      ReciterPlayer.audio.playbackRate = ReciterPlayer.speed;
    }

    ReciterPlayer.pageRepeatEnabled = tempAudioOptions.pageRepeatEnabled;
    if (ReciterPlayer.pageRepeatEnabled) {
      let startP = parseInt(dom.pageRepeatStartInput.value, 10) || 1;
      let endP = parseInt(dom.pageRepeatEndInput.value, 10) || 1;
      if (startP < 1) startP = 1;
      if (startP > 604) startP = 604;
      if (endP < startP) endP = startP;
      if (endP > 604) endP = 604;
      ReciterPlayer.pageRepeatStart = startP;
      ReciterPlayer.pageRepeatEnd = endP;
    }

    // Highlight options button if custom options are active
    if (dom.audioOptionsBtn) {
      const hasCustom = (ReciterPlayer.ayahRepeatCount > 1) || ReciterPlayer.pageRepeatEnabled || (ReciterPlayer.speed !== 1.0);
      dom.audioOptionsBtn.classList.toggle('has-active-options', hasCustom);
    }

    closeAudioOptionsModal();

    if (window.showToast) {
      let msg = `تم تفعيل خيارات التلاوة (السرعة: ${ReciterPlayer.speed}x`;
      if (ReciterPlayer.ayahRepeatCount > 1) {
        msg += ` - تكرار الآية: ${ReciterPlayer.ayahRepeatCount === Infinity ? 'مستمر' : ReciterPlayer.ayahRepeatCount + ' مرات'}`;
      }
      if (ReciterPlayer.pageRepeatEnabled) {
        msg += ` - تكرار ص${ReciterPlayer.pageRepeatStart} إلى ص${ReciterPlayer.pageRepeatEnd}`;
      }
      msg += ')';
      window.showToast(msg);
    }
  }

  function getReciterAudioUrl(reciter, surah, ayah) {
    const sPad = String(surah).padStart(3, '0');
    const aPad = String(ayah).padStart(3, '0');
    return `https://everyayah.com/data/${reciter}/${sPad}${aPad}.mp3`;
  }

  function playReciterAyah(surah, ayah, isRepeat = false) {
    ReciterPlayer.currentSurah = surah;
    ReciterPlayer.currentAyah = ayah;
    if (!isRepeat) {
      ReciterPlayer.ayahCurrentPlayed = 0;
    }

    const reciter = (dom.mushafReciterSelect && dom.mushafReciterSelect.value) || 'Abdurrahmaan_As-Sudais_192kbps';
    ReciterPlayer.reciter = reciter;

    const url = getReciterAudioUrl(reciter, surah, ayah);
    ReciterPlayer.audio.src = url;
    ReciterPlayer.audio.playbackRate = ReciterPlayer.speed || 1.0;
    ReciterPlayer.audio.play().then(() => {
      ReciterPlayer.isPlaying = true;
      updateReciterUI();
      highlightAudioAyah(surah, ayah);
    }).catch(err => {
      console.warn('Playback error:', err);
      ReciterPlayer.isPlaying = false;
      updateReciterUI();
    });
  }

  function toggleReciterAudio() {
    if (ReciterPlayer.isPlaying) {
      pauseReciterAudio();
    } else {
      const s = MushafState.activeSurahId || 1;
      const a = MushafState.activeAyahNum || 1;
      playReciterAyah(s, a);
    }
  }

  function pauseReciterAudio() {
    ReciterPlayer.audio.pause();
    ReciterPlayer.isPlaying = false;
    updateReciterUI();
    clearAudioHighlight();
  }

  function onReciterAudioEnded() {
    // 1. تكرار الآية الحالية إذا كان محدداً
    ReciterPlayer.ayahCurrentPlayed++;
    const repCount = ReciterPlayer.ayahRepeatCount;
    if (repCount === Infinity || ReciterPlayer.ayahCurrentPlayed < repCount) {
      playReciterAyah(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah, true);
      return;
    }
    ReciterPlayer.ayahCurrentPlayed = 0;

    // 2. حساب الآية التالية
    const curSurah = ReciterPlayer.currentSurah;
    const curAyah = ReciterPlayer.currentAyah;
    const surahObj = window.getSurahById ? window.getSurahById(curSurah) : null;
    const maxVerses = surahObj ? surahObj.verses : 286;

    let nextSurah = curSurah;
    let nextAyah = curAyah + 1;

    if (nextAyah > maxVerses) {
      if (nextSurah < 114) {
        nextSurah++;
        nextAyah = 1;
      } else {
        pauseReciterAudio();
        if (window.showToast) window.showToast('اكتملت التلاوة بحمد الله');
        return;
      }
    }

    // 3. التحقق من وجود الآية في الصفحة الحالية أو الانتقال للصفحة التالية / التكرار
    const isOnCurrentPage = MushafState.pagePolygons.some(
      p => p.surahNumber === nextSurah && p.ayahNumber === nextAyah
    );

    if (!isOnCurrentPage) {
      const nextPage = MushafState.currentPage + 1;
      // إذا كان تكرار من صفحة إلى صفحة مفعلاً
      if (ReciterPlayer.pageRepeatEnabled && nextPage > ReciterPlayer.pageRepeatEnd) {
        // العودة إلى صفحة البداية
        loadPage(ReciterPlayer.pageRepeatStart).then(() => {
          const firstVerse = MushafState.pageVerses && MushafState.pageVerses[0];
          if (firstVerse) {
            playReciterAyah(firstVerse.surah, firstVerse.ayah);
          }
        });
        return;
      }

      if (nextPage <= 604) {
        loadPage(nextPage).then(() => {
          playReciterAyah(nextSurah, nextAyah);
        });
      } else {
        pauseReciterAudio();
      }
    } else {
      playReciterAyah(nextSurah, nextAyah);
    }
  }

  function onReciterAudioError() {
    ReciterPlayer.isPlaying = false;
    updateReciterUI();
    clearAudioHighlight();
    if (window.showToast) window.showToast('تعذر تشغيل الصوت، يرجى التحقق من اتصال الإنترنت');
  }

  function updateReciterUI() {
    if (!dom.playReciterAudioBtn || !dom.reciterPlayIcon) return;
    if (ReciterPlayer.isPlaying) {
      dom.playReciterAudioBtn.classList.add('playing');
      dom.playReciterAudioBtn.title = 'إيقاف تلاوة القارئ';
      dom.reciterPlayIcon.innerHTML = `
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      `;
    } else {
      dom.playReciterAudioBtn.classList.remove('playing');
      dom.playReciterAudioBtn.title = 'تشغيل تلاوة القارئ';
      dom.reciterPlayIcon.innerHTML = `
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      `;
    }
  }

  function highlightAudioAyah(surah, ayah) {
    if (!dom.overlaySvg) return;
    dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
      p.classList.remove('audio-playing-ayah');
    });
    const targetPoly = dom.overlaySvg.querySelector(`#poly-${surah}-${ayah}`);
    if (targetPoly) {
      targetPoly.classList.add('audio-playing-ayah');
    }
    selectActiveAyah(surah, ayah, false);
  }

  function clearAudioHighlight() {
    if (!dom.overlaySvg) return;
    dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
      p.classList.remove('audio-playing-ayah');
    });
  }

  // --- OFFLINE MUSHAF DOWNLOADER ---

  const MUSHAF_CACHE_NAME = 'tibyan-mushaf-pages-v1';

  function initMushafDownloader() {
    if (dom.openDownloadMushafBtn) {
      dom.openDownloadMushafBtn.addEventListener('click', () => {
        if (typeof window.showSettingsSubpage === 'function') {
          window.showSettingsSubpage('settingsDownloadSubpage');
        } else {
          if (dom.settingsMainPanel) dom.settingsMainPanel.hidden = true;
          const dlSub = document.getElementById('settingsDownloadSubpage');
          if (dlSub) dlSub.hidden = false;
        }
      });
    }

    if (dom.startMushafDownloadBtn) {
      dom.startMushafDownloadBtn.addEventListener('click', startOfflineMushafDownload);
    }
  }

  async function startOfflineMushafDownload() {
    if (!('caches' in window)) {
      alert('متصفحك لا يدعم خاصية التخزين المحلي Offline Cache');
      return;
    }

    const btn = dom.startMushafDownloadBtn;
    const bar = dom.mushafDownloadBar;
    const status = dom.mushafDownloadStatus;

    btn.disabled = true;
    btn.textContent = 'جاري التحميل في الخلفية...';

    try {
      const cache = await caches.open(MUSHAF_CACHE_NAME);
      let completed = 0;
      const total = 604;
      const batchSize = 6;

      for (let i = 1; i <= total; i += batchSize) {
        const batch = [];
        for (let j = i; j < i + batchSize && j <= total; j++) {
          const pad = String(j).padStart(3, '0');
          const svgUrl = `https://cdn.quran.ws/svg/pages/v1.1.1/hafs-kfqc/${pad}.svg`;
          const jsonUrl = `https://cdn.quran.ws/svg/pages/v1.1.1/hafs-kfqc/${pad}.json`;

          batch.push(
            Promise.all([
              fetch(svgUrl).then(r => r.ok ? cache.put(svgUrl, r) : null).catch(() => {}),
              fetch(jsonUrl).then(r => r.ok ? cache.put(jsonUrl, r) : null).catch(() => {})
            ]).then(() => {
              completed++;
              const pct = Math.round((completed / total) * 100);
              if (bar) bar.style.width = `${pct}%`;
              if (status) status.textContent = `تم تحميل صفحة ${completed} من ${total} (${pct}%)`;
            })
          );
        }
        await Promise.all(batch);
      }

      if (status) {
        status.textContent = 'اكتمل تحميل المصحف الشريف بالكامل (604 صفحة) بنجاح! يعمل الآن بدون إنترنت.';
      }
      btn.disabled = false;
      btn.textContent = 'إعادة فحص / تحديث تحميل المصحف';
      if (window.showToast) window.showToast('اكتمل تحميل المصحف للعمل بدون إنترنت بنجاح');
    } catch (err) {
      console.warn('Error downloading Mushaf offline:', err);
      btn.disabled = false;
      btn.textContent = 'استئناف التحميل';
      if (status) status.textContent = 'حدث انقطاع في الاتصال أثناء التحميل. اضغط استئناف للمتابعة.';
    }
  }

  // --- PAGE DATA FETCHING & RENDERING ---

  async function loadPage(pageNum) {
    if (pageNum < 1) pageNum = 1;
    if (pageNum > 604) pageNum = 604;

    MushafState.currentPage = pageNum;
    localStorage.setItem('tibyan_mushaf_page', pageNum);

    if (dom.pageInput) dom.pageInput.value = pageNum;
    if (dom.inpageNumber) dom.inpageNumber.textContent = pageNum;

    // Update Header Meta
    updatePageMetaHeader(pageNum);

    // Show loading state
    if (dom.loader) dom.loader.style.display = 'flex';

    // ViewBox standard
    const isSpecialFirstPages = (pageNum === 1 || pageNum === 2);
    MushafState.pageViewBox = isSpecialFirstPages ? '-53.3109 -198.4777 345 550' : '0 0 345 550';
    if (dom.overlaySvg) {
      dom.overlaySvg.setAttribute('viewBox', MushafState.pageViewBox);
      dom.overlaySvg.innerHTML = '';
    }

    const pad = String(pageNum).padStart(3, '0');
    const cacheKey = `p_${pageNum}`;

    try {
      let pageData = MushafState.cache.get(cacheKey);

      if (!pageData) {
        const svgUrl = `https://cdn.quran.ws/svg/pages/v1.1.1/hafs-kfqc/${pad}.svg`;
        const jsonUrl = `https://cdn.quran.ws/svg/pages/v1.1.1/hafs-kfqc/${pad}.json`;
        const versesUrl = `https://api.quran.com/api/v4/quran/verses/imlaei?page_number=${pageNum}`;

        let svgText = null;
        let polygons = [];
        let verses = [];

        // Check Offline CacheStorage first
        if ('caches' in window) {
          try {
            const cache = await caches.open(MUSHAF_CACHE_NAME);
            const cachedSvg = await cache.match(svgUrl);
            const cachedJson = await cache.match(jsonUrl);
            if (cachedSvg) svgText = await cachedSvg.text();
            if (cachedJson) polygons = await cachedJson.json();
          } catch (e) {}
        }

        const fetchTasks = [];
        if (!svgText) {
          fetchTasks.push(fetch(svgUrl).then(r => r.ok ? r.text() : null).then(t => { if (t) svgText = t; }).catch(() => {}));
        }
        if (!polygons || !polygons.length) {
          fetchTasks.push(fetch(jsonUrl).then(r => r.ok ? r.json() : []).then(j => { if (j && j.length) polygons = j; }).catch(() => {}));
        }
        fetchTasks.push(fetch(versesUrl).then(r => r.ok ? r.json() : { verses: [] }).then(v => { verses = (v && v.verses) ? v.verses : []; }).catch(() => {}));

        if (fetchTasks.length) {
          await Promise.allSettled(fetchTasks);
        }

        pageData = { svgText, polygons, verses };
        MushafState.cache.set(cacheKey, pageData);
      }

      // Render Image or SVG
      renderPageVisual(pageData.svgText, pad);

      // Render Polygons Overlay
      MushafState.pagePolygons = pageData.polygons || [];
      MushafState.pageVerses = pageData.verses || [];
      renderPolygonsOverlay(MushafState.pagePolygons);

      // Set default active Ayah on this page
      setupInitialActiveAyahForPage();

      // Background preload next & previous page
      preloadAdjacentPages(pageNum);

    } catch (err) {
      console.warn('Error loading Mushaf page:', err);
      renderRasterFallback(pad);
    } finally {
      if (dom.loader) dom.loader.style.display = 'none';
    }
  }

  function renderPageVisual(svgText, pad) {
    if (!dom.imageLayer) return;

    if (svgText && svgText.includes('<svg')) {
      dom.imageLayer.innerHTML = svgText;
      const innerSvg = dom.imageLayer.querySelector('svg');
      if (innerSvg) {
        innerSvg.style.width = '100%';
        innerSvg.style.height = '100%';
        innerSvg.style.display = 'block';
      }
    } else {
      renderRasterFallback(pad);
    }
  }

  function renderRasterFallback(pad) {
    if (!dom.imageLayer) return;
    const pngUrl = `https://files.quran.app/hafs/madani/width_1024/page${pad}.png`;
    dom.imageLayer.innerHTML = `
      <img src="${pngUrl}" alt="صفحة المصحف ${pad}" class="mushaf-raster-img" loading="eager" />
    `;
  }

  function renderPolygonsOverlay(polygons) {
    if (!dom.overlaySvg) return;
    dom.overlaySvg.innerHTML = '';

    if (!polygons || !polygons.length) return;

    polygons.forEach((item) => {
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let d = item.polygon || '';
      if (!d.startsWith('M')) {
        const pts = d.trim().split(/\s+/);
        if (pts.length) {
          d = 'M ' + pts.join(' L ') + ' Z';
        }
      }
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('class', 'ayah-poly');
      pathEl.setAttribute('data-surah', item.surahNumber);
      pathEl.setAttribute('data-ayah', item.ayahNumber);
      pathEl.setAttribute('id', `poly-${item.surahNumber}-${item.ayahNumber}`);

      pathEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (MushafState.maskMode !== 'none') {
          // في وضع الإخفاء: النقر على آية أخرى يحددها ويكشفها للمراجعة بدون حجب الشاشة بنافذة الإجراءات
          if (MushafState.activeSurahId !== item.surahNumber || MushafState.activeAyahNum !== item.ayahNumber) {
            selectActiveAyah(item.surahNumber, item.ayahNumber, false);
            return;
          }
        }
        openAyahActionSheet(item.surahNumber, item.ayahNumber);
      });

      dom.overlaySvg.appendChild(pathEl);
    });

    refreshPolygonsDecoration();
    highlightActiveAyahPolygon();
    if (ReciterPlayer.isPlaying) {
      highlightAudioAyah(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    }
  }

  
  function computeWordRects(polygonStr, wordsCount) {
    if (!polygonStr || !wordsCount) return [];
    const parts = polygonStr.trim().split(/Z\s*/i).filter(Boolean);
    const segments = [];

    parts.forEach(p => {
      const nums = p.replace(/[MLZ]/gi, ' ').trim().split(/\s+/).map(Number);
      if (nums.length < 4) return;
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = maxX - minX;
      if (width > 0 && maxY > minY) {
        segments.push({ minX, maxX, minY, maxY, width });
      }
    });

    if (!segments.length) return [];

    const totalWidth = segments.reduce((acc, s) => acc + s.width, 0);
    const widthPerWord = totalWidth / wordsCount;

    const wordRects = [];
    let currentSegIdx = 0;
    let currentSeg = segments[0];
    let currentX = currentSeg.maxX;

    for (let w = 0; w < wordsCount; w++) {
      let remainingWordWidth = widthPerWord;
      const wordSubRects = [];

      while (remainingWordWidth > 0 && currentSegIdx < segments.length) {
        const availInSeg = currentX - currentSeg.minX;
        const padY = 1.0; // slight vertical padding to completely cover Arabic diacritics

        if (availInSeg <= remainingWordWidth) {
          wordSubRects.push({
            x: currentSeg.minX,
            y: currentSeg.minY - padY,
            width: currentX - currentSeg.minX,
            height: (currentSeg.maxY - currentSeg.minY) + (padY * 2)
          });
          remainingWordWidth -= availInSeg;
          currentSegIdx++;
          if (currentSegIdx < segments.length) {
            currentSeg = segments[currentSegIdx];
            currentX = currentSeg.maxX;
          }
        } else {
          const startX = currentX - remainingWordWidth;
          wordSubRects.push({
            x: startX,
            y: currentSeg.minY - padY,
            width: remainingWordWidth,
            height: (currentSeg.maxY - currentSeg.minY) + (padY * 2)
          });
          currentX = startX;
          remainingWordWidth = 0;
        }
      }

      wordRects.push(wordSubRects);
    }

    return wordRects;
  }

  function renderWordMasksForActiveAyah() {
    if (!dom.overlaySvg) return;

    let wordGroup = dom.overlaySvg.querySelector('#wordMaskGroup');
    if (!wordGroup) {
      wordGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      wordGroup.setAttribute('id', 'wordMaskGroup');
      wordGroup.setAttribute('class', 'word-mask-group');
      dom.overlaySvg.appendChild(wordGroup);
    }
    wordGroup.innerHTML = '';

    if (MushafState.maskMode !== 'word') {
      return;
    }

    const polyItem = MushafState.pagePolygons.find(
      p => p.surahNumber === MushafState.activeSurahId && p.ayahNumber === MushafState.activeAyahNum
    );

    if (!polyItem || !MushafState.targetWords || !MushafState.targetWords.length) {
      return;
    }

    const wordsCount = MushafState.targetWords.length;
    const wordRects = computeWordRects(polyItem.polygon, wordsCount);

    wordRects.forEach((subRects, wIdx) => {
      subRects.forEach(r => {
        const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rectEl.setAttribute('x', r.x);
        rectEl.setAttribute('y', r.y);
        rectEl.setAttribute('width', r.width);
        rectEl.setAttribute('height', r.height);
        rectEl.setAttribute('rx', '1');
        rectEl.setAttribute('data-word-idx', wIdx);
        rectEl.setAttribute(
          'class',
          `word-mask-rect ${wIdx < MushafState.wordPointerIndex ? 'revealed' : 'hidden-word'}`
        );

        rectEl.addEventListener('click', (e) => {
          e.stopPropagation();
          // النقر على الكلمة المخفية يكشفها
          if (wIdx >= MushafState.wordPointerIndex) {
            advanceWordPointer();
          }
        });

        wordGroup.appendChild(rectEl);
      });
    });
  }

  function updateWordMasksState() {
    if (!dom.overlaySvg || MushafState.maskMode !== 'word') return;
    const rects = dom.overlaySvg.querySelectorAll('.word-mask-rect');
    rects.forEach(rect => {
      const idx = parseInt(rect.getAttribute('data-word-idx'), 10);
      if (idx < MushafState.wordPointerIndex) {
        rect.classList.add('revealed');
        rect.classList.remove('hidden-word');
      } else {
        rect.classList.remove('revealed');
        rect.classList.add('hidden-word');
      }
    });
  }

  function highlightActiveAyahPolygon() {
    if (!dom.overlaySvg) return;
    dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
      p.classList.remove('selected-ayah', 'reciting-ayah', 'unmasked-ayah');
    });

    const activeEl = dom.overlaySvg.querySelector(
      `#poly-${MushafState.activeSurahId}-${MushafState.activeAyahNum}`
    );
    if (activeEl) {
      activeEl.classList.add(MushafState.isReciting ? 'reciting-ayah' : 'selected-ayah');
      activeEl.classList.add('unmasked-ayah');
    }

    renderWordMasksForActiveAyah();
  }

  function updatePageMetaHeader(pageNum) {
    if (window.getSurahsForPage) {
      const surahs = window.getSurahsForPage(pageNum);
      if (surahs.length && dom.headerSurahName) {
        const names = surahs.map(s => s.name).join(' / ');
        dom.headerSurahName.textContent = `سورة ${names}`;
      }
    }

    if (window.getJuzForPage && dom.headerJuzName) {
      const juz = window.getJuzForPage(pageNum);
      if (juz) {
        dom.headerJuzName.textContent = `${juz.name}`;
      }
    }
  }

  function setupInitialActiveAyahForPage() {
    if (MushafState.pagePolygons && MushafState.pagePolygons.length > 0) {
      const existsOnPage = MushafState.pagePolygons.some(
        p => p.surahNumber === MushafState.activeSurahId && p.ayahNumber === MushafState.activeAyahNum
      );
      if (!existsOnPage) {
        const first = MushafState.pagePolygons[0];
        selectActiveAyah(first.surahNumber, first.ayahNumber, false);
      } else {
        selectActiveAyah(MushafState.activeSurahId, MushafState.activeAyahNum, false);
      }
    }
  }

  function preloadAdjacentPages(current) {
    const pagesToPreload = [current + 1, current - 1].filter(p => p >= 1 && p <= 604);
    pagesToPreload.forEach(p => {
      const key = `p_${p}`;
      if (!MushafState.cache.has(key)) {
        const pad = String(p).padStart(3, '0');
        Promise.allSettled([
          fetch(`https://cdn.quran.ws/svg/pages/v1.1.1/hafs-kfqc/${pad}.svg`).then(r => r.ok ? r.text() : null),
          fetch(`https://cdn.quran.ws/svg/pages/v1.1.1/hafs-kfqc/${pad}.json`).then(r => r.ok ? r.json() : []),
          fetch(`https://api.quran.com/api/v4/quran/verses/imlaei?page_number=${p}`).then(r => r.ok ? r.json() : { verses: [] })
        ]).then(([sRes, jRes, vRes]) => {
          MushafState.cache.set(key, {
            svgText: sRes.value || null,
            polygons: jRes.value || [],
            verses: (vRes.value && vRes.value.verses) ? vRes.value.verses : []
          });
        }).catch(() => {});
      }
    });
  }

  // --- AYAH SELECTION & IN-MEMORY WORD MATCHING ---

  async function selectActiveAyah(surahId, ayahNum, shouldScroll) {
    MushafState.activeSurahId = parseInt(surahId, 10);
    MushafState.activeAyahNum = parseInt(ayahNum, 10);

    highlightActiveAyahPolygon();
    updateRecitationActiveAyahInfo();
    highlightCurrentSurahInDrawer();

    // Load words of this Ayah in memory
    await loadAyahWords(surahId, ayahNum);

    if (shouldScroll && dom.floatingControls) {
      dom.floatingControls.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateRecitationActiveAyahInfo() {
    if (!dom.activeAyahMeta) return;
    const surahObj = window.getSurahById ? window.getSurahById(MushafState.activeSurahId) : null;
    const sName = surahObj ? surahObj.name : `السورة ${MushafState.activeSurahId}`;
    dom.activeAyahMeta.textContent = `سورة ${sName} | الآية ${MushafState.activeAyahNum}`;
  }

  async function loadAyahWords(surahId, ayahNum) {
    const verseKey = `${surahId}:${ayahNum}`;
    let verseText = '';

    const foundInPage = MushafState.pageVerses.find(v => v.verse_key === verseKey);
    if (foundInPage && (foundInPage.text_imlaei || foundInPage.text_uthmani_simple)) {
      verseText = foundInPage.text_imlaei || foundInPage.text_uthmani_simple;
    } else {
      try {
        const res = await fetch(`https://api.quran.com/api/v4/quran/verses/imlaei?verse_key=${verseKey}`);
        if (res.ok) {
          const json = await res.json();
          if (json.verses && json.verses[0]) {
            verseText = json.verses[0].text_imlaei;
          }
        }
      } catch (e) {
        console.warn('Failed to fetch verse text:', e);
      }
    }

    if (!verseText) {
      verseText = '';
    }

    const rawWords = verseText.trim().split(/\s+/).filter(Boolean);
    MushafState.targetWords = rawWords.map((word, idx) => ({
      index: idx,
      original: word,
      normalized: normalizeArabicText(word),
      matched: false
    }));

    MushafState.wordPointerIndex = 0;
    updateRecitationStatus();
    renderWordMasksForActiveAyah();
  }

  function advanceWordPointer() {
    if (MushafState.wordPointerIndex < MushafState.targetWords.length) {
      MushafState.targetWords[MushafState.wordPointerIndex].matched = true;
      MushafState.wordPointerIndex++;

      // Subtle haptic feedback
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(15);
      }

      updateRecitationStatus();
      updateWordMasksState();

      // Check if Ayah complete
      if (MushafState.wordPointerIndex >= MushafState.targetWords.length) {
        handleAyahCompleted();
      }
    }
  }

  function handleAyahCompleted() {
    playSuccessChime();

    if (dom.recitationStatusBadge) {
      dom.recitationStatusBadge.className = 'floating-status-badge status-completed';
      dom.recitationStatusBadge.textContent = 'أحسنت! اكتملت الآية';
    }

    const poly = dom.overlaySvg ? dom.overlaySvg.querySelector(
      `#poly-${MushafState.activeSurahId}-${MushafState.activeAyahNum}`
    ) : null;
    if (poly) {
      poly.classList.add('completed-ayah');
    }

    // Auto advance to next Ayah after 750ms
    setTimeout(() => {
      advanceToNextAyah();
    }, 750);
  }

  function advanceToNextAyah() {
    const surahObj = window.getSurahById ? window.getSurahById(MushafState.activeSurahId) : null;
    const maxVerses = surahObj ? surahObj.verses : 286;

    let nextSurah = MushafState.activeSurahId;
    let nextAyah = MushafState.activeAyahNum + 1;

    if (nextAyah > maxVerses) {
      if (nextSurah < 114) {
        nextSurah++;
        nextAyah = 1;
      } else {
        stopRecitation();
        return;
      }
    }

    // Check if next Ayah belongs to another page
    const isOnCurrentPage = MushafState.pagePolygons.some(
      p => p.surahNumber === nextSurah && p.ayahNumber === nextAyah
    );

    if (!isOnCurrentPage) {
      if (MushafState.currentPage < 604) {
        loadPage(MushafState.currentPage + 1).then(() => {
          selectActiveAyah(nextSurah, nextAyah, false);
        });
        return;
      }
    }

    selectActiveAyah(nextSurah, nextAyah, false);
  }

  function stepAyah(delta) {
    let targetSurah = MushafState.activeSurahId;
    let targetAyah = MushafState.activeAyahNum + delta;

    const surahObj = window.getSurahById ? window.getSurahById(targetSurah) : null;
    const maxVerses = surahObj ? surahObj.verses : 286;

    if (targetAyah < 1) {
      if (targetSurah > 1) {
        targetSurah--;
        const prevSurah = window.getSurahById ? window.getSurahById(targetSurah) : null;
        targetAyah = prevSurah ? prevSurah.verses : 1;
      } else {
        return;
      }
    } else if (targetAyah > maxVerses) {
      if (targetSurah < 114) {
        targetSurah++;
        targetAyah = 1;
      } else {
        return;
      }
    }

    const isOnCurrentPage = MushafState.pagePolygons.some(
      p => p.surahNumber === targetSurah && p.ayahNumber === targetAyah
    );

    if (!isOnCurrentPage) {
      const targetSurahObj = window.getSurahById ? window.getSurahById(targetSurah) : null;
      if (targetSurahObj && targetAyah === 1) {
        loadPage(targetSurahObj.startPage).then(() => {
          selectActiveAyah(targetSurah, targetAyah, false);
        });
        return;
      }
    }

    selectActiveAyah(targetSurah, targetAyah, false);
  }

  // --- STREAMING VOICE RECOGNITION (Web Speech API) ---

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API is not supported in this browser.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'ar-SA';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      MushafState.isReciting = true;
      updateRecitationStatus();
      highlightActiveAyahPolygon();
    };

    rec.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscript += item[0].transcript + ' ';
        } else {
          interimTranscript += item[0].transcript + ' ';
        }
      }

      const rawCombined = (finalTranscript + ' ' + interimTranscript).trim();
      if (dom.liveTranscript) {
        dom.liveTranscript.textContent = rawCombined ? `المسموع: "${rawCombined}"` : '';
      }

      // Real-time word matching
      processSpokenTranscript(rawCombined);
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        alert('يرجى السماح للتطبيق باستخدام الميكروفون لبدء التسميع الصوتي.');
        stopRecitation();
      }
    };

    rec.onend = () => {
      if (MushafState.isReciting) {
        try {
          rec.start();
        } catch (e) {
          setTimeout(() => {
            if (MushafState.isReciting) {
              try { rec.start(); } catch (err) {}
            }
          }, 300);
        }
      } else {
        updateRecitationStatus();
        highlightActiveAyahPolygon();
      }
    };

    MushafState.recognition = rec;
  }

  function processSpokenTranscript(transcript) {
    if (!transcript || !MushafState.targetWords.length) return;
    if (MushafState.wordPointerIndex >= MushafState.targetWords.length) return;

    const normalizedSpoken = normalizeArabicText(transcript);
    const spokenTokens = normalizedSpoken.split(/\s+/).filter(Boolean);
    if (!spokenTokens.length) return;

    const currentTarget = MushafState.targetWords[MushafState.wordPointerIndex].normalized;

    for (let i = 0; i < spokenTokens.length; i++) {
      const token = spokenTokens[i];
      if (wordsMatch(token, currentTarget)) {
        advanceWordPointer();
        break;
      }
    }
  }

  function toggleRecitation() {
    if (MushafState.isReciting) {
      stopRecitation();
    } else {
      startRecitation();
    }
  }

  function startRecitation() {
    if (!MushafState.recognition) {
      setupSpeechRecognition();
      if (!MushafState.recognition) {
        alert('ميزة التسميع الصوتي غير مدعومة في هذا المتصفح. ينصح باستخدام متصفح Chrome أو Edge أو Safari.');
        return;
      }
    }

    try {
      MushafState.isReciting = true;
      MushafState.recognition.start();
    } catch (e) {
      // Recognition might already be running
    }

    updateRecitationStatus();
    highlightActiveAyahPolygon();
  }

  function stopRecitation() {
    MushafState.isReciting = false;
    if (MushafState.recognition) {
      try {
        MushafState.recognition.stop();
      } catch (e) {}
    }

    if (dom.liveTranscript) {
      dom.liveTranscript.textContent = '';
    }

    updateRecitationStatus();
    highlightActiveAyahPolygon();
  }

  function updateRecitationStatus() {
    if (!dom.startRecitationBtn || !dom.recitationStatusBadge) return;

    if (MushafState.isReciting) {
      dom.startRecitationBtn.classList.add('active');
      if (dom.micBtnText) dom.micBtnText.textContent = 'إيقاف التسميع';
      if (dom.micIcon) {
        dom.micIcon.innerHTML = `
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        `;
      }
      dom.recitationStatusBadge.className = 'floating-status-badge status-listening';
      if (MushafState.targetWords.length > 0 && MushafState.wordPointerIndex > 0) {
        dom.recitationStatusBadge.textContent = `${MushafState.wordPointerIndex} من ${MushafState.targetWords.length} كلمة`;
      } else {
        dom.recitationStatusBadge.textContent = 'جاري الاستماع... اقرأ الآية';
      }
    } else {
      dom.startRecitationBtn.classList.remove('active');
      if (dom.micBtnText) dom.micBtnText.textContent = 'بدء التسميع';
      if (dom.micIcon) {
        dom.micIcon.innerHTML = `
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        `;
      }
      dom.recitationStatusBadge.className = 'floating-status-badge status-idle';
      dom.recitationStatusBadge.textContent = 'جاهز للتسميع';
    }
  }

  // --- EVENT ATTACHMENTS ---

  function attachEventListeners() {
    // Next Page
    if (dom.nextPageBtn) {
      dom.nextPageBtn.addEventListener('click', () => {
        if (MushafState.currentPage < 604) {
          loadPage(MushafState.currentPage + 1);
        }
      });
    }

    // Previous Page
    if (dom.prevPageBtn) {
      dom.prevPageBtn.addEventListener('click', () => {
        if (MushafState.currentPage > 1) {
          loadPage(MushafState.currentPage - 1);
        }
      });
    }

    // Page Input Direct Jump
    if (dom.pageInput) {
      dom.pageInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val >= 1 && val <= 604) {
          loadPage(val);
        } else {
          e.target.value = MushafState.currentPage;
        }
      });
    }

    // Mask / Blur Mode Toggle
    if (dom.toggleMaskBtn) {
      dom.toggleMaskBtn.addEventListener('click', toggleMaskMode);
    }

    // Start/Stop Recitation
    if (dom.startRecitationBtn) {
      dom.startRecitationBtn.addEventListener('click', toggleRecitation);
    }

    // Prev / Next Ayah Buttons
    if (dom.prevAyahBtn) {
      dom.prevAyahBtn.addEventListener('click', () => stepAyah(-1));
    }
    if (dom.nextAyahBtn) {
      dom.nextAyahBtn.addEventListener('click', () => stepAyah(1));
    }

    // Reset Pointer Button
    if (dom.resetAyahBtn) {
      dom.resetAyahBtn.addEventListener('click', () => {
        MushafState.wordPointerIndex = 0;
        MushafState.targetWords.forEach(w => { w.matched = false; });
        updateRecitationStatus();
        renderWordMasksForActiveAyah();
        const poly = dom.overlaySvg ? dom.overlaySvg.querySelector(
          `#poly-${MushafState.activeSurahId}-${MushafState.activeAyahNum}`
        ) : null;
        if (poly) poly.classList.remove('completed-ayah');
      });
    }

    // Touch Swipe Navigation for Mushaf Page
    if (dom.pageWrapper) {
      let touchStartX = 0;
      let touchStartY = 0;

      dom.pageWrapper.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      dom.pageWrapper.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          const deltaX = e.changedTouches[0].clientX - touchStartX;
          const deltaY = e.changedTouches[0].clientY - touchStartY;

          if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX < 0) {
              // RTL next page (swiping towards left)
              if (MushafState.currentPage < 604) loadPage(MushafState.currentPage + 1);
            } else {
              // RTL prev page (swiping towards right)
              if (MushafState.currentPage > 1) loadPage(MushafState.currentPage - 1);
            }
          }
        }
      }, { passive: true });
      // Edge Clicking for Page Navigation (Laptop / Desktop)
      dom.pageWrapper.addEventListener('click', (e) => {
        if (e.target.closest('.ayah-poly') || e.target.closest('button') || e.target.closest('.word-mask-rect')) return;
        const rect = dom.pageWrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        if (clickX < width * 0.16) {
          // Left edge -> Next page in RTL
          if (MushafState.currentPage < 604) loadPage(MushafState.currentPage + 1);
        } else if (clickX > width * 0.84) {
          // Right edge -> Prev page in RTL
          if (MushafState.currentPage > 1) loadPage(MushafState.currentPage - 1);
        }
      });
    }

    // Keyboard Arrow Keys (Laptop / Desktop)
    window.addEventListener('keydown', (e) => {
      if (dom.view && dom.view.classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
          if (MushafState.currentPage < 604) loadPage(MushafState.currentPage + 1);
        } else if (e.key === 'ArrowRight') {
          if (MushafState.currentPage > 1) loadPage(MushafState.currentPage - 1);
        }
      }
    });
  }

  // Expose module globally
  window.MushafViewer = {
    init: initMushaf,
    loadPage: loadPage,
    getState: () => MushafState,
    normalizeText: normalizeArabicText,
    startRecitation: startRecitation,
    stopRecitation: stopRecitation,
    toggleMaskMode: toggleMaskMode,
    setMaskMode: setMaskMode,
    openDrawer: openSurahDrawer,
    closeDrawer: closeSurahDrawer
  };

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMushaf);
  } else {
    initMushaf();
  }

})();
