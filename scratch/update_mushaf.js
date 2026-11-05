const fs = require('fs');

let mushafJs = fs.readFileSync('js/mushaf.js', 'utf8');

// 1. Add qcfPageContainer to dom references
const oldDomInit = "overlaySvg: document.getElementById('mushafOverlaySvg'),";
const newDomInit = `overlaySvg: document.getElementById('mushafOverlaySvg'),
      qcfContainer: document.getElementById('qcfPageContainer'),`;
if (!mushafJs.includes(newDomInit)) {
  mushafJs = mushafJs.replace(oldDomInit, newDomInit);
}

// 2. Add QCF cache & state in MushafState
const oldState = "verseTextCache: new Map(),";
const newState = `verseTextCache: new Map(),
    qcfDataCache: new Map(),
    qcfFontsLoaded: new Set(),
    pageQcfWords: [],`;
if (!mushafJs.includes(newState)) {
  mushafJs = mushafJs.replace(oldState, newState);
}

// 3. Define QCF Font Loader & QCF Page Words Loader & 15-Lines Renderer
const qcfCodeBlock = `
  // --- QCF V1 (1405 AH) 15-LINES ENGINE ---

  async function loadQCFFont(pageNum) {
    const fontName = 'p' + pageNum + '-v1';
    if (MushafState.qcfFontsLoaded.has(fontName)) return true;
    try {
      const fontUrl = 'https://verses.quran.foundation/fonts/quran/hafs/v1/woff2/p' + pageNum + '.woff2';
      const fontFace = new FontFace(fontName, 'url(' + fontUrl + ')');
      const loaded = await fontFace.load();
      document.fonts.add(loaded);
      MushafState.qcfFontsLoaded.add(fontName);
      return true;
    } catch (e) {
      console.warn('Failed to load QCF font for page ' + pageNum, e);
      return false;
    }
  }

  async function fetchQCFPageData(pageNum) {
    if (MushafState.qcfDataCache.has(pageNum)) {
      return MushafState.qcfDataCache.get(pageNum);
    }
    const url = 'https://api.quran.com/api/v4/verses/by_page/' + pageNum + '?words=true&word_fields=code_v1,text_imlaei,line_number,location&mushaf=2';
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        MushafState.qcfDataCache.set(pageNum, json);
        return json;
      }
    } catch (e) {
      console.warn('Error fetching QCF data for page ' + pageNum, e);
    }
    return null;
  }

  function getSurahNameById(id) {
    if (window.getSurahById) {
      const s = window.getSurahById(id);
      if (s) return s.name;
    }
    if (window.QURAN_SURAHS) {
      const s = window.QURAN_SURAHS.find(x => x.id === id);
      if (s) return s.name;
    }
    return '';
  }

  async function renderQCFPage15Lines(pageNum) {
    if (!dom.qcfContainer) return;
    const fontLoadedPromise = loadQCFFont(pageNum);
    const qcfData = await fetchQCFPageData(pageNum);

    if (!qcfData || !qcfData.verses) {
      return;
    }

    await fontLoadedPromise;

    const fontName = 'p' + pageNum + '-v1';
    dom.qcfContainer.style.fontFamily = "'" + fontName + "', 'Times New Roman', serif";
    dom.qcfContainer.innerHTML = '';

    // Group words into 15 lines (line_number 1 to 15)
    const lines = {};
    for (let l = 1; l <= 15; l++) lines[l] = [];

    const allWords = [];

    qcfData.verses.forEach(v => {
      if (!v.words) return;
      v.words.forEach(w => {
        const lineNum = w.line_number || 1;
        if (!lines[lineNum]) lines[lineNum] = [];
        lines[lineNum].push(w);
        allWords.push(w);
      });
    });

    MushafState.pageQcfWords = allWords;

    // Check if any surahs start on this page to render their headers on empty lines
    const surahsOnThisPage = (window.QURAN_SURAHS || []).filter(s => s.startPage === pageNum);

    for (let l = 1; l <= 15; l++) {
      const lineWords = lines[l] || [];

      if (!lineWords.length) {
        // Line has no words: check if it represents a Surah Header or Basmalah
        if (pageNum === 1 && l === 1) {
          const headerRow = document.createElement('div');
          headerRow.className = 'qcf-surah-header-line';
          headerRow.innerHTML = '<div class="qcf-surah-header-frame">سورة الفاتحة</div>';
          dom.qcfContainer.appendChild(headerRow);
          continue;
        } else if (pageNum === 2 && l === 1) {
          const headerRow = document.createElement('div');
          headerRow.className = 'qcf-surah-header-line';
          headerRow.innerHTML = '<div class="qcf-surah-header-frame">سورة البقرة</div>';
          dom.qcfContainer.appendChild(headerRow);
          continue;
        } else if (pageNum === 2 && l === 2) {
          const bismillahRow = document.createElement('div');
          bismillahRow.className = 'qcf-line qcf-line-center';
          bismillahRow.innerHTML = '<span class="qcf-word qcf-unmasked" style="font-family:p1-v1">ﭑ ﭒ ﭓ ﭔ</span>';
          dom.qcfContainer.appendChild(bismillahRow);
          continue;
        } else if (surahsOnThisPage.length > 0 && l <= 2) {
          const s = surahsOnThisPage[0];
          if (l === 1) {
            const headerRow = document.createElement('div');
            headerRow.className = 'qcf-surah-header-line';
            headerRow.innerHTML = '<div class="qcf-surah-header-frame">سورة ' + s.name + '</div>';
            dom.qcfContainer.appendChild(headerRow);
            continue;
          } else if (l === 2 && s.id !== 9) {
            const bismillahRow = document.createElement('div');
            bismillahRow.className = 'qcf-line qcf-line-center';
            bismillahRow.innerHTML = '<span class="qcf-word qcf-unmasked" style="font-family:p1-v1">ﭑ ﭒ ﭓ ﭔ</span>';
            dom.qcfContainer.appendChild(bismillahRow);
            continue;
          }
        }
      }

      const lineRow = document.createElement('div');
      lineRow.className = 'qcf-line';
      lineRow.setAttribute('data-line', l);
      if (lineWords.length <= 4 && (l === 15 || l === 8)) {
        lineRow.classList.add('qcf-line-center');
      }

      lineWords.forEach((word) => {
        const span = document.createElement('span');
        span.className = 'qcf-word';
        if (word.char_type_name === 'end') {
          span.classList.add('qcf-ayah-end');
        }
        span.textContent = word.code_v1 || '';
        span.setAttribute('data-loc', word.location || '');
        span.setAttribute('data-page', pageNum);
        span.setAttribute('data-line', l);
        span.setAttribute('data-type', word.char_type_name || 'word');
        span.setAttribute('data-text', word.text_imlaei || '');

        const locParts = (word.location || '').split(':');
        const sNum = parseInt(locParts[0] || '1', 10);
        const aNum = parseInt(locParts[1] || '1', 10);
        const wIdx = parseInt(locParts[2] || '1', 10) - 1;
        span.setAttribute('data-surah', sNum);
        span.setAttribute('data-ayah', aNum);
        span.setAttribute('data-word-idx', wIdx);

        // Click to reveal or select ayah
        span.addEventListener('click', (e) => {
          e.stopPropagation();
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
          }
        });

        lineRow.appendChild(span);
      });

      dom.qcfContainer.appendChild(lineRow);
    }

    if (dom.pageWrapper) {
      dom.pageWrapper.classList.add('qcf-mode-active');
    }

    syncQcfWordsDisplay();
  }

  function syncQcfWordsDisplay() {
    if (!dom.qcfContainer) return;
    const isMasked = MushafState.maskMode && MushafState.maskMode !== 'none';

    dom.qcfContainer.querySelectorAll('.qcf-word').forEach(span => {
      const sNum = parseInt(span.getAttribute('data-surah'), 10);
      const aNum = parseInt(span.getAttribute('data-ayah'), 10);
      const wIdx = parseInt(span.getAttribute('data-word-idx'), 10);
      const verseKey = sNum + ':' + aNum;

      // Check errors
      const errSet = MushafState.wordErrors.get(verseKey);
      if (errSet && errSet.has(wIdx)) {
        span.classList.add('word-error');
      } else {
        span.classList.remove('word-error');
      }

      if (!isMasked) {
        span.classList.remove('revealed', 'current-recite-word', 'active-selection');
        if (sNum === MushafState.activeSurahId && aNum === MushafState.activeAyahNum) {
          span.classList.add('active-selection');
        }
        return;
      }

      // In Mask / Blind Recitation mode:
      if (sNum === 1 && aNum === 1) {
        span.classList.add('qcf-unmasked');
        return;
      }

      if (MushafState.unmaskedVerses && MushafState.unmaskedVerses.has(verseKey)) {
        span.classList.add('revealed');
        return;
      }

      if (sNum === MushafState.activeSurahId && aNum === MushafState.activeAyahNum) {
        if (wIdx < MushafState.wordPointerIndex) {
          span.classList.add('revealed');
        } else {
          span.classList.remove('revealed');
        }
        if (wIdx === MushafState.wordPointerIndex) {
          span.classList.add('current-recite-word');
        } else {
          span.classList.remove('current-recite-word');
        }
      } else {
        span.classList.remove('revealed', 'current-recite-word');
      }
    });
  }
`;

