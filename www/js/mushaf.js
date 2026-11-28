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

    // اختلاف الألف الخنجرية/الصريحة بين المتعرّف الصوتي ونص المصحف
    const sNoAlif = spoken.replace(/ا/g, '');
    const tNoAlif = target.replace(/ا/g, '');
    if (sNoAlif === tNoAlif && sNoAlif.length > 1) return true;

    return false;
  }

  // --- MUSHAF STATE ---

  let localQuranTextMap = null;

  async function loadLocalQuranText() {
    if (localQuranTextMap) return localQuranTextMap;
    try {
      const res = await fetch('data/quran_text.json');
      if (res.ok) {
        localQuranTextMap = await res.json();
      }
    } catch (e) {
      console.warn('Failed to load local quran_text.json:', e);
    }
    return localQuranTextMap;
  }
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
    spokenCursor: 0,
    lastSpokenCount: 0,
    wordErrors: new Map(),
    recognition: null,
    isReciting: false,
    audioCtx: null,
    cache: new Map(),
    verseTextCache: new Map(),
    qcfDataCache: new Map(),
    qcfFontsLoaded: new Set(),
    pageQcfWords: [],
    recitationStartTime: null,
    recitationTimerInterval: null,
    recitedVersesCount: 0
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

  // --- LANDSCAPE & DOUBLE-PAGE SPREAD HELPERS ---
  function isLandscapeMode() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return (w > h && w >= 600);
  }

  function getSpreadPages(pageNum) {
    const p = Math.max(1, Math.min(604, parseInt(pageNum, 10) || 1));
    const right = (p % 2 === 1) ? p : p - 1;
    const left = (right + 1 <= 604) ? right + 1 : null;
    return { right, left };
  }

  function isPageCurrentlyVisible(pageNum) {
    if (!pageNum) return false;
    if (isLandscapeMode()) {
      const spread = getSpreadPages(MushafState.currentPage);
      return pageNum === spread.right || pageNum === spread.left;
    }
    return pageNum === MushafState.currentPage;
  }

  // --- DOM ELEMENTS REFERENCE ---
  let dom = {};

  function initDomReferences() {
    dom = {
      view: document.getElementById('view-mushaf'),
      // Header Elements
      topBar: document.getElementById('mushafTopBar'),
      openSurahDrawerBtn: document.getElementById('openSurahDrawerBtn'),
      headerSurahName: document.getElementById('mushafHeaderSurahName'),
      headerJuzName: document.getElementById('mushafHeaderJuzName'),
      toggleMaskBtn: document.getElementById('toggleMaskBtn'),
      maskEyeIcon: document.getElementById('maskEyeIcon'),
      maskBtnText: document.getElementById('maskBtnText'),
      maskOptionsMenu: document.getElementById('maskOptionsMenu'),
      // Mode Picker Elements (العين أو القائمة - كبسولة عائمة)
      mushafModeCapsuleWrapper: document.getElementById('mushafModeCapsuleWrapper'),
      mushafModePillPop: document.getElementById('mushafModePillPop'),
      pillCloseModeBtn: document.getElementById('pillCloseModeBtn'),
      pillModeListBtn: document.getElementById('pillModeListBtn'),
      pillModeEyeBtn: document.getElementById('pillModeEyeBtn'),
      pillModeEyeIconWrap: document.getElementById('pillModeEyeIconWrap'),
      // Mushaf Viewer Frame
      pageWrapper: document.getElementById('mushafPageWrapper'),
      pageStage: document.getElementById('mushafPageStage'),
      underlayStage: document.getElementById('mushafUnderlayStage'),
      qcfUnderlayContainer: document.getElementById('qcfUnderlayContainer'),
      curlLeaf: document.getElementById('mushafCurlLeaf'),
      curlUnderlayShadow: document.getElementById('curlUnderlayShadow'),
      curlFlapBody: document.getElementById('curlFlapBody'),
      curlCreaseShadow: document.getElementById('curlCreaseShadow'),
      imageLayer: document.getElementById('mushafImageLayer'),
      overlaySvg: document.getElementById('mushafOverlaySvg'),
      qcfContainer: document.getElementById('qcfPageContainer'),
      loader: document.getElementById('mushafLoader'),
      // In-page Page Number & Bottom Bar
      inpageNumber: document.getElementById('mushafInpageNumber'),
      openPageNotesBtn: document.getElementById('openPageNotesBtn'),
      pageNotesDotIndicator: document.getElementById('pageNotesDotIndicator'),
      pageNotesModal: document.getElementById('pageNotesModal'),
      pageNotesBackdrop: document.getElementById('pageNotesBackdrop'),
      pageNotesModalTitle: document.getElementById('pageNotesModalTitle'),
      pageNotesCountBadge: document.getElementById('pageNotesCountBadge'),
      pageNotesListContainer: document.getElementById('pageNotesListContainer'),
      pageNotesTextarea: document.getElementById('pageNotesTextarea'),
      pageAyahNotesSection: document.getElementById('pageAyahNotesSection'),
      pageAyahNotesList: document.getElementById('pageAyahNotesList'),
      pageNoteInputTitle: document.getElementById('pageNoteInputTitle'),
      cancelEditNoteBtn: document.getElementById('cancelEditNoteBtn'),
      cancelPageNoteBtn: document.getElementById('cancelPageNoteBtn'),
      savePageNoteBtn: document.getElementById('savePageNoteBtn'),
      savePageNoteBtnText: document.getElementById('savePageNoteBtnText'),
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
      toggleBlindModeBtn: document.getElementById('toggleBlindModeBtn'),
      blindModeIcon: document.getElementById('blindModeIcon'),
      recitationRevealAyahBtn: document.getElementById('recitationRevealAyahBtn'),
      recitationStatsBar: document.getElementById('recitationStatsBar'),
      recitationTimerBadge: document.getElementById('recitationTimerBadge'),
      recitationCounterBadge: document.getElementById('recitationCounterBadge'),
      // Ayah Action Sheet & Note Modal
      actionSheetBackdrop: document.getElementById('actionSheetBackdrop'),
      ayahActionSheet: document.getElementById('ayahActionSheet'),
      actionSheetTitle: document.getElementById('actionSheetTitle'),
      closeActionSheetBtn: document.getElementById('closeActionSheetBtn'),
      mutashabihatSheetBackdrop: document.getElementById('mutashabihatSheetBackdrop'),
      mutashabihatSheet: document.getElementById('mutashabihatSheet'),
      mutashabihatSheetTitle: document.getElementById('mutashabihatSheetTitle'),
      closeMutashabihatSheetBtn: document.getElementById('closeMutashabihatSheetBtn'),
      mutashabihatTopicBadge: document.getElementById('mutashabihatTopicBadge'),
      mutashabihatRuleText: document.getElementById('mutashabihatRuleText'),
      mutashabihatCurrentRef: document.getElementById('mutashabihatCurrentRef'),
      mutashabihatCurrentText: document.getElementById('mutashabihatCurrentText'),
      mutashabihatCounterpartsContainer: document.getElementById('mutashabihatCounterpartsContainer'),
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
      openGharibBtn: document.getElementById('openGharibBtn'),
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
      openUrgentExamSettingsRowBtn: document.getElementById('openUrgentExamSettingsRowBtn'),
      backFromExamBtn: document.getElementById('backFromExamBtn')
    };
  }

  // --- INITIALIZATION ---
  function initMushaf() {
    loadLocalQuranText();
    initDomReferences();
    if (typeof MushafSettingsManager !== 'undefined') {
      MushafSettingsManager.applySettings();
    }
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

    // تنظيف كاش التجويد القديم والـ 1422 إن وجد
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('seraj_tajweed_p_')) {
          localStorage.removeItem(k);
        }
      }
    } catch (_) { }

    if ('caches' in window) {
      ['tibyan-mushaf-pages-1422', 'tibyan-mushaf-pages-1422-v2'].forEach((name) => {
        caches.delete(name).catch(() => { });
      });
    }

    // تحميل خط ترويسة السور مسبقاً بدون حجب العرض، ثم عرض الصفحة المحفوظة فوراً
    loadSurahHeaderFonts();
    loadPage(MushafState.currentPage, { noAnimation: true });

    // البدء التلقائي في تحميل صفحات وخطوط المصحف في الخلفية للعمل بدون إنترنت
    AutoMushafDownloader.init();
  }

  // --- OFF-CANVAS SURAH DRAWER & UNIVERSAL QURAN SEARCH ---

  let quranSearchIndex = null;
  let quranSearchIndexLoading = null;
  let drawerSearchDebounceTimer = null;
  let currentSearchQuery = '';
  let currentMatchingAyahs = [];
  let displayedAyahsCount = 0;
  const AYAH_SEARCH_BATCH_SIZE = 50;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function ensureQuranSearchIndex() {
    if (quranSearchIndex && quranSearchIndex.length > 0) return quranSearchIndex;
    if (quranSearchIndexLoading) return quranSearchIndexLoading;

    quranSearchIndexLoading = (async () => {
      try {
        if (!localQuranTextMap) {
          await loadLocalQuranText();
        }
        if (!localQuranTextMap) {
          console.warn('Unable to load quran text for search indexing');
          return [];
        }
        const idx = [];
        for (const [key, text] of Object.entries(localQuranTextMap)) {
          const sep = key.indexOf(':');
          if (sep === -1) continue;
          const surah = parseInt(key.slice(0, sep), 10);
          const ayah = parseInt(key.slice(sep + 1), 10);
          const normText = normalizeArabicText(text);
          idx.push({ surah, ayah, text, normText });
        }
        quranSearchIndex = idx;
        return quranSearchIndex;
      } catch (err) {
        console.warn('Failed to build quran search index:', err);
        return [];
      } finally {
        quranSearchIndexLoading = null;
      }
    })();

    return quranSearchIndexLoading;
  }

  function highlightMatchedText(text, qNorm, qNoAl) {
    if (!text || !qNorm) return escapeHtml(text || '');
    const words = text.split(/\s+/);
    const normWords = words.map(w => normalizeArabicText(w));
    const qTokens = qNorm.split(/\s+/).filter(Boolean);

    if (qTokens.length <= 1) {
      const target = qTokens[0] || qNorm;
      return words.map((w, i) => {
        const nw = normWords[i];
        const safeW = escapeHtml(w);
        if (nw && (nw.includes(target) || (qNoAl && nw.includes(qNoAl)))) {
          return `<mark class="search-highlight">${safeW}</mark>`;
        }
        return safeW;
      }).join(' ');
    } else {
      const spanLen = qTokens.length;
      const matchedIndices = new Set();
      for (let i = 0; i <= normWords.length - spanLen; i++) {
        const slice = normWords.slice(i, i + spanLen).join(' ');
        if (slice.includes(qNorm)) {
          for (let j = i; j < i + spanLen; j++) matchedIndices.add(j);
        }
      }
      return words.map((w, i) => {
        const safeW = escapeHtml(w);
        return matchedIndices.has(i) ? `<mark class="search-highlight">${safeW}</mark>` : safeW;
      }).join(' ');
    }
  }

  function initSurahDrawer() {
    if (!dom.drawerList || !window.QURAN_SURAHS) return;

    renderDrawerSurahList(window.QURAN_SURAHS);

    // Search filter input with debounce (~200ms)
    if (dom.drawerSearchInput) {
      dom.drawerSearchInput.addEventListener('input', (e) => {
        clearTimeout(drawerSearchDebounceTimer);
        const rawVal = e.target.value;
        drawerSearchDebounceTimer = setTimeout(() => {
          handleUniversalDrawerSearch(rawVal);
        }, 200);
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

  async function handleUniversalDrawerSearch(rawQuery) {
    const trimmed = (rawQuery || '').trim();
    currentSearchQuery = trimmed;

    if (!trimmed) {
      currentMatchingAyahs = [];
      displayedAyahsCount = 0;
      renderDrawerSurahList(window.QURAN_SURAHS || []);
      return;
    }

    const queryNorm = normalizeArabicText(trimmed);
    const queryDigits = trimmed.replace(/[^\d]/g, '');

    // 1. فلترة السور المطابقة
    const matchingSurahs = (window.QURAN_SURAHS || []).filter(s => {
      const normName = normalizeArabicText(s.name);
      const sIdStr = String(s.id);
      return (queryNorm && normName.includes(queryNorm)) || (queryDigits && sIdStr === queryDigits);
    });

    // 2. فلترة الآيات القرآنية المطابقة
    let matchingAyahs = [];
    if (queryNorm.length >= 2 || (queryDigits && queryDigits.length >= 1)) {
      const index = await ensureQuranSearchIndex();
      const qNoAl = (queryNorm.startsWith('ال') && queryNorm.length > 3) ? queryNorm.slice(2) : null;

      for (let i = 0; i < index.length; i++) {
        const item = index[i];
        if (queryNorm && (item.normText.includes(queryNorm) || (qNoAl && item.normText.includes(qNoAl)))) {
          matchingAyahs.push(item);
        }
      }
    }

    currentMatchingAyahs = matchingAyahs;
    displayedAyahsCount = 0;

    renderUniversalSearchResults(trimmed, matchingSurahs, matchingAyahs, queryNorm);
  }

  function renderUniversalSearchResults(rawQuery, matchingSurahs, matchingAyahs, queryNorm) {
    if (!dom.drawerList) return;
    dom.drawerList.innerHTML = '';

    if (matchingSurahs.length === 0 && matchingAyahs.length === 0) {
      dom.drawerList.innerHTML = `
        <div class="drawer-search-empty">
          <svg class="drawer-search-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <div class="drawer-search-empty-title">لا توجد نتائج مطابقة</div>
          <div class="drawer-search-empty-desc">لم نجد أي سورة أو آية مطابقة لـ "${escapeHtml(rawQuery)}"</div>
        </div>
      `;
      return;
    }

    // قسم السور المطابقة
    if (matchingSurahs.length > 0) {
      const surahHeader = document.createElement('div');
      surahHeader.className = 'drawer-section-header';
      surahHeader.innerHTML = `
        <span class="drawer-section-title">السور المطابقة</span>
        <span class="drawer-results-count">${matchingSurahs.length} سورة</span>
      `;
      dom.drawerList.appendChild(surahHeader);

      matchingSurahs.forEach(s => {
        dom.drawerList.appendChild(createSurahDrawerItem(s));
      });
    }

    // قسم نتائج الآيات
    if (matchingAyahs.length > 0) {
      const ayahHeader = document.createElement('div');
      ayahHeader.className = 'drawer-section-header';
      ayahHeader.innerHTML = `
        <span class="drawer-section-title">نتائج الآيات</span>
        <span class="drawer-results-count">${matchingAyahs.length} نتيجة</span>
      `;
      dom.drawerList.appendChild(ayahHeader);

      const ayahsListContainer = document.createElement('div');
      ayahsListContainer.className = 'drawer-ayahs-list';
      ayahsListContainer.id = 'drawerAyahsList';
      dom.drawerList.appendChild(ayahsListContainer);

      renderMoreAyahs(AYAH_SEARCH_BATCH_SIZE, queryNorm);
    }
  }

  function renderMoreAyahs(batchSize, queryNorm) {
    const ayahsListContainer = document.getElementById('drawerAyahsList');
    if (!ayahsListContainer) return;

    const qNoAl = (queryNorm && queryNorm.startsWith('ال') && queryNorm.length > 3) ? queryNorm.slice(2) : null;
    const start = displayedAyahsCount;
    const end = Math.min(currentMatchingAyahs.length, start + batchSize);

    for (let i = start; i < end; i++) {
      const item = currentMatchingAyahs[i];
      const card = createAyahResultCard(item, queryNorm, qNoAl);
      ayahsListContainer.appendChild(card);
    }

    displayedAyahsCount = end;

    // زر "عرض المزيد من النتائج"
    let loadMoreBtn = dom.drawerList.querySelector('.drawer-load-more-btn');
    if (displayedAyahsCount < currentMatchingAyahs.length) {
      const remaining = currentMatchingAyahs.length - displayedAyahsCount;
      if (!loadMoreBtn) {
        loadMoreBtn = document.createElement('button');
        loadMoreBtn.type = 'button';
        loadMoreBtn.className = 'drawer-load-more-btn';
        loadMoreBtn.addEventListener('click', () => {
          renderMoreAyahs(AYAH_SEARCH_BATCH_SIZE, queryNorm);
        });
        dom.drawerList.appendChild(loadMoreBtn);
      }
      loadMoreBtn.innerHTML = `
        <span>عرض المزيد من النتائج (${remaining} متبقية)</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;
    } else if (loadMoreBtn) {
      loadMoreBtn.remove();
    }
  }

  function createAyahResultCard(item, queryNorm, qNoAl) {
    const card = document.createElement('div');
    card.className = 'drawer-ayah-result-card';
    card.setAttribute('data-surah', item.surah);
    card.setAttribute('data-ayah', item.ayah);

    const sObj = window.getSurahById ? window.getSurahById(item.surah) : null;
    const surahName = sObj ? sObj.name : `السورة ${item.surah}`;
    const targetPage = getAyahPageNumber(item.surah, item.ayah);
    const highlighted = highlightMatchedText(item.text, queryNorm, qNoAl);

    card.innerHTML = `
      <div class="drawer-ayah-meta-row">
        <span class="drawer-ayah-badge">سورة ${surahName} • آية ${item.ayah}</span>
        <span class="drawer-ayah-page-badge">صفحة ${targetPage}</span>
      </div>
      <div class="drawer-ayah-text">${highlighted}</div>
    `;

    card.addEventListener('click', async () => {
      closeSurahDrawer();
      await loadPage(targetPage);
      MushafState.activeSurahId = item.surah;
      MushafState.activeAyahNum = item.ayah;
      selectActiveAyah(item.surah, item.ayah, false);

      // التمرير إلى الآية بلطف إن وُجدت في الصفحة
      setTimeout(() => {
        const activeWordEl = dom.qcfContainer ? dom.qcfContainer.querySelector(`.qcf-word[data-surah="${item.surah}"][data-ayah="${item.ayah}"]`) : null;
        if (activeWordEl) {
          activeWordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    });

    return card;
  }

  function createSurahDrawerItem(s) {
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
      <button class="drawer-surah-download-btn" type="button" title="تحميل سورة ${s.name} صوتياً" aria-label="تحميل سورة ${s.name}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:17px;height:17px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
    `;

    const dlBtn = item.querySelector('.drawer-surah-download-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSurahDrawer();
        openAudioDownloadModal();
        switchDownloadTab('audio');
        if (dom.downloadSurahSelect) {
          dom.downloadSurahSelect.value = s.id;
          updateDownloadCardStatus();
        }
      });
    }

    item.addEventListener('click', () => {
      loadPage(s.startPage);
      closeSurahDrawer();
    });

    return item;
  }

  function renderDrawerSurahList(surahList) {
    if (!dom.drawerList) return;
    dom.drawerList.innerHTML = '';

    if (!surahList || !surahList.length) {
      dom.drawerList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          لا توجد سور مطابقة
        </div>
      `;
      return;
    }

    surahList.forEach(s => {
      dom.drawerList.appendChild(createSurahDrawerItem(s));
    });
  }

  const renderDrawerList = renderDrawerSurahList;

  function openSurahDrawer() {
    if (!dom.surahDrawer || !dom.drawerBackdrop) return;
    dom.drawerBackdrop.hidden = false;
    dom.surahDrawer.hidden = false;
    document.body.classList.add('drawer-open-lock');

    // Preload search index in background
    ensureQuranSearchIndex();

    // Small delay to trigger CSS transition
    requestAnimationFrame(() => {
      dom.surahDrawer.classList.remove('drawer-closed');
      highlightCurrentSurahInDrawer();
      if (dom.drawerSearchInput) {
        dom.drawerSearchInput.value = '';
        renderDrawerSurahList(window.QURAN_SURAHS || []);
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

    // عين الشريط العلوي: تشغيل/إيقاف وضع الإخفاء (Blind Mode)
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
  }

  function initMaskControls() {
    // Mode picker handles mask controls
  }

  function toggleMaskMode() {
    const nextMode = (MushafState.maskMode === 'none' || !MushafState.maskMode || MushafState.maskMode === false) ? 'verse' : 'none';
    setMaskMode(nextMode);
    if (window.showToast) {
      window.showToast(nextMode === 'verse' ? 'فعّلنا وضع التسميع' : 'أظهرنا الآيات');
    }
  }

  function setMaskMode(mode) {
    MushafState.maskMode = mode;
    localStorage.setItem('tibyan_mushaf_mask_mode', mode);

    // في بداية وضع إخفاء الآيات: تفريغ الآيات المكشوفة ليبدأ المصحف مخفياً بالكامل ما عدا البسملة ورأس الصفحة
    if (MushafState.unmaskedVerses) {
      MushafState.unmaskedVerses.clear();
    }
    MushafState.wordErrors.clear();

    const eyeOpenSvg = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
    const eyeOffSvg = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;

    if (mode === 'none' || !mode) {
      if (dom.pageWrapper) {
        dom.pageWrapper.classList.remove('mask-mode-active', 'mask-mode-word', 'mask-mode-verse');
      }
      if (dom.toggleMaskBtn) {
        dom.toggleMaskBtn.classList.remove('active');
        dom.toggleMaskBtn.title = 'إخفاء الآيات للتسميع';
      }
      if (dom.toggleBlindModeBtn) {
        dom.toggleBlindModeBtn.classList.remove('active');
        dom.toggleBlindModeBtn.title = 'وضع إخفاء الآيات (التسميع واختبار التثبيت)';
      }
      if (dom.maskEyeIcon) dom.maskEyeIcon.innerHTML = eyeOpenSvg;
      if (dom.blindModeIcon) dom.blindModeIcon.innerHTML = eyeOpenSvg;

      if (!MushafState.isReciting) {
        if (dom.recitationRevealAyahBtn) dom.recitationRevealAyahBtn.style.display = 'none';
        if (dom.recitationStatsBar) dom.recitationStatsBar.style.display = 'none';
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
      if (dom.toggleBlindModeBtn) {
        dom.toggleBlindModeBtn.classList.add('active');
        dom.toggleBlindModeBtn.title = 'إظهار الآيات المكشوفة';
      }
      if (dom.maskEyeIcon) dom.maskEyeIcon.innerHTML = eyeOffSvg;
      if (dom.blindModeIcon) dom.blindModeIcon.innerHTML = eyeOffSvg;

      if (dom.recitationRevealAyahBtn) dom.recitationRevealAyahBtn.style.display = 'inline-flex';
      if (dom.recitationStatsBar) dom.recitationStatsBar.style.display = 'flex';

      if (window.scrollTo) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    highlightActiveAyahPolygon();
    syncQcfWordsDisplay();

    if (ReciterPlayer.isPlaying && ReciterPlayer.currentSurah && ReciterPlayer.currentAyah) {
      startReciterWordTracking(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    }
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

    // 6. Urgent Exam Row & Subpage
    if (dom.openUrgentExamSettingsRowBtn) {
      dom.openUrgentExamSettingsRowBtn.addEventListener('click', () => {
        if (typeof window.openUrgentExamModal === 'function') {
          window.openUrgentExamModal();
        } else if (typeof window.showToolsSubpage === 'function') {
          const toolsBtn = document.querySelector('.nav-item-btn[data-tab="view-tools"]');
          if (toolsBtn) toolsBtn.click();
          window.showToolsSubpage('settingsExamSubpage');
          if (typeof window.populateExamSurahSelects === 'function') window.populateExamSurahSelects();
          if (typeof window.renderUrgentExamModal === 'function') window.renderUrgentExamModal();
        }
      });
    }

    if (dom.backFromExamBtn) {
      dom.backFromExamBtn.addEventListener('click', () => {
        if (typeof window.hideToolsSubpages === 'function') {
          window.hideToolsSubpages();
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

    // 1. الأولوية المطلقة: مطابقة كلمات المصحف الرقمي QCF تماماً لنفس أرقام الكلمات
    if (MushafState.pageQcfWords && MushafState.pageQcfWords.length > 0) {
      const qcfAyahWords = MushafState.pageQcfWords.filter(w => {
        const locParts = (w.location || '').split(':');
        const vkParts = (w._vk || '').split(':');
        const s = parseInt(vkParts[0] || locParts[0] || '1', 10);
        const a = parseInt(vkParts[1] || locParts[1] || '1', 10);
        return s === surahNum && a === ayahNum && w.char_type_name !== 'end';
      });

      if (qcfAyahWords.length > 0) {
        selectedAyahWords = qcfAyahWords.map(w => (w.text_imlaei || w.text_qpc_hafs || '').trim()).filter(Boolean);
        renderSheetWordTokens(surahNum, ayahNum);
        return;
      }
    }

    // 2. فحص بيانات الآيات بالصفحة أو جلبها
    let verseText = '';
    const foundInPage = MushafState.pageVerses && MushafState.pageVerses.find(v => v.verse_key === verseKey);
    if (foundInPage && (foundInPage.text_uthmani || foundInPage.text_imlaei || foundInPage.text_uthmani_simple)) {
      verseText = foundInPage.text_uthmani || foundInPage.text_imlaei || foundInPage.text_uthmani_simple;
    } else {
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

    // تنظيف رموز علامات الوقف المنفصلة لكي لا تأخذ أرقام كلمات إضافية
    const rawWords = verseText.trim().split(/\s+/).filter(w => {
      const stripped = w.replace(/[\s\u06D6-\u06ED]/g, '');
      return stripped.length > 0;
    });
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

  let cachedGharibData = null;

  function formatGharibContent(rawText) {
    if (!rawText || !rawText.trim()) {
      return `
        <div class="gharib-empty-card">
          <div class="gharib-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:32px;height:32px;color:var(--primary);">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <h4 class="gharib-empty-title">ألفاظ الآية بيّنة جليّة</h4>
          <p class="gharib-empty-desc">مفردات هذه الآية الكريمة واضحة المعنى في لسان العرب، ولا تشتمل على ألفاظ غريبة تستوجب البيان الإفرادي. يمكنك الاطلاع على المعنى الإجمالي والتفسير.</p>
          <button type="button" class="gharib-switch-tafseer-btn btn-formal-secondary" onclick="window.switchTafseerTab && window.switchTafseerTab(16)">
            التفسير الميسر
          </button>
        </div>
      `;
    }

    const lines = rawText.split(/<br\s*[\/]?>/i).map(l => l.trim()).filter(Boolean);
    const itemsHtml = lines.map(line => {
      const parts = line.split(/\s*[:؛]\s*/);
      if (parts.length >= 2) {
        const word = parts[0].trim();
        const meaning = parts.slice(1).join(' : ').trim();
        return `
          <div class="gharib-card">
            <div class="gharib-word-badge">
              <span class="gharib-word-dot"></span>
              <span class="gharib-word-text">${word}</span>
            </div>
            <div class="gharib-meaning-text">${meaning}</div>
          </div>
        `;
      } else {
        return `
          <div class="gharib-card">
            <div class="gharib-meaning-text">${line}</div>
          </div>
        `;
      }
    }).join('');

    return `<div class="gharib-list">${itemsHtml}</div>`;
  }

  async function loadGharibContent(surahNum, ayahNum) {
    if (!cachedGharibData) {
      try {
        const res = await fetch('data/gharib.json');
        if (res.ok) {
          cachedGharibData = await res.json();
        }
      } catch (e) {
        console.warn('Failed to load local gharib.json:', e);
      }
    }

    if (dom.sheetTafseerLoading) dom.sheetTafseerLoading.style.display = 'none';

    const key = `${surahNum}:${ayahNum}`;
    const rawText = cachedGharibData ? cachedGharibData[key] : null;

    if (dom.sheetTafseerText) {
      dom.sheetTafseerText.innerHTML = formatGharibContent(rawText);
    }
  }

  window.switchTafseerTab = function (tafsirId) {
    if (selectedAyahContext) {
      loadAyahTafseer(selectedAyahContext.surah, selectedAyahContext.ayah, tafsirId);
    }
  };

  async function loadAyahTafseer(surahNum, ayahNum, tafsirId = currentSheetTafsirId) {
    if (!dom.sheetTafseerText) return;
    currentSheetTafsirId = tafsirId;

    if (dom.sheetTafseerLoading) dom.sheetTafseerLoading.style.display = 'flex';
    dom.sheetTafseerText.innerHTML = '';

    // Switch tab buttons active class
    const tabContainers = [dom.ayahTafseerModal, dom.ayahActionSheet].filter(Boolean);
    tabContainers.forEach(container => {
      container.querySelectorAll('.tafseer-tab-btn').forEach(btn => {
        const id = btn.getAttribute('data-tafsir');
        btn.classList.toggle('active', String(id) === String(tafsirId));
      });
    });

    const surahObj = window.getSurahById ? window.getSurahById(surahNum) : null;
    const sName = surahObj ? surahObj.name : `السورة ${surahNum}`;

    if (String(tafsirId) === 'gharib') {
      if (dom.tafseerModalTitle) {
        dom.tafseerModalTitle.textContent = `غريب القرآن | سورة ${sName} - آية ${ayahNum}`;
      }
      await loadGharibContent(surahNum, ayahNum);
      return;
    }

    if (dom.tafseerModalTitle) {
      dom.tafseerModalTitle.textContent = `تفسير سورة ${sName} | الآية ${ayahNum}`;
    }

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

  function openAyahTafseerModal(initialTab) {
    if (!selectedAyahContext) return;
    const { surah, ayah } = selectedAyahContext;
    const tabToUse = initialTab || (currentSheetTafsirId === 'gharib' ? 'gharib' : (currentSheetTafsirId || 16));
    const surahObj = window.getSurahById ? window.getSurahById(surah) : null;
    const sName = surahObj ? surahObj.name : `السورة ${surah}`;
    if (dom.tafseerModalTitle) {
      dom.tafseerModalTitle.textContent = (String(tabToUse) === 'gharib')
        ? `غريب القرآن | سورة ${sName} - آية ${ayah}`
        : `تفسير سورة ${sName} | الآية ${ayah}`;
    }
    loadAyahTafseer(surah, ayah, tabToUse);
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
      dom.setBookmarkBtnText.textContent = isBm ? 'إزالة العلامة' : 'علامة توقف';
    }

    const hasN = hasNote(surahNum, ayahNum);
    if (dom.addNoteBtnText) {
      dom.addNoteBtnText.textContent = hasN ? 'تعديل الملاحظة' : 'إضافة ملاحظة';
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

  // --- MUTASHABIHAT SHEET LOGIC (مصحف الحفظ الميسر) ---
  function showMutashabihatSheet(surahNum, ayahNum) {
    if (!window.getMutashabihData) return;
    const data = window.getMutashabihData(surahNum, ayahNum);
    if (!data) return;

    if (dom.mutashabihatSheetTitle) {
      dom.mutashabihatSheetTitle.textContent = `متشابهات سورة ${data.surahName} | الآية ${data.ayah}`;
    }
    if (dom.mutashabihatTopicBadge) {
      dom.mutashabihatTopicBadge.textContent = data.topic || 'ضابط المتشابهة اللفظية';
    }
    if (dom.mutashabihatRuleText) {
      dom.mutashabihatRuleText.textContent = data.note || data.rule || '';
    }
    if (dom.mutashabihatCurrentRef) {
      dom.mutashabihatCurrentRef.textContent = `سورة ${data.surahName}: آية ${data.ayah} (صفحة ${data.page})`;
    }
    if (dom.mutashabihatCurrentText) {
      let t = data.text || '';
      if (data.phrase && t.includes(data.phrase)) {
        t = t.replace(data.phrase, `<mark class="mutashabih-highlight">${data.phrase}</mark>`);
      }
      dom.mutashabihatCurrentText.innerHTML = t;
    }

    if (dom.mutashabihatCounterpartsContainer) {
      dom.mutashabihatCounterpartsContainer.innerHTML = '';
      if (Array.isArray(data.counterparts) && data.counterparts.length > 0) {
        data.counterparts.forEach((cp) => {
          const card = document.createElement('div');
          card.className = 'mutashabihat-verse-card counterpart';

          let cpText = cp.text || '';
          if (cp.phrase && cpText.includes(cp.phrase)) {
            cpText = cpText.replace(cp.phrase, `<mark class="mutashabih-highlight">${cp.phrase}</mark>`);
          }

          card.innerHTML = `
            <div class="mutashabihat-verse-card-header">
              <span class="mutashabihat-verse-tag counterpart-tag">الموضع المقابل</span>
              <span class="mutashabihat-verse-ref">سورة ${cp.surahName}: آية ${cp.ayah} (صفحة ${cp.page})</span>
            </div>
            ${cp.rule ? `<div class="mutashabihat-counterpart-rule">${cp.rule}</div>` : ''}
            <div class="mutashabihat-verse-text">${cpText}</div>
            <button type="button" class="btn-jump-mutashabih" data-page="${cp.page}" data-surah="${cp.surah}" data-ayah="${cp.ayah}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>انتقال للآية</span>
            </button>
          `;

          const jumpBtn = card.querySelector('.btn-jump-mutashabih');
          if (jumpBtn) {
            jumpBtn.addEventListener('click', () => {
              closeMutashabihatSheet();
              loadPage(cp.page).then(() => {
                selectActiveAyah(cp.surah, cp.ayah, true);
              });
            });
          }

          dom.mutashabihatCounterpartsContainer.appendChild(card);
        });
      }
    }

    if (dom.mutashabihatSheetBackdrop) {
      dom.mutashabihatSheetBackdrop.classList.add('active');
      dom.mutashabihatSheetBackdrop.classList.add('open');
    }
    if (dom.mutashabihatSheet) {
      dom.mutashabihatSheet.style.display = 'block';
      dom.mutashabihatSheet.classList.add('active');
      dom.mutashabihatSheet.classList.add('open');
    }
  }

  function closeMutashabihatSheet() {
    if (dom.mutashabihatSheetBackdrop) {
      dom.mutashabihatSheetBackdrop.classList.remove('active');
      dom.mutashabihatSheetBackdrop.classList.remove('open');
    }
    if (dom.mutashabihatSheet) {
      dom.mutashabihatSheet.classList.remove('active');
      dom.mutashabihatSheet.classList.remove('open');
      dom.mutashabihatSheet.style.display = 'none';
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
    // Mutashabihat sheet events
    if (dom.closeMutashabihatSheetBtn) {
      dom.closeMutashabihatSheetBtn.addEventListener('click', closeMutashabihatSheet);
    }
    if (dom.mutashabihatSheetBackdrop) {
      dom.mutashabihatSheetBackdrop.addEventListener('click', closeMutashabihatSheet);
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

    // Open dedicated Tafseer & Gharib modal buttons
    if (dom.openTafseerBtn) {
      dom.openTafseerBtn.addEventListener('click', () => {
        closeAyahActionSheet();
        if (selectedAyahContext) {
          openAyahTafseerModal(16);
        }
      });
    }
    if (dom.openGharibBtn) {
      dom.openGharibBtn.addEventListener('click', () => {
        closeAyahActionSheet();
        if (selectedAyahContext) {
          openAyahTafseerModal('gharib');
        }
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
          const attr = btn.getAttribute('data-tafsir');
          const tafsirId = (attr === 'gharib') ? 'gharib' : (parseInt(attr, 10) || 16);
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
        if (window.showToast) window.showToast('شِلنا التظليل');
      } else {
        targetIndices.forEach(idx => {
          window.AppState.wordHighlights[`${surah}:${ayah}:${idx}`] = color;
        });
        delete window.AppState.ayahHighlights[`${surah}:${ayah}`];
        const cName = color === 'yellow' ? 'الأصفر' : (color === 'red' ? 'الأحمر' : 'الأزرق');
        if (window.showToast) window.showToast(`ظلّلنا باللون ${cName}`);
      }

      if (window.persistState) window.persistState();
      renderSheetWordTokens(surah, ayah);
      refreshPolygonsDecoration();
      syncQcfWordsDisplay();
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

    // دوائر الألوان السريعة المباشرة أسفل الكلمات المحددة
    const wordsCounterEl = document.getElementById('selectedWordsCounter');
    if (wordsCounterEl) {
      wordsCounterEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.inline-color-btn');
        if (!btn) return;
        e.stopPropagation();
        const color = btn.getAttribute('data-color');
        if (color && color !== 'none') {
          setPenActiveColor(color);
        }
        applyPenColor(color);
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
          if (window.showToast) window.showToast('شِلنا علامة التوقف');
        } else {
          window.AppState.ayahBookmarks = { page: MushafState.currentPage, surah, ayah };
          if (window.showToast) window.showToast('تم، حفظنا علامة التوقف');
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

  // --- PAGE NOTES (ملاحظات متعددة لكل صفحة مع نموذج الإضافة والتعديل) ---

  let editingPageNoteId = null;

  function getPageNotesList(pageNum) {
    if (!window.AppState) window.AppState = {};
    if (!window.AppState.pageNotes) window.AppState.pageNotes = {};
    const raw = window.AppState.pageNotes[pageNum];
    if (!raw) return [];

    if (Array.isArray(raw)) {
      return raw.filter(item => item && typeof item.text === 'string' && item.text.trim().length > 0);
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      return [{
        id: 'legacy_' + pageNum,
        text: trimmed,
        createdAt: new Date().toISOString()
      }];
    }

    if (typeof raw === 'object' && raw.text) {
      return [raw];
    }

    return [];
  }

  function setPageNotesList(pageNum, notesArray) {
    if (!window.AppState) window.AppState = {};
    if (!window.AppState.pageNotes) window.AppState.pageNotes = {};
    if (!Array.isArray(notesArray) || notesArray.length === 0) {
      delete window.AppState.pageNotes[pageNum];
    } else {
      window.AppState.pageNotes[pageNum] = notesArray;
    }
  }

  function formatNoteDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('ar-u-nu-latn', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }

  function updatePageNotesIndicator(pageNum) {
    if (!dom.pageNotesDotIndicator) return;
    const list = getPageNotesList(pageNum);
    const hasNote = list.length > 0;
    dom.pageNotesDotIndicator.style.display = hasNote ? 'block' : 'none';
    if (dom.openPageNotesBtn) {
      dom.openPageNotesBtn.style.color = hasNote ? 'var(--primary)' : '';
      dom.openPageNotesBtn.style.borderColor = hasNote ? 'var(--primary)' : '';
    }
  }

  function renderPageNotesList(notes, curP) {
    if (!dom.pageNotesListContainer) return;
    dom.pageNotesListContainer.innerHTML = '';

    if (dom.pageNotesCountBadge) {
      dom.pageNotesCountBadge.textContent = String(notes.length);
    }

    if (!notes || notes.length === 0) {
      dom.pageNotesListContainer.innerHTML = `
        <div class="page-notes-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="page-notes-empty-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <div class="page-notes-empty-title">لا توجد ملاحظات مسجلة لهذه الصفحة بعد</div>
          <div class="page-notes-empty-desc">اكتب ملاحظتك في النموذج أدناه ثم اضغط حفظ الملاحظة</div>
        </div>
      `;
      return;
    }

    notes.forEach(note => {
      const card = document.createElement('div');
      card.className = 'page-note-card';
      card.setAttribute('data-id', note.id);

      const formattedDate = formatNoteDate(note.createdAt) || 'ملاحظة محفوظة';

      card.innerHTML = `
        <div class="page-note-card-header">
          <span class="page-note-meta-time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>${escapeHtml(formattedDate)}</span>
          </span>
          <div class="page-note-actions">
            <button type="button" class="page-note-btn-action btn-edit-note" title="تعديل الملاحظة" aria-label="تعديل">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button type="button" class="page-note-btn-action danger btn-delete-note" title="حذف الملاحظة" aria-label="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="page-note-card-text">${escapeHtml(note.text)}</div>
      `;

      // زر التعديل
      const btnEdit = card.querySelector('.btn-edit-note');
      if (btnEdit) {
        btnEdit.addEventListener('click', () => {
          editingPageNoteId = note.id;
          if (dom.pageNotesTextarea) {
            dom.pageNotesTextarea.value = note.text;
            dom.pageNotesTextarea.focus();
          }
          if (dom.pageNoteInputTitle) dom.pageNoteInputTitle.textContent = 'تعديل الملاحظة';
          if (dom.savePageNoteBtnText) dom.savePageNoteBtnText.textContent = 'تحديث الملاحظة';
          if (dom.cancelEditNoteBtn) dom.cancelEditNoteBtn.style.display = 'inline-block';
        });
      }

      // زر الحذف مع تأكيد
      const btnDelete = card.querySelector('.btn-delete-note');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          if (confirm('متأكد تبي تحذف هذه الملاحظة؟')) {
            let currentList = getPageNotesList(curP);
            currentList = currentList.filter(item => item.id !== note.id);
            setPageNotesList(curP, currentList);
            if (editingPageNoteId === note.id) {
              resetNoteInputState();
            }
            renderPageNotesList(currentList, curP);
            updatePageNotesIndicator(curP);
            if (window.persistState) window.persistState();
            if (window.showToast) window.showToast('شِلنا الملاحظة');
          }
        });
      }

      dom.pageNotesListContainer.appendChild(card);
    });
  }

  function resetNoteInputState() {
    editingPageNoteId = null;
    if (dom.pageNotesTextarea) dom.pageNotesTextarea.value = '';
    if (dom.pageNoteInputTitle) dom.pageNoteInputTitle.textContent = 'إضافة ملاحظة جديدة';
    if (dom.savePageNoteBtnText) dom.savePageNoteBtnText.textContent = 'حفظ الملاحظة';
    if (dom.cancelEditNoteBtn) dom.cancelEditNoteBtn.style.display = 'none';
  }

  function openPageNotesModal() {
    const curP = MushafState.currentPage;
    if (dom.pageNotesModalTitle) {
      dom.pageNotesModalTitle.textContent = `ملاحظات صفحة ${curP}`;
    }

    resetNoteInputState();
    const currentNotes = getPageNotesList(curP);
    renderPageNotesList(currentNotes, curP);

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
          const safeText = escapeHtml(n.text);
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
    }
  }

  function closePageNotesModal() {
    if (dom.pageNotesBackdrop) dom.pageNotesBackdrop.hidden = true;
    if (dom.pageNotesModal) dom.pageNotesModal.hidden = true;
    resetNoteInputState();
  }

  function initPageNotes() {
    if (dom.openPageNotesBtn) {
      dom.openPageNotesBtn.addEventListener('click', openPageNotesModal);
    }
    if (dom.closePageNotesBtn) {
      dom.closePageNotesBtn.addEventListener('click', closePageNotesModal);
    }
    if (dom.cancelPageNoteBtn) {
      dom.cancelPageNoteBtn.addEventListener('click', () => {
        if (editingPageNoteId) {
          resetNoteInputState();
        } else if (dom.pageNotesTextarea && dom.pageNotesTextarea.value.trim().length > 0) {
          dom.pageNotesTextarea.value = '';
        } else {
          closePageNotesModal();
        }
      });
    }
    if (dom.cancelEditNoteBtn) {
      dom.cancelEditNoteBtn.addEventListener('click', resetNoteInputState);
    }
    if (dom.pageNotesBackdrop) {
      dom.pageNotesBackdrop.addEventListener('click', closePageNotesModal);
    }

    if (dom.savePageNoteBtn) {
      dom.savePageNoteBtn.addEventListener('click', () => {
        const curP = MushafState.currentPage;
        const val = dom.pageNotesTextarea ? dom.pageNotesTextarea.value.trim() : '';

        if (!val) {
          if (window.showToast) window.showToast('اكتب ملاحظتك أول');
          return;
        }

        let currentList = getPageNotesList(curP);

        if (editingPageNoteId) {
          const idx = currentList.findIndex(item => item.id === editingPageNoteId);
          if (idx !== -1) {
            currentList[idx].text = val;
            currentList[idx].updatedAt = new Date().toISOString();
          } else {
            currentList.push({
              id: editingPageNoteId,
              text: val,
              createdAt: new Date().toISOString()
            });
          }
          if (window.showToast) window.showToast('تم، حدّثنا الملاحظة');
        } else {
          currentList.push({
            id: 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            text: val,
            createdAt: new Date().toISOString()
          });
          if (window.showToast) window.showToast('تم، حفظنا الملاحظة');
        }

        setPageNotesList(curP, currentList);
        resetNoteInputState();
        renderPageNotesList(currentList, curP);
        updatePageNotesIndicator(curP);
        if (window.persistState) window.persistState();
      });
    }
  }

  // --- RECITER AUDIO PLAYER (ZERO-LATENCY WEB AUDIO API & GAPLESS PLAYBACK) ---

  // وقفة طبيعية مريحة وسريعة بين الآيات (600ms أي 0.6 ثانية كما طلب المستخدم)
  const RECITER_VERSE_PAUSE_MS = 600;
  const AUDIO_CACHE_NAME = 'seraj-audio-cache-v2';

  // تنظيف فوري لأي كاش صوتيات قديم منخفض الجودة عند الإقلاع
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(k => {
        if ((k.startsWith('seraj-audio-cache') || k.startsWith('tibyan-audio')) && k !== AUDIO_CACHE_NAME) {
          console.log('[Audio] Removing legacy low-bitrate audio cache:', k);
          caches.delete(k);
        }
      });
    }).catch(() => { });
  }

  const ReciterPlayer = {
    audioElement: new Audio(),
    preloadAudio: new Audio(),
    playSessionId: 0,
    ctx: null,
    gainNode: null,
    currentSource: null,
    fallbackAudio: new Audio(),
    isPlaying: false,
    isPaused: false,
    pausedSurah: null,
    pausedAyah: null,
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

  // الحفاظ التام على نبرة القارئ الأصلية وطبقة الصوت عند تسريع الصوت (منع صوت السنجاب نهائياً)
  function setupPreservePitch(audio) {
    if (!audio) return;
    audio.preservesPitch = true;
    audio.mozPreservesPitch = true;
    audio.webkitPreservesPitch = true;
  }
  setupPreservePitch(ReciterPlayer.audioElement);
  setupPreservePitch(ReciterPlayer.preloadAudio);

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
      if (peak < 0.03) return buf; // صوت منخفض جداً - حفظ الملف الأصلي دون أدنى مساس بالنقاء

      // عتبة كشف فائقة الحساسية لحماية مخارج الحروف الرقيقة والهمزات والمدود
      const voiceThreshold = Math.max(0.002, Math.min(0.008, peak * 0.02));
      const win = Math.floor(sr * 0.015); // 15ms نافذة فحص

      // 2. كشف بداية صوت الآية الفعلي مع هامش أمان واسع (40ms) يحفظ الحرف الأول وهمزة الوصل والقطع بنقاء تام
      let start = 0;
      for (let i = 0; i < len - win; i += win) {
        let sum = 0;
        for (let j = 0; j < win; j++) {
          const s = channel[i + j];
          sum += s * s;
        }
        if (Math.sqrt(sum / win) > voiceThreshold) {
          start = Math.max(0, i - Math.floor(sr * 0.040));
          break;
        }
      }
      // إذا كانت بداية الصوت قريبة من أصل الملف (أقل من 45ms) يُترك الصوت كاملاً دون أي قص
      if (start <= Math.floor(sr * 0.045)) {
        start = 0;
      }

      // 3. كشف نهاية صوت الآية الفعلي مع هامش أمان متسع (55ms) يحفظ المدود والصدى الطبيعي ونزول الصوت الرخيم
      let end = len - 1;
      for (let i = len - win; i >= 0; i -= win) {
        let sum = 0;
        for (let j = 0; j < win; j++) {
          const s = channel[i + j];
          sum += s * s;
        }
        if (Math.sqrt(sum / win) > voiceThreshold) {
          end = Math.min(len - 1, i + win + Math.floor(sr * 0.055));
          break;
        }
      }
      // إذا كانت نهاية الصوت قريبة من آخر الملف (أقل من 60ms) يُترك الصوت كاملاً
      if (end >= len - Math.floor(sr * 0.060)) {
        end = len - 1;
      }

      const trimLen = end - start + 1;
      if (trimLen > sr * 0.2 && (start > 0 || end < len - 1)) {
        const trimmed = ReciterPlayer.ctx.createBuffer(buf.numberOfChannels, trimLen, sr);
        // تلاشي ناعم فائق النقاء (15ms Smooth Raised-Cosine Fade-In / Fade-Out) يمنع الطقطقة ويحفظ مخارج الحروف
        const fadeSamples = Math.min(Math.floor(sr * 0.015), Math.floor(trimLen / 8));
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

  function applyReciterPlaybackRate(speedVal) {
    const parsed = parseFloat(speedVal);
    const rate = (!isNaN(parsed) && parsed >= 1.0 && parsed <= 2.0) ? parsed : 1.0;
    ReciterPlayer.speed = rate;

    if (ReciterPlayer.currentSource && ReciterPlayer.currentSource.playbackRate) {
      try {
        ReciterPlayer.currentSource.playbackRate.value = rate;
      } catch (_) { }
    }
    if (ReciterPlayer.audioElement) {
      setupPreservePitch(ReciterPlayer.audioElement);
      ReciterPlayer.audioElement.playbackRate = rate;
    }
    if (ReciterPlayer.preloadAudio) {
      setupPreservePitch(ReciterPlayer.preloadAudio);
      ReciterPlayer.preloadAudio.playbackRate = rate;
    }
    if (ReciterPlayer.fallbackAudio) {
      setupPreservePitch(ReciterPlayer.fallbackAudio);
      ReciterPlayer.fallbackAudio.playbackRate = rate;
    }
    return rate;
  }

  function initReciterPlayer() {
    // استعادة سرعة القارئ المحفوظة من localStorage وتطبيقها على المشغلات والشرائح
    try {
      const savedSpeed = parseFloat(localStorage.getItem('tibyan_reciter_speed'));
      if (!isNaN(savedSpeed)) {
        const applied = applyReciterPlaybackRate(savedSpeed);
        if (Math.abs(applied - savedSpeed) > 0.01) {
          localStorage.setItem('tibyan_reciter_speed', String(applied));
        }
      }
    } catch (_) { }
    if (dom.audioSpeedChips) {
      dom.audioSpeedChips.querySelectorAll('.opt-chip').forEach(chip => {
        const s = parseFloat(chip.getAttribute('data-speed') || chip.getAttribute('data-rate'));
        chip.classList.toggle('active', Math.abs(s - (ReciterPlayer.speed || 1.0)) < 0.01);
      });
    }

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
        selectReciter(e.target.value);
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

  // --- CUSTOM RECITERS LIST & MODAL (HIGH BITRATE 128kbps - 192kbps) ---
  const MUSHAF_RECITERS = [
    { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'عبد الرحمن السديس', riwayah: 'حفص عن عاصم - الحرم المكي', bit: '192kbps' },
    { id: 'Husary_128kbps', name: 'محمود خليل الحصري', riwayah: 'حفص عن عاصم - مرتل متقن', bit: '128kbps' },
    { id: 'Husary_Muallim_128kbps', name: 'محمود خليل الحصري (المعلم)', riwayah: 'حفص عن عاصم - المصحف المعلم', bit: '128kbps' },
    { id: 'Alafasy_128kbps', name: 'مشاري راشد العفاسي', riwayah: 'حفص عن عاصم - مرتل عذب', bit: '128kbps' },
    { id: 'MaherAlMuaiqly128kbps', name: 'ماهر المعيقلي', riwayah: 'حفص عن عاصم - الحرم المكي', bit: '128kbps' },
    { id: 'Abdul_Basit_Murattal_192kbps', name: 'عبد الباسط عبد الصمد', riwayah: 'حفص عن عاصم - مرتل مجود', bit: '192kbps' },
    { id: 'Minshawy_Murattal_128kbps', name: 'محمد صديق المنشاوي', riwayah: 'حفص عن عاصم - مرتل خاشع', bit: '128kbps' },
    { id: 'Minshawy_Mujawwad_192kbps', name: 'محمد صديق المنشاوي (مجود)', riwayah: 'حفص عن عاصم - تجويد نقي', bit: '192kbps' },
    { id: 'Abu_Bakr_Ash-Shaatree_128kbps', name: 'أبو بكر الشاطري', riwayah: 'حفص عن عاصم - مرتل خاشع', bit: '128kbps' },
    { id: 'Yasser_Ad-Dussary_128kbps', name: 'ياسر الدوسري', riwayah: 'حفص عن عاصم - الحرم المكي', bit: '128kbps' },
    { id: 'Saood_ash-Shuraym_128kbps', name: 'سعود الشريم', riwayah: 'حفص عن عاصم - الحرم المكي', bit: '128kbps' },
    { id: 'Hani_Rifai_192kbps', name: 'هاني الرفاعي', riwayah: 'حفص عن عاصم - مرتل خاشع', bit: '192kbps' },
    { id: 'Muhammad_Ayyoub_128kbps', name: 'محمد أيوب', riwayah: 'حفص عن عاصم - الحرم النبوي', bit: '128kbps' },
    { id: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', name: 'أحمد علي العجمي', riwayah: 'حفص عن عاصم - مرتل عذب', bit: '128kbps' },
    { id: 'Ghamadi_40kbps', name: 'سعد الغامدي', riwayah: 'حفص عن عاصم - مرتل', bit: '40kbps' }
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

  function normalizeReciterId(reciter) {
    if (!reciter) return 'Abdurrahmaan_As-Sudais_192kbps';
    if (reciter === 'Maher_AlMuaiqly_64kbps') return 'MaherAlMuaiqly128kbps';
    if (reciter === 'Minshawy_Murattal_64kbps') return 'Minshawy_Murattal_128kbps';
    if (reciter === 'Saood_ash-Shuraym_64kbps') return 'Saood_ash-Shuraym_128kbps';
    if (reciter === 'Abu_Bakr_Ash-Shaatree_64kbps') return 'Abu_Bakr_Ash-Shaatree_128kbps';
    if (reciter === 'Abdul_Basit_Murattal_64kbps') return 'Abdul_Basit_Murattal_192kbps';
    if (reciter === 'Alafasy_64kbps') return 'Alafasy_128kbps';
    return reciter;
  }

  function selectReciter(reciterId) {
    reciterId = normalizeReciterId(reciterId);
    const found = MUSHAF_RECITERS.find(r => r.id === reciterId);
    if (!found) return;

    const oldReciter = ReciterPlayer.reciter;
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
    localStorage.setItem('tibyan_default_reciter', reciterId);
    const settingsReciterEl = document.getElementById('settingsDefaultReciterSelect');
    if (settingsReciterEl) settingsReciterEl.value = reciterId;

    if (window.showToast) window.showToast(`اخترنا لك القارئ: ${found.name}`);
    updateDownloadCardStatus();
    updateDownloadedSurahsList();

    // إذا تغير القارئ وكان الصوت قيد التشغيل حالياً، أعد تشغيل الآية الحالية فوراً بصوت القارئ الجديد
    if (oldReciter !== reciterId) {
      if (ReciterPlayer.isPlaying) {
        const curS = ReciterPlayer.currentSurah || MushafState.activeSurahId || 1;
        const curA = ReciterPlayer.currentAyah || MushafState.activeAyahNum || 1;
        playReciterAyah(curS, curA, true);
      } else if (ReciterPlayer.isPaused) {
        ReciterPlayer.isPaused = false;
        ReciterPlayer.pausedSurah = null;
        ReciterPlayer.pausedAyah = null;
      }
    }
  }

  function initReciterPickerModal() {
    // Restore saved reciter with legacy migration
    let savedReciter = localStorage.getItem('tibyan_current_reciter') || localStorage.getItem('tibyan_default_reciter') || 'Abdurrahmaan_As-Sudais_192kbps';
    savedReciter = normalizeReciterId(savedReciter);
    localStorage.setItem('tibyan_current_reciter', savedReciter);
    localStorage.setItem('tibyan_default_reciter', savedReciter);

    const initialReciter = MUSHAF_RECITERS.find(r => r.id === savedReciter) || MUSHAF_RECITERS[0];
    if (dom.currentReciterNameDisplay) {
      dom.currentReciterNameDisplay.textContent = initialReciter.name;
    }
    if (dom.mushafReciterSelect) {
      dom.mushafReciterSelect.value = initialReciter.id;
    }
    const settingsReciterSelect = document.getElementById('settingsDefaultReciterSelect');
    if (settingsReciterSelect) {
      settingsReciterSelect.value = initialReciter.id;
      settingsReciterSelect.addEventListener('change', (e) => {
        selectReciter(e.target.value);
      });
    }
    const settingsDownloadBtn = document.getElementById('settingsOpenAudioDownloadBtn');
    if (settingsDownloadBtn) {
      settingsDownloadBtn.addEventListener('click', () => {
        openAudioDownloadModal();
        switchDownloadTab('audio');
      });
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

  // Contextual Floating Top Bar (شريط علوي منبثق عند النقر على الآيات أو الصفحة)
  function hideTopBar() {
    if (dom.topBar) {
      dom.topBar.classList.remove('is-visible');
    }
  }

  function showTopBar() {
    if (dom.topBar) {
      dom.topBar.classList.add('is-visible');
    }
  }

  function toggleTopBar() {
    if (dom.topBar) {
      dom.topBar.classList.toggle('is-visible');
    }
  }

  // Page Turning (دعم التقليب في الوضع الطولي بصفحة واحدة والأفقي بصفحتين حسب خيار الانتقال)
  function turnPageForward() {
    const mode = (typeof MushafSettingsManager !== 'undefined') ? MushafSettingsManager.getSettings().transition : 'slide';
    if (mode === 'curl' && typeof InteractivePageCurl !== 'undefined' && typeof InteractivePageCurl.triggerAutoCurl === 'function') {
      InteractivePageCurl.triggerAutoCurl('next');
    } else {
      if (isLandscapeMode()) {
        const spread = getSpreadPages(MushafState.currentPage);
        const nextSpreadPage = spread.right + 2;
        if (nextSpreadPage <= 604) {
          loadPage(nextSpreadPage);
        }
      } else {
        if (MushafState.currentPage < 604) {
          loadPage(MushafState.currentPage + 1);
        }
      }
    }
  }

  function turnPageBackward() {
    const mode = (typeof MushafSettingsManager !== 'undefined') ? MushafSettingsManager.getSettings().transition : 'slide';
    if (mode === 'curl' && typeof InteractivePageCurl !== 'undefined' && typeof InteractivePageCurl.triggerAutoCurl === 'function') {
      InteractivePageCurl.triggerAutoCurl('prev');
    } else {
      if (isLandscapeMode()) {
        const spread = getSpreadPages(MushafState.currentPage);
        const prevSpreadPage = spread.right - 2;
        if (prevSpreadPage >= 1) {
          loadPage(prevSpreadPage);
        }
      } else {
        if (MushafState.currentPage > 1) {
          loadPage(MushafState.currentPage - 1);
        }
      }
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

    // Range Ayah Dropdowns (من الآية إلى الآية)
    if (dom.pageRepeatStartInput) {
      const handleStartChange = (e) => {
        const val = parseInt(e.target.value, 10) || 1;
        tempAudioOptions.rangeStartAyah = val;
        const curSurah = MushafState.activeSurahId || 1;
        const surahObj = window.getSurahById ? window.getSurahById(curSurah) : null;
        const sName = surahObj ? ` (${surahObj.name})` : '';
        if (dom.rangeStartSubtext) dom.rangeStartSubtext.textContent = `الآية ${val}${sName}`;

        // إذا كانت قيمة "من" أكبر من القيمة المختارة في "إلى"، يتم تحديث "إلى" تلقائياً ليتطابق معها أو يليها
        if (dom.pageRepeatEndInput) {
          let endVal = parseInt(dom.pageRepeatEndInput.value, 10) || val;
          if (val > endVal) {
            endVal = val;
            dom.pageRepeatEndInput.value = String(endVal);
            tempAudioOptions.rangeEndAyah = endVal;
            if (dom.rangeEndSubtext) dom.rangeEndSubtext.textContent = `الآية ${endVal}${sName}`;
          }
        }
        if (dom.saveAudioOptionsBtn) dom.saveAudioOptionsBtn.classList.add('is-highlighted');
      };
      dom.pageRepeatStartInput.addEventListener('change', handleStartChange);
      dom.pageRepeatStartInput.addEventListener('input', handleStartChange);
    }
    if (dom.pageRepeatEndInput) {
      const handleEndChange = (e) => {
        const val = parseInt(e.target.value, 10) || 1;
        tempAudioOptions.rangeEndAyah = val;
        const curSurah = MushafState.activeSurahId || 1;
        const surahObj = window.getSurahById ? window.getSurahById(curSurah) : null;
        const sName = surahObj ? ` (${surahObj.name})` : '';
        if (dom.rangeEndSubtext) dom.rangeEndSubtext.textContent = `الآية ${val}${sName}`;

        // إذا كانت قيمة "إلى" أصغر من "من"، يتم تحديث "من" تلقائياً ليتطابق معها
        if (dom.pageRepeatStartInput) {
          let startVal = parseInt(dom.pageRepeatStartInput.value, 10) || val;
          if (val < startVal) {
            startVal = val;
            dom.pageRepeatStartInput.value = String(startVal);
            tempAudioOptions.rangeStartAyah = startVal;
            if (dom.rangeStartSubtext) dom.rangeStartSubtext.textContent = `الآية ${startVal}${sName}`;
          }
        }
        if (dom.saveAudioOptionsBtn) dom.saveAudioOptionsBtn.classList.add('is-highlighted');
      };
      dom.pageRepeatEndInput.addEventListener('change', handleEndChange);
      dom.pageRepeatEndInput.addEventListener('input', handleEndChange);
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
        // تفعيل مفتاح التكرار تلقائياً عند الزيادة
        tempAudioOptions.masterRepeatEnabled = true;
        if (dom.masterRepeatToggle) dom.masterRepeatToggle.checked = true;
        if (dom.repeatControlsContainer) {
          dom.repeatControlsContainer.style.opacity = '1';
          dom.repeatControlsContainer.style.pointerEvents = 'auto';
        }
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
        // تفعيل مفتاح التكرار تلقائياً عند الزيادة
        tempAudioOptions.masterRepeatEnabled = true;
        if (dom.masterRepeatToggle) dom.masterRepeatToggle.checked = true;
        if (dom.repeatControlsContainer) {
          dom.repeatControlsContainer.style.opacity = '1';
          dom.repeatControlsContainer.style.pointerEvents = 'auto';
        }
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
        const rate = parseFloat(chip.getAttribute('data-speed') || chip.getAttribute('data-rate'));
        if (!isNaN(rate) && rate >= 1.0 && rate <= 2.0) {
          tempAudioOptions.speed = rate;
          applyReciterPlaybackRate(rate);
          try { localStorage.setItem('tibyan_reciter_speed', String(rate)); } catch (_) { }
        }
      });
    }

    // حفظ الخيارات
    if (dom.saveAudioOptionsBtn) {
      dom.saveAudioOptionsBtn.addEventListener('click', saveAudioOptions);
    }
  }

  function getAyahSnippet(surahId, ayahNum, maxWords = 5) {
    if (!localQuranTextMap) return '';
    const key = `${surahId}:${ayahNum}`;
    const text = localQuranTextMap[key];
    if (!text || typeof text !== 'string') return '';
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      return words.join(' ');
    }
    return words.slice(0, maxWords).join(' ') + '...';
  }

  function getPageAyahRange(surahId, pageNum) {
    const sId = parseInt(surahId, 10);
    const pNum = parseInt(pageNum, 10);
    const map = (typeof QURAN_AYAH_PAGE_MAP !== 'undefined' ? QURAN_AYAH_PAGE_MAP : null) || (window.QURAN_AYAH_PAGE_MAP || null);
    if (!map || !map[sId]) return null;
    const entries = map[sId];
    for (let i = 0; i < entries.length; i++) {
      if (entries[i][1] === pNum) {
        const start = (i > 0) ? entries[i - 1][0] + 1 : 1;
        const end = entries[i][0];
        return { start, end };
      }
    }
    return null;
  }

  function getCurrentPageSurahAyahRange(surahId, pageNum) {
    const sId = parseInt(surahId, 10);
    const pNum = parseInt(pageNum, 10);
    const surahPolys = (MushafState.pagePolygons || []).filter(
      p => p && p.surahNumber === sId && typeof p.ayahNumber === 'number'
    );
    if (surahPolys.length > 0) {
      let minA = Infinity;
      let maxA = -Infinity;
      for (let i = 0; i < surahPolys.length; i++) {
        const a = surahPolys[i].ayahNumber;
        if (a < minA) minA = a;
        if (a > maxA) maxA = a;
      }
      if (minA !== Infinity && maxA !== -Infinity) {
        return { start: minA, end: maxA };
      }
    }
    const fromMap = getPageAyahRange(sId, pNum);
    if (fromMap) return fromMap;
    const maxV = getAudioSurahAyahs(sId);
    return { start: 1, end: maxV };
  }

  function populateAyahRangeSelect(selectEl, surahId, maxAyahs, selectedVal) {
    if (!selectEl) return;
    const fragment = document.createDocumentFragment();
    const selNum = parseInt(selectedVal, 10) || 1;
    for (let i = 1; i <= maxAyahs; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      const snippet = getAyahSnippet(surahId, i, 5);
      const label = snippet ? `${i} — ${snippet}` : `الآية ${i}`;
      opt.textContent = label;
      opt.title = label;
      if (i === selNum) {
        opt.selected = true;
      }
      fragment.appendChild(opt);
    }
    selectEl.innerHTML = '';
    selectEl.appendChild(fragment);
    selectEl.value = String(selNum);
  }

  async function openAudioOptionsModal() {
    ensureAudioContext();
    await loadLocalQuranText();
    const curSurah = MushafState.activeSurahId || 1;
    const curAyah = MushafState.activeAyahNum || 1;
    const maxV = getAudioSurahAyahs(curSurah);
    const surahObj = window.getSurahById ? window.getSurahById(curSurah) : null;
    const surahName = surahObj ? ` (${surahObj.name})` : '';

    const pageRange = getCurrentPageSurahAyahRange(curSurah, MushafState.currentPage);
    const isCurAyahOnPage = (MushafState.pagePolygons && MushafState.pagePolygons.length > 0)
      ? MushafState.pagePolygons.some(p => p && p.surahNumber === curSurah && p.ayahNumber === curAyah)
      : (pageRange && curAyah >= pageRange.start && curAyah <= pageRange.end);

    let initialStart = (curAyah && isCurAyahOnPage) ? curAyah : (pageRange ? pageRange.start : 1);
    if (initialStart > maxV) initialStart = maxV;
    if (initialStart < 1) initialStart = 1;

    let initialEnd = pageRange ? pageRange.end : maxV;
    if (initialEnd < initialStart) initialEnd = initialStart;
    if (initialEnd > maxV) initialEnd = maxV;

    tempAudioOptions = {
      masterRepeatEnabled: (typeof ReciterPlayer.masterRepeatEnabled === 'boolean') ? ReciterPlayer.masterRepeatEnabled : false,
      rangeRepeatCount: ReciterPlayer.rangeRepeatCount || 1,
      ayahRepeatCount: ReciterPlayer.ayahRepeatCount || 1,
      rangeStartAyah: initialStart,
      rangeEndAyah: initialEnd,
      speed: ReciterPlayer.speed || 1.0,
      pauseSec: 0
    };

    if (dom.pageRepeatStartInput) {
      populateAyahRangeSelect(dom.pageRepeatStartInput, curSurah, maxV, initialStart);
    }
    if (dom.rangeStartSubtext) {
      dom.rangeStartSubtext.textContent = `الآية ${initialStart}${surahName}`;
    }

    if (dom.pageRepeatEndInput) {
      populateAyahRangeSelect(dom.pageRepeatEndInput, curSurah, maxV, initialEnd);
    }
    if (dom.rangeEndSubtext) {
      dom.rangeEndSubtext.textContent = `الآية ${initialEnd}${surahName}`;
    }

    // تفعيل زر حفظ وتطبيق بلون بارز عند الفتح
    if (dom.saveAudioOptionsBtn) {
      dom.saveAudioOptionsBtn.classList.add('is-highlighted');
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
        const s = parseFloat(chip.getAttribute('data-speed') || chip.getAttribute('data-rate'));
        chip.classList.toggle('active', Math.abs(s - tempAudioOptions.speed) < 0.01);
      });
    }

    if (dom.audioOptionsBackdrop) dom.audioOptionsBackdrop.hidden = false;
    if (dom.audioOptionsModal) dom.audioOptionsModal.hidden = false;
  }

  function closeAudioOptionsModal() {
    if (dom.saveAudioOptionsBtn) dom.saveAudioOptionsBtn.classList.remove('is-highlighted');
    if (dom.audioOptionsBackdrop) dom.audioOptionsBackdrop.hidden = true;
    if (dom.audioOptionsModal) dom.audioOptionsModal.hidden = true;
  }

  function getAyahPageNumber(surahId, ayahNum) {
    if (window.getAyahPageNumber) {
      return window.getAyahPageNumber(surahId, ayahNum);
    }
    const sId = parseInt(surahId, 10);
    const aNum = parseInt(ayahNum, 10);
    const map = (typeof QURAN_AYAH_PAGE_MAP !== 'undefined' ? QURAN_AYAH_PAGE_MAP : null) || (window.QURAN_AYAH_PAGE_MAP || null);
    if (map && map[sId]) {
      const pages = map[sId];
      for (let i = 0; i < pages.length; i++) {
        if (aNum <= pages[i][0]) return pages[i][1];
      }
      return pages[pages.length - 1][1];
    }
    const surahObj = (typeof getSurahById === 'function') ? getSurahById(sId) : (window.getSurahById ? window.getSurahById(sId) : null);
    return (surahObj && surahObj.startPage) ? surahObj.startPage : (MushafState.currentPage || 1);
  }

  function saveAudioOptions() {
    // 1. قراءة القيم من الحقول مباشرة إن وُجدت لضمان عدم ضياع أي إدخال
    if (dom.pageRepeatStartInput) {
      const v = parseInt(dom.pageRepeatStartInput.value, 10);
      if (!isNaN(v) && v > 0) tempAudioOptions.rangeStartAyah = v;
    }
    if (dom.pageRepeatEndInput) {
      const v = parseInt(dom.pageRepeatEndInput.value, 10);
      if (!isNaN(v) && v > 0) tempAudioOptions.rangeEndAyah = v;
    }

    // عكس البداية والنهاية إن كانت البداية أكبر من النهاية
    if (tempAudioOptions.rangeStartAyah && tempAudioOptions.rangeEndAyah && tempAudioOptions.rangeStartAyah > tempAudioOptions.rangeEndAyah) {
      const temp = tempAudioOptions.rangeStartAyah;
      tempAudioOptions.rangeStartAyah = tempAudioOptions.rangeEndAyah;
      tempAudioOptions.rangeEndAyah = temp;
    }

    // تطبيق سرعة الصوت على كافة المشغلات (بما فيها Web Audio AudioBufferSourceNode) وحفظها في localStorage
    const appliedSpeed = applyReciterPlaybackRate(tempAudioOptions.speed);
    try { localStorage.setItem('tibyan_reciter_speed', String(appliedSpeed)); } catch (_) { }

    ReciterPlayer.versePauseMs = 0; // متصل تماماً دائماً
    localStorage.removeItem('tibyan_reciter_pause_ms');

    const curSurah = MushafState.activeSurahId || 1;
    const maxV = getAudioSurahAyahs(curSurah);

    // تفعيل التكرار إن كان المفتاح مفعلاً أو اختار المستخدم تكراراً أكثر من مرة
    const isRepeatOn = Boolean(
      tempAudioOptions.masterRepeatEnabled ||
      (dom.masterRepeatToggle && dom.masterRepeatToggle.checked) ||
      (tempAudioOptions.rangeRepeatCount && tempAudioOptions.rangeRepeatCount > 1) ||
      (tempAudioOptions.ayahRepeatCount && tempAudioOptions.ayahRepeatCount > 1)
    );

    ReciterPlayer.masterRepeatEnabled = isRepeatOn;
    ReciterPlayer.rangeRepeatCount = isRepeatOn ? (tempAudioOptions.rangeRepeatCount || 1) : 1;
    ReciterPlayer.ayahRepeatCount = isRepeatOn ? (tempAudioOptions.ayahRepeatCount || 1) : 1;

    ReciterPlayer.ayahRangeStart = tempAudioOptions.rangeStartAyah || 1;
    ReciterPlayer.ayahRangeEnd = tempAudioOptions.rangeEndAyah || maxV;
    ReciterPlayer.rangeCurrentPlayed = 0;
    ReciterPlayer.ayahCurrentPlayed = 0;

    ReciterPlayer.ayahRangeEnabled = true;
    ReciterPlayer.ayahRangeStartPage = getAyahPageNumber(curSurah, ReciterPlayer.ayahRangeStart) || MushafState.currentPage;

    closeAudioOptionsModal();

    // تشغيل التلاوة فوراً وبدء التطبيق العملي
    const startAyah = ReciterPlayer.ayahRangeStart || 1;
    const targetPage = getAyahPageNumber(curSurah, startAyah);

    if (targetPage && !isPageCurrentlyVisible(targetPage)) {
      loadPage(targetPage).then(() => {
        playReciterAyah(curSurah, startAyah);
      });
    } else {
      playReciterAyah(curSurah, startAyah);
    }

    if (window.showToast) {
      let msg = `تم تطبيق الخيارات وبدء التلاوة (من الآية ${ReciterPlayer.ayahRangeStart} إلى ${ReciterPlayer.ayahRangeEnd})`;
      if (ReciterPlayer.masterRepeatEnabled) {
        msg += ` | تكرار النطاق: ${ReciterPlayer.rangeRepeatCount}x`;
        if (ReciterPlayer.ayahRepeatCount > 1) {
          msg += ` | تكرار الآية: ${ReciterPlayer.ayahRepeatCount}x`;
        }
      }
      window.showToast(msg);
    }
  }

  // روابط الـ CDN السريعة للتلاوات عالية النقاء (Global Cloudflare CDN)
  const RECITER_CDN_FALLBACKS = {
    'Alafasy_128kbps': 'https://verses.quran.com/Alafasy/mp3/',
    'Abdurrahmaan_As-Sudais_192kbps': 'https://verses.quran.com/Sudais/mp3/',
    'Minshawy_Murattal_128kbps': 'https://verses.quran.com/Minshawi/Murattal/mp3/',
    'Minshawy_Mujawwad_192kbps': 'https://verses.quran.com/Minshawi/Mujawwad/mp3/',
    'Abdul_Basit_Murattal_192kbps': 'https://verses.quran.com/AbdulBaset/Murattal/mp3/',
    'Abu_Bakr_Ash-Shaatree_128kbps': 'https://verses.quran.com/Shatri/mp3/',
    'Saood_ash-Shuraym_128kbps': 'https://verses.quran.com/Shuraym/mp3/',
    'Hani_Rifai_192kbps': 'https://verses.quran.com/Rifai/mp3/'
  };

  function getReciterAudioUrl(reciter, surah, ayah) {
    const rId = normalizeReciterId(reciter);
    const sPad = String(surah).padStart(3, '0');
    const aPad = String(ayah).padStart(3, '0');
    return `https://everyayah.com/data/${rId}/${sPad}${aPad}.mp3`;
  }

  // الحصول على رابط الصوت سواء من الكاش المحلي أوفلاين أو عبر الرابط المباشر عالي الدقة
  async function getAyahAudioUrl(reciter, surah, ayah) {
    const rId = normalizeReciterId(reciter);
    const rawUrl = getReciterAudioUrl(rId, surah, ayah);
    const sPad = String(surah).padStart(3, '0');
    const aPad = String(ayah).padStart(3, '0');
    const cdnBase = RECITER_CDN_FALLBACKS[rId];
    const cdnUrl = cdnBase ? `${cdnBase}${sPad}${aPad}.mp3` : null;

    if ('caches' in window) {
      try {
        const cache = await caches.open(AUDIO_CACHE_NAME);
        const match = (await cache.match(rawUrl)) || (cdnUrl ? await cache.match(cdnUrl) : null);
        if (match) {
          const blob = await match.blob();
          return URL.createObjectURL(blob);
        }
      } catch (_) { }
    }
    // حفظ نسخة في الكاش في الخلفية للاستخدام أوفلاين
    if ('caches' in window && navigator.onLine) {
      const tryCache = async (url) => {
        try {
          const resp = await fetch(url, { mode: 'cors' });
          if (resp && resp.ok) {
            const cache = await caches.open(AUDIO_CACHE_NAME);
            await cache.put(rawUrl, resp);
            return true;
          }
        } catch (_) { }
        return false;
      };

      tryCache(rawUrl).then(success => {
        if (!success && cdnUrl) tryCache(cdnUrl);
      });
    }
    return rawUrl;
  }

  const inFlightAudioPromises = new Map();

  async function getAyahAudioBuffer(reciter, surah, ayah) {
    ensureAudioContext();
    const rId = normalizeReciterId(reciter);
    const key = `${rId}_${surah}_${ayah}`;
    if (decodedBufferCache.has(key)) {
      return decodedBufferCache.get(key);
    }
    if (inFlightAudioPromises.has(key)) {
      return inFlightAudioPromises.get(key);
    }

    const task = (async () => {
      const url = getReciterAudioUrl(rId, surah, ayah);
      const sPad = String(surah).padStart(3, '0');
      const aPad = String(ayah).padStart(3, '0');
      const cdnBase = RECITER_CDN_FALLBACKS[rId];
      const cdnUrl = cdnBase ? `${cdnBase}${sPad}${aPad}.mp3` : null;

      let arrayBuf = null;

      // 1. فحص التخزين المحلي (Offline Cache)
      if ('caches' in window) {
        try {
          const cache = await caches.open(AUDIO_CACHE_NAME);
          const match = (await cache.match(url)) || (cdnUrl ? await cache.match(cdnUrl) : null);
          if (match) {
            arrayBuf = await match.arrayBuffer();
          }
        } catch (_) { }
      }

      // 2. التحميل عبر الإنترنت إذا لم تكن مخزنة (مع دعم الـ CDN السريع كبديل)
      if (!arrayBuf) {
        const fetchBuf = async (fetchUrl) => {
          try {
            const resp = await fetch(fetchUrl, { mode: 'cors' });
            if (resp && resp.ok) {
              const clone = resp.clone();
              if ('caches' in window) {
                caches.open(AUDIO_CACHE_NAME).then(c => c.put(url, clone)).catch(() => { });
              }
              return await resp.arrayBuffer();
            }
          } catch (_) { }
          return null;
        };

        if (cdnUrl) {
          arrayBuf = await fetchBuf(cdnUrl);
        }
        if (!arrayBuf) {
          arrayBuf = await fetchBuf(url);
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
    ReciterPlayer.playSessionId++; // إبطال أي جلسة تشغيل سابقة لمنع تداخل الأصوات
    ReciterPlayer.isPaused = false;
    ReciterPlayer.pausedSurah = null;
    ReciterPlayer.pausedAyah = null;
    if (ReciterPlayer.nextVerseTimer) {
      clearTimeout(ReciterPlayer.nextVerseTimer);
      ReciterPlayer.nextVerseTimer = null;
    }
    if (ReciterPlayer._handoffTimer) {
      clearTimeout(ReciterPlayer._handoffTimer);
      ReciterPlayer._handoffTimer = null;
    }
    if (ReciterPlayer.audioElement) {
      try {
        ReciterPlayer.audioElement.pause();
        ReciterPlayer.audioElement.currentTime = 0;
        ReciterPlayer.audioElement.onended = null;
        ReciterPlayer.audioElement.onerror = null;
        ReciterPlayer.audioElement.ontimeupdate = null;
      } catch (_) { }
    }
    stopReciterWordTracking();
    if (ReciterPlayer.preloadAudio) {
      try {
        ReciterPlayer.preloadAudio.pause();
        ReciterPlayer.preloadAudio.currentTime = 0;
        ReciterPlayer.preloadAudio.onended = null;
        ReciterPlayer.preloadAudio.onerror = null;
      } catch (_) { }
    }
    if (ReciterPlayer.fallbackAudio) {
      try {
        ReciterPlayer.fallbackAudio.pause();
        ReciterPlayer.fallbackAudio.currentTime = 0;
        ReciterPlayer.fallbackAudio.onended = null;
      } catch (_) { }
    }
    if (ReciterPlayer.ctx) {
      try {
        ReciterPlayer.ctx.close();
      } catch (_) { }
      ReciterPlayer.ctx = null;
    }
  }

  async function playReciterAyah(surah, ayah, isRepeat = false) {
    stopCurrentPlayback();
    const sessionId = ++ReciterPlayer.playSessionId;

    ReciterPlayer.currentSurah = surah;
    ReciterPlayer.currentAyah = ayah;
    if (!isRepeat) {
      ReciterPlayer.ayahCurrentPlayed = 0;
    }

    const reciter = (dom.mushafReciterSelect && dom.mushafReciterSelect.value) || 'Abdurrahmaan_As-Sudais_192kbps';
    ReciterPlayer.reciter = reciter;
    ReciterPlayer.isPlaying = true;
    updateReciterUI();
    highlightAudioAyah(surah, ayah);

    // جلب رابط الصوت (محلياً من الكاش أوفلاين أو عبر الإنترنت)
    const audioUrl = await getAyahAudioUrl(reciter, surah, ayah);

    // إذا تغيرت الجلسة أثناء جلب الرابط، إلغاء فوري لمنع تداخل أي صوت
    if (ReciterPlayer.playSessionId !== sessionId || !ReciterPlayer.isPlaying) return;

    const audio = ReciterPlayer.audioElement;
    audio.src = audioUrl;
    setupPreservePitch(audio);
    audio.playbackRate = ReciterPlayer.speed || 1.0;

    audio.onended = () => {
      if (ReciterPlayer.playSessionId === sessionId && ReciterPlayer.isPlaying) {
        onReciterVerseEnded();
      }
    };

    audio.onerror = () => {
      if (ReciterPlayer.playSessionId === sessionId && ReciterPlayer.isPlaying) {
        onReciterAudioError();
      }
    };

    try {
      await audio.play();
      if (ReciterPlayer.playSessionId !== sessionId) {
        audio.pause();
        return;
      }
      startReciterWordTracking(surah, ayah);
      preloadNextVerse(surah, ayah);
    } catch (err) {
      if (ReciterPlayer.playSessionId === sessionId) {
        console.warn('Playback error:', err);
        onReciterAudioError();
      }
    }
  }

  // تحميل الآية التالية مسبقاً في الخلفية لانتقال فوري متصل بدون أي تأخير
  async function preloadNextVerse(curSurah, curAyah) {
    if (!ReciterPlayer.isPlaying) return;
    const repCount = ReciterPlayer.ayahRepeatCount || 1;
    const played = (ReciterPlayer.ayahCurrentPlayed || 0) + 1;

    let targetSurah = curSurah;
    let targetAyah = curAyah;

    if (repCount !== Infinity && played >= repCount) {
      const savedPlayed = ReciterPlayer.ayahCurrentPlayed;
      ReciterPlayer.ayahCurrentPlayed = repCount - 1;
      const next = calculateNextVerse(curSurah, curAyah);
      ReciterPlayer.ayahCurrentPlayed = savedPlayed;
      if (next) {
        targetSurah = next.surah;
        targetAyah = next.ayah;
      } else {
        return; // اكتملت التلاوة
      }
    }

    const reciter = ReciterPlayer.reciter;
    const nextUrl = await getAyahAudioUrl(reciter, targetSurah, targetAyah);
    if (!ReciterPlayer.isPlaying) return;

    ReciterPlayer.preloadAudio.src = nextUrl;
    ReciterPlayer.preloadAudio.preload = 'auto';
  }

  function toggleReciterAudio() {
    if (ReciterPlayer.isPlaying) {
      pauseReciterAudio();
    } else {
      resumeOrPlayReciterAudio();
    }
  }

  async function resumeOrPlayReciterAudio() {
    // 1. هل هناك صوت متوقف مؤقتاً لنفس الآية؟ نستأنف من نفس اللحظة فوراً دون إعادة من البداية
    if (ReciterPlayer.isPaused && ReciterPlayer.audioElement && ReciterPlayer.audioElement.src && !ReciterPlayer.audioElement.ended) {
      try {
        ReciterPlayer.isPlaying = true;
        ReciterPlayer.isPaused = false;
        updateReciterUI();
        highlightAudioAyah(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
        await ReciterPlayer.audioElement.play();
        startReciterWordTracking(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
        return;
      } catch (err) {
        console.warn('Resume failed, starting fresh:', err);
      }
    }

    // 2. إذا لم يكن هناك صوت متوقف، ابدأ التشغيل من الآية المحددة
    ReciterPlayer.isPaused = false;
    const s = MushafState.activeSurahId || 1;
    let a;
    if (ReciterPlayer.ayahRangeEnabled) {
      if (ReciterPlayer.currentAyah && ReciterPlayer.currentSurah === s &&
        ReciterPlayer.currentAyah >= (ReciterPlayer.ayahRangeStart || 1) &&
        ReciterPlayer.currentAyah <= (ReciterPlayer.ayahRangeEnd || 999)) {
        a = ReciterPlayer.currentAyah;
      } else {
        a = ReciterPlayer.ayahRangeStart || MushafState.activeAyahNum || 1;
      }
    } else {
      a = ReciterPlayer.currentAyah || MushafState.activeAyahNum || 1;
    }
    playReciterAyah(s, a);
  }

  function pauseReciterAudio() {
    if (ReciterPlayer.nextVerseTimer) {
      clearTimeout(ReciterPlayer.nextVerseTimer);
      ReciterPlayer.nextVerseTimer = null;
    }
    if (ReciterPlayer._handoffTimer) {
      clearTimeout(ReciterPlayer._handoffTimer);
      ReciterPlayer._handoffTimer = null;
    }

    if (ReciterPlayer.audioElement) {
      try {
        ReciterPlayer.audioElement.pause();
      } catch (_) { }
    }
    stopReciterWordTracking(false);

    ReciterPlayer.isPlaying = false;
    ReciterPlayer.isPaused = true;
    ReciterPlayer.pausedSurah = ReciterPlayer.currentSurah;
    ReciterPlayer.pausedAyah = ReciterPlayer.currentAyah;
    updateReciterUI();
    // إبقاء الآية مظللة ليعرف المستخدم أين توقف تماماً
    if (ReciterPlayer.currentSurah && ReciterPlayer.currentAyah) {
      highlightAudioAyah(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    }
  }

  async function onReciterVerseEnded() {
    if (!ReciterPlayer.isPlaying) return;

    // 1. تكرار الآية الحالية
    ReciterPlayer.ayahCurrentPlayed++;
    const repCount = ReciterPlayer.ayahRepeatCount || 1;
    if (repCount === Infinity || ReciterPlayer.ayahCurrentPlayed < repCount) {
      playReciterAyah(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah, true);
      return;
    }
    ReciterPlayer.ayahCurrentPlayed = 0;

    // 2. حساب الآية التالية
    const next = calculateNextVerse(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    if (!next) {
      stopCurrentPlayback();
      ReciterPlayer.isPlaying = false;
      ReciterPlayer.isPaused = false;
      updateReciterUI();
      clearAudioHighlight();
      if (window.showToast) {
        window.showToast(ReciterPlayer.ayahRangeEnabled ? 'خلصنا تكرار المقطع' : 'خلصت التلاوة');
      }
      return;
    }

    if (next.isRangeLoop) {
      ReciterPlayer.rangeCurrentPlayed = next.loopCount;
    }

    // 3. التحقق من وجود الآية في الصفحة الحالية أو الانتقال للصفحة المطلوبة
    const targetPage = getAyahPageNumber(next.surah, next.ayah);
    const isOnCurrentPage = MushafState.pagePolygons.some(
      p => p.surahNumber === next.surah && p.ayahNumber === next.ayah
    );

    if (!isOnCurrentPage || (targetPage && !isPageCurrentlyVisible(targetPage))) {
      const pageToLoad = targetPage || (next.isRangeLoop && ReciterPlayer.ayahRangeStartPage) || (MushafState.currentPage + 1);
      if (pageToLoad && pageToLoad >= 1 && pageToLoad <= 604 && !isPageCurrentlyVisible(pageToLoad)) {
        await loadPage(pageToLoad);
        if (!ReciterPlayer.isPlaying) return;
      }
    }

    playReciterAyah(next.surah, next.ayah, false);
  }

  function onReciterAudioError() {
    stopCurrentPlayback();
    ReciterPlayer.isPlaying = false;
    ReciterPlayer.isPaused = false;
    updateReciterUI();
    clearAudioHighlight();
    if (window.showToast) window.showToast('ما قدرنا نشغّل الصوت');
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
      alert('المتصفح ما يدعم الحفظ المحلي');
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
          if (window.showToast) window.showToast('وقفنا التحميل');
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
          window.showToast(`تم، حمّلنا سورة ${surahName}`);
        }
      }
    } catch (err) {
      console.error('Download error:', err);
      if (window.showToast) window.showToast('ما قدرنا نحمّلها الحين');
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
      if (window.showToast) window.showToast(`شِلنا تحميل سورة ${surahName}`);
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
          <span style="font-weight:400;color:var(--text-main);">سورة ${sName}</span>
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
        if (window.showToast) window.showToast(`شِلنا تحميل سورة ${sName}`);
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
    if (typeof AutoMushafDownloader !== 'undefined' && AutoMushafDownloader.updateCachedCount) {
      AutoMushafDownloader.updateCachedCount();
    }

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
          if (window.showToast) window.showToast('وقفنا تحميل التفسير');
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
        if (dom.tafseerProgressLabel) dom.tafseerProgressLabel.textContent = `خلص تحميل ${bookTitle} بالكامل (114 سورة)`;
        if (window.showToast) window.showToast(`تم، حمّلنا ${bookTitle}`);
      }
    } catch (err) {
      console.error('Error downloading tafseer:', err);
      if (window.showToast) window.showToast('ما قدرنا نحمّل التفسير');
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
              if (window.showToast) window.showToast('وقفنا التحميل');
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
            if (dom.tafseerProgressLabel) dom.tafseerProgressLabel.textContent = `خلص تحميل تفسير سورة ${sName}`;
            if (window.showToast) window.showToast(`تم، حمّلنا تفسير سورة ${sName}`);
          }
        } else {
          throw new Error('No tafsir array');
        }
      } else {
        throw new Error('API returned ' + res.status);
      }
    } catch (e) {
      console.warn('Failed surah tafseer download:', e);
      if (window.showToast) window.showToast('ما قدرنا نحمّل تفسير السورة');
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
      if (window.showToast) window.showToast(`شِلنا بيانات ${bookTitle}`);
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
    stopReciterWordTracking(true);
    if (!dom.overlaySvg) return;
    dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
      p.classList.remove('audio-playing-ayah');
    });
  }

  // ===== تتبع تلاوة القارئ كلمة بكلمة (Word-by-word reciter line indicator) =====
  const RECITER_API_MAP = {
    'Abdurrahmaan_As-Sudais_192kbps': 3,
    'Husary_128kbps': 6,
    'Alafasy_128kbps': 7,
    'Abdul_Basit_Murattal_192kbps': 2,
    'Minshawy_Murattal_128kbps': 9,
    'Abu_Bakr_Ash-Shaatree_128kbps': 4,
    'Saood_ash-Shuraym_128kbps': 10
  };

  const reciterChapterSegmentsCache = new Map();
  let reciterWordTrackingRaf = null;
  let activeReciterTrackingKey = null;

  async function fetchChapterSegments(reciterId, surahNum) {
    const cacheKey = `${reciterId}_${surahNum}`;
    if (reciterChapterSegmentsCache.has(cacheKey)) {
      return reciterChapterSegmentsCache.get(cacheKey);
    }
    const url = `https://api.quran.com/api/v4/chapter_recitations/${reciterId}/${surahNum}?segments=true`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const map = new Map();
        if (json.audio_file && Array.isArray(json.audio_file.timestamps)) {
          json.audio_file.timestamps.forEach(ts => {
            if (ts.verse_key && Array.isArray(ts.segments)) {
              const base = ts.timestamp_from || 0;
              const relSegments = ts.segments.map(seg => ({
                wordPos: seg[0],
                startMs: Math.max(0, (seg[1] != null ? seg[1] : 0) - base),
                endMs: Math.max(0, (seg[2] != null ? seg[2] : 0) - base)
              }));
              map.set(ts.verse_key, relSegments);
            }
          });
        }
        reciterChapterSegmentsCache.set(cacheKey, map);
        return map;
      }
    } catch (e) {
      console.warn('Word tracking segments fetch notice:', e.message);
    }
    return null;
  }

  function startReciterWordTracking(surah, ayah) {
    stopReciterWordTracking(true);
    const audio = ReciterPlayer.audioElement;
    if (!audio) return;

    activeReciterTrackingKey = `${surah}:${ayah}`;
    const reciterKey = ReciterPlayer.reciter;
    const apiReciterId = RECITER_API_MAP[reciterKey] || 3;

    // تشغيل طلب المقاطع الدقيقة في الخلفية مع تجهيز التتبع الفوري
    let segmentsMapPromise = fetchChapterSegments(apiReciterId, surah);

    let lastActiveSpan = null;

    function step() {
      if (!ReciterPlayer.isPlaying || activeReciterTrackingKey !== `${surah}:${ayah}`) {
        return;
      }

      if (dom.qcfContainer) {
        const wordSpans = Array.from(dom.qcfContainer.querySelectorAll(
          `.ayah-container[data-verse-key="${surah}:${ayah}"] .qcf-word:not(.qcf-ayah-end)`
        ));

        if (wordSpans.length > 0) {
          const curTimeMs = (audio.currentTime || 0) * 1000;
          const durationMs = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
            ? (audio.duration * 1000)
            : 0;

          let targetSpan = null;

          // 1. هل تتوفر المقاطع الدقيقة من الكاش؟
          const cachedMap = reciterChapterSegmentsCache.get(`${apiReciterId}_${surah}`);
          const verseSegments = cachedMap ? cachedMap.get(`${surah}:${ayah}`) : null;

          if (verseSegments && verseSegments.length > 0) {
            // التوقيت الدقيق لمقاطع القارئ
            for (let i = 0; i < verseSegments.length; i++) {
              const seg = verseSegments[i];
              if (curTimeMs >= seg.startMs && curTimeMs < seg.endMs) {
                const pos = seg.wordPos; // 1-based index
                targetSpan = wordSpans.find(sp => {
                  const p = parseInt(sp.getAttribute('data-word-idx'), 10);
                  return (p + 1) === pos;
                }) || wordSpans[pos - 1] || null;
                break;
              }
            }
            if (!targetSpan && curTimeMs >= (verseSegments[verseSegments.length - 1].endMs || 0)) {
              targetSpan = wordSpans[wordSpans.length - 1];
            }
          }

          // 2. توزيع تناسبي ذكي بأوزان حروف الكلمات (Smart Duration Fallback)
          if (!targetSpan && durationMs > 0) {
            const weights = wordSpans.map((sp, idx) => {
              const text = (sp.getAttribute('data-text') || sp.textContent || '').trim();
              const stripped = text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
              let w = Math.max(stripped.length, 2);
              if (idx === wordSpans.length - 1) w += 1.5; // وقوف القارئ في رأس الآية
              return w;
            });
            const totalWeight = weights.reduce((acc, w) => acc + w, 0) || wordSpans.length;
            const progress = Math.min(Math.max(curTimeMs / durationMs, 0), 0.999);
            const targetWeightAccum = progress * totalWeight;

            let accum = 0;
            let chosenIdx = 0;
            for (let i = 0; i < weights.length; i++) {
              accum += weights[i];
              if (targetWeightAccum <= accum) {
                chosenIdx = i;
                break;
              }
            }
            targetSpan = wordSpans[chosenIdx] || wordSpans[0];
          }

          if (targetSpan !== lastActiveSpan) {
            if (lastActiveSpan) {
              lastActiveSpan.classList.remove('active-reciter-word');
            }
            if (targetSpan) {
              targetSpan.classList.add('active-reciter-word');
            }
            lastActiveSpan = targetSpan;
          }
        }
      }

      reciterWordTrackingRaf = requestAnimationFrame(step);
    }

    reciterWordTrackingRaf = requestAnimationFrame(step);
  }

  function stopReciterWordTracking(clearUnderline = true) {
    if (reciterWordTrackingRaf) {
      cancelAnimationFrame(reciterWordTrackingRaf);
      reciterWordTrackingRaf = null;
    }
    if (clearUnderline) {
      activeReciterTrackingKey = null;
      if (dom.qcfContainer) {
        dom.qcfContainer.querySelectorAll('.qcf-word.active-reciter-word').forEach(sp => {
          sp.classList.remove('active-reciter-word');
        });
      }
    }
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
      alert('المتصفح ما يدعم الحفظ المحلي');
      return;
    }

    const btn = dom.startMushafDownloadBtn;
    const bar = dom.mushafDownloadBar;
    const status = dom.mushafDownloadStatus;

    btn.disabled = true;
    btn.textContent = 'جاري التحميل بالخلفية...';

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
        status.textContent = 'خلص تحميل مصحف المدينة (604 صفحات) بالكامل';
      }
      btn.disabled = false;
      btn.textContent = 'تحديث التحميل';
      if (window.showToast) window.showToast('تم، حمّلنا كل صفحات المصحف');
    } catch (err) {
      console.warn('Error downloading Mushaf offline:', err);
      btn.disabled = false;
      btn.textContent = 'استئناف التحميل';
      if (status) status.textContent = 'انقطع الاتصال أثناء التحميل، اضغط استئناف عشان نكمل.';
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

  // --- MUSHAF SETTINGS MANAGER (إعدادات المصحف: التخطيط، التقليب، وتظليل المتشابهات) ---
  const MushafSettingsManager = {
    STORAGE_KEY: 'seraj_mushaf_settings',

    getSettings() {
      const defaults = {
        layout: 'normal',       // 'normal' | 'thematic'
        transition: 'slide',    // 'slide' | 'curl'
        mutashabihat: false     // true | false
      };
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if ('tajweed' in parsed) {
              delete parsed.tajweed;
              try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ ...defaults, ...parsed })); } catch (_) { }
            }
            return { ...defaults, ...parsed };
          }
        }
      } catch (_) { }
      return defaults;
    },

    saveSettings(settings) {
      const clean = { ...settings };
      if ('tajweed' in clean) delete clean.tajweed;
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(clean));
      } catch (_) { }
      if (typeof pageColumnCache !== 'undefined') {
        pageColumnCache.clear();
      }
      this.applySettings(clean);
    },

    applySettings(settings = this.getSettings()) {
      if (typeof pageColumnCache !== 'undefined') {
        pageColumnCache.clear();
      }
      if (typeof pageColumnPending !== 'undefined') {
        pageColumnPending.clear();
      }
      const isThematic = settings.layout === 'thematic';
      const isSlide = settings.transition === 'slide';
      const isMutashabihat = settings.mutashabihat === true || settings.mutashabihat === 'true';

      document.body.classList.remove('mushaf-tajweed-mode');
      document.body.classList.toggle('mushaf-thematic-mode', isThematic);
      document.body.classList.toggle('mushaf-mutashabihat-mode', isMutashabihat);
      document.body.classList.toggle('mushaf-slide-mode', isSlide);
      document.body.classList.toggle('mushaf-curl-mode', !isSlide);

      if (dom.pageWrapper) {
        dom.pageWrapper.classList.remove('mushaf-tajweed-mode');
        dom.pageWrapper.classList.toggle('mushaf-thematic-mode', isThematic);
        dom.pageWrapper.classList.toggle('mushaf-mutashabihat-mode', isMutashabihat);
        dom.pageWrapper.classList.toggle('mushaf-slide-mode', isSlide);
        dom.pageWrapper.classList.toggle('mushaf-curl-mode', !isSlide);
      }

      if (dom.view && dom.view.classList.contains('active')) {
        if (MushafState.currentPage) {
          loadPage(MushafState.currentPage, { noAnimation: true });
        }
      }
    }
  };
  window.MushafSettingsManager = MushafSettingsManager;

  // --- QCF V1 (1405 AH) 15-LINES LOCAL-ONLY FAST RENDER ENGINE ---

  const qcfFontPromises = new Map();
  const QCF_DATA_CACHE = 'tibyan-qcf-pages-v1';
  const QCF_FONT_CACHE = 'tibyan-qcf-fonts-v1';

  function loadQCFFont(pageNum) {
    const fontName = 'p' + pageNum + '-v1';
    if (MushafState.qcfFontsLoaded.has(fontName)) return Promise.resolve(true);
    if (qcfFontPromises.has(fontName)) return qcfFontPromises.get(fontName);

    const localUrl = './assets/qcf/p' + pageNum + '.woff2';

    const p = (async () => {
      try {
        let buffer = null;
        let fontCache = null;

        if (typeof caches !== 'undefined') {
          try {
            fontCache = await caches.open(QCF_FONT_CACHE);
            const cachedResp = await fontCache.match(localUrl);
            if (cachedResp) {
              buffer = await cachedResp.arrayBuffer();
            }
          } catch (_) { }
        }

        if (!buffer) {
          const res = await fetch(localUrl);
          if (res.ok) {
            if (fontCache) {
              try { fontCache.put(localUrl, res.clone()); } catch (_) { }
            }
            buffer = await res.arrayBuffer();
          }
        }

        if (!buffer) return false;

        const face = new FontFace(fontName, buffer, { display: 'swap' });
        const loaded = await face.load();
        document.fonts.add(loaded);
        MushafState.qcfFontsLoaded.add(fontName);
        return true;
      } catch (e) {
        console.warn('[QCF] فشل تحميل الخط المحلي:', localUrl, e);
        return false;
      }
    })();

    qcfFontPromises.set(fontName, p);
    p.then((ok) => { if (!ok) qcfFontPromises.delete(fontName); });
    return p;
  }

  async function fetchQCFPageData(pageNum) {
    if (MushafState.qcfDataCache.has(pageNum)) {
      return MushafState.qcfDataCache.get(pageNum);
    }
    const localUrl = './data/pages/' + pageNum + '.json';

    try {
      const res = await fetch(localUrl);
      if (res.ok) {
        const json = await res.json();
        if (json && json.verses) {
          MushafState.qcfDataCache.set(pageNum, json);
          return json;
        }
      }
    } catch (_) { }

    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(QCF_DATA_CACHE);
        const cached = await cache.match(localUrl) || await caches.match(localUrl);
        if (cached) {
          const json = await cached.json();
          if (json && json.verses) {
            MushafState.qcfDataCache.set(pageNum, json);
            return json;
          }
        }
      } catch (_) { }
    }

    return null;
  }

  function getSurahsStartingOnPage(pageNum) {
    if (!window.QURAN_SURAHS) return [];
    return window.QURAN_SURAHS.filter(s => s.startPage === pageNum);
  }

  // --- ترويسة السورة والبسملة (QUL glyph-based) ---

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
    if (hasLoadedFontFace('surah-name-v4')) {
      MushafState.surahHeaderFontsReady = true;
      return true;
    }
    try {
      await Promise.race([
        document.fonts.load("40px 'surah-name-v4'", 'surah001'),
        new Promise((resolve) => setTimeout(resolve, 250))
      ]);
    } catch (_) { }
    MushafState.surahHeaderFontsReady = hasLoadedFontFace('surah-name-v4');
    return MushafState.surahHeaderFontsReady;
  }

  function buildSurahHeaderLine(surahId) {
    const row = document.createElement('div');
    row.className = 'qcf-surah-header-line';
    row.setAttribute('data-surah-header', surahId);
    if (MushafState.surahHeaderFontsReady) {
      const id3 = String(surahId).padStart(3, '0');
      row.classList.add('glyph');
      // إطار CSS + اسم السورة بخط surah-name-v4 (ligature: surahNNN). خط إطار QUL (header) لا يتشكّل خارج QUL
      row.innerHTML =
        '<div class="qcf-surah-header-box"><span class="surah-name-v4-icon">surah' + id3 + '</span></div>';
    } else {
      row.innerHTML = '<div class="qcf-surah-header-box"><span class="qcf-surah-title-text">سورة ' + getAudioSurahName(surahId) + '</span></div>';
    }
    return row;
  }

  // ملاءمة جميع الأسطر الـ 15 بمقاس خط موحّد تماماً ومحاذاة متساوية من اليمين إلى اليسار
  function getAyahThematicTone(sNum, aNum) {
    return ((Math.floor((aNum - 1) / 4) + sNum) % 4) + 1;
  }

  function fitQcfLines(container = dom.qcfContainer) {
    if (!container) return;
    const cols = container.querySelectorAll('.qcf-page-column');
    cols.forEach(col => {
      let padH = 32;
      try {
        const cs = window.getComputedStyle(col);
        padH = (parseFloat(cs.paddingLeft) || 16) + (parseFloat(cs.paddingRight) || 16);
      } catch (_) { }
      const colW = Math.floor((col.clientWidth || 360) - padH);
      if (colW <= 0) return;

      const lines = col.querySelectorAll('.qcf-line:not(.qcf-surah-header-line):not(.qcf-bismillah-line)');
      lines.forEach(line => {
        const target = line.querySelector('.qcf-line-inner');
        line.style.transform = '';
        if (!target) return;

        // توحيد التوسيط وتباعد الكلمات المحكوم عبر CSS دون تمديد space-between
        target.style.transform = '';
        target.style.transformOrigin = '';
        target.style.width = '';
        target.style.justifyContent = '';
        target.style.gap = '';
        const containers = target.querySelectorAll('.ayah-container, .ayah-highlight');
        containers.forEach(c => {
          c.style.gap = '';
          c.style.width = '';
        });

        line.classList.add('qcf-line-center');

        const naturalW = target.scrollWidth;
        if (naturalW > colW && colW > 0) {
          const fitScale = Math.max(0.75, +(colW / naturalW).toFixed(3));
          target.style.transformOrigin = 'center center';
          target.style.transform = `scale(${fitScale})`;
        }
      });
    });
  }

  // حساب أصغر مقاس خط مناسب وتوحيده بالتساوي بين الصفحتين المتقابلتين وكافة الأسطر الـ 15
  function adjustQcfFontSize(container = dom.qcfContainer) {
    if (!container) return;
    const h = container.clientHeight || (dom.qcfContainer ? dom.qcfContainer.clientHeight : 0) || (dom.pageWrapper ? dom.pageWrapper.clientHeight : 0) || window.innerHeight;
    const totalW = container.clientWidth || (dom.qcfContainer ? dom.qcfContainer.clientWidth : 0) || (dom.pageWrapper ? dom.pageWrapper.clientWidth : 0) || window.innerWidth;
    if (h <= 0 || totalW <= 0) return;

    const isLandscape = isLandscapeMode();
    const rawW = isLandscape ? Math.floor((totalW - 20) / 2) : totalW;

    const firstCol = container.querySelector('.qcf-page-column');
    let defaultPadH = 32;
    let defaultPadV = 36;
    if (firstCol) {
      const cs = window.getComputedStyle(firstCol);
      defaultPadH = (parseFloat(cs.paddingLeft) || 16) + (parseFloat(cs.paddingRight) || 16);
      defaultPadV = (parseFloat(cs.paddingTop) || 20) + (parseFloat(cs.paddingBottom) || 16);
    } else {
      defaultPadV = Math.max(32, Math.min(52, h * 0.05));
    }

    const computeInitialTargetForDims = (colW, colH) => {
      const lineH = isLandscape ? (colH - 16) / 15 : colH / 15;
      return Math.max(12, Math.min(+(lineH * 0.60).toFixed(1), +(colW / 14.2).toFixed(1)));
    };

    const applyUniformFontSize = (sz) => {
      container.style.setProperty('--qcf-font-size', `${sz}px`);
      container.querySelectorAll('.qcf-page-column').forEach(col => {
        col.style.setProperty('--qcf-font-size', `${sz}px`);
      });
      if (container === dom.qcfContainer && dom.qcfUnderlayContainer) {
        dom.qcfUnderlayContainer.style.setProperty('--qcf-font-size', `${sz}px`);
        dom.qcfUnderlayContainer.querySelectorAll('.qcf-page-column').forEach(col => {
          col.style.setProperty('--qcf-font-size', `${sz}px`);
        });
      }
    };

    const cols = container.querySelectorAll('.qcf-page-column');
    if (cols.length > 0) {
      cols.forEach(col => {
        col.querySelectorAll('.qcf-line:not(.qcf-surah-header-line):not(.qcf-bismillah-line) .qcf-line-inner').forEach(inner => {
          inner.style.transform = '';
          inner.style.transformOrigin = '';
          inner.style.width = '';
          inner.style.justifyContent = '';
          inner.style.gap = '';
          inner.querySelectorAll('.ayah-container, .ayah-highlight').forEach(c => {
            c.style.gap = '';
            c.style.width = '';
          });
        });
      });

      // حساب المقاس الأنسب لكل صفحة على حدة ثم اختيار أصغر مقاس مشترك (minFontSize) وتوحيده على الصفحتين
      const pageSizes = [];
      cols.forEach(col => {
        let cPadH = defaultPadH;
        let cPadV = defaultPadV;
        try {
          const cs = window.getComputedStyle(col);
          cPadH = (parseFloat(cs.paddingLeft) || 16) + (parseFloat(cs.paddingRight) || 16);
          cPadV = (parseFloat(cs.paddingTop) || 20) + (parseFloat(cs.paddingBottom) || 16);
        } catch (_) { }

        const colW = Math.max(200, Math.floor((col.clientWidth || rawW) - cPadH));
        const colH = Math.max(300, Math.floor((col.clientHeight || h) - cPadV));
        let colSize = computeInitialTargetForDims(colW, colH);
        col.style.setProperty('--qcf-font-size', `${colSize}px`);

        for (let attempt = 0; attempt < 5; attempt++) {
          let overflowRatio = 1;
          col.querySelectorAll('.qcf-line:not(.qcf-surah-header-line):not(.qcf-bismillah-line) .qcf-line-inner').forEach(inner => {
            const sw = inner.scrollWidth;
            if (sw > colW) {
              const ratio = colW / sw;
              if (ratio < overflowRatio) overflowRatio = ratio;
            }
          });
          if (overflowRatio >= 1) break;
          const nextSize = Math.max(10.5, +(colSize * overflowRatio * 0.985).toFixed(1));
          colSize = (nextSize >= colSize) ? Math.max(10.5, +(colSize - 0.5).toFixed(1)) : nextSize;
          col.style.setProperty('--qcf-font-size', `${colSize}px`);
        }

        pageSizes.push(colSize);
      });

      const minFontSize = pageSizes.length ? Math.min(...pageSizes) : computeInitialTargetForDims(Math.max(220, rawW - defaultPadH), Math.max(340, h - defaultPadV));
      applyUniformFontSize(minFontSize);
    } else {
      const availW = Math.max(220, rawW - defaultPadH);
      const availH = Math.max(340, h - defaultPadV);
      applyUniformFontSize(computeInitialTargetForDims(availW, availH));
    }

    fitQcfLines(container);
  }

  // ملاءمة عرض إطار الترويسة لعرض السطر
  function fitSurahHeaders(container = dom.qcfContainer) {
    if (!container) return;
    container.querySelectorAll('.qcf-surah-header-line.glyph').forEach(row => {
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

  let lastLandscapeState = isLandscapeMode();
  if (!window.__qcfHeaderFitBound) {
    window.__qcfHeaderFitBound = true;
    let fitTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        const currentLandscape = isLandscapeMode();
        if (currentLandscape !== lastLandscapeState) {
          lastLandscapeState = currentLandscape;
          if (dom.view && dom.view.classList.contains('active')) {
            loadPage(MushafState.currentPage);
            return;
          }
        }
        adjustQcfFontSize();
        fitSurahHeaders();
      }, 120);
    });

    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', () => {
        setTimeout(() => {
          const currentLandscape = isLandscapeMode();
          lastLandscapeState = currentLandscape;
          if (dom.view && dom.view.classList.contains('active')) {
            loadPage(MushafState.currentPage);
          }
        }, 150);
      });
    }
  }

  // نظام تفويض الأحداث الموحد لكلمات وصفحات المصحف (Event Delegation)
  function initQcfContainerEvents() {
    if (!dom.qcfContainer || dom.qcfContainer._eventsBound) return;
    dom.qcfContainer._eventsBound = true;

    // النقر على الكلمة: في وضع الإخفاء يكشف الكلمة، وفي الوضع العادي يحدد الآية ويفتح/يغلق الشريط العلوي
    dom.qcfContainer.addEventListener('click', (e) => {
      const span = e.target.closest('.qcf-word');
      if (!span) return;

      if (typeof InteractivePageCurl !== 'undefined' && (InteractivePageCurl.isDragging || InteractivePageCurl.wasDraggedRecently)) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      e.stopPropagation();

      const sNum = parseInt(span.getAttribute('data-surah'), 10);
      const aNum = parseInt(span.getAttribute('data-ayah'), 10);
      if (isNaN(sNum) || isNaN(aNum)) return;

      const isMasked = MushafState.maskMode && MushafState.maskMode !== 'none';
      if (isMasked) {
        if (span.classList.contains('revealed')) {
          span.classList.remove('revealed');
        } else {
          span.classList.add('revealed');
          if (sNum === MushafState.activeSurahId && aNum === MushafState.activeAyahNum) {
            advanceWordPointer();
          }
        }
      } else {
        selectActiveAyah(sNum, aNum, false);
        const isMutashabihatMode = window.MushafSettingsManager && (window.MushafSettingsManager.getSettings().mutashabihat === true || window.MushafSettingsManager.getSettings().mutashabihat === 'true');
        const ayahContainer = span.closest('.ayah-container');
        const isMutashabih = (ayahContainer && ayahContainer.getAttribute('data-mutashabih') === 'true') ||
          (typeof window.isMutashabihVerse === 'function' && window.isMutashabihVerse(sNum, aNum));
        if (isMutashabihatMode && isMutashabih) {
          showMutashabihatSheet(sNum, aNum);
        } else {
          toggleTopBar();
        }
      }
    });

    // الضغط بالزر الأيمن لفتح خيارات الآية (تفسير، تلاوة، فاصلة)
    dom.qcfContainer.addEventListener('contextmenu', (e) => {
      const span = e.target.closest('.qcf-word');
      if (!span) return;
      e.preventDefault();
      e.stopPropagation();
      const sNum = parseInt(span.getAttribute('data-surah'), 10);
      const aNum = parseInt(span.getAttribute('data-ayah'), 10);
      if (!isNaN(sNum) && !isNaN(aNum)) {
        openAyahActionSheet(sNum, aNum);
      }
    });

    // اللمس المطول (Long Press) لفتح خيارات الآية
    let touchTimer = null;
    let touchMoved = false;
    dom.qcfContainer.addEventListener('touchstart', (e) => {
      const span = e.target.closest('.qcf-word');
      if (!span) return;
      touchMoved = false;
      const sNum = parseInt(span.getAttribute('data-surah'), 10);
      const aNum = parseInt(span.getAttribute('data-ayah'), 10);
      if (isNaN(sNum) || isNaN(aNum)) return;

      touchTimer = setTimeout(() => {
        if (touchMoved) return;
        if (typeof InteractivePageCurl !== 'undefined' && (InteractivePageCurl.isDragging || InteractivePageCurl.wasDraggedRecently)) return;
        if (navigator.vibrate) try { navigator.vibrate(40); } catch (_) { }
        openAyahActionSheet(sNum, aNum);
      }, 500);
    }, { passive: true });

    dom.qcfContainer.addEventListener('touchmove', () => {
      touchMoved = true;
      if (touchTimer) clearTimeout(touchTimer);
    }, { passive: true });

    dom.qcfContainer.addEventListener('touchend', () => {
      if (touchTimer) clearTimeout(touchTimer);
    }, { passive: true });

    dom.qcfContainer.addEventListener('touchcancel', () => {
      if (touchTimer) clearTimeout(touchTimer);
    }, { passive: true });
  }

  // بناء عمود صفحة مفردة (15 سطراً) لاستخدامه في الوضع الفردي أو في وضع الصفحتين المتقابلتين
  async function buildPageColumn(pageNum) {
    const col = document.createElement('div');
    col.className = 'qcf-page-column';
    col.setAttribute('data-page', pageNum);

    const fontName = 'p' + pageNum + '-v1';
    const [qcfData, fontOk] = await Promise.all([
      fetchQCFPageData(pageNum),
      loadQCFFont(pageNum)
    ]);

    if (!qcfData || !qcfData.verses) {
      return { col, words: [] };
    }

    col.style.setProperty('font-family', fontOk
      ? "'" + fontName + "', 'UthmanicHafs', serif"
      : "'UthmanicHafs', serif", 'important');

    const lines = {};
    for (let l = 1; l <= 15; l++) lines[l] = [];
    const pageWords = [];

    qcfData.verses.forEach(v => {
      if (!v.words) return;
      v.words.forEach(w => {
        w._vk = v.verse_key;
        const lineNum = w.line_number || 1;
        if (!lines[lineNum]) lines[lineNum] = [];
        lines[lineNum].push(w);
        pageWords.push(w);
      });
    });

    const lineMeta = buildQcfLineMeta(lines);
    if (Object.values(lineMeta).some(m => m.type === 'header')) {
      await loadSurahHeaderFonts();
    }

    // حساب الموضوع الغالب لكل سطر لتلوين السطر بالكامل 100% بدون رقع جزئية في المنتصف
    const lineTone = {};
    for (let l = 1; l <= 15; l++) {
      const lWords = lines[l] || [];
      const lMeta = lineMeta[l];
      if (lMeta || lWords.length === 0) {
        lineTone[l] = null;
        continue;
      }
      const counts = {};
      let lastTone = null;
      lWords.forEach((word) => {
        const locParts = (word.location || '').split(':');
        const vkParts = (word._vk || '').split(':');
        const sNum = parseInt(vkParts[0] || locParts[0] || '1', 10);
        const aNum = parseInt(vkParts[1] || locParts[1] || '1', 10);
        const tone = getAyahThematicTone(sNum, aNum);
        const weight = word.char_type_name === 'end' ? 0.5 : 1;
        counts[tone] = (counts[tone] || 0) + weight;
        lastTone = tone;
      });
      let bestTone = lastTone;
      let bestCount = -1;
      for (const tKey of Object.keys(counts)) {
        const tVal = Number(tKey);
        const c = counts[tKey];
        if (c > bestCount || (c === bestCount && tVal === lastTone)) {
          bestCount = c;
          bestTone = tVal;
        }
      }
      lineTone[l] = bestTone;
    }

    for (let l = 1; l <= 15; l++) {
      const lineWords = lines[l] || [];
      const meta = lineMeta[l];

      if (meta) {
        if (meta.type === 'header') {
          col.appendChild(buildSurahHeaderLine(meta.surahId));
        } else if (meta.type === 'bismillah') {
          const bismillahRow = document.createElement('div');
          bismillahRow.className = 'qcf-bismillah-line';
          bismillahRow.setAttribute('data-line', l);
          bismillahRow.textContent = '﷽';
          col.appendChild(bismillahRow);
        } else {
          const blank = document.createElement('div');
          blank.className = 'qcf-line';
          blank.setAttribute('data-line', l);
          col.appendChild(blank);
        }
        continue;
      }

      const lineRow = document.createElement('div');
      lineRow.className = 'qcf-line';
      lineRow.setAttribute('data-line', l);
      const lastW = lineWords[lineWords.length - 1];
      if (lastW && lastW.char_type_name === 'end') {
        const lLoc = (lastW.location || '').split(':');
        const lVk = (lastW._vk || '').split(':');
        const lastS = parseInt(lVk[0] || lLoc[0] || '0', 10);
        const lastA = parseInt(lVk[1] || lLoc[1] || '0', 10);
        const sObj = (window.QURAN_SURAHS || []).find(s => s.id === lastS);
        if (sObj && lastA === sObj.verses) {
          lineRow.setAttribute('data-surah-end', 'true');
        }
      }
      if (pageNum === 1 || pageNum === 2) {
        lineRow.classList.add('qcf-line-center');
      }

      const rowTone = lineTone[l];
      if (rowTone !== null && rowTone !== undefined) {
        lineRow.setAttribute('data-line-theme-tone', String(rowTone));
        if (lineTone[l - 1] !== rowTone) {
          lineRow.setAttribute('data-line-theme-first', 'true');
        }
        if (lineTone[l + 1] !== rowTone) {
          lineRow.setAttribute('data-line-theme-last', 'true');
        }
      }

      const lineInner = document.createElement('div');
      lineInner.className = 'qcf-line-inner';
      lineRow.appendChild(lineInner);

      let currentAyahKey = null;
      let currentAyahContainer = null;

      lineWords.forEach((word) => {
        const locParts = (word.location || '').split(':');
        const vkParts = (word._vk || '').split(':');
        const sNum = parseInt(vkParts[0] || locParts[0] || '1', 10);
        const aNum = parseInt(vkParts[1] || locParts[1] || '1', 10);
        const wIdx = word.position ? word.position - 1 : parseInt(locParts[2] || '1', 10) - 1;
        const verseKey = sNum + ':' + aNum;
        const tone = getAyahThematicTone(sNum, aNum);

        if (verseKey !== currentAyahKey || !currentAyahContainer) {
          currentAyahKey = verseKey;
          currentAyahContainer = document.createElement('span');
          currentAyahContainer.className = 'ayah-container';
          currentAyahContainer.setAttribute('data-verse-key', verseKey);
          currentAyahContainer.setAttribute('data-surah', sNum);
          currentAyahContainer.setAttribute('data-ayah', aNum);
          if (typeof window.isMutashabihVerse === 'function' && window.isMutashabihVerse(sNum, aNum)) {
            currentAyahContainer.setAttribute('data-mutashabih', 'true');
          }
          currentAyahContainer.setAttribute('data-theme-tone', tone);
          lineInner.appendChild(currentAyahContainer);
        }

        const span = document.createElement('span');
        span.className = 'qcf-word';
        if (word.char_type_name === 'end') {
          span.classList.add('qcf-ayah-end');
          if (fontOk) {
            span.style.setProperty('font-family', "'" + fontName + "'", 'important');
            span.innerHTML = word.code_v1 || '';
          } else {
            span.style.setProperty('font-family', "'UthmanicHafs', serif", 'important');
            span.textContent = word.text_qpc_hafs || word.text_imlaei || `(${aNum})`;
          }
        } else {
          if (fontOk) {
            span.style.setProperty('font-family', "'" + fontName + "'", 'important');
            span.innerHTML = word.code_v1 || '';
          } else {
            span.style.setProperty('font-family', "'UthmanicHafs', serif", 'important');
            span.textContent = word.text_qpc_hafs || word.text_imlaei || '';
          }
        }
        span.setAttribute('data-loc', word.location || '');
        span.setAttribute('data-page', pageNum);
        span.setAttribute('data-line', l);
        span.setAttribute('data-type', word.char_type_name || 'word');
        span.setAttribute('data-text', word.text_imlaei || '');
        span.setAttribute('data-surah', sNum);
        span.setAttribute('data-ayah', aNum);
        span.setAttribute('data-word-idx', wIdx);

        currentAyahContainer.appendChild(span);
      });

      col.appendChild(lineRow);
    }

    // رقم الصفحة في أسفل كل عمود داخل المصحف المفتوح
    const footer = document.createElement('div');
    footer.className = 'qcf-column-page-footer';
    footer.textContent = pageNum;
    col.appendChild(footer);

    return { col, words: pageWords };
  }

  // كاش هياكل صفحات المصحف المجهزة مسبقاً (Pre-rendered Page Columns Cache)
  const pageColumnCache = new Map();
  const pageColumnPending = new Map();

  async function getCachedPageColumn(p) {
    if (p < 1 || p > 604) return null;
    if (pageColumnCache.has(p)) {
      const cached = pageColumnCache.get(p);
      return { col: cached.col.cloneNode(true), words: cached.words };
    }
    if (pageColumnPending.has(p)) {
      const res = await pageColumnPending.get(p);
      if (res && res.col) {
        return { col: res.col.cloneNode(true), words: res.words };
      }
      return res;
    }

    const promise = (async () => {
      try {
        const res = await buildPageColumn(p);
        if (res && res.col) {
          if (pageColumnCache.size > 40) {
            const firstKey = pageColumnCache.keys().next().value;
            pageColumnCache.delete(firstKey);
          }
          pageColumnCache.set(p, res);
        }
        return res;
      } finally {
        pageColumnPending.delete(p);
      }
    })();

    pageColumnPending.set(p, promise);
    const res = await promise;
    if (res && res.col) {
      return { col: res.col.cloneNode(true), words: res.words };
    }
    return res;
  }

  function mountRenderedColumns(isLandscape, rightRes, leftRes) {
    const frag = document.createDocumentFragment();
    const allWords = [];

    if (isLandscape) {
      if (rightRes && rightRes.col) {
        rightRes.col.classList.add('qcf-page-right');
        frag.appendChild(rightRes.col);
        allWords.push(...rightRes.words);
      }

      const spine = document.createElement('div');
      spine.className = 'mushaf-book-spine';
      frag.appendChild(spine);

      if (leftRes && leftRes.col) {
        leftRes.col.classList.add('qcf-page-left');
        frag.appendChild(leftRes.col);
        allWords.push(...leftRes.words);
      }
    } else if (rightRes && rightRes.col) {
      rightRes.col.classList.add('qcf-page-single');
      frag.appendChild(rightRes.col);
      allWords.push(...rightRes.words);
    }

    dom.qcfContainer.innerHTML = '';
    dom.qcfContainer.appendChild(frag);
    MushafState.pageQcfWords = allWords;

    if (dom.pageWrapper) {
      dom.pageWrapper.classList.add('qcf-mode-active');
    }

    adjustQcfFontSize();
    fitSurahHeaders();
    requestAnimationFrame(() => {
      adjustQcfFontSize();
      fitSurahHeaders();
    });

    syncQcfWordsDisplay();

    if (ReciterPlayer.isPlaying && ReciterPlayer.currentSurah && ReciterPlayer.currentAyah) {
      startReciterWordTracking(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    }
  }

  function renderQCFPage15Lines(pageNum, options = {}) {
    if (!dom.qcfContainer) return Promise.resolve();

    const renderToken = (MushafState.qcfRenderToken = (MushafState.qcfRenderToken || 0) + 1);

    const isLandscape = isLandscapeMode();
    if (dom.pageWrapper) {
      dom.pageWrapper.classList.toggle('is-landscape', isLandscape);
    }
    dom.qcfContainer.classList.toggle('is-spread', isLandscape);
    document.body.classList.toggle('mushaf-landscape-mode', isLandscape);

    // إذا كانت الحركة صامتة عبر underlay والمحتوى مبني مسبقاً، نقله فوراً لضمان سرعة 60fps وانعدام الوميض
    if (options && options.silentAnimation && dom.qcfUnderlayContainer && dom.qcfUnderlayContainer.firstElementChild) {
      dom.qcfContainer.innerHTML = '';
      while (dom.qcfUnderlayContainer.firstChild) {
        dom.qcfContainer.appendChild(dom.qcfUnderlayContainer.firstChild);
      }
      if (isLandscape) {
        const spread = getSpreadPages(pageNum);
        const rightData = pageColumnCache.get(spread.right);
        const leftData = spread.left ? pageColumnCache.get(spread.left) : null;
        MushafState.pageQcfWords = [...((rightData && rightData.words) || []), ...((leftData && leftData.words) || [])];
      } else {
        const singleData = pageColumnCache.get(pageNum);
        MushafState.pageQcfWords = (singleData && singleData.words) || [];
      }
      adjustQcfFontSize();
      fitSurahHeaders();
      syncQcfWordsDisplay();
      return Promise.resolve();
    }

    // مسار العرض المتزامن الفوري (0ms) إذا كانت الصفحة مبنية مسبقاً في الكاش
    if (isLandscape) {
      const spread = getSpreadPages(pageNum);
      if (pageColumnCache.has(spread.right) && (!spread.left || pageColumnCache.has(spread.left))) {
        const rCached = pageColumnCache.get(spread.right);
        const lCached = spread.left ? pageColumnCache.get(spread.left) : null;
        mountRenderedColumns(
          true,
          { col: rCached.col.cloneNode(true), words: rCached.words },
          lCached ? { col: lCached.col.cloneNode(true), words: lCached.words } : null
        );
        return Promise.resolve();
      }
      return Promise.all([
        getCachedPageColumn(spread.right),
        spread.left ? getCachedPageColumn(spread.left) : Promise.resolve(null)
      ]).then(([rightRes, leftRes]) => {
        if (renderToken !== MushafState.qcfRenderToken) return;
        mountRenderedColumns(true, rightRes, leftRes);
      });
    }

    if (pageColumnCache.has(pageNum)) {
      const cached = pageColumnCache.get(pageNum);
      mountRenderedColumns(false, { col: cached.col.cloneNode(true), words: cached.words }, null);
      return Promise.resolve();
    }

    // في حال لم تكن في الكاش بعد: يتم بناؤها دون مسح الشاشة قبل اكتمال البناء لمنع الشاشة البيضاء
    return getCachedPageColumn(pageNum).then((res) => {
      if (renderToken !== MushafState.qcfRenderToken) return;
      mountRenderedColumns(false, res, null);
    });
  }

  function syncQcfWordsDisplay() {
    if (!dom.qcfContainer) return;
    const isMasked = MushafState.maskMode && MushafState.maskMode !== 'none';
    const totalWords = (MushafState.targetWords || []).length;
    const activeKey = `${MushafState.activeSurahId}:${MushafState.activeAyahNum}`;

    // توحيد تظليل وتحديد الآية على مستوى حاويات الآيات (Continuous Verse Highlighting)
    dom.qcfContainer.querySelectorAll('.ayah-container').forEach(container => {
      const vk = container.getAttribute('data-verse-key');
      const isActive = vk === activeKey;
      container.classList.remove('active-verse-container', 'reciting-verse-container');
      if (isActive && !isMasked) {
        container.classList.add(MushafState.isReciting ? 'reciting-verse-container' : 'active-verse-container');
      }
    });

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

      // Check word highlights (تظليل الكلمات المحددة بألوانها)
      span.classList.remove('highlight-yellow', 'highlight-red', 'highlight-blue');
      const hlKey = `${sNum}:${aNum}:${wIdx}`;
      const wordHl = (window.AppState && window.AppState.wordHighlights) ? window.AppState.wordHighlights[hlKey] : null;
      if (wordHl && !isEnd) {
        span.classList.add(`highlight-${wordHl}`);
      }

      if (!isMasked) {
        span.classList.remove('revealed', 'current-recite-word', 'selected-ayah-word', 'reciting-ayah-word');
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

  async function getPageDataWithCache(pageNum) {
    const cacheKey = `p_${pageNum}`;
    let pageData = MushafState.cache.get(cacheKey);
    if (!pageData) {
      const polygons = await fetchAyahPolygons(pageNum);
      pageData = { polygons: Array.isArray(polygons) ? polygons : [], verses: [] };
      MushafState.cache.set(cacheKey, pageData);
    }
    return pageData;
  }

  async function loadPage(pageNum, options = {}) {
    hideTopBar();
    if (pageNum < 1) pageNum = 1;
    if (pageNum > 604) pageNum = 604;

    const oldPage = MushafState.currentPage;
    const isLandscape = isLandscapeMode();
    const spread = isLandscape ? getSpreadPages(pageNum) : null;
    const targetAnchor = spread ? spread.right : pageNum;

    const isDirectJump = oldPage && Math.abs(targetAnchor - oldPage) > (isLandscape ? 2 : 1);
    const direction = (oldPage && targetAnchor !== oldPage) ? (targetAnchor > oldPage ? 'next' : 'prev') : null;

    if (dom.pageStage) {
      dom.pageStage.classList.remove('slide-next', 'slide-prev', 'page-crossfade');

      if (options.silentAnimation) {
        // تم الانتهاء عبر حركة طيّ الورقة التفاعلية مسبقاً
      } else if (isDirectJump && direction) {
        // التلاشي السريع (Crossfade) عند القفز المفاجئ لصفحة بعيدة من الفهرس أو البحث
        void dom.pageStage.offsetWidth;
        dom.pageStage.classList.add('page-crossfade');
        const onAnimEnd = () => {
          if (dom.pageStage) dom.pageStage.classList.remove('page-crossfade');
        };
        dom.pageStage.addEventListener('animationend', onAnimEnd, { once: true });
      } else if (direction && !options.noAnimation) {
        // حركة تقليب الورقة
        void dom.pageStage.offsetWidth;
        const animClass = direction === 'next' ? 'slide-next' : 'slide-prev';
        dom.pageStage.classList.add(animClass);
        const onAnimEnd = () => {
          if (dom.pageStage) dom.pageStage.classList.remove(animClass);
        };
        dom.pageStage.addEventListener('animationend', onAnimEnd, { once: true });
      }
    }

    // إعادة التمرير للأعلى دائماً عند فتح أي صفحة ليظهر رأس الصفحة والبسملة بوضوح
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'instant' });
    const mushafView = document.getElementById('view-mushaf');
    if (mushafView) mushafView.scrollTop = 0;

    MushafState.currentPage = targetAnchor;
    localStorage.setItem('tibyan_mushaf_page', targetAnchor);

    // تفريغ الآيات المكشوفة عند الانتقال لصفحة جديدة ليبدأ إخفاء كامل أيضاً
    if (MushafState.unmaskedVerses) {
      MushafState.unmaskedVerses.clear();
    }

    if (dom.pageInput) dom.pageInput.value = targetAnchor;
    if (dom.inpageNumber) {
      dom.inpageNumber.textContent = isLandscape && spread.left ? `${spread.right} - ${spread.left}` : targetAnchor;
    }

    // Update Header Meta
    updatePageMetaHeader(targetAnchor);
    updatePageNotesIndicator(targetAnchor);

    // جلب بيانات المضلعات في الخلفية بدون تعطيل أو حجب العرض الفوري لصفحة المصحف
    (async () => {
      try {
        if (isLandscape) {
          const [rightData, leftData] = await Promise.all([
            getPageDataWithCache(spread.right),
            spread.left ? getPageDataWithCache(spread.left) : Promise.resolve({ polygons: [], verses: [] })
          ]);
          if (MushafState.currentPage === targetAnchor) {
            MushafState.pagePolygons = [...(rightData.polygons || []), ...(leftData.polygons || [])];
            MushafState.pageVerses = [...(rightData.verses || []), ...(leftData.verses || [])];
          }
        } else {
          const pageData = await getPageDataWithCache(pageNum);
          if (MushafState.currentPage === targetAnchor) {
            MushafState.pagePolygons = pageData.polygons || [];
            MushafState.pageVerses = pageData.verses || [];
          }
        }
      } catch (_) { }
    })();

    try {
      await renderQCFPage15Lines(targetAnchor, options);

      // Set default active Ayah on this page / spread
      setupInitialActiveAyahForPage();

      // التحميل المسبق في الخلفية لـ 5 صفحات سابقة و5 صفحات تالية (P-5 إلى P+5)
      if (isLandscape) {
        preloadAdjacentPages(spread.right);
        if (spread.left) preloadAdjacentPages(spread.left);
      } else {
        preloadAdjacentPages(pageNum);
      }
    } catch (err) {
      console.warn('Error loading Mushaf page:', err);
    }
  }

  function renderPageVisual(pad, pageNum) {
    if (dom.imageLayer) dom.imageLayer.innerHTML = '';
    return;
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

      // 2. ضغط مطول في الجوال والشاشات اللمسية والكمبيوتر: فتح نافذة خيارات الآية
      let longPressTimer = null;
      let isLongPress = false;
      let touchStartX = 0;
      let touchStartY = 0;

      // دعم الضغط المطول بالماوس للكمبيوتر
      pathEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // كلك يسار فقط
        isLongPress = false;
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          isLongPress = true;
          openAyahActionSheet(item.surahNumber, item.ayahNumber);
        }, 500);
      });

      pathEl.addEventListener('mouseup', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      });

      pathEl.addEventListener('mouseleave', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      });

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

      // 3. النقر العادي (يسار بالماوس أو لمسة سريعة): تحديد الآية فقط دون فتح القائمة أبداً
      pathEl.addEventListener('click', (e) => {
        if (typeof InteractivePageCurl !== 'undefined' && (InteractivePageCurl.isDragging || InteractivePageCurl.wasDraggedRecently)) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
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

          // في وضع التسميع وإخفاء الآيات: النقر على الآية النشطة يكشفها ويحتسبها وينتقل للتالية فوراً
          if (item.surahNumber === MushafState.activeSurahId && item.ayahNumber === MushafState.activeAyahNum) {
            handleAyahCompleted();
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
          // النقر العادي يحدد الآية فقط دون فتح نافذة الخيارات (تفتح فقط بالضغط المطول أو كلك يمين)
          selectActiveAyah(item.surahNumber, item.ayahNumber, false);
          highlightActiveAyahPolygon();
          const isMutashabihatMode = window.MushafSettingsManager && (window.MushafSettingsManager.getSettings().mutashabihat === true || window.MushafSettingsManager.getSettings().mutashabihat === 'true');
          if (isMutashabihatMode && typeof window.isMutashabihVerse === 'function' && window.isMutashabihVerse(item.surahNumber, item.ayahNumber)) {
            showMutashabihatSheet(item.surahNumber, item.ayahNumber);
          } else {
            toggleTopBar();
          }
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

  // تتبع الكلمات: يعمل داخل وضع الإخفاء أثناء التسميع (للآية النشطة غير المكشوفة فقط)
  function isWordTrackingActive() {
    if (MushafState.maskMode === 'word') return true;
    if (MushafState.maskMode !== 'verse' || !MushafState.isReciting) return false;
    const key = `${MushafState.activeSurahId}:${MushafState.activeAyahNum}`;
    return !(MushafState.unmaskedVerses && MushafState.unmaskedVerses.has(key));
  }

  function markWordError(surahId, ayahNum, idx) {
    const key = `${surahId}:${ayahNum}`;
    if (!MushafState.wordErrors.has(key)) MushafState.wordErrors.set(key, new Set());
    MushafState.wordErrors.get(key).add(idx);
  }

  // تلوين الكلمات المتعثَّر فيها (خلفية حمراء خفيفة + خط أحمر تحتها)
  function renderWordErrorMarks() {

    if (ReciterPlayer.isPlaying && ReciterPlayer.currentSurah && ReciterPlayer.currentAyah) {
      startReciterWordTracking(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    }
    if (!dom.overlaySvg) return;
    const NS = 'http://www.w3.org/2000/svg';
    let g = dom.overlaySvg.querySelector('#wordErrorGroup');
    if (!g) {
      g = document.createElementNS(NS, 'g');
      g.setAttribute('id', 'wordErrorGroup');
      g.setAttribute('class', 'word-error-group');
      dom.overlaySvg.appendChild(g);
    }
    g.innerHTML = '';
    if (!MushafState.maskMode || MushafState.maskMode === 'none') return;

    (MushafState.pagePolygons || []).forEach(item => {
      const key = `${item.surahNumber}:${item.ayahNumber}`;
      const errs = MushafState.wordErrors.get(key);
      if (!errs || !errs.size) return;
      const isActive = item.surahNumber === MushafState.activeSurahId && item.ayahNumber === MushafState.activeAyahNum;
      if (!isActive && !MushafState.unmaskedVerses.has(key)) return;
      const words = (getCurrentAyahText(item.surahNumber, item.ayahNumber) || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      computeWordRects(item.polygon, words).forEach((subRects, idx) => {
        if (!errs.has(idx)) return;
        subRects.forEach(r => {
          const bg = document.createElementNS(NS, 'rect');
          bg.setAttribute('x', r.x); bg.setAttribute('y', r.y);
          bg.setAttribute('width', r.width); bg.setAttribute('height', r.height);
          bg.setAttribute('class', 'word-error-mark');
          g.appendChild(bg);
          const ln = document.createElementNS(NS, 'line');
          ln.setAttribute('x1', r.x); ln.setAttribute('x2', r.x + r.width);
          ln.setAttribute('y1', r.y + r.height); ln.setAttribute('y2', r.y + r.height);
          ln.setAttribute('class', 'word-error-underline');
          g.appendChild(ln);
        });
      });
    });
  }

  // إعادة إخفاء آية للتسميع من جديد (تفريغ كشفها وأخطائها)
  function resetAyahMaskState(surahId, ayahNum) {
    const key = `${surahId}:${ayahNum}`;
    MushafState.unmaskedVerses.delete(key);
    MushafState.wordErrors.delete(key);
    if (dom.overlaySvg) {
      dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
        if (p.getAttribute('data-surah') == surahId && p.getAttribute('data-ayah') == ayahNum) {
          p.classList.remove('completed-ayah', 'unmasked-ayah');
        }
      });
    }
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

    if (!isWordTrackingActive()) {
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
    updateWordMasksState();
  }

  function updateWordMasksState() {
    syncQcfWordsDisplay();

    if (ReciterPlayer.isPlaying && ReciterPlayer.currentSurah && ReciterPlayer.currentAyah) {
      startReciterWordTracking(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    }
    if (!dom.overlaySvg || !isWordTrackingActive()) return;
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
      // مؤشر القراءة: الكلمة المنتظَرة حالياً
      rect.classList.toggle('current-word', idx === MushafState.wordPointerIndex);
    });
  }

  function highlightActiveAyahPolygon() {
    if (!dom.overlaySvg) return;

    const isMaskedMode = MushafState.maskMode && MushafState.maskMode !== 'none';

    dom.overlaySvg.querySelectorAll('.ayah-poly').forEach(p => {
      p.classList.remove('selected-ayah', 'reciting-ayah', 'word-tracking-ayah');

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
      } else if (isWordTrackingActive()) {
        // الآية النشطة تُحجب كلمة كلمة بدل حجبها كاملة، وتنكشف كلماتها مع التسميع
        activeEl.classList.add('word-tracking-ayah');
      }
    }

    renderWordMasksForActiveAyah();
    renderWordErrorMarks();
    syncQcfWordsDisplay();

    if (ReciterPlayer.isPlaying && ReciterPlayer.currentSurah && ReciterPlayer.currentAyah) {
      startReciterWordTracking(ReciterPlayer.currentSurah, ReciterPlayer.currentAyah);
    }
  }

  function updatePageMetaHeader(pageNum) {
    if (isLandscapeMode()) {
      const spread = getSpreadPages(pageNum);
      if (window.getSurahsForPage) {
        const sRight = window.getSurahsForPage(spread.right) || [];
        const sLeft = spread.left ? (window.getSurahsForPage(spread.left) || []) : [];
        const combined = [...sRight];
        sLeft.forEach(s => {
          if (!combined.some(c => c.id === s.id)) combined.push(s);
        });
        if (combined.length && dom.headerSurahName) {
          dom.headerSurahName.textContent = `سورة ${combined.map(s => s.name).join(' / ')}`;
        }
      }
      if (window.getJuzForPage && dom.headerJuzName) {
        const jRight = window.getJuzForPage(spread.right);
        const jLeft = spread.left ? window.getJuzForPage(spread.left) : null;
        if (jRight && jLeft && jRight.number !== jLeft.number) {
          dom.headerJuzName.textContent = `جزء ${jRight.number} - ${jLeft.number}`;
        } else if (jRight) {
          dom.headerJuzName.textContent = jRight.name.replace(/^الجزء\s+/, 'جزء ');
        }
      }
      return;
    }

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
    } else if (MushafState.pageQcfWords && MushafState.pageQcfWords.length > 0) {
      const firstW = MushafState.pageQcfWords[0];
      const sId = parseInt(firstW.surah || (firstW._vk ? firstW._vk.split(':')[0] : 0), 10);
      const aId = parseInt(firstW.ayah || (firstW._vk ? firstW._vk.split(':')[1] : 0), 10);
      if (sId && aId) {
        selectActiveAyah(sId, aId, false);
      }
    }
  }

  async function preloadAdjacentPages(current) {
    const isLandscape = isLandscapeMode();
    const spread = isLandscape ? getSpreadPages(current) : null;
    const anchor = spread ? spread.right : current;

    // الصفحات المجاورة ذات الأولوية القصوى (Next 5 pages + Prev 5 pages = P-5 إلى P+5)
    const priorityPages = [
      anchor + 1,
      anchor - 1,
      anchor + 2,
      anchor - 2,
      anchor + 3,
      anchor - 3,
      anchor + 4,
      anchor - 4,
      anchor + 5,
      anchor - 5
    ].filter(p => p >= 1 && p <= 604);

    if (spread && spread.left) {
      for (let offset = 1; offset <= 5; offset++) {
        const pLeftAhead = spread.left + offset;
        const pLeftBehind = spread.left - offset;
        if (pLeftAhead <= 604 && !priorityPages.includes(pLeftAhead)) priorityPages.push(pLeftAhead);
        if (pLeftBehind >= 1 && !priorityPages.includes(pLeftBehind)) priorityPages.push(pLeftBehind);
      }
    }

    const scheduleIdle = (typeof window.requestIdleCallback === 'function')
      ? (cb) => window.requestIdleCallback(cb, { timeout: 300 })
      : (cb) => setTimeout(cb, 16);

    scheduleIdle(async () => {
      // 1. تحميل الخطوط المحلية وبيانات QCF V1 والبناء المسبق للـ DOM للصفحات المجاورة (P-5 إلى P+5)
      for (const p of priorityPages) {
        await preloadQcfPage(p);
        if (!pageColumnCache.has(p)) {
          await getCachedPageColumn(p);
        }
      }
    });
  }

  async function preloadQcfPage(pageNum) {
    if (pageNum < 1 || pageNum > 604) return false;
    try {
      await Promise.all([
        fetchQCFPageData(pageNum),
        loadQCFFont(pageNum)
      ]);
      return true;
    } catch (_) {
      return false;
    }
  }

  // --- MUSHAF AUTO-DOWNLOADER (التحميل التلقائي لكامل صفحات المصحف في الخلفية للعمل بدون نت) ---
  const AutoMushafDownloader = {
    isRunning: false,
    isPaused: false,
    downloadedPagesCount: 0,
    totalPages: 604,

    async init() {
      await this.updateCachedCount();
    },

    async updateCachedCount() {
      // المصحف الآن مضمن بالكامل محلياً داخل التطبيق (604 صفحة وخطوطها محلياً)
      this.downloadedPagesCount = 604;
      this.updateUiStatus();
      return 604;
    },

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.isPaused = false;
      this.processNextBatch();
    },

    pause() {
      this.isPaused = true;
      this.isRunning = false;
      this.updateUiStatus();
    },

    async processNextBatch() {
      if (!this.isRunning || this.isPaused) return;

      const cur = MushafState.currentPage || 1;
      // ترتيب ذكي: البدء من الصفحة الحالية للأمام حتى 604، ثم من 1 إلى الصفحة الحالية
      const queue = [];
      for (let p = cur; p <= 604; p++) queue.push(p);
      for (let p = 1; p < cur; p++) queue.push(p);

      let dataCache = null;
      if (typeof caches !== 'undefined') {
        try {
          dataCache = await caches.open(QCF_DATA_CACHE);
        } catch (_) { }
      }

      for (const p of queue) {
        if (!this.isRunning || this.isPaused) break;

        const url = 'https://api.quran.com/api/v4/verses/by_page/' + p + '?words=true&word_fields=code_v1,text_qpc_hafs,text_imlaei,line_number,page_number,location&mushaf=2';
        let isCached = false;
        if (dataCache) {
          try {
            const match = await dataCache.match(url);
            if (match) isCached = true;
          } catch (_) { }
        }

        if (!isCached) {
          try {
            await preloadQcfPage(p);
            this.downloadedPagesCount++;
            this.updateUiStatus();
          } catch (_) { }

          // مهلة بسيطة ومريحة (200ms) حتى لا يثقل على الجهاز
          await new Promise(r => setTimeout(r, 200));
        }
      }

      this.isRunning = false;
      await this.updateCachedCount();
    },

    updateUiStatus() {
      const percent = Math.min(100, Math.round((this.downloadedPagesCount / this.totalPages) * 100));
      const statusBadge = document.getElementById('mushafPagesDownloadBadge');
      const progressFill = document.getElementById('mushafPagesProgressBarFill');
      const countText = document.getElementById('mushafPagesCountText');
      const progressWrap = document.getElementById('mushafPagesProgressWrap');

      if (statusBadge) {
        if (this.downloadedPagesCount >= this.totalPages) {
          statusBadge.className = 'download-badge downloaded';
          statusBadge.textContent = 'مكتمل التحميل';
        } else if (this.isRunning) {
          statusBadge.className = 'download-badge downloading';
          statusBadge.textContent = `جاري التحميل (${percent}%)`;
        } else {
          statusBadge.className = 'download-badge partial';
          statusBadge.textContent = `محمّل ${percent}%`;
        }
      }

      if (countText) {
        if (this.downloadedPagesCount >= this.totalPages) {
          countText.textContent = `كل صفحات المصحف (604 صفحات) محمّلة وجاهزة بدون نت`;
        } else {
          countText.textContent = `${this.downloadedPagesCount} من ${this.totalPages} صفحة محفوظة على جهازك`;
        }
      }

      if (progressFill) {
        progressFill.style.width = `${percent}%`;
      }

      if (progressWrap) {
        progressWrap.style.display = (this.downloadedPagesCount >= this.totalPages) ? 'none' : 'block';
      }
    }
  };

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

  function cleanSpacelessArabic(str) {
    if (!str) return '';
    return normalizeArabicText(str).replace(/\s+/g, '');
  }

  function getCurrentAyahText(surahId, ayahNum) {
    const verseKey = `${surahId}:${ayahNum}`;
    if (localQuranTextMap && localQuranTextMap[verseKey]) {
      return localQuranTextMap[verseKey];
    }
    if (MushafState.verseTextCache && MushafState.verseTextCache.has(verseKey)) {
      return MushafState.verseTextCache.get(verseKey);
    }
    const foundInPage = MushafState.pageVerses && MushafState.pageVerses.find(v => v.verse_key === verseKey);
    if (foundInPage && (foundInPage.text_imlaei || foundInPage.text_uthmani_simple)) {
      const txt = foundInPage.text_imlaei || foundInPage.text_uthmani_simple;
      if (MushafState.verseTextCache) MushafState.verseTextCache.set(verseKey, txt);
      return txt;
    }
    if (MushafState.targetWords && MushafState.targetWords.length > 0) {
      return MushafState.targetWords.map(w => w.original).join(' ');
    }
    return '';
  }

  async function loadAyahWords(surahId, ayahNum) {
    const verseKey = `${surahId}:${ayahNum}`;
    let verseText = getCurrentAyahText(surahId, ayahNum);

    if (!verseText && !localQuranTextMap) {
      await loadLocalQuranText();
      verseText = getCurrentAyahText(surahId, ayahNum);
    }

    if (!verseText) {
      try {
        const res = await fetch(`https://api.quran.com/api/v4/quran/verses/imlaei?verse_key=${verseKey}`);
        if (res.ok) {
          const json = await res.json();
          if (json.verses && json.verses[0]) {
            verseText = json.verses[0].text_imlaei;
            if (MushafState.verseTextCache) {
              MushafState.verseTextCache.set(verseKey, verseText);
            }
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
      matched: false,
      stumbled: false
    }));

    MushafState.wordPointerIndex = 0;
    const carry = MushafState.carryCursor;
    MushafState.carryCursor = null;
    MushafState.spokenCursor = (typeof carry === 'number') ? carry : (MushafState.lastSpokenCount || 0);
    if (MushafState.isReciting && MushafState.maskMode === 'verse') {
      resetAyahMaskState(surahId, ayahNum); // الآية تبدأ مخفية دائماً أثناء التسميع
    }
    updateRecitationStatus();
    renderWordMasksForActiveAyah();

    if (typeof carry === 'number' && MushafState.isReciting && MushafState.lastTranscript) {
      setTimeout(() => {
        if (MushafState.isReciting) processSpokenTranscript(MushafState.lastTranscript, { tentativeLast: !!MushafState.lastTentative });
      }, 0);
    }
  }

  function advanceWordPointer() {
    if (MushafState.wordPointerIndex < MushafState.targetWords.length) {
      MushafState.targetWords[MushafState.wordPointerIndex].matched = true;
      markWordError(MushafState.activeSurahId, MushafState.activeAyahNum, MushafState.wordPointerIndex);
      MushafState.wordPointerIndex++;
      renderWordErrorMarks();

      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(15);
      }

      updateRecitationStatus();
      updateWordMasksState();

      if (MushafState.wordPointerIndex >= MushafState.targetWords.length) {
        handleAyahCompleted();
      }
    }
  }

  let isAyahTransitioning = false;
  let speechRestartTimeout = null;

  function handleAyahCompleted() {
    if (isAyahTransitioning) return;
    isAyahTransitioning = true;

    playSuccessChime();

    MushafState.recitedVersesCount = (MushafState.recitedVersesCount || 0) + 1;
    updateRecitationStatsUI();

    const curSurah = MushafState.activeSurahId;
    const curAyah = MushafState.activeAyahNum;
    const verseKey = `${curSurah}:${curAyah}`;

    // كشف باقي كلمات الآية (عند الإكمال بالنقر أو زر التخطي أو نسبة التطابق)
    if (MushafState.targetWords) {
      MushafState.wordPointerIndex = MushafState.targetWords.length;
      updateWordMasksState();
    }

    if (MushafState.unmaskedVerses) {
      MushafState.unmaskedVerses.add(verseKey);
    }

    if (dom.recitationStatusBadge) {
      dom.recitationStatusBadge.style.display = 'inline-flex';
      dom.recitationStatusBadge.className = 'floating-status-badge status-completed';
      dom.recitationStatusBadge.textContent = 'عاش، ثبتّت الآية';
    }

    // Unmask all polygon pieces of this verse
    if (dom.overlaySvg) {
      dom.overlaySvg.querySelectorAll(`[data-surah="${curSurah}"][data-ayah="${curAyah}"]`).forEach(p => {
        p.classList.add('completed-ayah', 'unmasked-ayah');
      });
      const poly = dom.overlaySvg.querySelector(`#poly-${curSurah}-${curAyah}`);
      if (poly) {
        poly.classList.add('completed-ayah', 'unmasked-ayah');
      }
    }

    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate([25, 40, 25]);
    }

    // Advance to next Ayah smoothly after short celebration
    setTimeout(() => {
      advanceToNextAyah();
      if (MushafState.isReciting && MushafState.lastTranscript) {
        processSpokenTranscript(MushafState.lastTranscript, { tentativeLast: !!MushafState.lastTentative });
      }
    }, 280);
  }

  function advanceToNextAyah() {
    isAyahTransitioning = false;
    if (dom.liveTranscript) dom.liveTranscript.textContent = '';

    const surahObj = window.getSurahById ? window.getSurahById(MushafState.activeSurahId) : null;
    const maxVerses = surahObj ? surahObj.verses : 286;

    let nextSurah = MushafState.activeSurahId;
    let nextAyah = MushafState.activeAyahNum + 1;

    if (nextAyah > maxVerses) {
      if (nextSurah < 114) {
        nextSurah++;
        nextAyah = 1;
      } else {
        if (window.showToast) window.showToast('ما شاء الله، ختمت سرد الآيات');
        stopRecitation();
        return;
      }
    }

    // تبقى جلسة الميكروفون مفتوحة بين الآيات، وتُطابَق الكلمات المنطوقة بعد الآية المنتهية مع الآية التالية (carryCursor)

    // Check if next Ayah belongs to another page
    const isOnCurrentPage = MushafState.pagePolygons.some(
      p => p.surahNumber === nextSurah && p.ayahNumber === nextAyah
    );

    if (!isOnCurrentPage) {
      const targetP = getAyahPageNumber(nextSurah, nextAyah);
      if (targetP && targetP <= 604 && !isPageCurrentlyVisible(targetP)) {
        loadPage(targetP).then(() => {
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
        const prevSurahObj = window.getSurahById ? window.getSurahById(targetSurah) : null;
        targetAyah = prevSurahObj ? prevSurahObj.verses : 1;
      } else {
        targetAyah = 1;
      }
    } else if (targetAyah > maxVerses) {
      if (targetSurah < 114) {
        targetSurah++;
        targetAyah = 1;
      } else {
        targetAyah = maxVerses;
      }
    }

    if (dom.liveTranscript) dom.liveTranscript.textContent = '';

    const isOnCurrentPage = MushafState.pagePolygons.some(
      p => p.surahNumber === targetSurah && p.ayahNumber === targetAyah
    );

    if (!isOnCurrentPage) {
      const targetPage = getAyahPageNumber(targetSurah, targetAyah);
      if (targetPage && !isPageCurrentlyVisible(targetPage)) {
        loadPage(targetPage).then(() => {
          selectActiveAyah(targetSurah, targetAyah, false);
          if (ReciterPlayer.isPlaying) {
            playReciterAyah(targetSurah, targetAyah);
          }
        });
        return;
      }
    }

    selectActiveAyah(targetSurah, targetAyah, false);
    if (ReciterPlayer.isPlaying) {
      playReciterAyah(targetSurah, targetAyah);
    }
  }

  // --- RECITATION TIMER & STATS (مسار السرد السريع - الحدر) ---

  function startRecitationTimer() {
    MushafState.recitationStartTime = Date.now();
    MushafState.recitedVersesCount = 0;
    updateRecitationStatsUI();

    if (dom.recitationStatsBar) dom.recitationStatsBar.style.display = 'flex';
    if (dom.recitationRevealAyahBtn) dom.recitationRevealAyahBtn.style.display = 'inline-flex';

    if (MushafState.recitationTimerInterval) clearInterval(MushafState.recitationTimerInterval);
    MushafState.recitationTimerInterval = setInterval(() => {
      updateRecitationStatsUI();
    }, 1000);
  }

  function stopRecitationTimer() {
    if (MushafState.recitationTimerInterval) {
      clearInterval(MushafState.recitationTimerInterval);
      MushafState.recitationTimerInterval = null;
    }
    if (!MushafState.maskMode || MushafState.maskMode === 'none') {
      if (dom.recitationStatsBar) dom.recitationStatsBar.style.display = 'none';
      if (dom.recitationRevealAyahBtn) dom.recitationRevealAyahBtn.style.display = 'none';
    }
  }

  function updateRecitationStatsUI() {
    if (MushafState.recitationStartTime && dom.recitationTimerBadge) {
      const elapsedSec = Math.floor((Date.now() - MushafState.recitationStartTime) / 1000);
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const ss = String(elapsedSec % 60).padStart(2, '0');
      dom.recitationTimerBadge.textContent = `${mm}:${ss}`;
    }
    if (dom.recitationCounterBadge) {
      const count = MushafState.recitedVersesCount || 0;
      dom.recitationCounterBadge.textContent = `${count} ${count === 1 ? 'آية' : 'آيات'}`;
    }
  }

  // --- STREAMING VOICE RECOGNITION (Web Speech API) ---

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API is not supported in this browser.');
      return;
    }

    if (MushafState.recognition) {
      try { MushafState.recognition.abort(); } catch (e) { }
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'ar-SA';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      MushafState.isReciting = true;
      MushafState.spokenCursor = 0;
      MushafState.lastSpokenCount = 0;
      MushafState.carryCursor = null;
      MushafState.lastTranscript = '';
      updateRecitationStatus();
      highlightActiveAyahPolygon();
    };

    rec.onsoundstart = () => {
      if (dom.recitationStatusBadge && MushafState.isReciting) {
        dom.recitationStatusBadge.style.display = 'inline-flex';
        dom.recitationStatusBadge.textContent = 'تم التقاط الصوت...';
      }
    };

    rec.onspeechstart = () => {
      if (dom.recitationStatusBadge && MushafState.isReciting) {
        dom.recitationStatusBadge.style.display = 'inline-flex';
        dom.recitationStatusBadge.textContent = 'جاري مطابقة كلامك...';
      }
    };

    rec.onresult = (event) => {
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i] && event.results[i][0]) {
          fullTranscript += event.results[i][0].transcript + ' ';
        }
      }

      const rawCombined = fullTranscript.trim();
      const sessionDisplay = [MushafState.accumulatedTranscript, rawCombined].filter(Boolean).join(' ').trim();
      MushafState.currentSegmentTranscript = rawCombined;
      if (dom.liveTranscript) {
        dom.liveTranscript.style.display = 'block';
        dom.liveTranscript.textContent = sessionDisplay ? `المسموع: "${sessionDisplay}"` : '';
      }

      // Real-time comparison with active verse
      const lastRes = event.results[event.results.length - 1];
      processSpokenTranscript(rawCombined, { tentativeLast: !!(lastRes && !lastRes.isFinal) });
    };

    rec.onerror = (event) => {
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
      stopRecitation();

      if (event.error === 'network') {
        const isBrave = !!(navigator.brave && typeof navigator.brave.isBrave === 'function');
        if (dom.recitationStatusBadge) {
          dom.recitationStatusBadge.style.display = 'inline-flex';
          dom.recitationStatusBadge.className = 'floating-status-badge status-idle';
          dom.recitationStatusBadge.textContent = isBrave
            ? 'متصفح Brave يمنع خدمة الصوت. افتح Chrome أو اضغط (>>)'
            : 'ما قدرنا نتصل بمحرك الصوت. افتح Chrome أو اضغط (>>)';
        }
        if (window.showToast) {
          window.showToast(isBrave
            ? 'متصفح Brave يمنع التعرف الصوتي افتراضياً، افتح Chrome أو اضغط (>>)'
            : 'التعرف الصوتي يحتاج Chrome أو Edge، أو سمّع بالنقر على الآية أو (>>)');
        }
        return;
      }
      if (event.error === 'not-allowed') {
        if (dom.recitationStatusBadge) {
          dom.recitationStatusBadge.style.display = 'inline-flex';
          dom.recitationStatusBadge.textContent = 'ما سمحت للميكروفون';
        }
        alert('اسمح للميكروفون أول عشان نبدأ التسميع.');
        return;
      }
      if (event.error === 'audio-capture') {
        if (dom.recitationStatusBadge) {
          dom.recitationStatusBadge.style.display = 'inline-flex';
          dom.recitationStatusBadge.textContent = 'ما لقينا ميكروفون شابك';
        }
        return;
      }
    };

    rec.onend = () => {
      if (MushafState.currentSegmentTranscript) {
        MushafState.accumulatedTranscript = [MushafState.accumulatedTranscript, MushafState.currentSegmentTranscript]
          .filter(Boolean)
          .join(' ')
          .trim();
        MushafState.currentSegmentTranscript = '';
      }
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
    };

    MushafState.recognition = rec;
  }

  function isNearWord(a, b) {
    if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }

  // مطابقة الكلمة المنطوقة spoken[si] مع الكلمة المستهدفة words[ti] (currentWordIndex)
  // --- الحروف المقطّعة (الم، حم، يس، ...): المتعرّف الصوتي يكتبها بأسماء الحروف (حميم، الف لام ميم) ---
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

  function matchWordsAt(spoken, si, words, ti) {
    const s0 = spoken[si];
    const t0 = words[ti].normalized;
    if (wordsMatch(s0, t0) || isNearWord(s0, t0)) return { s: 1, t: 1 };
    const mq = matchMuqattaat(spoken, si, t0);
    if (mq) return { s: mq, t: 1 };
    if (si + 1 < spoken.length && wordsMatch(s0 + spoken[si + 1], t0)) return { s: 2, t: 1 };
    if (ti + 1 < words.length && words[ti + 1].normalized && wordsMatch(s0, t0 + words[ti + 1].normalized)) return { s: 1, t: 2 };
    return null;
  }

  // --- البدء الذكي من أي موضع بالصفحة (Mid-Surah / Mid-Page Auto-Catchup) ---
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

  function processSpokenTranscript(transcript, opts) {
    if (!transcript) return;
    MushafState.lastTranscript = transcript;
    MushafState.lastTentative = !!(opts && opts.tentativeLast);
    if (isAyahTransitioning) return;

    const spoken = normalizeArabicText(transcript).split(/\s+/).filter(Boolean);
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
      // فحص المطابقة المباشرة أو البحث المتقدم للأمام (Lookahead)
      let matchedOffset = -1;
      let matchResult = null;
      const lookaheadLimit = Math.min(cursor + 6, spoken.length);

      for (let s = cursor; s < lookaheadLimit; s++) {
        const m = matchWordsAt(spoken, s, words, cur);
        if (m) {
          matchedOffset = s;
          matchResult = m;
          break;
        }
      }

      if (matchedOffset !== -1) {
        // إذا وجد الكلمة بعد تخطي بعض الكلمات المنطوقة، فهذا تعثر سابق ثم تصحيح
        if (matchedOffset > cursor) {
          words[cur].stumbled = true;
        }
        for (let k = 0; k < matchResult.t; k++) {
          words[cur + k].matched = true;
          if (words[cur + k].stumbled) {
            markWordError(surah, ayah, cur + k);
          }
        }
        cur += matchResult.t;
        cursor = matchedOffset + matchResult.s;
        progressed = true;
        skipEmpty();
        continue;
      }

      // إذا كانت آخر كلمة مؤقتة غير مكتملة، ننتظر اكتمالها دون تسجيل خطأ
      if (tentativeLast && cursor === spoken.length - 1) {
        break;
      }

      // كلمة لم تطابق: نسجل تعثراً ونستمر في قراءة الكلمات المنطوقة
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
        dom.recitationStatusBadge.textContent = 'كلمة مختلفة، أعدها شوي';
      } else {
        dom.recitationStatusBadge.textContent = `${cur} من ${words.length} كلمة`;
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
    pauseReciterAudio();
    loadLocalQuranText();

    // الآية النشطة يجب أن تكون ضمن الصفحة المعروضة وإلا ينتظر التطبيق آية من صفحة أخرى
    const onPage = (MushafState.pagePolygons || []).some(p => p.surahNumber === MushafState.activeSurahId && p.ayahNumber === MushafState.activeAyahNum);
    if (!onPage && MushafState.pagePolygons && MushafState.pagePolygons.length) {
      const first = MushafState.pagePolygons[0];
      selectActiveAyah(first.surahNumber, first.ayahNumber, false);
    }

    if (!MushafState.recognition) {
      setupSpeechRecognition();
      if (!MushafState.recognition) {
        alert('التسميع الصوتي ما يشتغل على هذا المتصفح.');
        return;
      }
    }

    // التسميع الصوتي = تسميع غيبي: يُفعَّل الإخفاء تلقائياً وتبدأ الآية مخفية عند أول كلمة
    if (!MushafState.maskMode || MushafState.maskMode === 'none') setMaskMode('verse');
    // الاستئناف من آخر آية/كلمة وصل إليها المستخدم (لا تصفير). التصفير فقط إن كانت الآية مكشوفة بالكامل
    if (MushafState.unmaskedVerses.has(`${MushafState.activeSurahId}:${MushafState.activeAyahNum}`)) {
      resetAyahMaskState(MushafState.activeSurahId, MushafState.activeAyahNum);
      MushafState.wordPointerIndex = 0;
      (MushafState.targetWords || []).forEach(w => { w.matched = false; w.stumbled = false; });
    }
    MushafState.spokenCursor = 0;   // جلسة صوتية جديدة: عدّاد الكلمات المنطوقة فقط
    MushafState.lastSpokenCount = 0;
    MushafState.accumulatedTranscript = '';
    MushafState.currentSegmentTranscript = '';

    MushafState.isReciting = true;
    startRecitationTimer();

    try {
      MushafState.recognition.start();
    } catch (e) {
      // Already running
    }

    updateRecitationStatus();
    highlightActiveAyahPolygon();
  }

  function stopRecitation() {
    MushafState.isReciting = false;
    isAyahTransitioning = false;
    clearTimeout(speechRestartTimeout);
    stopRecitationTimer();

    if (MushafState.recognition) {
      try {
        MushafState.recognition.stop();
      } catch (e) { }
    }

    if (dom.liveTranscript) {
      dom.liveTranscript.textContent = '';
    }
    MushafState.accumulatedTranscript = '';
    MushafState.currentSegmentTranscript = '';

    updateRecitationStatus();
    highlightActiveAyahPolygon();
  }

  function updateRecitationStatus() {
    if (!dom.startRecitationBtn) return;

    if (MushafState.isReciting) {
      dom.startRecitationBtn.classList.add('active');
      if (dom.micBtnText) dom.micBtnText.textContent = 'إيقاف التسميع';
      if (dom.micIcon) {
        dom.micIcon.innerHTML = `
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        `;
      }
      if (dom.recitationStatusBadge) {
        dom.recitationStatusBadge.style.display = 'inline-flex';
        dom.recitationStatusBadge.className = 'floating-status-badge status-listening';
        if (MushafState.targetWords && MushafState.targetWords.length > 0 && MushafState.wordPointerIndex > 0) {
          dom.recitationStatusBadge.textContent = `${MushafState.wordPointerIndex} من ${MushafState.targetWords.length} كلمة`;
        } else {
          dom.recitationStatusBadge.textContent = 'تفضّل اقرأ، نسمعك الحين...';
        }
      }
      if (dom.recitationRevealAyahBtn) dom.recitationRevealAyahBtn.style.display = 'inline-flex';
      if (dom.recitationStatsBar) dom.recitationStatsBar.style.display = 'flex';
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
      if (dom.recitationStatusBadge) {
        dom.recitationStatusBadge.style.display = 'none';
      }
      if (MushafState.maskMode !== 'verse') {
        if (dom.recitationRevealAyahBtn) dom.recitationRevealAyahBtn.style.display = 'none';
        if (dom.recitationStatsBar) dom.recitationStatsBar.style.display = 'none';
      }
    }
  }

  // --- INTERACTIVE REALISTIC PAGE CURL & CORNER FLIP CONTROLLER ---

  const InteractivePageCurl = {
    isDragging: false,
    isCandidate: false,
    wasDraggedRecently: false,
    _dragRecentlyTimer: null,
    direction: null, // 'next' (RTL: سحب من اليسار لليمين) | 'prev' (RTL: سحب من اليمين لليسار)
    targetPage: 1,
    startX: 0,
    startY: 0,
    startClientX: 0,
    startClientY: 0,
    currentX: 0,
    currentY: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
    progress: 0,
    cornerYRatio: 0.5,
    isAnimating: false,
    rafId: null,

    init() {
      dom.underlayStage = document.getElementById('mushafUnderlayStage');
      dom.qcfUnderlayContainer = document.getElementById('qcfUnderlayContainer');
      dom.curlLeaf = document.getElementById('mushafCurlLeaf');
      dom.curlUnderlayShadow = document.getElementById('curlUnderlayShadow');
      dom.curlFlapBody = document.getElementById('curlFlapBody');
      dom.curlCreaseShadow = document.getElementById('curlCreaseShadow');

      if (!dom.pageWrapper) return;
      this.attachListeners();
    },

    attachListeners() {
      const el = dom.pageWrapper;
      if (!el) return;

      // أحداث اللمس (Touch)
      el.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          const t = e.touches[0];
          this.handleStart(t.clientX, t.clientY, e.target);
        }
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches[0]) {
          const t = e.touches[0];
          this.handleMove(t.clientX, t.clientY, e);
        }
      }, { passive: false });

      el.addEventListener('touchend', () => {
        this.handleEnd();
      }, { passive: true });

      el.addEventListener('touchcancel', () => {
        this.handleCancel();
      }, { passive: true });

      // أحداث الماوس (Mouse)
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        this.handleStart(e.clientX, e.clientY, e.target);
      });

      window.addEventListener('mousemove', (e) => {
        if (this.isDragging || this.isCandidate) {
          this.handleMove(e.clientX, e.clientY, e);
        }
      });

      window.addEventListener('mouseup', () => {
        if (this.isDragging || this.isCandidate) {
          this.handleEnd();
        }
      });
    },

    handleStart(clientX, clientY, targetEl) {
      if (this.isAnimating) return false;

      // تجاهل اللمس فقط إذا كان على أزرار التحكم المستقلة أو البطاقات العائمة والنافذة المنبثقة
      if (targetEl && (
        targetEl.closest('button') ||
        targetEl.closest('.floating-player-card') ||
        targetEl.closest('#mushafPageBottomBar') ||
        targetEl.closest('.notes-modal-content') ||
        targetEl.closest('.recitation-settings-modal')
      )) {
        this.isCandidate = false;
        return false;
      }

      const rect = dom.pageWrapper.getBoundingClientRect();
      this.startX = clientX - rect.left;
      this.startY = clientY - rect.top;
      this.startClientX = clientX;
      this.startClientY = clientY;
      this.currentX = this.startX;
      this.currentY = this.startY;
      this.lastX = clientX;
      this.lastTime = performance.now();
      this.velocity = 0;
      this.isDragging = false;
      this.isCandidate = true;
      this.direction = null;
      this.progress = 0;
      this.cornerYRatio = Math.max(0, Math.min(1, this.startY / rect.height));

      // تسريع التجهيز الفوري للعمود المسبق بمجرد لمس الشاشة قبل بدء السحب
      const curP = MushafState.currentPage || 1;
      const stepP = isLandscapeMode() ? 2 : 1;
      if (curP + stepP <= 604 && !pageColumnCache.has(curP + stepP)) {
        getCachedPageColumn(curP + stepP);
      }
      if (curP - stepP >= 1 && !pageColumnCache.has(curP - stepP)) {
        getCachedPageColumn(curP - stepP);
      }

      return true;
    },

    handleMove(clientX, clientY, e) {
      if (this.isAnimating || !this.isCandidate) return;
      const rect = dom.pageWrapper.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const dx = clientX - (this.startClientX !== undefined ? this.startClientX : (this.startX + rect.left));
      const dy = clientY - (this.startClientY !== undefined ? this.startClientY : (this.startY + rect.top));
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!this.isDragging) {
        // إذا كان التمرير عمودياً نلغي التقليب للسماح بتمرير الصفحة
        if (absDy > 14 && absDy > absDx * 1.15) {
          this.isCandidate = false;
          return;
        }

        // استجابة فورية وحساسة للسحب الأفقي من أي نقطة أو زاوية في الصفحة
        if (absDx > 8 && absDx > absDy) {
          const isLandscape = isLandscapeMode();
          const step = isLandscape ? 2 : 1;

          if (dx > 0) {
            // سحب من اليسار نحو اليمين -> الصفحة التالية في المصحف العربي (RTL)
            const target = MushafState.currentPage + step;
            if (target > 604) {
              this.isCandidate = false;
              return;
            }
            this.direction = 'next';
            this.targetPage = target;
          } else {
            // سحب من اليمين نحو اليسار -> الصفحة السابقة في المصحف العربي (RTL)
            const target = MushafState.currentPage - step;
            if (target < 1) {
              this.isCandidate = false;
              return;
            }
            this.direction = 'prev';
            this.targetPage = target;
          }

          const transitionMode = (typeof MushafSettingsManager !== 'undefined') ? MushafSettingsManager.getSettings().transition : 'slide';
          this.transitionMode = transitionMode;
          this.isDragging = true;
          if (dom.underlayStage) {
            dom.underlayStage.style.display = 'block';
            if (this.transitionMode === 'slide') {
              dom.underlayStage.style.zIndex = '5';
              dom.pageStage.style.zIndex = '6';
            }
          }
          if (this.transitionMode === 'curl') {
            if (dom.curlLeaf) dom.curlLeaf.style.display = 'block';
          } else {
            if (dom.curlLeaf) dom.curlLeaf.style.display = 'none';
          }
          this.prepareUnderlay(this.targetPage);
          if (e && e.cancelable) e.preventDefault();
        } else {
          return;
        }
      }

      if (e && e.cancelable) e.preventDefault();

      const now = performance.now();
      const dt = now - this.lastTime;
      if (dt > 0) {
        this.velocity = (clientX - this.lastX) / dt;
      }
      this.lastX = clientX;
      this.lastTime = now;
      this.currentX = x;
      this.currentY = y;

      const W = rect.width;
      if (this.transitionMode === 'slide') {
        // انزلاق أفقي ناعم ومستقر 1:1 تتبع مباشر للإصبع (نفس مصحف آية)
        if (this.direction === 'next') {
          // سحب لليمين في RTL: الصفحة الحالية تتحرك لليمين والصفحة التالية تدخل من اليسار
          dom.pageStage.style.transform = `translate3d(${dx}px, 0, 0)`;
          dom.underlayStage.style.transform = `translate3d(${dx - W}px, 0, 0)`;
        } else {
          // سحب لليسار في RTL: الصفحة الحالية تتحرك لليسار والصفحة السابقة تدخل من اليمين
          dom.pageStage.style.transform = `translate3d(${dx}px, 0, 0)`;
          dom.underlayStage.style.transform = `translate3d(${W + dx}px, 0, 0)`;
        }
      } else {
        let p = 0;
        if (this.direction === 'next') {
          p = dx / (W * 0.85);
        } else {
          p = -dx / (W * 0.85);
        }
        this.progress = Math.max(0, Math.min(1, p));
        this.cornerYRatio = Math.max(0, Math.min(1, y / rect.height));

        this.renderFrame(this.progress, this.cornerYRatio, this.direction);
      }
    },

    handleEnd() {
      this.isCandidate = false;
      if (!this.isDragging) {
        return;
      }

      this.isDragging = false;
      this.wasDraggedRecently = true;
      clearTimeout(this._dragRecentlyTimer);
      this._dragRecentlyTimer = setTimeout(() => {
        this.wasDraggedRecently = false;
      }, 300);

      // فيزياء الإفلات: تجاوز 20% من عرض الشاشة أو سرعة سحب خاطفة (Flick)
      const absDx = Math.abs(this.currentX - this.startX);
      const isFlick = (this.direction === 'next' && this.velocity > 0.22) ||
        (this.direction === 'prev' && this.velocity < -0.22);
      const shouldComplete = (this.transitionMode === 'slide' ? (absDx > (dom.pageWrapper ? dom.pageWrapper.offsetWidth : 300) * 0.2) : (this.progress > 0.25)) || isFlick;

      this.snapAndFinish(shouldComplete);
    },

    handleCancel() {
      this.isCandidate = false;
      if (this.isDragging) {
        this.isDragging = false;
        this.wasDraggedRecently = true;
        clearTimeout(this._dragRecentlyTimer);
        this._dragRecentlyTimer = setTimeout(() => {
          this.wasDraggedRecently = false;
        }, 300);
        this.snapAndFinish(false);
      }
    },

    prepareUnderlay(targetPage) {
      if (!dom.qcfUnderlayContainer) return;
      dom.qcfUnderlayContainer.innerHTML = '';
      const isLandscape = isLandscapeMode();
      dom.qcfUnderlayContainer.classList.toggle('is-spread', isLandscape);

      // نسخ مقياس الخط فوراً دون استدعاء getComputedStyle لمنع أي تعليق أو اهتزاز
      if (dom.qcfContainer) {
        const curFont = dom.qcfContainer.style.getPropertyValue('--qcf-font-size');
        if (curFont) {
          dom.qcfUnderlayContainer.style.setProperty('--qcf-font-size', curFont);
        }
      }

      try {
        if (isLandscape) {
          const spread = getSpreadPages(targetPage);
          const rightCached = pageColumnCache.get(spread.right);
          const leftCached = spread.left ? pageColumnCache.get(spread.left) : null;
          if (rightCached && (!spread.left || leftCached)) {
            const rightCol = rightCached.col.cloneNode(true);
            rightCol.classList.add('qcf-page-right');
            dom.qcfUnderlayContainer.appendChild(rightCol);
            const spine = document.createElement('div');
            spine.className = 'mushaf-book-spine';
            dom.qcfUnderlayContainer.appendChild(spine);
            if (leftCached) {
              const leftCol = leftCached.col.cloneNode(true);
              leftCol.classList.add('qcf-page-left');
              dom.qcfUnderlayContainer.appendChild(leftCol);
            }
            adjustQcfFontSize(dom.qcfUnderlayContainer);
            fitSurahHeaders(dom.qcfUnderlayContainer);
            return;
          }
          Promise.all([
            getCachedPageColumn(spread.right),
            spread.left ? getCachedPageColumn(spread.left) : Promise.resolve(null)
          ]).then(([rightRes, leftRes]) => {
            if (dom.qcfUnderlayContainer && !dom.qcfUnderlayContainer.hasChildNodes()) {
              if (rightRes && rightRes.col) {
                rightRes.col.classList.add('qcf-page-right');
                dom.qcfUnderlayContainer.appendChild(rightRes.col);
              }
              const spine = document.createElement('div');
              spine.className = 'mushaf-book-spine';
              dom.qcfUnderlayContainer.appendChild(spine);
              if (leftRes && leftRes.col) {
                leftRes.col.classList.add('qcf-page-left');
                dom.qcfUnderlayContainer.appendChild(leftRes.col);
              }
              adjustQcfFontSize(dom.qcfUnderlayContainer);
              fitSurahHeaders(dom.qcfUnderlayContainer);
            }
          }).catch(err => console.warn('Error in prepareUnderlay fallback:', err));
        } else {
          const cached = pageColumnCache.get(targetPage);
          if (cached && cached.col) {
            const col = cached.col.cloneNode(true);
            col.classList.add('qcf-page-single');
            dom.qcfUnderlayContainer.appendChild(col);
            adjustQcfFontSize(dom.qcfUnderlayContainer);
            fitSurahHeaders(dom.qcfUnderlayContainer);
            return;
          }
          getCachedPageColumn(targetPage).then(res => {
            if (res && res.col && dom.qcfUnderlayContainer && !dom.qcfUnderlayContainer.hasChildNodes()) {
              res.col.classList.add('qcf-page-single');
              dom.qcfUnderlayContainer.appendChild(res.col);
              adjustQcfFontSize(dom.qcfUnderlayContainer);
              fitSurahHeaders(dom.qcfUnderlayContainer);
            }
          }).catch(err => console.warn('Error in prepareUnderlay fallback:', err));
        }
      } catch (err) {
        console.warn('Error in prepareUnderlay:', err);
      }
    },

    renderFrame(progress, cornerYRatio, direction) {
      if (!dom.pageWrapper || !dom.pageStage) return;
      const W = dom.pageWrapper.offsetWidth || 400;
      const p = Math.max(0, Math.min(1, progress));

      let X_top, X_bottom;
      const tiltAngle = (cornerYRatio - 0.5) * 50 * (1 - Math.abs(p - 0.5) * 1.5);

      if (direction === 'next') {
        // سحب من اليسار لليمين: الورقة تطوى كاشفة الصفحة التالية تحتها
        const X_mid = p * W;
        X_top = Math.max(0, Math.min(W, X_mid + tiltAngle));
        X_bottom = Math.max(0, Math.min(W, X_mid - tiltAngle));

        const pageClip = `polygon(${X_top}px 0px, 100% 0px, 100% 100%, ${X_bottom}px 100%)`;
        dom.pageStage.style.clipPath = pageClip;
        dom.pageStage.style.webkitClipPath = pageClip;

        if (dom.curlUnderlayShadow) {
          const shadowWidth = Math.min(48, Math.max(12, X_mid * 0.45));
          const shadowLeftTop = Math.max(0, X_top - shadowWidth);
          const shadowLeftBottom = Math.max(0, X_bottom - shadowWidth);
          const shadowClip = `polygon(${shadowLeftTop}px 0px, ${X_top}px 0px, ${X_bottom}px 100%, ${shadowLeftBottom}px 100%)`;
          dom.curlUnderlayShadow.style.clipPath = shadowClip;
          dom.curlUnderlayShadow.style.webkitClipPath = shadowClip;
          dom.curlUnderlayShadow.style.background = `linear-gradient(to left, rgba(0,0,0,${0.38 * Math.sin(p * Math.PI) + 0.1}) 0%, rgba(0,0,0,0.12) 45%, transparent 100%)`;
        }

        if (dom.curlFlapBody) {
          const flapWidth = Math.min(110, Math.max(15, (W - X_mid) * 0.65, X_mid * 0.75)) * (0.35 + 0.65 * Math.sin(p * Math.PI));
          const flapRightTop = Math.min(W, X_top + flapWidth);
          const flapRightBottom = Math.min(W, X_bottom + flapWidth);
          const flapClip = `polygon(${X_top}px 0px, ${flapRightTop}px 0px, ${flapRightBottom}px 100%, ${X_bottom}px 100%)`;
          dom.curlFlapBody.style.clipPath = flapClip;
          dom.curlFlapBody.style.webkitClipPath = flapClip;
        }

        if (dom.curlCreaseShadow) {
          const flapWidth = Math.min(110, Math.max(15, (W - X_mid) * 0.65, X_mid * 0.75)) * (0.35 + 0.65 * Math.sin(p * Math.PI));
          const creaseLeftTop = Math.min(W, X_top + flapWidth);
          const creaseLeftBottom = Math.min(W, X_bottom + flapWidth);
          const creaseRightTop = Math.min(W, creaseLeftTop + 24);
          const creaseRightBottom = Math.min(W, creaseLeftBottom + 24);
          const creaseClip = `polygon(${creaseLeftTop}px 0px, ${creaseRightTop}px 0px, ${creaseRightBottom}px 100%, ${creaseLeftBottom}px 100%)`;
          dom.curlCreaseShadow.style.clipPath = creaseClip;
          dom.curlCreaseShadow.style.webkitClipPath = creaseClip;
          dom.curlCreaseShadow.style.background = `linear-gradient(to right, rgba(0,0,0,${0.28 * Math.sin(p * Math.PI) + 0.05}) 0%, rgba(0,0,0,0.08) 40%, transparent 100%)`;
        }
      } else {
        // سحب من اليمين لليسار: الورقة تطوى كاشفة الصفحة السابقة تحتها
        const X_mid = W - (p * W);
        X_top = Math.max(0, Math.min(W, X_mid - tiltAngle));
        X_bottom = Math.max(0, Math.min(W, X_mid + tiltAngle));

        const pageClip = `polygon(0px 0px, ${X_top}px 0px, ${X_bottom}px 100%, 0px 100%)`;
        dom.pageStage.style.clipPath = pageClip;
        dom.pageStage.style.webkitClipPath = pageClip;

        if (dom.curlUnderlayShadow) {
          const shadowWidth = Math.min(48, Math.max(12, (W - X_mid) * 0.45));
          const shadowRightTop = Math.min(W, X_top + shadowWidth);
          const shadowRightBottom = Math.min(W, X_bottom + shadowWidth);
          const shadowClip = `polygon(${X_top}px 0px, ${shadowRightTop}px 0px, ${shadowRightBottom}px 100%, ${X_bottom}px 100%)`;
          dom.curlUnderlayShadow.style.clipPath = shadowClip;
          dom.curlUnderlayShadow.style.webkitClipPath = shadowClip;
          dom.curlUnderlayShadow.style.background = `linear-gradient(to right, rgba(0,0,0,${0.38 * Math.sin(p * Math.PI) + 0.1}) 0%, rgba(0,0,0,0.12) 45%, transparent 100%)`;
        }

        if (dom.curlFlapBody) {
          const flapWidth = Math.min(110, Math.max(15, X_mid * 0.65, (W - X_mid) * 0.75)) * (0.35 + 0.65 * Math.sin(p * Math.PI));
          const flapLeftTop = Math.max(0, X_top - flapWidth);
          const flapLeftBottom = Math.max(0, X_bottom - flapWidth);
          const flapClip = `polygon(${flapLeftTop}px 0px, ${X_top}px 0px, ${X_bottom}px 100%, ${flapLeftBottom}px 100%)`;
          dom.curlFlapBody.style.clipPath = flapClip;
          dom.curlFlapBody.style.webkitClipPath = flapClip;
        }

        if (dom.curlCreaseShadow) {
          const flapWidth = Math.min(110, Math.max(15, X_mid * 0.65, (W - X_mid) * 0.75)) * (0.35 + 0.65 * Math.sin(p * Math.PI));
          const creaseRightTop = Math.max(0, X_top - flapWidth);
          const creaseRightBottom = Math.max(0, X_bottom - flapWidth);
          const creaseLeftTop = Math.max(0, creaseRightTop - 24);
          const creaseLeftBottom = Math.max(0, creaseRightBottom - 24);
          const creaseClip = `polygon(${creaseLeftTop}px 0px, ${creaseRightTop}px 0px, ${creaseRightBottom}px 100%, ${creaseLeftBottom}px 100%)`;
          dom.curlCreaseShadow.style.clipPath = creaseClip;
          dom.curlCreaseShadow.style.webkitClipPath = creaseClip;
          dom.curlCreaseShadow.style.background = `linear-gradient(to left, rgba(0,0,0,${0.28 * Math.sin(p * Math.PI) + 0.05}) 0%, rgba(0,0,0,0.08) 40%, transparent 100%)`;
        }
      }
    },

    snapAndFinish(shouldComplete) {
      this.isAnimating = true;
      if (this.rafId) cancelAnimationFrame(this.rafId);

      const tPage = this.targetPage;
      const dir = this.direction;
      const W = (dom.pageWrapper ? dom.pageWrapper.offsetWidth : 0) || window.innerWidth;

      if (this.transitionMode === 'slide') {
        const duration = shouldComplete ? 260 : 200;
        const curve = 'cubic-bezier(0.25, 1, 0.5, 1)';
        dom.pageStage.style.transition = `transform ${duration}ms ${curve}`;
        dom.underlayStage.style.transition = `transform ${duration}ms ${curve}`;

        if (shouldComplete) {
          if (dir === 'next') {
            dom.pageStage.style.transform = `translate3d(${W}px, 0, 0)`;
            dom.underlayStage.style.transform = `translate3d(0, 0, 0)`;
          } else {
            dom.pageStage.style.transform = `translate3d(${-W}px, 0, 0)`;
            dom.underlayStage.style.transform = `translate3d(0, 0, 0)`;
          }
        } else {
          dom.pageStage.style.transform = `translate3d(0, 0, 0)`;
          if (dir === 'next') {
            dom.underlayStage.style.transform = `translate3d(${-W}px, 0, 0)`;
          } else {
            dom.underlayStage.style.transform = `translate3d(${W}px, 0, 0)`;
          }
        }

        setTimeout(async () => {
          if (shouldComplete) {
            await loadPage(tPage, { silentAnimation: true });
          }
          this.cleanupCurl();
          this.isAnimating = false;
        }, duration + 15);
        return;
      }

      const startP = this.progress;
      const targetP = shouldComplete ? 1.0 : 0.0;
      const duration = shouldComplete ? 280 : 220;
      const startTime = performance.now();
      const corner = this.cornerYRatio;

      const easeOut = (t) => 1 - Math.pow(1 - t, 3);

      const anim = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const curP = startP + (targetP - startP) * easeOut(t);
        this.progress = curP;
        this.renderFrame(curP, corner, dir);

        if (t < 1) {
          this.rafId = requestAnimationFrame(anim);
        } else {
          (async () => {
            if (shouldComplete) {
              await loadPage(tPage, { silentAnimation: true });
            }
            this.cleanupCurl();
            this.isAnimating = false;
          })();
        }
      };

      this.rafId = requestAnimationFrame(anim);
    },

    cleanupCurl() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      if (dom.pageStage) {
        dom.pageStage.style.clipPath = '';
        dom.pageStage.style.webkitClipPath = '';
        dom.pageStage.style.transform = '';
        dom.pageStage.style.transition = '';
        dom.pageStage.style.zIndex = '';
      }
      if (dom.curlLeaf) {
        dom.curlLeaf.style.display = 'none';
      }
      if (dom.underlayStage) {
        dom.underlayStage.style.display = 'none';
        dom.underlayStage.style.transform = '';
        dom.underlayStage.style.transition = '';
        dom.underlayStage.style.zIndex = '';
      }
      if (dom.qcfUnderlayContainer) {
        dom.qcfUnderlayContainer.innerHTML = '';
      }
      this.isDragging = false;
      this.isCandidate = false;
      this.direction = null;
      this.progress = 0;
    },

    async triggerAutoCurl(direction) {
      if (this.isAnimating || this.isDragging) return;
      const isLandscape = isLandscapeMode();
      const step = isLandscape ? 2 : 1;
      let target = 0;
      if (direction === 'next') {
        target = MushafState.currentPage + step;
        if (target > 604) return;
      } else {
        target = MushafState.currentPage - step;
        if (target < 1) return;
      }

      this.direction = direction;
      this.targetPage = target;
      this.cornerYRatio = 0.5;
      this.transitionMode = 'curl';
      this.isAnimating = true;

      if (dom.underlayStage) dom.underlayStage.style.display = 'block';
      if (dom.curlLeaf) dom.curlLeaf.style.display = 'block';
      await this.prepareUnderlay(target);

      this.progress = 0;
      this.snapAndFinish(true);
    }
  };

  // --- EVENT ATTACHMENTS ---

  function attachEventListeners() {
    // Spacebar shortcut in blind recitation mode to reveal & advance
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (MushafState.maskMode === 'verse' || MushafState.isReciting) {
          e.preventDefault();
          handleAyahCompleted();
        }
      }
    });

    // Next Page
    if (dom.nextPageBtn) {
      dom.nextPageBtn.addEventListener('click', turnPageForward);
    }

    // Previous Page
    if (dom.prevPageBtn) {
      dom.prevPageBtn.addEventListener('click', turnPageBackward);
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

    // Blind Recitation Mode Toggle Button in Player
    if (dom.toggleBlindModeBtn) {
      dom.toggleBlindModeBtn.addEventListener('click', () => {
        toggleMaskMode();
      });
    }

    // Reveal & Skip Ayah Button (كشف الآية والتخطي)
    if (dom.recitationRevealAyahBtn) {
      dom.recitationRevealAyahBtn.addEventListener('click', () => {
        handleAyahCompleted();
      });
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

    // تفعيل تفويض الأحداث لكلمات وصفحات المصحف
    initQcfContainerEvents();

    // تفعيل نظام تقليب وانثناء صفحات المصحف التفاعلي (Interactive Realistic Page Curl)
    if (typeof InteractivePageCurl !== 'undefined') {
      InteractivePageCurl.init();
    }

    if (dom.pageWrapper) {
      // النقر على حواف الصفحة والوسط
      dom.pageWrapper.addEventListener('click', (e) => {
        if (typeof InteractivePageCurl !== 'undefined' && (InteractivePageCurl.isDragging || InteractivePageCurl.isAnimating || InteractivePageCurl.wasDraggedRecently)) return;
        if (e.target.closest('.ayah-poly') || e.target.closest('button') || e.target.closest('.word-mask-rect') || e.target.closest('.qcf-word') || e.target.closest('.qcf-surah-header-box') || e.target.closest('#mushafPageBottomBar')) return;
        const rect = dom.pageWrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        if (clickX < width * 0.22) {
          // Tap Left (النقر على الحافة اليسرى) -> الصفحة التالية في الاتجاه العربي (RTL)
          turnPageForward();
        } else if (clickX > width * 0.78) {
          // Tap Right (النقر على الحافة اليمنى) -> الصفحة السابقة في الاتجاه العربي (RTL)
          turnPageBackward();
        } else {
          // النقر في وسط الصفحة يبدّل ظهور الشريط العلوي ومشغل الصوت العائم (في الوضع العادي فقط)
          toggleTopBar();
          if (!MushafState.maskMode || MushafState.maskMode === 'none') {
            toggleFloatingPlayer();
          }
        }
      });
    }

    if (dom.topBar) {
      dom.topBar.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Keyboard Arrow Keys (Laptop / Desktop)
    window.addEventListener('keydown', (e) => {
      if (dom.view && dom.view.classList.contains('active')) {
        if (e.key === 'ArrowRight') {
          turnPageForward();
        } else if (e.key === 'ArrowLeft') {
          turnPageBackward();
        }
      }
    });
  }

  // Expose module globally
  function playReciterRange(surah, fromAyah, toAyah, repeatCount = 1) {
    const sId = parseInt(surah, 10) || 1;
    const fA = parseInt(fromAyah, 10) || 1;
    const tA = parseInt(toAyah, 10) || fA;

    ReciterPlayer.masterRepeatEnabled = (repeatCount > 1);
    ReciterPlayer.rangeRepeatCount = repeatCount || 1;
    ReciterPlayer.ayahRepeatCount = 1;
    ReciterPlayer.ayahRangeStart = fA;
    ReciterPlayer.ayahRangeEnd = tA;
    ReciterPlayer.rangeCurrentPlayed = 0;
    ReciterPlayer.ayahCurrentPlayed = 0;
    ReciterPlayer.ayahRangeEnabled = true;
    ReciterPlayer.ayahRangeStartPage = getAyahPageNumber(sId, fA) || MushafState.currentPage;

    // إظهار مشغل الصوت العائم ليتمكن المستخدم من اختيار القارئ وتغييره وإيقاف/تشغيل الصوت
    toggleFloatingPlayer(true);

    const targetPage = getAyahPageNumber(sId, fA);
    if (targetPage && !isPageCurrentlyVisible(targetPage)) {
      loadPage(targetPage).then(() => {
        playReciterAyah(sId, fA);
      });
    } else {
      playReciterAyah(sId, fA);
    }
  }

  function onTabActivated() {
    if (!dom.qcfContainer) return;
    const curPage = MushafState.currentPage || 1;
    const hasMounted = Boolean(dom.qcfContainer.querySelector('.qcf-page-column'));
    if (!hasMounted) {
      loadPage(curPage, { noAnimation: true });
      return;
    }
    adjustQcfFontSize();
    fitSurahHeaders();
    requestAnimationFrame(() => {
      adjustQcfFontSize();
      fitSurahHeaders();
    });
    preloadAdjacentPages(curPage);
  }

  window.MushafViewer = {
    init: initMushaf,
    loadPage: loadPage,
    onTabActivated: onTabActivated,
    getState: () => MushafState,
    normalizeText: normalizeArabicText,
    startRecitation: startRecitation,
    stopRecitation: stopRecitation,
    toggleMaskMode: toggleMaskMode,
    setMaskMode: setMaskMode,
    openDrawer: openSurahDrawer,
    closeDrawer: closeSurahDrawer,
    toggleFloatingPlayer: toggleFloatingPlayer,
    toggleTopBar: toggleTopBar,
    showTopBar: showTopBar,
    hideTopBar: hideTopBar,
    playReciterRange: playReciterRange,
    pauseReciterAudio: pauseReciterAudio,
    stopPlayback: stopCurrentPlayback,
    isReciterPlaying: () => Boolean(ReciterPlayer && ReciterPlayer.isPlaying),
    getCurrentReciterAyah: () => (ReciterPlayer ? { surah: ReciterPlayer.currentSurah, ayah: ReciterPlayer.currentAyah } : null)
  };

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMushaf);
  } else {
    initMushaf();
  }

})();