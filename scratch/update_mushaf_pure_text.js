const fs = require('fs');

let mushafJs = fs.readFileSync('js/mushaf.js', 'utf8');

// 1. Replace the QCF block with the enhanced pure text QUL engine
const startMarker = '// --- QCF V1 (1405 AH) 15-LINES ENGINE ---';
const endMarker = 'async function loadPage(pageNum) {';

const idxStart = mushafJs.indexOf(startMarker);
const idxEnd = mushafJs.indexOf(endMarker);

if (idxStart === -1 || idxEnd === -1) {
  console.error('Markers not found!');
  process.exit(1);
}

const newQcfEngine = `// --- QCF V1 (1405 AH) 15-LINES PURE TEXT ENGINE (TARTEEL QUL LAYOUT) ---

  async function loadQCFFont(pageNum) {
    const fontName = 'p' + pageNum + '-v1';
    if (MushafState.qcfFontsLoaded.has(fontName)) return true;
    try {
      // Primary: Tarteel QUL CDN (v1-optimized woff2), Fallback: Quran Foundation
      const fontUrlPrimary = 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v1-optimized/woff2/p' + pageNum + '.woff2?v=3.2';
      const fontUrlFallback = 'https://verses.quran.foundation/fonts/quran/hafs/v1/woff2/p' + pageNum + '.woff2';

      let fontFace = new FontFace(fontName, 'url(' + fontUrlPrimary + ')');
      try {
        const loaded = await fontFace.load();
        document.fonts.add(loaded);
        MushafState.qcfFontsLoaded.add(fontName);
        return true;
      } catch (e1) {
        fontFace = new FontFace(fontName, 'url(' + fontUrlFallback + ')');
        const loaded = await fontFace.load();
        document.fonts.add(loaded);
        MushafState.qcfFontsLoaded.add(fontName);
        return true;
      }
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

  function getSurahsStartingOnPage(pageNum) {
    if (!window.QURAN_SURAHS) return [];
    return window.QURAN_SURAHS.filter(s => s.startPage === pageNum);
  }

  async function renderQCFPage15Lines(pageNum) {
    if (!dom.qcfContainer) return;

    // Reset container and show clean loading state
    dom.qcfContainer.innerHTML = '';
    const fontName = 'p' + pageNum + '-v1';

    const fontLoadedPromise = loadQCFFont(pageNum);
    const qcfData = await fetchQCFPageData(pageNum);

    if (!qcfData || !qcfData.verses) {
      return;
    }

    await fontLoadedPromise;

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

    // Surahs starting on this page
    const startingSurahs = getSurahsStartingOnPage(pageNum);

    for (let l = 1; l <= 15; l++) {
      const lineWords = lines[l] || [];

      // Check if this line is a Surah Header or Basmalah
      if (!lineWords.length) {
        if (pageNum === 1 && l === 1) {
          const headerRow = document.createElement('div');
          headerRow.className = 'qcf-surah-header-line';
          headerRow.innerHTML = '<div class="qcf-surah-header-box"><span class="qcf-surah-title-text">سورة الفاتحة</span></div>';
          dom.qcfContainer.appendChild(headerRow);
          continue;
        } else if (pageNum === 2 && l === 1) {
          const headerRow = document.createElement('div');
          headerRow.className = 'qcf-surah-header-line';
          headerRow.innerHTML = '<div class="qcf-surah-header-box"><span class="qcf-surah-title-text">سورة البقرة</span></div>';
          dom.qcfContainer.appendChild(headerRow);
          continue;
        } else if (pageNum === 2 && l === 2) {
          const bismillahRow = document.createElement('div');
          bismillahRow.className = 'qcf-bismillah-line';
          bismillahRow.innerHTML = '﷽';
          dom.qcfContainer.appendChild(bismillahRow);
          continue;
        } else if (startingSurahs.length > 0) {
          const s = startingSurahs[0];
          if (l === 1) {
            const headerRow = document.createElement('div');
            headerRow.className = 'qcf-surah-header-line';
            headerRow.innerHTML = '<div class="qcf-surah-header-box"><span class="qcf-surah-title-text">سورة ' + s.name + '</span></div>';
            dom.qcfContainer.appendChild(headerRow);
            continue;
          } else if (l === 2) {
            if (s.id !== 9) { // سورة التوبة لا بسملة فيها
              const bismillahRow = document.createElement('div');
              bismillahRow.className = 'qcf-bismillah-line';
              bismillahRow.innerHTML = '﷽';
              dom.qcfContainer.appendChild(bismillahRow);
            }
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

        // Click on word: in mask mode reveals / advances, in normal mode selects Ayah
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

        // Long press / right-click to open Ayah action sheet (Tafsir, Audio, Bookmark)
        span.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openAyahActionSheet(sNum, aNum);
        });

        let touchTimer = null;
        span.addEventListener('touchstart', (e) => {
          touchTimer = setTimeout(() => {
            if (navigator.vibrate) try { navigator.vibrate(40); } catch (_) {}
            openAyahActionSheet(sNum, aNum);
          }, 500);
        }, { passive: true });
        span.addEventListener('touchend', () => {
          if (touchTimer) clearTimeout(touchTimer);
        });
        span.addEventListener('touchmove', () => {
          if (touchTimer) clearTimeout(touchTimer);
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
        span.classList.remove('revealed', 'current-recite-word', 'selected-ayah-word', 'reciting-ayah-word');
        if (sNum === MushafState.activeSurahId && aNum === MushafState.activeAyahNum) {
          span.classList.add(MushafState.isReciting ? 'reciting-ayah-word' : 'selected-ayah-word');
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

mushafJs = mushafJs.substring(0, idxStart) + newQcfEngine + mushafJs.substring(idxEnd);

// 2. In loadPage, disable rendering raster images
const oldLoadPageLogic = `      // Render Page Visual (Image)
      renderPageVisual(pad, pageNum);

      // Render Polygons Overlay
      MushafState.pagePolygons = pageData.polygons || [];
      MushafState.pageVerses = pageData.verses || [];
      renderPolygonsOverlay(MushafState.pagePolygons);
      renderQCFPage15Lines(pageNum);`;

const newLoadPageLogic = `      // Pure Digital Text Mushaf 1405H (15 Lines Layout) - Zero images
      MushafState.pagePolygons = pageData.polygons || [];
      MushafState.pageVerses = pageData.verses || [];
      renderQCFPage15Lines(pageNum);`;

if (mushafJs.includes(oldLoadPageLogic)) {
  mushafJs = mushafJs.replace(oldLoadPageLogic, newLoadPageLogic);
  console.log('Updated loadPage logic');
} else {
  console.warn('oldLoadPageLogic not found directly, checking variations');
}

// 3. In catch block of loadPage, remove renderPageVisual(pad, pageNum)
const oldCatch = `    } catch (err) {
      console.warn('Error loading Mushaf page:', err);
      renderPageVisual(pad, pageNum);
    }`;
const newCatch = `    } catch (err) {
      console.warn('Error loading Mushaf page:', err);
      renderQCFPage15Lines(pageNum);
    }`;

if (mushafJs.includes(oldCatch)) {
  mushafJs = mushafJs.replace(oldCatch, newCatch);
  console.log('Updated catch block');
}

// 4. In renderPageVisual, clear image container so no raster images ever load or stay in DOM
const oldRenderVisual = "function renderPageVisual(pad, pageNum) {";
const newRenderVisual = `function renderPageVisual(pad, pageNum) {
    if (dom.imageLayer) dom.imageLayer.innerHTML = '';
    return;`;
if (mushafJs.includes(oldRenderVisual) && !mushafJs.includes(newRenderVisual)) {
  mushafJs = mushafJs.replace(oldRenderVisual, newRenderVisual);
  console.log('Disabled renderPageVisual');
}

fs.writeFileSync('js/mushaf.js', mushafJs, 'utf8');
console.log('js/mushaf.js updated successfully');