// Insert the QCF helper functions before loadPage
if (!mushafJs.includes('function renderQCFPage15Lines')) {
  mushafJs = mushafJs.replace('async function loadPage(pageNum) {', qcfCodeBlock + '\n\n  async function loadPage(pageNum) {');
}

// In loadPage, call renderQCFPage15Lines(pageNum)
const oldRenderCall = "renderPolygonsOverlay(MushafState.pagePolygons);";
const newRenderCall = `renderPolygonsOverlay(MushafState.pagePolygons);
      renderQCFPage15Lines(pageNum);`;
if (!mushafJs.includes("renderQCFPage15Lines(pageNum);")) {
  mushafJs = mushafJs.replace(oldRenderCall, newRenderCall);
}

// In updateWordMasksState, also sync QCF words
const oldUpdateWordMasks = "function updateWordMasksState() {";
const newUpdateWordMasks = `function updateWordMasksState() {
    syncQcfWordsDisplay();`;
if (!mushafJs.includes("function updateWordMasksState() {\r\n    syncQcfWordsDisplay();") && !mushafJs.includes("function updateWordMasksState() {\n    syncQcfWordsDisplay();")) {
  mushafJs = mushafJs.replace(oldUpdateWordMasks, newUpdateWordMasks);
}

// In renderWordErrorMarks, also sync QCF words
const oldRenderErrors = "function renderWordErrorMarks() {";
const newRenderErrors = `function renderWordErrorMarks() {
    syncQcfWordsDisplay();`;
