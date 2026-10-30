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
    unmaskedVerses: new Set(),
    pageVerses: [],
    pagePolygons: [],
    pageViewBox: '0 0 1920 3106',
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
      // Mode Picker Elements (العين أو القائمة - كبسولة عائمة)
      mushafModePickerBtn: document.getElementById('mushafModePickerBtn'),
      mushafBottomModeIcon: document.getElementById('mushafBottomModeIcon'),
      mushafModeCapsuleWrapper: document.getElementById('mushafModeCapsuleWrapper'),
      mushafModePillPop: document.getElementById('mushafModePillPop'),
      pillCloseModeBtn: document.getElementById('pillCloseModeBtn'),
      pillModeListBtn: document.getElementById('pillModeListBtn'),
      pillModeEyeBtn: document.getElementById('pillModeEyeBtn'),
      pillModeEyeIconWrap: document.getElementById('pillModeEyeIconWrap'),
      // Mushaf Viewer Frame
      pageWrapper: document.getElementById('mushafPageWrapper'),
      pageStage: document.getElementById('mushafPageStage'),
      imageLayer: document.getElementById('mushafImageLayer'),
      overlaySvg: document.getElementById('mushafOverlaySvg'),
      loader: document.getElementById('mushafLoader'),
      // In-page Page Number & Bottom Bar
      inpageNumber: document.getElementById('mushafInpageNumber'),
      openPageNotesBtn: document.getElementById('openPageNotesBtn'),
      pageNotesDotIndicator: document.getElementById('pageNotesDotIndicator'),
      pageNotesModal: document.getElementById('pageNotesModal'),
      pageNotesBackdrop: document.getElementById('pageNotesBackdrop'),
      pageNotesModalTitle: document.getElementById('pageNotesModalTitle'),
      pageNotesTextarea: document.getElementById('pageNotesTextarea'),
      pageAyahNotesSection: document.getElementById('pageAyahNotesSection'),
      pageAyahNotesList: document.getElementById('pageAyahNotesList'),
      deletePageNoteBtn: document.getElementById('deletePageNoteBtn'),
      cancelPageNoteBtn: document.getElementById('cancelPageNoteBtn'),
      savePageNoteBtn: document.getElementById('savePageNoteBtn'),
      closePageNotesBtn: document.getElementById('closePageNotesBtn'),
      prevPageBtn: document.getElementById('mushafPrevPageBtn'),
      nextPageBtn: document.getElementById('mushafNextPageBtn'),
      pageInput: document.getElementById('mushafPageInput'),
      // Reciter Audio Player Controls
      mushafReciterSelect: document.getElementById('mushafReciterSelect'),
      openReciterModalBtn: document.getElementById('openReciterModalBtn'),
      currentReciterNameDisplay: document.getElementById('currentReciterNameDisplay'),
      reciterPickerModal: document.getElementById('reciterPickerModal'),
      reciterModalBackdrop: document.getElementById('reciterModalBackdrop'),
      closeReciterPickerBtn: document.getElementById('closeReciterPickerBtn'),
      reciterSearchInput: document.getElementById('reciterSearchInput'),
      reciterCardsList: document.getElementById('reciterCardsList'),
      playReciterAudioBtn: document.getElementById('playReciterAudioBtn'),
      reciterPlayIcon: document.getElementById('reciterPlayIcon'),
      // Reciter & Tafseer Download Manager
      openAudioDownloadBtn: document.getElementById('openAudioDownloadBtn'),
      closeAudioDownloadBtn: document.getElementById('closeAudioDownloadBtn'),
      audioDownloadModal: document.getElementById('audioDownloadModal'),
      audioDownloadBackdrop: document.getElementById('audioDownloadBackdrop'),
      tabBtnAudioDownloads: document.getElementById('tabBtnAudioDownloads'),
      tabBtnTafseerDownloads: document.getElementById('tabBtnTafseerDownloads'),
      audioDownloadsTabContent: document.getElementById('audioDownloadsTabContent'),
      tafseerDownloadsTabContent: document.getElementById('tafseerDownloadsTabContent'),
      downloadReciterSelect: document.getElementById('downloadReciterSelect'),
      downloadSurahSelect: document.getElementById('downloadSurahSelect'),
      downloadSurahNameText: document.getElementById('downloadSurahNameText'),
      downloadSurahAyahsCountText: document.getElementById('downloadSurahAyahsCountText'),
      downloadSurahStatusBadge: document.getElementById('downloadSurahStatusBadge'),
      downloadProgressWrap: document.getElementById('downloadProgressWrap'),
      downloadProgressLabel: document.getElementById('downloadProgressLabel'),
      downloadProgressPercent: document.getElementById('downloadProgressPercent'),
      downloadProgressBarFill: document.getElementById('downloadProgressBarFill'),
      startSurahDownloadBtn: document.getElementById('startSurahDownloadBtn'),
      cancelSurahDownloadBtn: document.getElementById('cancelSurahDownloadBtn'),
      deleteSurahDownloadBtn: document.getElementById('deleteSurahDownloadBtn'),
      downloadedSurahsContainer: document.getElementById('downloadedSurahsContainer'),
      // Tafseer Offline Downloader elements
      tafseerBookSelect: document.getElementById('tafseerBookSelect'),
      tafseerBookTitleText: document.getElementById('tafseerBookTitleText'),
      tafseerDownloadStatusBadge: document.getElementById('tafseerDownloadStatusBadge'),
      tafseerProgressWrap: document.getElementById('tafseerProgressWrap'),
      tafseerProgressLabel: document.getElementById('tafseerProgressLabel'),
      tafseerProgressPercent: document.getElementById('tafseerProgressPercent'),
      tafseerProgressBarFill: document.getElementById('tafseerProgressBarFill'),
      startFullTafseerDownloadBtn: document.getElementById('startFullTafseerDownloadBtn'),
      startSurahTafseerDownloadBtn: document.getElementById('startSurahTafseerDownloadBtn'),
      deleteTafseerDownloadBtn: document.getElementById('deleteTafseerDownloadBtn'),
      cancelTafseerDownloadBtn: document.getElementById('cancelTafseerDownloadBtn'),
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
      pageRepeatStartInput: document.getElementById('pageRepeatStartInput'),
      pageRepeatEndInput: document.getElementById('pageRepeatEndInput'),
      rangeStartSubtext: document.getElementById('rangeStartSubtext'),
      rangeEndSubtext: document.getElementById('rangeEndSubtext'),
      masterRepeatToggle: document.getElementById('masterRepeatToggle'),
      repeatControlsContainer: document.getElementById('repeatControlsContainer'),
      rangeRepeatCountDisplay: document.getElementById('rangeRepeatCountDisplay'),
      rangeRepeatIncBtn: document.getElementById('rangeRepeatIncBtn'),
      rangeRepeatDecBtn: document.getElementById('rangeRepeatDecBtn'),
      ayahRepeatCountDisplay: document.getElementById('ayahRepeatCountDisplay'),
      ayahRepeatIncBtn: document.getElementById('ayahRepeatIncBtn'),
      ayahRepeatDecBtn: document.getElementById('ayahRepeatDecBtn'),
      audioSpeedChips: document.getElementById('audioSpeedChips'),
      versePauseChips: document.getElementById('versePauseChips'),
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
      sheetAyahWordsContainer: document.getElementById('sheetAyahWordsContainer'),
      toggleSelectAllWordsBtn: document.getElementById('toggleSelectAllWordsBtn'),
      clearWordSelectionBtn: document.getElementById('clearWordSelectionBtn'),
      selectedWordsCounter: document.getElementById('selectedWordsCounter'),
      selectedWordsCountNum: document.getElementById('selectedWordsCountNum'),
      highlighterPenBtn: document.getElementById('highlighterPenBtn'),
      highlighterPenColorDot: document.getElementById('highlighterPenColorDot'),
      highlighterPalettePop: document.getElementById('highlighterPalettePop'),
      ayahTafseerModal: document.getElementById('ayahTafseerModal'),
      tafseerModalBackdrop: document.getElementById('tafseerModalBackdrop'),
      tafseerModalTitle: document.getElementById('tafseerModalTitle'),
      openTafseerBtn: document.getElementById('openTafseerBtn'),
      closeTafseerModalBtn: document.getElementById('closeTafseerModalBtn'),
      sheetTafseerText: document.getElementById('sheetTafseerText'),
      sheetTafseerLoading: document.getElementById('sheetTafseerLoading'),
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

    // Restore saved page or default to current surah
    const savedPage = parseInt(localStorage.getItem('tibyan_mushaf_page'), 10);
    if (savedPage && savedPage >= 1 && savedPage <= 604) {
      MushafState.currentPage = savedPage;
    } else {
      const curSurahName = (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name) || 'الأنفال';
      const surahObj = (typeof window.QURAN_SURAHS !== 'undefined') ? window.QURAN_SURAHS.find(s => s.name === curSurahName) : null;
      MushafState.currentPage = (surahObj && surahObj.startPage) ? surahObj.startPage : 177;
    }

    // Restore saved mask mode
    const savedMask = localStorage.getItem('tibyan_mushaf_mask_mode');
    MushafState.maskMode = savedMask || 'none';
    setMaskMode(MushafState.maskMode);

    initSurahDrawer();
    initSettingsSubpages();
    initMaskControls();
    initModePickerModal();
    initAyahActionSheetEvents();
    initPageNotes();
    initReciterPlayer();
    initReciterPickerModal();
    initAudioOptionsModal();
    initMushafDownloader();
    initAudioDownloadManager();
    initTafseerDownloadManager();
    attachEventListeners();
    setupSpeechRecognition();

    // Purge legacy 1422 caches if existing
    if ('caches' in window) {
      ['tibyan-mushaf-pages-1422', 'tibyan-mushaf-pages-1422-v2'].forEach((name) => {
        caches.delete(name).catch(() => { });
      });
    }

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
    if (dom.headerSurahName) {
      dom.headerSurahName.addEventListener('click', openSurahDrawer);
    }
    if (dom.headerJuzName) {
      dom.headerJuzName.addEventListener('click', openSurahDrawer);
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

  // --- MASK / BLUR MODE CONTROLS & INTERACTION PICKER (العين أو القائمة - كبسولة عائمة جانبية مثل قلم التظليل) ---

  function initModePickerModal() {
    const savedInteractionMode = localStorage.getItem('tibyan_mushaf_interaction_mode') || 'eye';
    MushafState.interactionMode = savedInteractionMode;
    updateModePickerUI(savedInteractionMode);

    // زر العين بالأسفل: أول نقرة تخفي الآيات للتسميع، وثاني نقرة تظهر الآيات مباشرة
    if (dom.mushafModePickerBtn) {
      dom.mushafModePickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMaskMode();
      });
    }

    if (dom.toggleMaskBtn) {
      dom.toggleMaskBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMaskMode();
      });
    }
  }

  function setInteractionMode(mode) {
    MushafState.interactionMode = mode;
    localStorage.setItem('tibyan_mushaf_interaction_mode', mode);

    if (mode === 'eye') {
      setMaskMode('verse');
    } else {
      setMaskMode('none');
    }

    updateModePickerUI(mode);
  }

  function updateModePickerUI(mode) {
    const isMasked = MushafState.maskMode === 'verse';

    if (dom.mushafModePickerBtn) {
      dom.mushafModePickerBtn.classList.add('mode-active-eye');
      dom.mushafModePickerBtn.classList.remove('mode-active-list');
      dom.mushafModePickerBtn.classList.toggle('mask-currently-hidden', isMasked);
      dom.mushafModePickerBtn.title = isMasked ? 'إظهار الآيات' : 'إخفاء الآيات للتسميع';
    }

    const eyeOpenSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:19px;height:19px;">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;

    const eyeSlashedSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:19px;height:19px;">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;

    if (dom.mushafBottomModeIcon) {
      dom.mushafBottomModeIcon.innerHTML = isMasked ? eyeSlashedSvg : eyeOpenSvg;
    }
  }

  function initMaskControls() {
    // Mode picker handles mask controls
  }

  function toggleMaskMode() {
    const nextMode = (MushafState.maskMode === 'none' || !MushafState.maskMode || MushafState.maskMode === false) ? 'verse' : 'none';
    setMaskMode(nextMode);
    if (window.showToast) {
      window.showToast(nextMode === 'verse' ? 'تم إخفاء الآيات للتسميع (انقر على أي آية لإظهارها)' : 'تم إظهار الآيات');
    }
  }

  function setMaskMode(mode) {
    MushafState.maskMode = mode;
    localStorage.setItem('tibyan_mushaf_mask_mode', mode);

    // في بداية وضع إخفاء الآيات: تفريغ الآيات المكشوفة ليبدأ المصحف مخفياً بالكامل ما عدا البسملة ورأس الصفحة
    if (MushafState.unmaskedVerses) {
      MushafState.unmaskedVerses.clear();
    }

    if (mode === 'none' || !mode) {
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
      if (window.scrollTo) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    highlightActiveAyahPolygon();
    updateModePickerUI(MushafState.interactionMode || 'eye');
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

  let selectedAyahWords = [];
  let selectedWordIndices = new Set();
  let currentSheetTafsirId = 16;
  const TAFSIR_OFFLINE_CACHE = 'tibyan-tafsir-cache-v1';

  // --- OFFLINE TAFSEER STORAGE (Cache API + IndexedDB Fallback) ---
  const TafseerDB = {
    db: null,
    async getDB() {
      if (this.db) return this.db;
      if (typeof indexedDB === 'undefined') return null;
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open('tibyan_tafseer_db', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('tafseer')) {
              db.createObjectStore('tafseer', { keyPath: 'key' });
            }
          };
          req.onsuccess = (e) => {
            this.db = e.target.result;
            resolve(this.db);
          };
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    },

    async put(key, text) {
      if ('caches' in window) {
        try {
          const cache = await caches.open(TAFSIR_OFFLINE_CACHE);
          const res = new Response(JSON.stringify({ tafsir: { text } }), {
            headers: { 'Content-Type': 'application/json' }
          });
          await cache.put(key, res);
        } catch (_) { }
      }
      try {
        const db = await this.getDB();
        if (db) {
          const tx = db.transaction('tafseer', 'readwrite');
          tx.objectStore('tafseer').put({ key, text });
        }
      } catch (_) { }
    },

    async get(key) {
      if ('caches' in window) {
        try {
          const cache = await caches.open(TAFSIR_OFFLINE_CACHE);
          const match = await cache.match(key);
          if (match) {
            const data = await match.json();
            if (data && data.tafsir && data.tafsir.text) {
              return data.tafsir.text;
            }
          }
        } catch (_) { }
      }
      try {
        const db = await this.getDB();
        if (db) {
          return new Promise((resolve) => {
            const tx = db.transaction('tafseer', 'readonly');
            const req = tx.objectStore('tafseer').get(key);
            req.onsuccess = () => {
              if (req.result && req.result.text) resolve(req.result.text);
              else resolve(null);
            };
            req.onerror = () => resolve(null);
          });
        }
      } catch (_) { }
      return null;
    },

    async clear(tafsirId) {
      if ('caches' in window) {
        try {
          const cache = await caches.open(TAFSIR_OFFLINE_CACHE);
          const keys = await cache.keys();
          for (const req of keys) {
            if (req.url && req.url.includes('/tafsirs/' + tafsirId + '/')) {
              await cache.delete(req);
            }
          }
        } catch (_) { }
      }
      try {
        const db = await this.getDB();
        if (db) {
          const tx = db.transaction('tafseer', 'readwrite');
          const store = tx.objectStore('tafseer');
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              if (cursor.key && String(cursor.key).includes('/tafsirs/' + tafsirId + '/')) {
                cursor.delete();
              }
              cursor.continue();
            }
          };
        }
      } catch (_) { }
    }
  };


  function getAyahHighlight(surah, ayah) {
    if (!window.AppState || !window.AppState.ayahHighlights) return null;
    return window.AppState.ayahHighlights[`${surah}:${ayah}`] || null;
  }

  async function fetchAyahWordsForSheet(surahNum, ayahNum) {
    if (!dom.sheetAyahWordsContainer) return;
    dom.sheetAyahWordsContainer.innerHTML = '<span class="words-loading-hint">جارِ تحميل نص كلمات الآية...</span>';
    selectedAyahWords = [];
    selectedWordIndices.clear();
    updateSelectedWordsCounter();

    const verseKey = `${surahNum}:${ayahNum}`;
    let verseText = '';

    // 1. Try finding in loaded page verses
    const foundInPage = MushafState.pageVerses && MushafState.pageVerses.find(v => v.verse_key === verseKey);
    if (foundInPage && (foundInPage.text_uthmani || foundInPage.text_imlaei || foundInPage.text_uthmani_simple)) {
      verseText = foundInPage.text_uthmani || foundInPage.text_imlaei || foundInPage.text_uthmani_simple;
    } else {
      // 2. Fetch from api.quran.com
      try {
        const res = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?verse_key=${verseKey}`);
        if (res.ok) {
          const json = await res.json();
          if (json.verses && json.verses[0]) {
            verseText = json.verses[0].text_uthmani || json.verses[0].text_imlaei;
          }
        }
      } catch (e) {
        console.warn('Failed to fetch verse words for sheet:', e);
      }
    }

    if (!verseText) {
      dom.sheetAyahWordsContainer.innerHTML = '<span class="words-loading-hint" style="color:#dc2626;">تعذر جلب نص الكلمات</span>';
      return;
    }

    const rawWords = verseText.trim().split(/\s+/).filter(Boolean);
    selectedAyahWords = rawWords;

    renderSheetWordTokens(surahNum, ayahNum);
  }

  function renderSheetWordTokens(surahNum, ayahNum) {
    if (!dom.sheetAyahWordsContainer) return;
    dom.sheetAyahWordsContainer.innerHTML = '';

    if (!window.AppState) window.AppState = {};
    if (!window.AppState.wordHighlights) window.AppState.wordHighlights = {};

    selectedAyahWords.forEach((wordText, wIdx) => {
      const tokenBtn = document.createElement('button');
      tokenBtn.type = 'button';
      tokenBtn.className = 'ayah-word-token';
      tokenBtn.setAttribute('data-word-idx', wIdx);
      tokenBtn.textContent = wordText;

      const hlKey = `${surahNum}:${ayahNum}:${wIdx}`;
      const savedColor = window.AppState.wordHighlights[hlKey];
      if (savedColor) {
        tokenBtn.classList.add(`highlight-${savedColor}`);
      }

      if (selectedWordIndices.has(wIdx)) {
        tokenBtn.classList.add('is-selected');
      }

      tokenBtn.addEventListener('click', () => {
        if (selectedWordIndices.has(wIdx)) {
          selectedWordIndices.delete(wIdx);
          tokenBtn.classList.remove('is-selected');
        } else {
          selectedWordIndices.add(wIdx);
          tokenBtn.classList.add('is-selected');
        }
        updateSelectedWordsCounter();
      });

      dom.sheetAyahWordsContainer.appendChild(tokenBtn);
    });
  }

  function updateSelectedWordsCounter() {
    const count = selectedWordIndices.size;
    if (dom.selectedWordsCountNum) dom.selectedWordsCountNum.textContent = count;
    if (dom.selectedWordsCounter) dom.selectedWordsCounter.style.display = count > 0 ? 'flex' : 'none';
    if (dom.clearWordSelectionBtn) dom.clearWordSelectionBtn.style.display = count > 0 ? 'inline-block' : 'none';
    if (dom.toggleSelectAllWordsBtn) {
      dom.toggleSelectAllWordsBtn.textContent = (count === selectedAyahWords.length && count > 0) ? 'إلغاء الكل' : 'تحديد الكل';
    }
    const label = document.getElementById('highlightActionLabel');
    if (label) {
      label.textContent = count > 0 ? `تظليل (${count}) كلمة محددة:` : 'تظليل كافة كلمات الآية:';
    }
  }

  async function loadAyahTafseer(surahNum, ayahNum, tafsirId = currentSheetTafsirId) {
    if (!dom.sheetTafseerText) return;
    currentSheetTafsirId = tafsirId;

    if (dom.sheetTafseerLoading) dom.sheetTafseerLoading.style.display = 'flex';
    dom.sheetTafseerText.innerHTML = '';

    // Switch tab buttons active class
    const tabContainers = [dom.ayahTafseerModal, dom.ayahActionSheet].filter(Boolean);
    tabContainers.forEach(container => {
      container.querySelectorAll('.tafseer-tab-btn').forEach(btn => {
        const id = parseInt(btn.getAttribute('data-tafsir'), 10);
        btn.classList.toggle('active', id === tafsirId);
      });
    });

    const reqUrl = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_ayah/${surahNum}:${ayahNum}`;

    // 1. فحص التخزين المحلي السريع (Cache API أو IndexedDB)
    let tafseerText = await TafseerDB.get(reqUrl);

    if (tafseerText) {
      if (dom.sheetTafseerLoading) dom.sheetTafseerLoading.style.display = 'none';
      renderTafseerContent(tafseerText);
      return;
    }

    // 2. الجلب من الخادم وحفظه محلياً
    try {
      const res = await fetch(reqUrl);
      if (res.ok) {
        const json = await res.json();
        if (json && json.tafsir && json.tafsir.text) {
          tafseerText = json.tafsir.text;
          renderTafseerContent(tafseerText);
          await TafseerDB.put(reqUrl, tafseerText);
          return;
        }
      }
      throw new Error('Tafseer fetch returned invalid status');
    } catch (err) {
      if (dom.sheetTafseerLoading) dom.sheetTafseerLoading.style.display = 'none';
      dom.sheetTafseerText.innerHTML = `
        <div style="color:var(--text-muted);font-size:0.82rem;line-height:1.6;padding:4px 0;">
          التفسير غير متوفر حالياً لهذه الآية دون اتصال. يمكنك تنزيل التفسير كاملاً من صفحة الإعدادات للقراءة في أي وقت.
        </div>
      `;
    } finally {
      if (dom.sheetTafseerLoading) dom.sheetTafseerLoading.style.display = 'none';
    }
  }

  function formatTafseerText(rawText) {
    if (!rawText) return '';

    // 1. تنظيف وسوم HTML الزائدة وتوحيد الفواصل
    let text = rawText
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();

    // 2. توحيد المسافات وفواصل الكتب
    text = text.replace(/[\r\t]+/g, ' ');
    text = text.replace(/\s*\.\s*\.\s*/g, ' .\n\n');

    // 3. الفصل بأسطر فارغة (\n\n) قبل الكلمات المفتاحية التفسيرية لتقسيم النص لفقرات مريحة
    const keywordPattern = /([\.!\?؟])\s*(?=(?:وقوله|قوله(?:\s+تعالى)?|والمراد|المراد|والمعنى|المعنى|والصفة|الصفة|وقد\s+جاء|وجاء(?:\s+التعبير)?|والمقصود|فالمقصود|المقصود|والحاصل|والخلاصة|وفي\s+الآية|وفى\s+الآية|ومعنى\s+قوله|فإن\s+قيل|فإنْ\s+قيل|قيل|قلنا|بل\s+نقول|أى|أي|أى\s+أن|أي\s+أن|قال\s+[^\:]{2,35}\:|ورحم\s+الله|وروى|وروي|وفى\s+الحديث|وفي\s+الحديث|ولهذا\s+قال|ولهذا|ومن\s+الواضح|وليس\s+من|إنما\s+المؤمن|ثم\s+وصف|ثم\s+بين|ثم\s+قال|ثم\s+أرشد|واختلف|فقال\s+|وقال\s+|أولا|ثانيا|ثالثا|رابعا|خامسا|\(\s*\d+\s*\)|\d+[\-–\.]|\{\s*[^}]+\s*\}))/g;
    text = text.replace(keywordPattern, '$1\n\n');

    // الفصل عند علامات الاستفهام المتبوعة بجواب مباشرة
    text = text.replace(/؟\s*(?=(?:قلنا|فقال|فالجواب|بل))/g, '؟\n\n');

    // الفصل قبل الآيات المفسرة
    text = text.replace(/([\.!])\s*(?=\(\s*[^\)]+\s*\)\s*(?:من|هو|وهو|أى|أي))/g, '$1\n\n');

    // 4. استخراج الفقرات وتجزئة أي فقرة تظل طويلة جداً
    const rawParagraphs = text.split(/\n{2,}/);
    const paragraphs = [];

    for (let p of rawParagraphs) {
      p = p.trim();
      if (!p) continue;

      if (p.length > 420) {
        const subSentences = p.split(/([\.!؟])\s+/);
        let currentChunk = '';
        for (let i = 0; i < subSentences.length; i += 2) {
          const sentence = subSentences[i] + (subSentences[i + 1] || '');
          if ((currentChunk + ' ' + sentence).length > 320 && currentChunk.length > 80) {
            paragraphs.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk = currentChunk ? (currentChunk + ' ' + sentence) : sentence;
          }
        }
        if (currentChunk.trim()) {
          paragraphs.push(currentChunk.trim());
        }
      } else {
        paragraphs.push(p);
      }
    }

    // 5. تغليف الآيات بأقواس قرآنية مميزة ﴿ ﴾ وإبراز الكلمات الافتتاحية
    return paragraphs.map(p => {
      let formatted = p.replace(/[\(\{]\s*([^\)\}]+?)\s*[\)\}]/g, (match, verseContent) => {
        if (/[\u0600-\u06FF]/.test(verseContent) && !/^\d+$/.test(verseContent.trim())) {
          return '<span class="tafseer-quran-verse">﴿ ' + verseContent.trim() + ' ﴾</span>';
        }
        return match;
      });

      formatted = formatted.replace(/^(وقوله|قوله(?:\s+تعالى)?|والمراد\s*[\:]?|والمعنى\s*[\:]?|فإن\s+قيل\s*[\:]?|قلنا\s*[\:]?|بل\s+نقول\s*[\:]?|فالمقصود\s*[\:]?|أى\s*[\:]?|أي\s*[\:]?|الصفة\s+[^\:]+\:|والصفة\s+[^\:]+\:|قال\s+[^\:]+\:|ورحم\s+الله\s+[^\:]+\:)/, '<strong class="tafseer-keyword">$1</strong>');

      return '<p class="tafseer-p">' + formatted + '</p>';
    }).join('');
  }

  function renderTafseerContent(rawHtml) {
    if (!dom.sheetTafseerText) return;
    dom.sheetTafseerText.innerHTML = formatTafseerText(rawHtml);
  }

  function openAyahTafseerModal() {
    if (!selectedAyahContext) return;
    const { surah, ayah } = selectedAyahContext;
    const surahObj = window.getSurahById ? window.getSurahById(surah) : null;
    const sName = surahObj ? surahObj.name : `السورة ${surah}`;
    if (dom.tafseerModalTitle) {
      dom.tafseerModalTitle.textContent = `تفسير سورة ${sName} | الآية ${ayah}`;
    }
    loadAyahTafseer(surah, ayah, currentSheetTafsirId);
    if (dom.tafseerModalBackdrop) {
      dom.tafseerModalBackdrop.classList.add('active', 'open');
      dom.tafseerModalBackdrop.style.display = 'block';
    }
    if (dom.ayahTafseerModal) {
      dom.ayahTafseerModal.classList.add('active', 'open');
      dom.ayahTafseerModal.style.display = 'flex';
    }
  }

  function closeAyahTafseerModal() {
    if (dom.tafseerModalBackdrop) {
      dom.tafseerModalBackdrop.classList.remove('active', 'open');
      dom.tafseerModalBackdrop.style.display = 'none';
    }
    if (dom.ayahTafseerModal) {
      dom.ayahTafseerModal.classList.remove('active', 'open');
      dom.ayahTafseerModal.style.display = 'none';
    }
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

    const hasN = hasNote(surahNum, ayahNum);
    if (dom.addNoteBtnText) {
      dom.addNoteBtnText.textContent = hasN ? 'تعديل الملاحظة على الآية' : 'ملاحظة على الآية أو متشابهات';
    }

    // Load words into action sheet for word-by-word selection
    fetchAyahWordsForSheet(surahNum, ayahNum);

    if (dom.highlighterPalettePop) {
      dom.highlighterPalettePop.style.display = 'none';
    }

    if (dom.actionSheetBackdrop) {
      dom.actionSheetBackdrop.classList.add('active');
      dom.actionSheetBackdrop.classList.add('open');
    }
    if (dom.ayahActionSheet) {
      dom.ayahActionSheet.classList.add('active');
      dom.ayahActionSheet.classList.add('open');
    }
  }

  function closeAyahActionSheet() {
    if (dom.actionSheetBackdrop) {
      dom.actionSheetBackdrop.classList.remove('active');
      dom.actionSheetBackdrop.classList.remove('open');
    }
    if (dom.ayahActionSheet) {
      dom.ayahActionSheet.classList.remove('active');
      dom.ayahActionSheet.classList.remove('open');
    }
    if (dom.highlighterPalettePop) {
      dom.highlighterPalettePop.style.display = 'none';
    }
  }

  function closeAyahNoteModal() {
    if (dom.ayahNoteModal) {
      dom.ayahNoteModal.hidden = true;
      dom.ayahNoteModal.style.display = 'none';
    }
  }

  function refreshPolygonsDecoration() {
    if (!dom.overlaySvg) return;

    // 1. Ensure wordHighlightsGroup exists on SVG
    let wordGroup = dom.overlaySvg.querySelector('#wordHighlightsGroup');
    if (!wordGroup) {
      wordGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      wordGroup.setAttribute('id', 'wordHighlightsGroup');
      wordGroup.setAttribute('class', 'word-highlights-group');
      dom.overlaySvg.appendChild(wordGroup);
    }
    wordGroup.innerHTML = '';

    if (!window.AppState) window.AppState = {};
    if (!window.AppState.wordHighlights) window.AppState.wordHighlights = {};

    dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
      const s = parseInt(p.getAttribute('data-surah'), 10);
      const a = parseInt(p.getAttribute('data-ayah'), 10);

      if (isBookmarked(s, a)) p.classList.add('bookmarked-ayah');
      else p.classList.remove('bookmarked-ayah');

      if (isFlagged(s, a)) p.classList.add('flagged-red-ayah');
      else p.classList.remove('flagged-red-ayah');

      if (hasNote(s, a)) p.classList.add('has-note-ayah');
      else p.classList.remove('has-note-ayah');

      p.classList.remove('highlight-yellow', 'highlight-red', 'highlight-blue');

      // Check for word highlights for this ayah
      const prefix = `${s}:${a}:`;
      const wordKeys = Object.keys(window.AppState.wordHighlights).filter(k => k.startsWith(prefix));

      if (wordKeys.length > 0) {
        const polyItem = MushafState.pagePolygons ? MushafState.pagePolygons.find(it => it.surahNumber === s && it.ayahNumber === a) : null;
        if (polyItem && polyItem.polygon) {
          let words = null;
          const verseKey = `${s}:${a}`;
          const foundVerse = MushafState.pageVerses && MushafState.pageVerses.find(v => v.verse_key === verseKey);
          if (foundVerse && (foundVerse.text_uthmani || foundVerse.text_imlaei)) {
            const txt = foundVerse.text_uthmani || foundVerse.text_imlaei;
            words = txt.trim().split(/\s+/).filter(Boolean);
          }
          if (!words && selectedAyahContext && selectedAyahContext.surah === s && selectedAyahContext.ayah === a && selectedAyahWords.length > 0) {
            words = selectedAyahWords;
          }
          if (!words) {
            const maxIdx = Math.max(...wordKeys.map(k => parseInt(k.split(':')[2], 10)));
            words = Array(maxIdx + 1).fill('كلمة');
          }

          const wordRects = computeWordRects(polyItem.polygon, words);

          wordKeys.forEach(k => {
            const wIdx = parseInt(k.split(':')[2], 10);
            const color = window.AppState.wordHighlights[k];
            if (color && wordRects[wIdx]) {
              wordRects[wIdx].forEach(subRect => {
                const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rectEl.setAttribute('x', subRect.x);
                rectEl.setAttribute('y', subRect.y);
                rectEl.setAttribute('width', subRect.width);
                rectEl.setAttribute('height', subRect.height);
                rectEl.setAttribute('rx', '2');
                rectEl.setAttribute('ry', '2');
                rectEl.setAttribute('class', `word-highlight-rect highlight-${color}`);
                wordGroup.appendChild(rectEl);
              });
            }
          });
        }
      } else {
        // Fallback: whole ayah highlight if exists
        const hColor = getAyahHighlight(s, a);
        if (hColor) {
          p.classList.add(`highlight-${hColor}`);
        }
      }
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

    // Toggle Select All Words
    if (dom.toggleSelectAllWordsBtn) {
      dom.toggleSelectAllWordsBtn.addEventListener('click', () => {
        if (!selectedAyahWords.length) return;
        if (selectedWordIndices.size === selectedAyahWords.length) {
          selectedWordIndices.clear();
        } else {
          selectedAyahWords.forEach((_, idx) => selectedWordIndices.add(idx));
        }
        if (selectedAyahContext) {
          renderSheetWordTokens(selectedAyahContext.surah, selectedAyahContext.ayah);
        }
        updateSelectedWordsCounter();
      });
    }

    // Clear Word Selection
    if (dom.clearWordSelectionBtn) {
      dom.clearWordSelectionBtn.addEventListener('click', () => {
        selectedWordIndices.clear();
        if (selectedAyahContext) {
          renderSheetWordTokens(selectedAyahContext.surah, selectedAyahContext.ayah);
        }
        updateSelectedWordsCounter();
      });
    }

    // Open dedicated Tafseer modal button
    if (dom.openTafseerBtn) {
      dom.openTafseerBtn.addEventListener('click', () => {
        openAyahTafseerModal();
      });
    }

    // Close dedicated Tafseer modal
    if (dom.closeTafseerModalBtn) {
      dom.closeTafseerModalBtn.addEventListener('click', closeAyahTafseerModal);
    }
    if (dom.tafseerModalBackdrop) {
      dom.tafseerModalBackdrop.addEventListener('click', closeAyahTafseerModal);
    }

    // Tafseer switcher tabs in dedicated Tafseer modal
    if (dom.ayahTafseerModal) {
      dom.ayahTafseerModal.querySelectorAll('.tafseer-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tafsirId = parseInt(btn.getAttribute('data-tafsir'), 10);
          if (selectedAyahContext) {
            loadAyahTafseer(selectedAyahContext.surah, selectedAyahContext.ayah, tafsirId);
          }
        });
      });
    }

    // Highlighter Pen Toggle & Palette Selection (دوائر الألوان فقط بدون نصوص)
    let activePenColor = 'red';

    function applyPenColor(color) {
      if (!selectedAyahContext) return;
      const { surah, ayah } = selectedAyahContext;
      if (!window.AppState) window.AppState = {};
      if (!window.AppState.wordHighlights) window.AppState.wordHighlights = {};
      if (!window.AppState.ayahHighlights) window.AppState.ayahHighlights = {};

      const targetIndices = selectedWordIndices.size > 0
        ? Array.from(selectedWordIndices)
        : selectedAyahWords.map((_, i) => i);

      if (color === 'none') {
        targetIndices.forEach(idx => {
          delete window.AppState.wordHighlights[`${surah}:${ayah}:${idx}`];
        });
        delete window.AppState.ayahHighlights[`${surah}:${ayah}`];
        if (window.showToast) window.showToast('تمت إزالة التظليل');
      } else {
        targetIndices.forEach(idx => {
          window.AppState.wordHighlights[`${surah}:${ayah}:${idx}`] = color;
        });
        delete window.AppState.ayahHighlights[`${surah}:${ayah}`];
        const cName = color === 'yellow' ? 'الأصفر' : (color === 'red' ? 'الأحمر' : 'الأزرق');
        if (window.showToast) window.showToast(`تم التظليل باللون ${cName}`);
      }

      if (window.persistState) window.persistState();
      renderSheetWordTokens(surah, ayah);
      refreshPolygonsDecoration();
    }

    function setPenActiveColor(color) {
      activePenColor = color;
      const colorMap = {
        red: '#ef4444',
        yellow: '#eab308',
        blue: '#0284c7'
      };
      if (dom.highlighterPenColorDot) {
        dom.highlighterPenColorDot.style.backgroundColor = colorMap[color] || '#ef4444';
      }
      if (dom.highlighterPalettePop) {
        dom.highlighterPalettePop.querySelectorAll('.pen-palette-btn').forEach(b => {
          const c = b.getAttribute('data-color');
          b.classList.toggle('active', c === color);
        });
      }
    }

    if (dom.highlighterPenBtn) {
      dom.highlighterPenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!dom.highlighterPalettePop) return;
        const isHidden = dom.highlighterPalettePop.style.display === 'none';
        dom.highlighterPalettePop.style.display = isHidden ? 'flex' : 'none';
      });
    }

    if (dom.highlighterPalettePop) {
      dom.highlighterPalettePop.addEventListener('click', (e) => {
        const btn = e.target.closest('.pen-palette-btn');
        if (!btn) return;
        e.stopPropagation();
        const color = btn.getAttribute('data-color');
        if (color !== 'none') {
          setPenActiveColor(color);
        }
        applyPenColor(color);
        dom.highlighterPalettePop.style.display = 'none';
      });
    }

    document.addEventListener('click', (e) => {
      if (dom.highlighterPalettePop && dom.highlighterPalettePop.style.display !== 'none') {
        if (!e.target.closest('.highlighter-pen-wrapper')) {
          dom.highlighterPalettePop.style.display = 'none';
        }
      }
    });

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

    // زر الملاحظات: يفتح مباشرة نافذة ملاحظات الصفحة الحالية الشاملة
    if (dom.addNoteAyahBtn) {
      dom.addNoteAyahBtn.addEventListener('click', () => {
        closeAyahActionSheet();
        openPageNotesModal();
      });
    }
  }

  // --- PAGE NOTES (ملاحظات خاصة بكل صفحة على حدة) ---

  function updatePageNotesIndicator(pageNum) {
    if (!dom.pageNotesDotIndicator) return;
    const hasNote = window.AppState && window.AppState.pageNotes && window.AppState.pageNotes[pageNum] && window.AppState.pageNotes[pageNum].trim().length > 0;
    dom.pageNotesDotIndicator.style.display = hasNote ? 'block' : 'none';
    if (dom.openPageNotesBtn) {
      dom.openPageNotesBtn.style.color = hasNote ? 'var(--primary)' : '';
      dom.openPageNotesBtn.style.borderColor = hasNote ? 'var(--primary)' : '';
    }
  }

  function openPageNotesModal() {
    const curP = MushafState.currentPage;
    if (dom.pageNotesModalTitle) {
      dom.pageNotesModalTitle.textContent = `ملاحظات صفحة ${curP}`;
    }
    const curNote = (window.AppState && window.AppState.pageNotes && window.AppState.pageNotes[curP]) || '';
    if (dom.pageNotesTextarea) {
      dom.pageNotesTextarea.value = curNote;
    }

    // عرض ملاحظات آيات الصفحة إن وجدت
    if (dom.pageAyahNotesList && dom.pageAyahNotesSection) {
      dom.pageAyahNotesList.innerHTML = '';
      const notesOnThisPage = [];
      if (window.AppState && window.AppState.ayahNotes && MushafState.pagePolygons) {
        const seen = new Set();
        MushafState.pagePolygons.forEach(p => {
          const key = `${p.surahNumber}:${p.ayahNumber}`;
          if (!seen.has(key) && window.AppState.ayahNotes[key]) {
            seen.add(key);
            const surahObj = window.getSurahById ? window.getSurahById(p.surahNumber) : null;
            const sName = surahObj ? surahObj.name : `السورة ${p.surahNumber}`;
            notesOnThisPage.push({
              surahName: sName,
              ayah: p.ayahNumber,
              text: window.AppState.ayahNotes[key]
            });
          }
        });
      }

      if (notesOnThisPage.length > 0) {
        notesOnThisPage.forEach(n => {
          const item = document.createElement('div');
          item.className = 'page-ayah-note-item';
          const safeText = n.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          item.innerHTML = `
            <div class="page-ayah-note-badge">سورة ${n.surahName} | آية ${n.ayah}</div>
            <div style="color:var(--text-main); font-size:0.8rem; white-space:pre-wrap;">${safeText}</div>
          `;
          dom.pageAyahNotesList.appendChild(item);
        });
        dom.pageAyahNotesSection.style.display = 'block';
      } else {
        dom.pageAyahNotesSection.style.display = 'none';
      }
    }

    if (dom.pageNotesBackdrop) dom.pageNotesBackdrop.hidden = false;
    if (dom.pageNotesModal) {
      dom.pageNotesModal.hidden = false;
      if (dom.pageNotesTextarea) dom.pageNotesTextarea.focus();
    }
  }

  function closePageNotesModal() {
    if (dom.pageNotesBackdrop) dom.pageNotesBackdrop.hidden = true;
    if (dom.pageNotesModal) dom.pageNotesModal.hidden = true;
  }

  function initPageNotes() {
    if (dom.openPageNotesBtn) {
      dom.openPageNotesBtn.addEventListener('click', openPageNotesModal);
    }
    if (dom.closePageNotesBtn) {
      dom.closePageNotesBtn.addEventListener('click', closePageNotesModal);
    }
    if (dom.cancelPageNoteBtn) {
      dom.cancelPageNoteBtn.addEventListener('click', closePageNotesModal);
    }
    if (dom.pageNotesBackdrop) {
      dom.pageNotesBackdrop.addEventListener('click', closePageNotesModal);
    }

    if (dom.savePageNoteBtn) {
      dom.savePageNoteBtn.addEventListener('click', () => {
        const curP = MushafState.currentPage;
        const val = dom.pageNotesTextarea ? dom.pageNotesTextarea.value.trim() : '';
        if (!window.AppState) window.AppState = {};
        if (!window.AppState.pageNotes) window.AppState.pageNotes = {};

        if (val) {
          window.AppState.pageNotes[curP] = val;
          if (window.showToast) window.showToast(`تم حفظ ملاحظات صفحة ${curP} بنجاح`);
        } else {
          delete window.AppState.pageNotes[curP];
          if (window.showToast) window.showToast(`تم إفراغ ملاحظات صفحة ${curP}`);
        }
        if (window.persistState) window.persistState();
        updatePageNotesIndicator(curP);
        closePageNotesModal();
      });
    }

    if (dom.deletePageNoteBtn) {
      dom.deletePageNoteBtn.addEventListener('click', () => {
        const curP = MushafState.currentPage;
        if (window.AppState && window.AppState.pageNotes) {
          delete window.AppState.pageNotes[curP];
        }
        if (window.persistState) window.persistState();
        updatePageNotesIndicator(curP);
        closePageNotesModal();
        if (window.showToast) window.showToast(`تم حذف ملاحظات صفحة ${curP}`);
      });
    }
  }

  // --- RECITER AUDIO PLAYER (ZERO-LATENCY WEB AUDIO API & GAPLESS PLAYBACK) ---

  // وقفة طبيعية مريحة وسريعة بين الآيات (600ms أي 0.6 ثانية كما طلب المستخدم)
  const RECITER_VERSE_PAUSE_MS = 600;
  const AUDIO_CACHE_NAME = 'seraj-audio-cache-v1';

  const ReciterPlayer = {
    ctx: null,
    gainNode: null,
    currentSource: null,
    fallbackAudio: new Audio(),
    isPlaying: false,
    nextVerseTimer: null,
    currentSurah: 1,
    currentAyah: 1,
    reciter: 'Abdurrahmaan_As-Sudais_192kbps',
    ayahRepeatCount: 1,
    ayahCurrentPlayed: 0,
    speed: 1.0,
    versePauseMs: 0, // تلاوة متصلة وسلسة دائماً بدون توقف
    masterRepeatEnabled: false,
    repeatMode: 'ayah',
    unifiedRepeatCount: 2,
    ayahRangeEnabled: false,
    ayahRangeStart: 1,
    ayahRangeEnd: 10,
    rangeRepeatCount: 2,
    rangeCurrentPlayed: 0,
    ayahRangeStartPage: 1
  };

  const decodedBufferCache = new Map();

  function ensureAudioContext() {
    if (!ReciterPlayer.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ReciterPlayer.ctx = new AudioCtx();
        ReciterPlayer.gainNode = ReciterPlayer.ctx.createGain();
        ReciterPlayer.gainNode.connect(ReciterPlayer.ctx.destination);
      }
    }
    if (ReciterPlayer.ctx && ReciterPlayer.ctx.state === 'suspended') {
      ReciterPlayer.ctx.resume().catch(() => { });
    }
  }

  const FADE_SEC = 0.015; // تلاشي 15ms

  // مصدر صوتي بعقدة جين خاصة به لإتاحة التلاشي عند البدء/الإيقاف
  function createFadeSource(buffer, fadeIn) {
    const ctx = ReciterPlayer.ctx;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = ReciterPlayer.speed || 1.0;
    src.connect(g);
    g.connect(ReciterPlayer.gainNode);
    src._g = g;
    if (fadeIn) {
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + FADE_SEC);
    }
    return src;
  }

  // إيقاف ناعم: تلاشي 15ms ثم stop (يمنع الطقطقة)
  function fadeStopSource(src) {
    if (!src) return;
    try {
      src.onended = null;
      const ctx = ReciterPlayer.ctx;
      const t = ctx.currentTime;
      if (src._g) {
        src._g.gain.cancelScheduledValues(t);
        src._g.gain.setValueAtTime(src._g.gain.value, t);
        src._g.gain.linearRampToValueAtTime(0, t + FADE_SEC);
        src.stop(t + FADE_SEC + 0.005);
      } else {
        src.stop(0);
      }
    } catch (_) { }
  }

  function decodeAudioBufferSafely(arrayBuffer) {
    return new Promise((resolve, reject) => {
      if (!ReciterPlayer.ctx) {
        reject(new Error('No AudioContext'));
        return;
      }
      try {
        const res = ReciterPlayer.ctx.decodeAudioData(
          arrayBuffer,
          (buf) => resolve(buf),
          (err) => reject(err)
        );
        if (res && typeof res.then === 'function') {
          res.then(resolve).catch(reject);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  function trimSilenceFromBuffer(buf) {
    if (!buf || !ReciterPlayer.ctx) return buf;
    try {
      const channel = buf.getChannelData(0);
      const sr = buf.sampleRate;
      const len = channel.length;
      if (len < sr * 0.25) return buf;

      // 1. حساب أعلى شدة للصوت لتحديد عتبة الكشف بدقة متناسبة مع التسجيل
      let peak = 0;
      for (let i = 0; i < len; i += 32) {
        const v = Math.abs(channel[i]);
        if (v > peak) peak = v;
      }
      if (peak < 0.04) return buf; // صوت منخفض جداً

      const voiceThreshold = Math.max(0.007, Math.min(0.02, peak * 0.035));
      const win = Math.floor(sr * 0.015); // 15ms نافذة كشف

      // 2. كشف بداية صوت الآية الفعلي
      let start = 0;
      for (let i = 0; i < len - win; i += win) {
        let sum = 0;
        for (let j = 0; j < win; j++) {
          const s = channel[i + j];
          sum += s * s;
        }
        if (Math.sqrt(sum / win) > voiceThreshold) {
          // هامش 15ms يحفظ أول حرف بدون ترك صمت زائد
          start = Math.max(0, i - Math.floor(sr * 0.015));
          break;
        }
      }

      // 3. كشف نهاية صوت الآية الفعلي
      let end = len - 1;
      for (let i = len - win; i >= 0; i -= win) {
        let sum = 0;
        for (let j = 0; j < win; j++) {
          const s = channel[i + j];
          sum += s * s;
        }
        if (Math.sqrt(sum / win) > voiceThreshold) {
          // هامش 25ms يحفظ المد وصدى الحرف ونزول الصوت بنعومة
          end = Math.min(len - 1, i + win + Math.floor(sr * 0.025));
          break;
        }
      }

      const trimLen = end - start + 1;
      if (trimLen > sr * 0.2 && trimLen < len) {
        const trimmed = ReciterPlayer.ctx.createBuffer(buf.numberOfChannels, trimLen, sr);
        // تلاشي ناعم متقاطع (Smooth S-Curve Envelope 12ms) يمنع أي حدة أو نقرة صوتية
        const fadeSamples = Math.min(Math.floor(sr * 0.012), Math.floor(trimLen / 8));
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const src = buf.getChannelData(c);
          const dst = trimmed.getChannelData(c);
          for (let i = 0; i < trimLen; i++) {
            let s = src[start + i];
            if (i < fadeSamples) {
              const t = i / fadeSamples;
              s *= (0.5 - 0.5 * Math.cos(Math.PI * t));
            } else if (i > trimLen - fadeSamples) {
              const t = (trimLen - i) / fadeSamples;
              s *= (0.5 - 0.5 * Math.cos(Math.PI * t));
            }
            dst[i] = s;
          }
        }
        return trimmed;
      }
    } catch (_) { }
    return buf;
  }

  let tempAudioOptions = {
    masterRepeatEnabled: false,
    repeatMode: 'ayah',
    repeatCount: 2,
    rangeStartAyah: 1,
    rangeEndAyah: 10,
    speed: 1.0,
    pauseSec: 1
  };

  function initReciterPlayer() {
    ReciterPlayer.fallbackAudio.addEventListener('ended', onReciterVerseEnded);
    ReciterPlayer.fallbackAudio.addEventListener('error', onReciterAudioError);

    // أزرار التحكم بالمشغل العائم: فتح وإغلاق
    if (dom.openFloatingPlayerBtn) {
      dom.openFloatingPlayerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFloatingPlayer(true);
      });
    }
    if (dom.closeFloatingPlayerBtn) {
      dom.closeFloatingPlayerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFloatingPlayer(false, true);
      });
    }

    if (dom.mushafReciterSelect) {
      dom.mushafReciterSelect.addEventListener('change', (e) => {
        ReciterPlayer.reciter = e.target.value;
        decodedBufferCache.clear();
        if (dom.downloadReciterSelect) {
          dom.downloadReciterSelect.value = e.target.value;
          updateDownloadCardStatus();
          updateDownloadedSurahsList();
        }
      });
    }

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

  // --- CUSTOM RECITERS LIST & MODAL ---
  const MUSHAF_RECITERS = [
    { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'عبد الرحمن السديس', riwayah: 'حفص عن عاصم - الحرم المكي', bit: '192kbps' },
    { id: 'Husary_128kbps', name: 'محمود خليل الحصري', riwayah: 'حفص عن عاصم - المصحف المعلم', bit: '128kbps' },
    { id: 'Alafasy_128kbps', name: 'مشاري راشد العفاسي', riwayah: 'حفص عن عاصم - مرتل عذب', bit: '128kbps' },
    { id: 'Maher_AlMuaiqly_64kbps', name: 'ماهر المعيقلي', riwayah: 'حفص عن عاصم - الحرم المكي', bit: '64kbps' },
    { id: 'Abdul_Basit_Murattal_192kbps', name: 'عبد الباسط عبد الصمد', riwayah: 'حفص عن عاصم - مرتل مجود', bit: '192kbps' },
    { id: 'Minshawy_Murattal_128kbps', name: 'محمد صديق المنشاوي', riwayah: 'حفص عن عاصم - مرتل خاشع', bit: '128kbps' },
    { id: 'Ghamadi_40kbps', name: 'سعد الغامدي', riwayah: 'حفص عن عاصم - مرتل', bit: '40kbps' },
    { id: 'Abu_Bakr_Ash-Shaatree_128kbps', name: 'أبو بكر الشاطري', riwayah: 'حفص عن عاصم - مرتل', bit: '128kbps' },
    { id: 'Yasser_Ad-Dussary_128kbps', name: 'ياسر الدوسري', riwayah: 'حفص عن عاصم - الحرم المكي', bit: '128kbps' },
    { id: 'Saood_ash-Shuraym_128kbps', name: 'سعود الشريم', riwayah: 'حفص عن عاصم - الحرم المكي', bit: '128kbps' }
  ];

  function openReciterPickerModal() {
    if (dom.reciterPickerModal) dom.reciterPickerModal.hidden = false;
    if (dom.reciterModalBackdrop) dom.reciterModalBackdrop.hidden = false;
    renderReciterCards(MUSHAF_RECITERS);
    if (dom.reciterSearchInput) {
      dom.reciterSearchInput.value = '';
      setTimeout(() => dom.reciterSearchInput.focus(), 100);
    }
  }

  function closeReciterPickerModal() {
    if (dom.reciterPickerModal) dom.reciterPickerModal.hidden = true;
    if (dom.reciterModalBackdrop) dom.reciterModalBackdrop.hidden = true;
  }

  function renderReciterCards(list) {
    if (!dom.reciterCardsList) return;
    dom.reciterCardsList.innerHTML = '';
    const currentId = (dom.mushafReciterSelect && dom.mushafReciterSelect.value) || ReciterPlayer.reciter;

    list.forEach(r => {
      const card = document.createElement('div');
      card.className = `reciter-card-item ${r.id === currentId ? 'active' : ''}`;
      card.setAttribute('data-reciter-id', r.id);

      const initial = r.name.trim().charAt(0);

      card.innerHTML = `
        <div class="reciter-card-info-wrap">
          <div class="reciter-card-avatar">${initial}</div>
          <div class="reciter-card-texts">
            <span class="reciter-card-name">${r.name}</span>
            <span class="reciter-card-riwayah">${r.riwayah}</span>
          </div>
        </div>
        <div class="reciter-check-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:13px;height:13px;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      `;

      card.addEventListener('click', () => {
        selectReciter(r.id);
        closeReciterPickerModal();
      });

      dom.reciterCardsList.appendChild(card);
    });
  }

  function selectReciter(reciterId) {
    const found = MUSHAF_RECITERS.find(r => r.id === reciterId);
    if (!found) return;

    ReciterPlayer.reciter = reciterId;
    if (dom.mushafReciterSelect) {
      dom.mushafReciterSelect.value = reciterId;
    }
    if (dom.downloadReciterSelect) {
      dom.downloadReciterSelect.value = reciterId;
    }
    if (dom.currentReciterNameDisplay) {
      dom.currentReciterNameDisplay.textContent = found.name;
    }
    decodedBufferCache.clear();
    localStorage.setItem('tibyan_current_reciter', reciterId);

    if (window.showToast) window.showToast(`تم اختيار القارئ: ${found.name}`);
    updateDownloadCardStatus();
    updateDownloadedSurahsList();
  }

  function initReciterPickerModal() {
    // Restore saved reciter
    const savedReciter = localStorage.getItem('tibyan_current_reciter') || 'Abdurrahmaan_As-Sudais_192kbps';
    const initialReciter = MUSHAF_RECITERS.find(r => r.id === savedReciter) || MUSHAF_RECITERS[0];
    if (dom.currentReciterNameDisplay) {
      dom.currentReciterNameDisplay.textContent = initialReciter.name;
    }
    if (dom.mushafReciterSelect) {
      dom.mushafReciterSelect.value = initialReciter.id;
    }
    ReciterPlayer.reciter = initialReciter.id;

    if (dom.openReciterModalBtn) {
      dom.openReciterModalBtn.addEventListener('click', openReciterPickerModal);
    }
    if (dom.closeReciterPickerBtn) {
      dom.closeReciterPickerBtn.addEventListener('click', closeReciterPickerModal);
    }
    if (dom.reciterModalBackdrop) {
      dom.reciterModalBackdrop.addEventListener('click', closeReciterPickerModal);
    }

    if (dom.reciterSearchInput) {
      dom.reciterSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        const filtered = MUSHAF_RECITERS.filter(r =>
          r.name.toLowerCase().includes(query) || r.riwayah.toLowerCase().includes(query)
        );
        renderReciterCards(filtered);
      });
    }
  }

  // Toggle Floating Glassmorphic Player
  function toggleFloatingPlayer(forceState, showPill = false) {
    if (!dom.floatingControls) return;
    dom.floatingControls.style.display = ''; // Clear legacy inline style
    const isHidden = dom.floatingControls.classList.contains('player-hidden');
    const shouldShow = (typeof forceState === 'boolean') ? forceState : isHidden;

    if (shouldShow) {
      dom.floatingControls.classList.remove('player-hidden');
      if (dom.openFloatingPlayerBtn) {
        dom.openFloatingPlayerBtn.style.display = 'none';
      }
    } else {
      dom.floatingControls.classList.add('player-hidden');
      if (dom.openFloatingPlayerBtn) {
        dom.openFloatingPlayerBtn.style.display = showPill ? 'inline-flex' : 'none';
      }
    }
  }

  function initAudioOptionsModal() {
    if (dom.audioOptionsBtn) {
      dom.audioOptionsBtn.addEventListener('click', openAudioOptionsModal);
    }
    if (dom.closeAudioOptionsBtn) {
      dom.closeAudioOptionsBtn.addEventListener('click', closeAudioOptionsModal);
    }
    if (dom.cancelAudioOptionsBtn) {
      dom.cancelAudioOptionsBtn.addEventListener('click', closeAudioOptionsModal);
    }
    if (dom.audioOptionsBackdrop) {
      dom.audioOptionsBackdrop.addEventListener('click', closeAudioOptionsModal);
    }

    // Range Ayah Inputs (من الآية إلى الآية)
    if (dom.pageRepeatStartInput) {
      dom.pageRepeatStartInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) || 1;
        tempAudioOptions.rangeStartAyah = val;
        const curSurah = MushafState.activeSurahId || 1;
        const surahObj = window.getSurahById ? window.getSurahById(curSurah) : null;
        const sName = surahObj ? ` (${surahObj.name})` : '';
        if (dom.rangeStartSubtext) dom.rangeStartSubtext.textContent = `الآية ${val}${sName}`;
      });
    }
    if (dom.pageRepeatEndInput) {
      dom.pageRepeatEndInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) || 1;
        tempAudioOptions.rangeEndAyah = val;
        const curSurah = MushafState.activeSurahId || 1;
        const surahObj = window.getSurahById ? window.getSurahById(curSurah) : null;
        const sName = surahObj ? ` (${surahObj.name})` : '';
        if (dom.rangeEndSubtext) dom.rangeEndSubtext.textContent = `الآية ${val}${sName}`;
      });
    }

    // مفتاح التكرار الشامل الواحد
    if (dom.masterRepeatToggle) {
      dom.masterRepeatToggle.addEventListener('change', (e) => {
        tempAudioOptions.masterRepeatEnabled = e.target.checked;
        if (dom.repeatControlsContainer) {
          dom.repeatControlsContainer.style.opacity = e.target.checked ? '1' : '0.45';
          dom.repeatControlsContainer.style.pointerEvents = e.target.checked ? 'auto' : 'none';
        }
      });
    }

    // تكرار النطاق المحدد
    if (dom.rangeRepeatIncBtn) {
      dom.rangeRepeatIncBtn.addEventListener('click', () => {
        tempAudioOptions.rangeRepeatCount = (tempAudioOptions.rangeRepeatCount || 1) + 1;
        if (tempAudioOptions.rangeRepeatCount > 99) tempAudioOptions.rangeRepeatCount = 99;
        if (dom.rangeRepeatCountDisplay) dom.rangeRepeatCountDisplay.textContent = tempAudioOptions.rangeRepeatCount;
      });
    }
    if (dom.rangeRepeatDecBtn) {
      dom.rangeRepeatDecBtn.addEventListener('click', () => {
        if (tempAudioOptions.rangeRepeatCount > 1) {
          tempAudioOptions.rangeRepeatCount--;
          if (dom.rangeRepeatCountDisplay) dom.rangeRepeatCountDisplay.textContent = tempAudioOptions.rangeRepeatCount;
        }
      });
    }

    // تكرار كل آية
    if (dom.ayahRepeatIncBtn) {
      dom.ayahRepeatIncBtn.addEventListener('click', () => {
        tempAudioOptions.ayahRepeatCount = (tempAudioOptions.ayahRepeatCount || 1) + 1;
        if (tempAudioOptions.ayahRepeatCount > 99) tempAudioOptions.ayahRepeatCount = 99;
        if (dom.ayahRepeatCountDisplay) dom.ayahRepeatCountDisplay.textContent = tempAudioOptions.ayahRepeatCount;
      });
    }
    if (dom.ayahRepeatDecBtn) {
      dom.ayahRepeatDecBtn.addEventListener('click', () => {
        if (tempAudioOptions.ayahRepeatCount > 1) {
          tempAudioOptions.ayahRepeatCount--;
          if (dom.ayahRepeatCountDisplay) dom.ayahRepeatCountDisplay.textContent = tempAudioOptions.ayahRepeatCount;
        }
      });
    }

    // سرعة القارئ
    if (dom.audioSpeedChips) {
      dom.audioSpeedChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.opt-chip');
        if (!chip) return;
        dom.audioSpeedChips.querySelectorAll('.opt-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        tempAudioOptions.speed = parseFloat(chip.getAttribute('data-speed'));
      });
    }

    // حفظ الخيارات
    if (dom.saveAudioOptionsBtn) {
      dom.saveAudioOptionsBtn.addEventListener('click', saveAudioOptions);
    }
  }

  function openAudioOptionsModal() {
    ensureAudioContext();
    const curSurah = MushafState.activeSurahId || 1;
    const curAyah = MushafState.activeAyahNum || 1;
    const maxV = getAudioSurahAyahs(curSurah);
    const surahObj = window.getSurahById ? window.getSurahById(curSurah) : null;
    const surahName = surahObj ? ` (${surahObj.name})` : '';

    tempAudioOptions = {
      masterRepeatEnabled: (typeof ReciterPlayer.masterRepeatEnabled === 'boolean') ? ReciterPlayer.masterRepeatEnabled : false,
      rangeRepeatCount: ReciterPlayer.rangeRepeatCount || 1,
      ayahRepeatCount: ReciterPlayer.ayahRepeatCount || 1,
      rangeStartAyah: ReciterPlayer.ayahRangeStart || curAyah,
      rangeEndAyah: ReciterPlayer.ayahRangeEnd || Math.min(maxV, curAyah + 5),
      speed: ReciterPlayer.speed || 1.0,
      pauseSec: 0
    };

    if (dom.pageRepeatStartInput) {
      dom.pageRepeatStartInput.min = 1;
      dom.pageRepeatStartInput.max = maxV;
      dom.pageRepeatStartInput.value = tempAudioOptions.rangeStartAyah;
    }
    if (dom.rangeStartSubtext) {
      dom.rangeStartSubtext.textContent = `الآية ${tempAudioOptions.rangeStartAyah}${surahName}`;
    }

    if (dom.pageRepeatEndInput) {
      dom.pageRepeatEndInput.min = 1;
      dom.pageRepeatEndInput.max = maxV;
      dom.pageRepeatEndInput.value = tempAudioOptions.rangeEndAyah;
    }
    if (dom.rangeEndSubtext) {
      dom.rangeEndSubtext.textContent = `الآية ${tempAudioOptions.rangeEndAyah}${surahName}`;
    }

    // مفتاح التكرار الشامل الواحد
    if (dom.masterRepeatToggle) dom.masterRepeatToggle.checked = tempAudioOptions.masterRepeatEnabled;
    if (dom.repeatControlsContainer) {
      dom.repeatControlsContainer.style.opacity = tempAudioOptions.masterRepeatEnabled ? '1' : '0.45';
      dom.repeatControlsContainer.style.pointerEvents = tempAudioOptions.masterRepeatEnabled ? 'auto' : 'none';
    }

    if (dom.rangeRepeatCountDisplay) dom.rangeRepeatCountDisplay.textContent = tempAudioOptions.rangeRepeatCount;
    if (dom.ayahRepeatCountDisplay) dom.ayahRepeatCountDisplay.textContent = tempAudioOptions.ayahRepeatCount;

    // سرعة التلاوة
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
    ReciterPlayer.speed = tempAudioOptions.speed || 1.0;
    if (ReciterPlayer.currentSource) {
      ReciterPlayer.currentSource.playbackRate.value = ReciterPlayer.speed;
    }
    if (ReciterPlayer.fallbackAudio) {
      ReciterPlayer.fallbackAudio.playbackRate = ReciterPlayer.speed;
    }

    ReciterPlayer.versePauseMs = 0; // متصل تماماً دائماً
    localStorage.removeItem('tibyan_reciter_pause_ms');

    ReciterPlayer.masterRepeatEnabled = tempAudioOptions.masterRepeatEnabled;
    ReciterPlayer.rangeRepeatCount = tempAudioOptions.rangeRepeatCount || 1;
    ReciterPlayer.ayahRepeatCount = tempAudioOptions.ayahRepeatCount || 1;

    ReciterPlayer.ayahRangeStart = tempAudioOptions.rangeStartAyah;
    ReciterPlayer.ayahRangeEnd = tempAudioOptions.rangeEndAyah;
    ReciterPlayer.rangeCurrentPlayed = 0;
    ReciterPlayer.ayahCurrentPlayed = 0;

    if (tempAudioOptions.masterRepeatEnabled) {
      ReciterPlayer.ayahRangeEnabled = (tempAudioOptions.rangeRepeatCount > 1 || (tempAudioOptions.rangeStartAyah && tempAudioOptions.rangeEndAyah));
      const curSurah = MushafState.activeSurahId || 1;
      ReciterPlayer.ayahRangeStartPage = getAyahPageNumber(curSurah, ReciterPlayer.ayahRangeStart) || MushafState.currentPage;
    } else {
      ReciterPlayer.ayahRepeatCount = 1;
      ReciterPlayer.rangeRepeatCount = 1;
      ReciterPlayer.ayahRangeEnabled = false;
    }

    closeAudioOptionsModal();

    if (window.showToast) {
      let msg = `تم ضبط سرعة القارئ (${ReciterPlayer.speed}x)`;
      if (ReciterPlayer.masterRepeatEnabled) {
        msg += ` - التكرار مفعّل`;
      }
      window.showToast(msg);
    }
  }

  function getReciterAudioUrl(reciter, surah, ayah) {
    const sPad = String(surah).padStart(3, '0');
    const aPad = String(ayah).padStart(3, '0');
    return `https://everyayah.com/data/${reciter}/${sPad}${aPad}.mp3`;
  }

  const inFlightAudioPromises = new Map();

  async function getAyahAudioBuffer(reciter, surah, ayah) {
    ensureAudioContext();
    const key = `${reciter}_${surah}_${ayah}`;
    if (decodedBufferCache.has(key)) {
      return decodedBufferCache.get(key);
    }
    if (inFlightAudioPromises.has(key)) {
      return inFlightAudioPromises.get(key);
    }

    const task = (async () => {
      const url = getReciterAudioUrl(reciter, surah, ayah);
      let arrayBuf = null;

      // 1. فحص التخزين المحلي (Offline Cache)
      if ('caches' in window) {
        try {
          const cache = await caches.open(AUDIO_CACHE_NAME);
          const match = await cache.match(url);
          if (match) {
            arrayBuf = await match.arrayBuffer();
          }
        } catch (_) { }
      }

      // 2. التحميل عبر الإنترنت إذا لم تكن مخزنة
      if (!arrayBuf) {
        try {
          const resp = await fetch(url, { mode: 'cors' });
          if (resp && resp.ok) {
            const clone = resp.clone();
            if ('caches' in window) {
              caches.open(AUDIO_CACHE_NAME).then(c => c.put(url, clone)).catch(() => { });
            }
            arrayBuf = await resp.arrayBuffer();
          }
        } catch (e) {
          console.warn('Network fetch error:', e);
        }
      }

      if (!arrayBuf) return null;

      try {
        const decoded = await decodeAudioBufferSafely(arrayBuf);
        const cleanBuffer = trimSilenceFromBuffer(decoded);
        if (decodedBufferCache.size > 50) {
          const firstKey = decodedBufferCache.keys().next().value;
          decodedBufferCache.delete(firstKey);
        }
        decodedBufferCache.set(key, cleanBuffer);
        return cleanBuffer;
      } catch (e) {
        console.warn('Audio decode error:', e);
        return null;
      }
    })();

    inFlightAudioPromises.set(key, task);
    try {
      return await task;
    } finally {
      inFlightAudioPromises.delete(key);
    }
  }

  function preloadUpcomingVerses(surah, ayah) {
    const reciter = ReciterPlayer.reciter;
    const next1 = calculateNextVerse(surah, ayah);
    if (next1) {
      getAyahAudioBuffer(reciter, next1.surah, next1.ayah);
      const next2 = calculateNextVerse(next1.surah, next1.ayah);
      if (next2) {
        getAyahAudioBuffer(reciter, next2.surah, next2.ayah);
        const next3 = calculateNextVerse(next2.surah, next2.ayah);
        if (next3) {
          getAyahAudioBuffer(reciter, next3.surah, next3.ayah);
        }
      }
    }
  }

  function calculateNextVerse(curSurah, curAyah) {
    // 1. تكرار الآية الحالية
    if (ReciterPlayer.ayahRepeatCount > 1 && (ReciterPlayer.ayahCurrentPlayed + 1) < ReciterPlayer.ayahRepeatCount) {
      return { surah: curSurah, ayah: curAyah, isAyahRepeat: true };
    }

    // 2. تكرار النطاق المحدد (من الآية إلى الآية)
    if (ReciterPlayer.ayahRangeEnabled) {
      const startAyah = ReciterPlayer.ayahRangeStart || 1;
      const endAyah = ReciterPlayer.ayahRangeEnd || getAudioSurahAyahs(curSurah);

      if (curAyah >= endAyah) {
        const nextLoopCount = (ReciterPlayer.rangeCurrentPlayed || 0) + 1;
        const maxRep = ReciterPlayer.rangeRepeatCount || 1;
        if (maxRep === Infinity || nextLoopCount < maxRep) {
          return { surah: curSurah, ayah: startAyah, isRangeLoop: true, loopCount: nextLoopCount };
        } else {
          return null; // اكتمل تكرار النطاق
        }
      } else {
        return { surah: curSurah, ayah: curAyah + 1, isRangeLoop: false };
      }
    }

    // 3. التلاوة المتتابعة الطبيعية
    const maxVerses = getAudioSurahAyahs(curSurah);
    let nextSurah = curSurah;
    let nextAyah = curAyah + 1;

    if (nextAyah > maxVerses) {
      if (nextSurah < 114) {
        nextSurah++;
        nextAyah = 1;
      } else {
        return null;
      }
    }

    return { surah: nextSurah, ayah: nextAyah, isRangeLoop: false };
  }

  function stopCurrentPlayback() {
    if (ReciterPlayer.nextVerseTimer) {
      clearTimeout(ReciterPlayer.nextVerseTimer);
      ReciterPlayer.nextVerseTimer = null;
    }
    if (ReciterPlayer._handoffTimer) {
      clearTimeout(ReciterPlayer._handoffTimer);
      ReciterPlayer._handoffTimer = null;
    }
    if (ReciterPlayer._nextScheduledSource) {
      try {
        fadeStopSource(ReciterPlayer._nextScheduledSource);
      } catch (_) { }
      ReciterPlayer._nextScheduledSource = null;
    }
    if (ReciterPlayer.currentSource) {
      try {
        fadeStopSource(ReciterPlayer.currentSource);
      } catch (_) { }
      ReciterPlayer.currentSource = null;
    }
    if (ReciterPlayer.fallbackAudio) {
      ReciterPlayer.fallbackAudio.pause();
    }
  }

  // جدولة الآية التالية بدقة فائقة عبر Web Audio API (تعمل مع 0ms وأي توقف آخر)
  async function scheduleNextVerseGapless(nextSurah, nextAyah, startAtTime, isRepeat) {
    if (!ReciterPlayer.ctx || !ReciterPlayer.isPlaying) return;
    const reciter = ReciterPlayer.reciter;
    const buffer = await getAyahAudioBuffer(reciter, nextSurah, nextAyah);
    if (!buffer || !ReciterPlayer.isPlaying || !ReciterPlayer.ctx) return;

    const now = ReciterPlayer.ctx.currentTime;
    // إذا فات الوقت المجدول (بسبب تأخر التحميل)، ابدأ فوراً مع جزء ضئيل جداً لمنع أي تقطيع
    const schedAt = Math.max(startAtTime, now + 0.005);

    const nSource = createFadeSource(buffer, false);

    nSource.start(schedAt);
    ReciterPlayer._nextScheduledSource = nSource;

    // تحديث currentSource وواجهة المستخدم والصفحة عند لحظة البدء الفعلية بدقة
    const delayMs = Math.max(0, (schedAt - now) * 1000 - 5);
    const handoffTimer = setTimeout(() => {
      if (!ReciterPlayer.isPlaying) return;

      try {
        if (ReciterPlayer.currentSource && ReciterPlayer.currentSource !== nSource) {
          ReciterPlayer.currentSource.onended = null;
        }
      } catch (_) { }

      ReciterPlayer.currentSource = nSource;
      ReciterPlayer.currentSurah = nextSurah;
      ReciterPlayer.currentAyah = nextAyah;
      if (isRepeat) {
        ReciterPlayer.ayahCurrentPlayed = (ReciterPlayer.ayahCurrentPlayed || 0) + 1;
      } else {
        ReciterPlayer.ayahCurrentPlayed = 0;
      }

      updateReciterUI();
      highlightAudioAyah(nextSurah, nextAyah);

      // فحص الحاجة لتغيير صفحة المصحف تلقائياً
      const isOnCurrentPage = MushafState.pagePolygons.some(
        p => p.surahNumber === nextSurah && p.ayahNumber === nextAyah
      );
      if (!isOnCurrentPage) {
        if (ReciterPlayer.ayahRangeEnabled && ReciterPlayer.ayahRangeStartPage && nextAyah === ReciterPlayer.ayahRangeStart) {
          loadPage(ReciterPlayer.ayahRangeStartPage);
        } else if (MushafState.currentPage < 604) {
          loadPage(MushafState.currentPage + 1);
        }
      }

      // جدولة الآية التي تليها فوراً بسلاسة تامة
      const dur = buffer.duration / (ReciterPlayer.speed || 1.0);
      const pauseSec = (ReciterPlayer.versePauseMs || 0) / 1000;
      const nextStart = schedAt + dur + pauseSec; // بدون تراكم انجراف الوقت
      preloadUpcomingVerses(nextSurah, nextAyah);
      preloadAndScheduleNext(nextSurah, nextAyah, nextStart, isRepeat);
    }, delayMs);

    ReciterPlayer._handoffTimer = handoffTimer;

    nSource.onended = () => {
      if (ReciterPlayer.currentSource === nSource && ReciterPlayer.isPlaying) {
        if (!ReciterPlayer._nextScheduledSource) {
          pauseReciterAudio();
          if (window.showToast) {
            window.showToast(ReciterPlayer.ayahRangeEnabled ? 'اكتمل تكرار النطاق المحدد بحمد الله' : 'اكتملت التلاوة بحمد الله');
          }
        }
      }
    };
  }

  // يحسب الآية التالية ويجدولها مسبقاً أثناء تشغيل الآية الحالية
  function preloadAndScheduleNext(curSurah, curAyah, nextStartTime, curIsRepeat) {
    if (!ReciterPlayer.isPlaying) return;
    const repCount = ReciterPlayer.ayahRepeatCount || 1;
    const played = (ReciterPlayer.ayahCurrentPlayed || 0) + 1;

    if (repCount === Infinity || played < repCount) {
      // سيتكرر نفس الآية
      scheduleNextVerseGapless(curSurah, curAyah, nextStartTime, true);
    } else {
      // الآية التالية حسب الترتيب
      const savedPlayed = ReciterPlayer.ayahCurrentPlayed;
      ReciterPlayer.ayahCurrentPlayed = repCount - 1;
      const next = calculateNextVerse(curSurah, curAyah);
      ReciterPlayer.ayahCurrentPlayed = savedPlayed;

      if (next) {
        if (next.isRangeLoop) {
          ReciterPlayer.rangeCurrentPlayed = next.loopCount;
        }
        scheduleNextVerseGapless(next.surah, next.ayah, nextStartTime, false);
      } else {
        // اكتملت التلاوة أو النطاق المحدد
        ReciterPlayer._nextScheduledSource = null;
      }
    }
  }

  async function playReciterAyah(surah, ayah, isRepeat = false) {
    ensureAudioContext();
    stopCurrentPlayback();

    ReciterPlayer.currentSurah = surah;
    ReciterPlayer.currentAyah = ayah;
    if (!isRepeat) {
      ReciterPlayer.ayahCurrentPlayed = 0;
    }

    const reciter = (dom.mushafReciterSelect && dom.mushafReciterSelect.value) || 'Abdurrahmaan_As-Sudais_192kbps';
    ReciterPlayer.reciter = reciter;

    const buffer = await getAyahAudioBuffer(reciter, surah, ayah);

    if (buffer && ReciterPlayer.ctx) {
      const source = createFadeSource(buffer, true);

      ReciterPlayer.currentSource = source;
      ReciterPlayer.isPlaying = true;
      updateReciterUI();
      highlightAudioAyah(surah, ayah);

      const now = ReciterPlayer.ctx.currentTime;
      const duration = buffer.duration / (ReciterPlayer.speed || 1.0);
      const pauseSec = (ReciterPlayer.versePauseMs || 0) / 1000;
      const nextStartTime = now + duration + pauseSec;

      source.onended = () => {
        if (ReciterPlayer.currentSource === source && ReciterPlayer.isPlaying) {
          if (!ReciterPlayer._nextScheduledSource) {
            pauseReciterAudio();
            if (window.showToast) {
              window.showToast(ReciterPlayer.ayahRangeEnabled ? 'اكتمل تكرار النطاق المحدد بحمد الله' : 'اكتملت التلاوة بحمد الله');
            }
          }
        }
      };

      source.start(now);
      preloadUpcomingVerses(surah, ayah);

      // جدول الآية التالية مسبقاً أثناء التشغيل (سلاسة تامة ومزامنة دقيقة)
      preloadAndScheduleNext(surah, ayah, nextStartTime, isRepeat);
    } else {
      // بديل احتياطي HTML5 Audio
      const url = getReciterAudioUrl(reciter, surah, ayah);
      ReciterPlayer.fallbackAudio.src = url;
      ReciterPlayer.fallbackAudio.playbackRate = ReciterPlayer.speed || 1.0;
      ReciterPlayer.fallbackAudio.play().then(() => {
        ReciterPlayer.isPlaying = true;
        updateReciterUI();
        highlightAudioAyah(surah, ayah);
      }).catch(err => {
        console.warn('Playback error:', err);
        onReciterAudioError();
      });
    }
  }

  function toggleReciterAudio() {
    ensureAudioContext();
    if (ReciterPlayer.isPlaying) {
      pauseReciterAudio();
    } else {
      const s = MushafState.activeSurahId || 1;
      const a = ReciterPlayer.ayahRangeEnabled ? (ReciterPlayer.ayahRangeStart || MushafState.activeAyahNum || 1) : (MushafState.activeAyahNum || 1);
      playReciterAyah(s, a);
    }
  }

  function pauseReciterAudio() {
    stopCurrentPlayback();
    ReciterPlayer.isPlaying = false;
    updateReciterUI();
    clearAudioHighlight();
  }

  function onReciterVerseEnded() {
    // هذه الدالة fallback فقط - تُستدعى إذا فشلت الجدولة المسبقة
    if (!ReciterPlayer.isPlaying) return;

    ReciterPlayer.ayahCurrentPlayed++;
    const repCount = ReciterPlayer.ayahRepeatCount;
    if (repCount === Infinity || ReciterPlayer.ayahCurrentPlayed < repCount) {
      playReciterAyah(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah, true);
      return;
    }
    ReciterPlayer.ayahCurrentPlayed = 0;

    const next = calculateNextVerse(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    if (!next) {
      pauseReciterAudio();
      if (window.showToast) {
        window.showToast(ReciterPlayer.ayahRangeEnabled ? 'اكتمل تكرار النطاق المحدد بحمد الله' : 'اكتملت التلاوة بحمد الله');
      }
      return;
    }

    if (next.isRangeLoop) {
      ReciterPlayer.rangeCurrentPlayed = next.loopCount;
    }

    // التحقق من وجود الآية في الصفحة الحالية أو الانتقال للصفحة المطلوبة
    const isOnCurrentPage = MushafState.pagePolygons.some(
      p => p.surahNumber === next.surah && p.ayahNumber === next.ayah
    );
    if (!isOnCurrentPage) {
      if (next.isRangeLoop && ReciterPlayer.ayahRangeStartPage) {
        loadPage(ReciterPlayer.ayahRangeStartPage);
      } else if (MushafState.currentPage < 604) {
        loadPage(MushafState.currentPage + 1);
      }
    }

    playReciterAyah(next.surah, next.ayah, false);
  }

  function onReciterAudioError() {
    ReciterPlayer.isPlaying = false;
    updateReciterUI();
    clearAudioHighlight();
    if (window.showToast) window.showToast('تعذر تشغيل الصوت، يرجى التحقق من الاتصال بالإنترنت');
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

  // --- RECITERS OFFLINE AUDIO DOWNLOAD MANAGER ---

  let isDownloadingAudio = false;
  let cancelAudioDownload = false;

  const SURAH_NAMES_LIST = [
    "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس",
    "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه",
    "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
    "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر",
    "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق",
    "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة",
    "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج",
    "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس",
    "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
    "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات",
    "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر",
    "المسد", "الإخلاص", "الفلق", "الناس"
  ];

  function getAudioSurahName(id) {
    if (window.getSurahById) {
      const s = window.getSurahById(id);
      if (s && s.name) return s.name;
    }
    return SURAH_NAMES_LIST[id - 1] || `السورة ${id}`;
  }

  function getAudioSurahAyahs(id) {
    if (window.getSurahById) {
      const s = window.getSurahById(id);
      if (s && s.verses) return s.verses;
    }
    return 7;
  }

  function populateDownloadSurahs() {
    if (!dom.downloadSurahSelect) return;
    dom.downloadSurahSelect.innerHTML = '';
    for (let i = 1; i <= 114; i++) {
      const name = getAudioSurahName(i);
      const verses = getAudioSurahAyahs(i);
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i}. سورة ${name} (${verses} آية)`;
      dom.downloadSurahSelect.appendChild(opt);
    }
  }

  async function isSurahDownloaded(reciter, surahId, verses) {
    if (!('caches' in window)) return false;
    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const count = verses || getAudioSurahAyahs(surahId);
      const u1 = getReciterAudioUrl(reciter, surahId, 1);
      const uLast = getReciterAudioUrl(reciter, surahId, count);
      const m1 = await cache.match(u1);
      const mLast = await cache.match(uLast);
      return !!(m1 && mLast);
    } catch (_) {
      return false;
    }
  }

  async function updateDownloadCardStatus() {
    if (!dom.downloadSurahSelect || !dom.downloadReciterSelect) return;
    const surahId = parseInt(dom.downloadSurahSelect.value, 10) || 1;
    const reciter = dom.downloadReciterSelect.value;
    const surahName = getAudioSurahName(surahId);
    const verses = getAudioSurahAyahs(surahId);

    if (dom.downloadSurahNameText) dom.downloadSurahNameText.textContent = `سورة ${surahName}`;
    if (dom.downloadSurahAyahsCountText) dom.downloadSurahAyahsCountText.textContent = `${verses} آية`;

    const downloaded = await isSurahDownloaded(reciter, surahId, verses);

    if (dom.downloadSurahStatusBadge) {
      if (downloaded) {
        dom.downloadSurahStatusBadge.className = 'download-badge downloaded';
        dom.downloadSurahStatusBadge.textContent = 'محملة وجاهزة للاستماع';
      } else {
        dom.downloadSurahStatusBadge.className = 'download-badge not-downloaded';
        dom.downloadSurahStatusBadge.textContent = 'غير محملة على هذا الجهاز';
      }
    }

    if (!isDownloadingAudio) {
      if (dom.startSurahDownloadBtn) {
        dom.startSurahDownloadBtn.style.display = downloaded ? 'none' : 'inline-flex';
      }
      if (dom.deleteSurahDownloadBtn) {
        dom.deleteSurahDownloadBtn.style.display = downloaded ? 'inline-flex' : 'none';
      }
      if (dom.cancelSurahDownloadBtn) {
        dom.cancelSurahDownloadBtn.style.display = 'none';
      }
      if (dom.downloadProgressWrap) {
        dom.downloadProgressWrap.style.display = 'none';
      }
    }
  }

  async function startSurahDownload() {
    if (!('caches' in window)) {
      alert('متصفحك لا يدعم خاصية الحفظ المحلي للملفات بدون إنترنت');
      return;
    }
    const surahId = parseInt(dom.downloadSurahSelect.value, 10) || 1;
    const reciter = dom.downloadReciterSelect.value;
    const surahName = getAudioSurahName(surahId);
    const verses = getAudioSurahAyahs(surahId);

    isDownloadingAudio = true;
    cancelAudioDownload = false;

    if (dom.downloadProgressWrap) dom.downloadProgressWrap.style.display = 'flex';
    if (dom.startSurahDownloadBtn) dom.startSurahDownloadBtn.style.display = 'none';
    if (dom.deleteSurahDownloadBtn) dom.deleteSurahDownloadBtn.style.display = 'none';
    if (dom.cancelSurahDownloadBtn) dom.cancelSurahDownloadBtn.style.display = 'inline-flex';

    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      let downloadedCount = 0;

      for (let ayah = 1; ayah <= verses; ayah++) {
        if (cancelAudioDownload) {
          if (window.showToast) window.showToast('تم إلغاء التحميل');
          break;
        }

        const url = getReciterAudioUrl(reciter, surahId, ayah);
        const match = await cache.match(url);
        if (!match) {
          try {
            const resp = await fetch(url, { mode: 'cors' });
            if (resp && resp.ok) {
              await cache.put(url, resp);
            }
          } catch (e) {
            console.warn(`Error fetching ayah ${ayah}:`, e);
          }
        }

        downloadedCount++;
        const pct = Math.round((downloadedCount / verses) * 100);
        if (dom.downloadProgressLabel) {
          dom.downloadProgressLabel.textContent = `تحميل الآية ${downloadedCount} من ${verses}...`;
        }
        if (dom.downloadProgressPercent) {
          dom.downloadProgressPercent.textContent = `${pct}%`;
        }
        if (dom.downloadProgressBarFill) {
          dom.downloadProgressBarFill.style.width = `${pct}%`;
        }
      }

      if (!cancelAudioDownload) {
        if (window.showToast) {
          window.showToast(`تم اكتمال تحميل سورة ${surahName} بنجاح`);
        }
      }
    } catch (err) {
      console.error('Download error:', err);
      if (window.showToast) window.showToast('حدث خطأ أثناء التحميل، يرجى التحقق من الاتصال');
    } finally {
      isDownloadingAudio = false;
      cancelAudioDownload = false;
      updateDownloadCardStatus();
      updateDownloadedSurahsList();
    }
  }

  async function deleteSurahDownload() {
    if (!('caches' in window)) return;
    const surahId = parseInt(dom.downloadSurahSelect.value, 10) || 1;
    const reciter = dom.downloadReciterSelect.value;
    const surahName = getAudioSurahName(surahId);
    const verses = getAudioSurahAyahs(surahId);

    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      for (let ayah = 1; ayah <= verses; ayah++) {
        const url = getReciterAudioUrl(reciter, surahId, ayah);
        await cache.delete(url);
      }
      if (window.showToast) window.showToast(`تم حذف ملفات سورة ${surahName} لتوفير المساحة`);
    } catch (e) {
      console.warn('Delete error:', e);
    }
    updateDownloadCardStatus();
    updateDownloadedSurahsList();
  }

  async function updateDownloadedSurahsList() {
    if (!dom.downloadedSurahsContainer || !dom.downloadReciterSelect) return;
    dom.downloadedSurahsContainer.innerHTML = '';

    if (!('caches' in window)) {
      dom.downloadedSurahsContainer.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);padding:8px;text-align:center;">التخزين غير مدعوم في هذا المتصفح</div>';
      return;
    }

    const reciter = dom.downloadReciterSelect.value;
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();

    const surahMap = new Set();
    keys.forEach(k => {
      if (k.url && k.url.includes(`/${reciter}/`)) {
        const match = k.url.match(/(\d{3})(\d{3})\.mp3$/);
        if (match) {
          const sNum = parseInt(match[1], 10);
          surahMap.add(sNum);
        }
      }
    });

    if (surahMap.size === 0) {
      dom.downloadedSurahsContainer.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);padding:10px;text-align:center;">لا توجد سور محملة لهذا القارئ حتى الآن</div>';
      return;
    }

    const sortedSurahs = Array.from(surahMap).sort((a, b) => a - b);
    sortedSurahs.forEach(sNum => {
      const sName = getAudioSurahName(sNum);
      const row = document.createElement('div');
      row.className = 'downloaded-surah-row';
      row.innerHTML = `
        <div class="downloaded-surah-left">
          <span style="font-weight:700;color:var(--text-main);">سورة ${sName}</span>
          <span style="font-size:0.7rem;color:#15803d;background:rgba(22,101,52,0.1);padding:2px 6px;border-radius:8px;">محمّلة</span>
        </div>
        <div class="downloaded-surah-actions">
          <button type="button" class="downloaded-mini-btn btn-play" title="تشغيل السورة" aria-label="تشغيل">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
          <button type="button" class="downloaded-mini-btn btn-delete" title="حذف السورة" aria-label="حذف">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.btn-play').addEventListener('click', () => {
        closeAudioDownloadModal();
        if (dom.mushafReciterSelect) dom.mushafReciterSelect.value = reciter;
        ReciterPlayer.reciter = reciter;
        playReciterAyah(sNum, 1);
      });

      row.querySelector('.btn-delete').addEventListener('click', async () => {
        const verses = getAudioSurahAyahs(sNum);
        for (let a = 1; a <= verses; a++) {
          const url = getReciterAudioUrl(reciter, sNum, a);
          await cache.delete(url);
        }
        if (window.showToast) window.showToast(`تم حذف سورة ${sName}`);
        updateDownloadCardStatus();
        updateDownloadedSurahsList();
      });

      dom.downloadedSurahsContainer.appendChild(row);
    });
  }

  function openAudioDownloadModal() {
    if (!dom.audioDownloadModal) return;
    populateDownloadSurahs();
    if (dom.mushafReciterSelect && dom.downloadReciterSelect) {
      dom.downloadReciterSelect.value = dom.mushafReciterSelect.value;
    }
    if (dom.downloadSurahSelect) {
      dom.downloadSurahSelect.value = MushafState.activeSurahId || 1;
    }
    updateDownloadCardStatus();
    updateDownloadedSurahsList();

    dom.audioDownloadModal.hidden = false;
    if (dom.audioDownloadBackdrop) dom.audioDownloadBackdrop.hidden = false;
  }

  function closeAudioDownloadModal() {
    if (dom.audioDownloadModal) dom.audioDownloadModal.hidden = true;
    if (dom.audioDownloadBackdrop) dom.audioDownloadBackdrop.hidden = true;
  }

  function initAudioDownloadManager() {
    if (dom.openAudioDownloadBtn) {
      dom.openAudioDownloadBtn.addEventListener('click', () => {
        openAudioDownloadModal();
        switchDownloadTab('audio');
      });
    }
    if (dom.closeAudioDownloadBtn) {
      dom.closeAudioDownloadBtn.addEventListener('click', closeAudioDownloadModal);
    }
    if (dom.audioDownloadBackdrop) {
      dom.audioDownloadBackdrop.addEventListener('click', closeAudioDownloadModal);
    }
    if (dom.downloadReciterSelect) {
      dom.downloadReciterSelect.addEventListener('change', () => {
        updateDownloadCardStatus();
        updateDownloadedSurahsList();
      });
    }
    if (dom.downloadSurahSelect) {
      dom.downloadSurahSelect.addEventListener('change', () => {
        updateDownloadCardStatus();
      });
    }
    if (dom.startSurahDownloadBtn) {
      dom.startSurahDownloadBtn.addEventListener('click', startSurahDownload);
    }
    if (dom.cancelSurahDownloadBtn) {
      dom.cancelSurahDownloadBtn.addEventListener('click', () => {
        cancelAudioDownload = true;
      });
    }
    if (dom.deleteSurahDownloadBtn) {
      dom.deleteSurahDownloadBtn.addEventListener('click', deleteSurahDownload);
    }
  }

  // --- OFFLINE TAFSEER DOWNLOAD MANAGER ---
  let isTafseerDownloading = false;
  let cancelTafseerDownload = false;

  function switchDownloadTab(tabName) {
    const isAudio = tabName === 'audio';
    if (dom.tabBtnAudioDownloads) dom.tabBtnAudioDownloads.classList.toggle('active', isAudio);
    if (dom.tabBtnTafseerDownloads) dom.tabBtnTafseerDownloads.classList.toggle('active', !isAudio);
    if (dom.audioDownloadsTabContent) dom.audioDownloadsTabContent.style.display = isAudio ? 'flex' : 'none';
    if (dom.tafseerDownloadsTabContent) dom.tafseerDownloadsTabContent.style.display = !isAudio ? 'flex' : 'none';
    if (!isAudio) {
      updateTafseerDownloadCardStatus();
    }
  }

  async function updateTafseerDownloadCardStatus() {
    const tafsirId = dom.tafseerBookSelect ? parseInt(dom.tafseerBookSelect.value, 10) : 16;
    const isWaseet = tafsirId === 93;
    if (dom.tafseerBookTitleText) {
      dom.tafseerBookTitleText.textContent = isWaseet ? 'تفسير الوسيط للطنطاوي' : 'التفسير الميسر';
    }

    const isFullyDownloaded = localStorage.getItem(`tafsir_full_downloaded_${tafsirId}`) === 'true';

    if (dom.tafseerDownloadStatusBadge) {
      if (isFullyDownloaded) {
        dom.tafseerDownloadStatusBadge.className = 'download-badge downloaded';
        dom.tafseerDownloadStatusBadge.textContent = 'محمل بالكامل (114 سورة)';
      } else {
        dom.tafseerDownloadStatusBadge.className = 'download-badge not-downloaded';
        dom.tafseerDownloadStatusBadge.textContent = 'غير محمل بالكامل';
      }
    }

    const secRow = document.getElementById('tafseerSecondaryButtonsRow');
    if (!isTafseerDownloading) {
      if (secRow) secRow.style.display = 'flex';
      if (dom.deleteTafseerDownloadBtn) {
        dom.deleteTafseerDownloadBtn.style.display = isFullyDownloaded ? 'inline-flex' : 'none';
      }
      if (dom.startFullTafseerDownloadBtn) {
        dom.startFullTafseerDownloadBtn.style.display = isFullyDownloaded ? 'none' : 'inline-flex';
      }
      if (dom.startSurahTafseerDownloadBtn) {
        dom.startSurahTafseerDownloadBtn.style.display = 'inline-flex';
      }
      if (dom.cancelTafseerDownloadBtn) {
        dom.cancelTafseerDownloadBtn.style.display = 'none';
      }
      if (dom.tafseerProgressWrap) {
        dom.tafseerProgressWrap.style.display = 'none';
      }
    } else {
      if (secRow) secRow.style.display = 'none';
      if (dom.startFullTafseerDownloadBtn) dom.startFullTafseerDownloadBtn.style.display = 'none';
      if (dom.cancelTafseerDownloadBtn) dom.cancelTafseerDownloadBtn.style.display = 'inline-flex';
      if (dom.tafseerProgressWrap) dom.tafseerProgressWrap.style.display = 'flex';
    }
  }

  async function startFullTafseerDownload() {
    const tafsirId = dom.tafseerBookSelect ? parseInt(dom.tafseerBookSelect.value, 10) : 16;
    const isWaseet = tafsirId === 93;
    const bookTitle = isWaseet ? 'تفسير الوسيط للطنطاوي' : 'التفسير الميسر';

    isTafseerDownloading = true;
    cancelTafseerDownload = false;

    // إظهار شريط التقدم فوراً بمجرد الضغط
    if (dom.tafseerProgressWrap) {
      dom.tafseerProgressWrap.style.display = 'flex';
      dom.tafseerProgressWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (dom.tafseerProgressPercent) dom.tafseerProgressPercent.textContent = '0%';
    if (dom.tafseerProgressBarFill) dom.tafseerProgressBarFill.style.width = '0%';
    if (dom.tafseerProgressLabel) dom.tafseerProgressLabel.textContent = `بدء تنزيل ${bookTitle}...`;

    if (dom.startFullTafseerDownloadBtn) dom.startFullTafseerDownloadBtn.style.display = 'none';
    const secRow = document.getElementById('tafseerSecondaryButtonsRow');
    if (secRow) secRow.style.display = 'none';
    if (dom.cancelTafseerDownloadBtn) dom.cancelTafseerDownloadBtn.style.display = 'inline-flex';

    try {
      const totalSurahs = 114;

      for (let s = 1; s <= totalSurahs; s++) {
        if (cancelTafseerDownload) {
          if (window.showToast) window.showToast('تم إلغاء تحميل التفسير');
          break;
        }

        const pct = Math.round(((s - 1) / totalSurahs) * 100);
        if (dom.tafseerProgressPercent) dom.tafseerProgressPercent.textContent = `${pct}%`;
        if (dom.tafseerProgressBarFill) dom.tafseerProgressBarFill.style.width = `${pct}%`;
        if (dom.tafseerProgressLabel) {
          const sObj = window.getSurahById ? window.getSurahById(s) : null;
          const sName = sObj ? sObj.name : `السورة ${s}`;
          dom.tafseerProgressLabel.textContent = `تحميل سورة ${sName} (${s} من ${totalSurahs})...`;
        }

        const chapterUrl = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_chapter/${s}?per_page=300`;
        try {
          const res = await fetch(chapterUrl);
          if (res.ok) {
            const data = await res.json();
            if (data && data.tafsirs && Array.isArray(data.tafsirs)) {
              for (const item of data.tafsirs) {
                const ayahKey = item.verse_key;
                const singleUrl = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_ayah/${ayahKey}`;
                await TafseerDB.put(singleUrl, item.text);
              }
            }
          }
        } catch (fetchErr) {
          console.warn(`Failed chapter ${s} tafseer:`, fetchErr);
        }
      }

      if (!cancelTafseerDownload) {
        localStorage.setItem(`tafsir_full_downloaded_${tafsirId}`, 'true');
        if (dom.tafseerProgressPercent) dom.tafseerProgressPercent.textContent = '100%';
        if (dom.tafseerProgressBarFill) dom.tafseerProgressBarFill.style.width = '100%';
        if (dom.tafseerProgressLabel) dom.tafseerProgressLabel.textContent = `اكتمل تحميل ${bookTitle} بالكامل (114 سورة) بنجاح!`;
        if (window.showToast) window.showToast(`تم اكتمال تحميل ${bookTitle} بالكامل بنجاح`);
      }
    } catch (err) {
      console.error('Error downloading tafseer:', err);
      if (window.showToast) window.showToast('حدث خطأ أثناء تحميل التفسير');
    } finally {
      isTafseerDownloading = false;
      cancelTafseerDownload = false;
      setTimeout(() => {
        updateTafseerDownloadCardStatus();
      }, 1500);
    }
  }

  async function startCurrentSurahTafseerDownload() {
    const tafsirId = dom.tafseerBookSelect ? parseInt(dom.tafseerBookSelect.value, 10) : 16;
    const isWaseet = tafsirId === 93;
    const bookTitle = isWaseet ? 'تفسير الوسيط للطنطاوي' : 'التفسير الميسر';
    const sId = MushafState.activeSurahId || (window.AppState && window.AppState.surahConfig && window.AppState.surahConfig.name ? (window.QURAN_SURAHS?.find(s => s.name === window.AppState.surahConfig.name)?.id || 8) : 8);
    const sObj = window.getSurahById ? window.getSurahById(sId) : null;
    const sName = sObj ? sObj.name : `السورة ${sId}`;

    isTafseerDownloading = true;
    cancelTafseerDownload = false;

    // إظهار شريط التقدم فوراً بمجرد الضغط
    if (dom.tafseerProgressWrap) {
      dom.tafseerProgressWrap.style.display = 'flex';
      dom.tafseerProgressWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (dom.tafseerProgressPercent) dom.tafseerProgressPercent.textContent = '0%';
    if (dom.tafseerProgressBarFill) dom.tafseerProgressBarFill.style.width = '0%';
    if (dom.tafseerProgressLabel) dom.tafseerProgressLabel.textContent = `بدء تنزيل تفسير سورة ${sName}...`;

    if (dom.startFullTafseerDownloadBtn) dom.startFullTafseerDownloadBtn.style.display = 'none';
    const secRow = document.getElementById('tafseerSecondaryButtonsRow');
    if (secRow) secRow.style.display = 'none';
    if (dom.cancelTafseerDownloadBtn) dom.cancelTafseerDownloadBtn.style.display = 'inline-flex';

    try {
      const chapterUrl = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_chapter/${sId}?per_page=300`;
      const res = await fetch(chapterUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.tafsirs && Array.isArray(data.tafsirs)) {
          const totalAyahs = data.tafsirs.length;
          for (let i = 0; i < totalAyahs; i++) {
            if (cancelTafseerDownload) {
              if (window.showToast) window.showToast('تم إلغاء التحميل');
              break;
            }
            const item = data.tafsirs[i];
            const ayahKey = item.verse_key;
            const singleUrl = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_ayah/${ayahKey}`;
            await TafseerDB.put(singleUrl, item.text);

            const pct = Math.round(((i + 1) / totalAyahs) * 100);
            if (dom.tafseerProgressPercent) dom.tafseerProgressPercent.textContent = `${pct}%`;
            if (dom.tafseerProgressBarFill) dom.tafseerProgressBarFill.style.width = `${pct}%`;
            if (dom.tafseerProgressLabel) {
              dom.tafseerProgressLabel.textContent = `تحميل تفسير سورة ${sName} (آية ${i + 1} من ${totalAyahs})...`;
            }
          }
          if (!cancelTafseerDownload) {
            if (dom.tafseerProgressPercent) dom.tafseerProgressPercent.textContent = '100%';
            if (dom.tafseerProgressBarFill) dom.tafseerProgressBarFill.style.width = '100%';
            if (dom.tafseerProgressLabel) dom.tafseerProgressLabel.textContent = `تم اكتمال تحميل تفسير سورة ${sName} بنجاح!`;
            if (window.showToast) window.showToast(`تم تحميل تفسير سورة ${sName} بنجاح`);
          }
        } else {
          throw new Error('No tafsir array');
        }
      } else {
        throw new Error('API returned ' + res.status);
      }
    } catch (e) {
      console.warn('Failed surah tafseer download:', e);
      if (window.showToast) window.showToast('تعذر تحميل تفسير السورة، تحقق من اتصالك بالإنترنت');
    } finally {
      isTafseerDownloading = false;
      cancelTafseerDownload = false;
      setTimeout(() => {
        updateTafseerDownloadCardStatus();
      }, 1500);
    }
  }

  async function deleteTafseerDownload() {
    const tafsirId = dom.tafseerBookSelect ? parseInt(dom.tafseerBookSelect.value, 10) : 16;
    const isWaseet = tafsirId === 93;
    const bookTitle = isWaseet ? 'تفسير الوسيط للطنطاوي' : 'التفسير الميسر';

    try {
      await TafseerDB.clear(tafsirId);
      localStorage.removeItem(`tafsir_full_downloaded_${tafsirId}`);
      if (window.showToast) window.showToast(`تم حذف بيانات ${bookTitle}`);
      updateTafseerDownloadCardStatus();
    } catch (e) {
      console.warn('Failed deleting tafseer:', e);
    }
  }

  function initTafseerDownloadManager() {
    if (dom.tabBtnAudioDownloads) {
      dom.tabBtnAudioDownloads.addEventListener('click', () => switchDownloadTab('audio'));
    }
    if (dom.tabBtnTafseerDownloads) {
      dom.tabBtnTafseerDownloads.addEventListener('click', () => switchDownloadTab('tafseer'));
    }
    if (dom.tafseerBookSelect) {
      dom.tafseerBookSelect.addEventListener('change', updateTafseerDownloadCardStatus);
    }
    if (dom.startFullTafseerDownloadBtn) {
      dom.startFullTafseerDownloadBtn.addEventListener('click', startFullTafseerDownload);
    }
    if (dom.startSurahTafseerDownloadBtn) {
      dom.startSurahTafseerDownloadBtn.addEventListener('click', startCurrentSurahTafseerDownload);
    }
    if (dom.cancelTafseerDownloadBtn) {
      dom.cancelTafseerDownloadBtn.addEventListener('click', () => {
        cancelTafseerDownload = true;
      });
    }
    if (dom.deleteTafseerDownloadBtn) {
      dom.deleteTafseerDownloadBtn.addEventListener('click', deleteTafseerDownload);
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

  // --- OFFLINE MUSHAF DOWNLOADER (1405 AH - Classic Madani) ---

  const MUSHAF_CACHE_NAME = 'tibyan-mushaf-1405-v1';
  const MUSHAF_1405_PRIMARY_CDN = 'https://android.quran.com/data/width_1920';
  const MUSHAF_1405_FALLBACK_CDN = 'https://files.quran.app/hafs/madani/width_1024';
  const MUSHAF_1405_LOCAL_DIR = 'assets/pages_1405';
  const MUSHAF_1405_DATA_DIR = 'data/pages_1405';

  function initMushafDownloader() {
    if (dom.openDownloadMushafBtn) {
      dom.openDownloadMushafBtn.addEventListener('click', () => {
        updateTafseerDownloadCardStatus();
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
      alert('متصفحك لا يدعم خاصية التخزين المحلي بدون اتصال بالإنترنت');
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

      // Pre-cache consolidated coordinates
      fetch('data/ayahinfo_1405.json')
        .then(r => r.ok ? cache.put('data/ayahinfo_1405.json', r) : null)
        .catch(() => { });

      for (let i = 1; i <= total; i += batchSize) {
        const batch = [];
        for (let j = i; j < i + batchSize && j <= total; j++) {
          const pad = String(j).padStart(3, '0');
          const primaryUrl = `${MUSHAF_1405_PRIMARY_CDN}/page${pad}.png`;
          const fallbackUrl = `${MUSHAF_1405_FALLBACK_CDN}/page${pad}.png`;
          const jsonUrl = `${MUSHAF_1405_DATA_DIR}/${pad}.json`;

          batch.push(
            Promise.all([
              fetch(primaryUrl)
                .then(r => r.ok ? cache.put(primaryUrl, r) : fetch(fallbackUrl).then(fr => fr.ok ? cache.put(fallbackUrl, fr) : null))
                .catch(() => { }),
              fetch(jsonUrl)
                .then(r => r.ok ? cache.put(jsonUrl, r) : null)
                .catch(() => { })
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
        status.textContent = 'اكتمل تحميل مصحف المدينة (طبعة 1405هـ) بالكامل (604 صفحة) بنجاح!';
      }
      btn.disabled = false;
      btn.textContent = 'إعادة فحص / تحديث تحميل المصحف';
      if (window.showToast) window.showToast('اكتمل تحميل صفحات المصحف بنجاح');
    } catch (err) {
      console.warn('Error downloading Mushaf offline:', err);
      btn.disabled = false;
      btn.textContent = 'استئناف التحميل';
      if (status) status.textContent = 'حدث انقطاع في الاتصال أثناء التحميل. اضغط استئناف للمتابعة.';
    }
  }

  // --- PAGE DATA FETCHING & RENDERING (1405 AH) ---

  let cachedConsolidatedCoords = null;

  async function fetchAyahPolygons(pageNum) {
    const pad = String(pageNum).padStart(3, '0');

    // 1. In-memory check
    if (cachedConsolidatedCoords && cachedConsolidatedCoords[pageNum]) {
      return cachedConsolidatedCoords[pageNum];
    }

    const jsonUrl = `${MUSHAF_1405_DATA_DIR}/${pad}.json`;

    // 2. Check offline CacheStorage first
    if ('caches' in window) {
      try {
        const cache = await caches.open(MUSHAF_CACHE_NAME);
        const cachedRes = await cache.match(jsonUrl);
        if (cachedRes) {
          const data = await cachedRes.json();
          if (Array.isArray(data) && data.length) return data;
        }
      } catch (e) { }
    }

    // 3. Fetch per-page JSON
    try {
      const res = await fetch(jsonUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) return data;
      }
    } catch (e) { }

    // 4. Fallback: load consolidated JSON once
    if (!cachedConsolidatedCoords) {
      try {
        const cRes = await fetch('data/ayahinfo_1405.json');
        if (cRes.ok) {
          cachedConsolidatedCoords = await cRes.json();
          if (cachedConsolidatedCoords && cachedConsolidatedCoords[pageNum]) {
            return cachedConsolidatedCoords[pageNum];
          }
        }
      } catch (e) { }
    }

    return [];
  }

  async function loadPage(pageNum) {
    if (pageNum < 1) pageNum = 1;
    if (pageNum > 604) pageNum = 604;

    const oldPage = MushafState.currentPage;
    const direction = (oldPage && pageNum !== oldPage) ? (pageNum > oldPage ? 'next' : 'prev') : null;

    // تشغيل تأثير انزلاق الصفحة الأفقي السلس (Smooth Horizontal Slide Animation)
    if (dom.pageStage && direction) {
      dom.pageStage.classList.remove('slide-next', 'slide-prev');
      void dom.pageStage.offsetWidth; // إعادة تهيئة الرسم في المتصفح لضمان تشغيل الحركة
      const animClass = direction === 'next' ? 'slide-next' : 'slide-prev';
      dom.pageStage.classList.add(animClass);

      const onAnimEnd = () => {
        if (dom.pageStage) dom.pageStage.classList.remove(animClass);
      };
      dom.pageStage.addEventListener('animationend', onAnimEnd, { once: true });
    }

    // إعادة التمرير للأعلى دائماً عند فتح أي صفحة ليظهر رأس الصفحة والبسملة بوضوح
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'instant' });
    const mushafView = document.getElementById('view-mushaf');
    if (mushafView) mushafView.scrollTop = 0;

    MushafState.currentPage = pageNum;
    localStorage.setItem('tibyan_mushaf_page', pageNum);

    // تفريغ الآيات المكشوفة عند الانتقال لصفحة جديدة ليبدأ إخفاء كامل أيضاً
    if (MushafState.unmaskedVerses) {
      MushafState.unmaskedVerses.clear();
    }

    if (dom.pageInput) dom.pageInput.value = pageNum;
    if (dom.inpageNumber) dom.inpageNumber.textContent = pageNum;

    // Update Header Meta
    updatePageMetaHeader(pageNum);
    updatePageNotesIndicator(pageNum);

    // Show loading state
    if (dom.loader) dom.loader.style.display = 'flex';

    // ViewBox standard (1405 AH grid: 1920 x 3106 for all pages)
    MushafState.pageViewBox = '0 0 1920 3106';
    if (dom.overlaySvg) {
      dom.overlaySvg.setAttribute('viewBox', MushafState.pageViewBox);
      dom.overlaySvg.innerHTML = '';
    }

    const pad = String(pageNum).padStart(3, '0');
    const cacheKey = `p_${pageNum}`;

    try {
      let pageData = MushafState.cache.get(cacheKey);

      if (!pageData) {
        const versesUrl = `https://api.quran.com/api/v4/quran/verses/imlaei?page_number=${pageNum}`;

        let polygons = [];
        let verses = [];

        const [polyResult, versesResult] = await Promise.allSettled([
          fetchAyahPolygons(pageNum),
          fetch(versesUrl).then(r => r.ok ? r.json() : { verses: [] }).catch(() => ({ verses: [] }))
        ]);

        polygons = (polyResult.status === 'fulfilled' && Array.isArray(polyResult.value)) ? polyResult.value : [];
        verses = (versesResult.status === 'fulfilled' && versesResult.value && versesResult.value.verses) ? versesResult.value.verses : [];

        pageData = { polygons, verses };
        MushafState.cache.set(cacheKey, pageData);
      }

      // Render Page Visual (Image)
      renderPageVisual(pad, pageNum);

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
      renderPageVisual(pad, pageNum);
    } finally {
      if (dom.loader) dom.loader.style.display = 'none';
    }
  }

  function renderPageVisual(pad, pageNum) {
    if (!dom.imageLayer) return;

    // 1. Primary: Android Quran CDN (1920px width - High Definition)
    const primaryUrl = `${MUSHAF_1405_PRIMARY_CDN}/page${pad}.png`;
    // 2. Fallback: Quran.app CDN (1024px width)
    const fallbackUrl = `${MUSHAF_1405_FALLBACK_CDN}/page${pad}.png`;
    // 3. Local optional storage
    const localPrimary = `${MUSHAF_1405_LOCAL_DIR}/page${pad}.png`;
    const localAlt = `${MUSHAF_1405_LOCAL_DIR}/${pad}.png`;

    dom.imageLayer.innerHTML = `
      <img src="${primaryUrl}" 
           alt="مصحف المدينة النبوية - طبعة 1405هـ - صفحة ${pageNum}" 
           class="mushaf-raster-img" 
           loading="eager"
           onerror="if (!this.dataset.triedFallback) { this.dataset.triedFallback = '1'; this.src='${fallbackUrl}'; } else if (!this.dataset.triedLocal) { this.dataset.triedLocal = '1'; this.src='${localPrimary}'; } else if (!this.dataset.triedLocalAlt) { this.dataset.triedLocalAlt = '1'; this.src='${localAlt}'; }" />
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
      // البسملة في سورة الفاتحة تحمل فئة خاصة لتبقى مكشوفة دائماً
      if (item.surahNumber === 1 && item.ayahNumber === 1) {
        pathEl.classList.add('basmalah-ayah');
      }
      pathEl.setAttribute('data-surah', item.surahNumber);
      pathEl.setAttribute('data-ayah', item.ayahNumber);
      pathEl.setAttribute('id', `poly-${item.surahNumber}-${item.ayahNumber}`);

      // 1. كلك يمين باللابتوب / الكمبيوتر: فتح نافذة خيارات الآية
      pathEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAyahActionSheet(item.surahNumber, item.ayahNumber);
      });

      // 2. ضغط مطول في الجوال والشاشات اللمسية: فتح نافذة خيارات الآية
      let longPressTimer = null;
      let isLongPress = false;
      let touchStartX = 0;
      let touchStartY = 0;

      pathEl.addEventListener('touchstart', (e) => {
        isLongPress = false;
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          isLongPress = true;
          if (navigator.vibrate) {
            try { navigator.vibrate(40); } catch (_) { }
          }
          openAyahActionSheet(item.surahNumber, item.ayahNumber);
        }, 500);
      }, { passive: true });

      pathEl.addEventListener('touchmove', (e) => {
        if (longPressTimer && e.touches && e.touches[0]) {
          const dx = Math.abs(e.touches[0].clientX - touchStartX);
          const dy = Math.abs(e.touches[0].clientY - touchStartY);
          // إلغاء المؤقت فقط عند حركة التمرير (> 10 بكسل)
          if (dx > 10 || dy > 10) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        }
      }, { passive: true });

      pathEl.addEventListener('touchend', (e) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (isLongPress) {
          if (e.cancelable) e.preventDefault();
        }
      });

      pathEl.addEventListener('touchcancel', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      });

      // 3. النقر العادي (يسار بالماوس أو لمسة سريعة): تحديد الآية وكشفها في وضع الإخفاء (دون فتح القائمة)
      pathEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isLongPress) {
          isLongPress = false;
          return;
        }

        const isMaskedMode = MushafState.maskMode && MushafState.maskMode !== 'none';
        const ayahKey = `${item.surahNumber}:${item.ayahNumber}`;

        if (isMaskedMode) {
          // إذا نقر على البسملة في الفاتحة، تظل دائماً مكشوفة
          if (item.surahNumber === 1 && item.ayahNumber === 1) {
            selectActiveAyah(item.surahNumber, item.ayahNumber, false);
            return;
          }

          // وضع إخفاء الآيات (العين): النقر على أي آية مخفية يكشفها (والنقر عليها مجدداً يعيد إخفاءها)
          if (!MushafState.unmaskedVerses) {
            MushafState.unmaskedVerses = new Set();
          }

          if (MushafState.unmaskedVerses.has(ayahKey)) {
            MushafState.unmaskedVerses.delete(ayahKey);
          } else {
            MushafState.unmaskedVerses.add(ayahKey);
          }

          selectActiveAyah(item.surahNumber, item.ayahNumber, false);
          highlightActiveAyahPolygon();
        } else {
          // النقر على أي آية يفتح خياراتها وقائمتها وتفسيرها مباشرة
          selectActiveAyah(item.surahNumber, item.ayahNumber, false);
          openAyahActionSheet(item.surahNumber, item.ayahNumber);
        }
      });

      dom.overlaySvg.appendChild(pathEl);
    });

    refreshPolygonsDecoration();
    highlightActiveAyahPolygon();
    if (ReciterPlayer.isPlaying) {
      highlightAudioAyah(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    }
  }


  function computeWordRects(polygonStr, wordsOrCount) {
    if (!polygonStr || !wordsOrCount) return [];

    let words = [];
    let wordsCount = 0;
    if (Array.isArray(wordsOrCount)) {
      words = wordsOrCount;
      wordsCount = words.length;
    } else if (typeof wordsOrCount === 'number') {
      wordsCount = wordsOrCount;
    }
    if (wordsCount <= 0) return [];

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

    // حساب أوزان الكلمات تناسبياً بحسب عدد حروفها الأصلية والمدود والتشكيل
    let weights = [];
    if (words.length === wordsCount) {
      weights = words.map((w, idx) => {
        const str = String(w || '');
        const stripped = str.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
        let len = Math.max(stripped.length, 2);
        if (len >= 6) len += 1.8; // تعويض مد الكلمات الطويلة في خط مصحف المدينة 1405
        if (idx === wordsCount - 1) len += 2.5; // وزن علامة نهاية الآية الدائرية (۝)
        return len;
      });
    } else {
      weights = Array(wordsCount).fill(1);
    }

    const totalWeight = weights.reduce((acc, w) => acc + w, 0) || wordsCount;

    const wordRects = [];
    let currentSegIdx = 0;
    let currentSeg = segments[0];
    let currentX = currentSeg.maxX;

    for (let w = 0; w < wordsCount; w++) {
      let remainingWordWidth = totalWidth * (weights[w] / totalWeight);
      const wordSubRects = [];

      while (remainingWordWidth > 0 && currentSegIdx < segments.length) {
        const availInSeg = currentX - currentSeg.minX;
        const padY = 2.0;

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

    const rawWords = (MushafState.targetWords || []).map(w => w.original);
    const wordRects = computeWordRects(polyItem.polygon, rawWords.length ? rawWords : MushafState.targetWords.length);

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

    const isMaskedMode = MushafState.maskMode && MushafState.maskMode !== 'none';

    dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
      p.classList.remove('selected-ayah', 'reciting-ayah');

      const s = p.getAttribute('data-surah');
      const a = p.getAttribute('data-ayah');
      const key = `${s}:${a}`;

      if (isMaskedMode) {
        // في وضع إخفاء الآيات: البسملة في الفاتحة (1:1) أو أي آية نقر عليها المستخدم تظهر مكشوفة
        if ((s === '1' && a === '1') || (MushafState.unmaskedVerses && MushafState.unmaskedVerses.has(key))) {
          p.classList.add('unmasked-ayah');
        } else {
          p.classList.remove('unmasked-ayah');
        }
      } else {
        p.classList.remove('unmasked-ayah');
      }
    });

    const activeEl = dom.overlaySvg.querySelector(
      `#poly-${MushafState.activeSurahId}-${MushafState.activeAyahNum}`
    );
    if (activeEl) {
      activeEl.classList.add(MushafState.isReciting ? 'reciting-ayah' : 'selected-ayah');
      if (!isMaskedMode) {
        activeEl.classList.add('unmasked-ayah');
      }
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
        dom.headerJuzName.textContent = juz.name.replace(/^الجزء\s+/, 'جزء ');
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
        const primaryUrl = `${MUSHAF_1405_PRIMARY_CDN}/page${pad}.png`;

        // Preload image in browser memory
        const preloadImg = new Image();
        preloadImg.src = primaryUrl;

        Promise.allSettled([
          fetchAyahPolygons(p),
          fetch(`https://api.quran.com/api/v4/quran/verses/imlaei?page_number=${p}`).then(r => r.ok ? r.json() : { verses: [] })
        ]).then(([polyRes, vRes]) => {
          MushafState.cache.set(key, {
            polygons: (polyRes.status === 'fulfilled' && Array.isArray(polyRes.value)) ? polyRes.value : [],
            verses: (vRes.status === 'fulfilled' && vRes.value && vRes.value.verses) ? vRes.value.verses : []
          });
        }).catch(() => { });
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

    // المشغل الزجاجي مثبت عائماً فوق الصفحة ولا يحتاج لتمرير الشاشة
    // if (shouldScroll && dom.floatingControls) {
    //   dom.floatingControls.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // }
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
      let targetPage = MushafState.currentPage;
      if (targetSurahObj && targetAyah === 1) {
        targetPage = targetSurahObj.startPage;
      } else if (delta > 0 && MushafState.currentPage < 604) {
        targetPage = MushafState.currentPage + 1;
      } else if (delta < 0 && MushafState.currentPage > 1) {
        targetPage = MushafState.currentPage - 1;
      }
      loadPage(targetPage).then(() => {
        selectActiveAyah(targetSurah, targetAyah, false);
        if (ReciterPlayer.isPlaying) {
          playReciterAyah(targetSurah, targetAyah);
        }
      });
      return;
    }

    selectActiveAyah(targetSurah, targetAyah, false);
    if (ReciterPlayer.isPlaying) {
      playReciterAyah(targetSurah, targetAyah);
    }
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
              try { rec.start(); } catch (err) { }
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
        alert('ميزة التسميع الصوتي غير مدعومة في هذا المتصفح. ينصح بتحديث المتصفح أو استخدام متصفح حديث يدعم التعرف الصوتي.');
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
      } catch (e) { }
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
      // Edge Clicking for Page Navigation & Center Click to Toggle Player
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
        } else {
          // النقر في وسط الصفحة يخفي / يظهر مشغل الصوت العائم (في الوضع العادي فقط)
          if (!MushafState.maskMode || MushafState.maskMode === 'none') {
            toggleFloatingPlayer();
          }
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
    closeDrawer: closeSurahDrawer,
    toggleFloatingPlayer: toggleFloatingPlayer
  };

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMushaf);
  } else {
    initMushaf();
  }

})();