if (!mushafJs.includes("function renderWordErrorMarks() {\r\n    syncQcfWordsDisplay();") && !mushafJs.includes("function renderWordErrorMarks() {\n    syncQcfWordsDisplay();")) {
  mushafJs = mushafJs.replace(oldRenderErrors, newRenderErrors);
}

// In highlightActiveAyahPolygon, also sync QCF words
const oldHighlightActive = "renderWordErrorMarks();\r\n  }";
const oldHighlightActiveLF = "renderWordErrorMarks();\n  }";
const newHighlightActive = `renderWordErrorMarks();
    syncQcfWordsDisplay();
  }`;

if (mushafJs.includes(oldHighlightActive)) {
  mushafJs = mushafJs.replace(oldHighlightActive, newHighlightActive);
} else if (mushafJs.includes(oldHighlightActiveLF)) {
  mushafJs = mushafJs.replace(oldHighlightActiveLF, newHighlightActive);
}

// In setMaskMode, also sync QCF words
const oldSetMaskMode = "highlightActiveAyahPolygon();\r\n  }";
const oldSetMaskModeLF = "highlightActiveAyahPolygon();\n  }";
const newSetMaskMode = `highlightActiveAyahPolygon();
    syncQcfWordsDisplay();
  }`;
if (mushafJs.includes(oldSetMaskMode)) {
  mushafJs = mushafJs.replace(oldSetMaskMode, newSetMaskMode);
} else if (mushafJs.includes(oldSetMaskModeLF)) {
  mushafJs = mushafJs.replace(oldSetMaskModeLF, newSetMaskMode);
}

fs.writeFileSync('js/mushaf.js', mushafJs, 'utf8');
console.log('js/mushaf.js updated with QCF 15-lines engine successfully');

