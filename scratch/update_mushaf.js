const fs = require('fs');
let code = fs.readFileSync('js/mushaf.js', 'utf8');

// 1. Update renderDrawerList: replace page badge with eye button
const oldRenderDrawerList = `  function renderDrawerList(surahList) {
    if (!dom.drawerList) return;
    dom.drawerList.innerHTML = '';

    if (!surahList.length) {
      dom.drawerList.innerHTML = \`
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          لا توجد سورة مطابقة لنتيجة البحث
        </div>
      \`;
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

      item.innerHTML = \`
        <div class="drawer-surah-num">\${s.id}</div>
        <div class="drawer-surah-info">
          <div class="drawer-surah-name">سورة \${s.name}</div>
          <div class="drawer-surah-meta">
            <span class="drawer-type-badge \${typeClass}">\${s.type}</span>
            <span>\${s.verses} آية</span>
          </div>
        </div>
        <span class="drawer-surah-page">ص \${s.startPage}</span>
      \`;

      item.addEventListener('click', () => {
        loadPage(s.startPage);
        closeSurahDrawer();
      });

      dom.drawerList.appendChild(item);
    });
  }`;

const newRenderDrawerList = `  function renderDrawerList(surahList) {
    if (!dom.drawerList) return;
    dom.drawerList.innerHTML = '';

    if (!surahList.length) {
      dom.drawerList.innerHTML = \`
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          لا توجد سورة مطابقة لنتيجة البحث
        </div>
      \`;
      return;
    }

    const isBlindActive = MushafState.maskMode && MushafState.maskMode !== 'none';

    surahList.forEach(s => {
      const item = document.createElement('div');
      item.className = 'drawer-surah-item';
      if (s.id === MushafState.activeSurahId) {
        item.classList.add('active');
      }
      item.setAttribute('data-id', s.id);
      item.setAttribute('data-page', s.startPage);

      const typeClass = s.type === 'مكية' ? 'makki' : 'madani';

      item.innerHTML = \`
        <div class="drawer-surah-num">\${s.id}</div>
        <div class="drawer-surah-info">
          <div class="drawer-surah-name">سورة \${s.name}</div>
          <div class="drawer-surah-meta">
            <span class="drawer-type-badge \${typeClass}">\${s.type}</span>
            <span>\${s.verses} آية</span>
          </div>
        </div>
        <button class="drawer-surah-blind-btn\${isBlindActive && s.id === MushafState.activeSurahId ? ' active' : ''}" type="button" title="وضع التسميع والإخفاء لسورة \${s.name}" aria-label="وضع التسميع والإخفاء">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      \`;

      // زر العين: تفعيل وضع الإخفاء والانتقال للسورة
      const blindBtn = item.querySelector('.drawer-surah-blind-btn');
      if (blindBtn) {
        blindBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          setMaskMode('verse');
          loadPage(s.startPage);
          closeSurahDrawer();
          if (window.showToast) {
            window.showToast(\`تم تفعيل وضع التسميع والإخفاء لسورة \${s.name}\`);
          }
        });
      }

      item.addEventListener('click', () => {
        loadPage(s.startPage);
        closeSurahDrawer();
      });

      dom.drawerList.appendChild(item);
    });
  }`;

if (!code.includes(oldRenderDrawerList)) {
  console.error('Could not find oldRenderDrawerList');
} else {
  code = code.replace(oldRenderDrawerList, newRenderDrawerList);
  console.log('Replaced renderDrawerList');
}

// 2. Continuous Verse Highlighting inside renderQCFPage15Lines
const oldLinesLoop = `      lineWords.forEach((word) => {
        const span = document.createElement('span');
        span.className = 'qcf-word';
        if (word.char_type_name === 'end') {
          span.classList.add('qcf-ayah-end');
        }
        if (fontOk) {
          span.style.setProperty('font-family', "'" + fontName + "'", 'important');
          span.innerHTML = word.code_v1 || ''; // رموز QCF تتطلب innerHTML
        } else {
          span.style.setProperty('font-family', "'UthmanicHafs', serif", 'important');
          span.textContent = word.text_qpc_hafs || word.text_imlaei || '';
        }
        span.setAttribute('data-loc', word.location || '');
        span.setAttribute('data-page', pageNum);
        span.setAttribute('data-line', l);
        span.setAttribute('data-type', word.char_type_name || 'word');
        span.setAttribute('data-text', word.text_imlaei || '');

        const locParts = (word.location || '').split(':');
        const vkParts = (word._vk || '').split(':');
        const sNum = parseInt(vkParts[0] || locParts[0] || '1', 10);
        const aNum = parseInt(vkParts[1] || locParts[1] || '1', 10);
        const wIdx = word.position ? word.position - 1 : parseInt(locParts[2] || '1', 10) - 1;
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
            if (navigator.vibrate) try { navigator.vibrate(40); } catch (_) { }
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
      });`;

const newLinesLoop = `      // تجميع الكلمات المتتابعة التي تنتمي لنفس الآية داخل غلاف آية موحد (ayah-container)
      let currentAyahKey = null;
      let currentAyahContainer = null;

      lineWords.forEach((word) => {
        const locParts = (word.location || '').split(':');
        const vkParts = (word._vk || '').split(':');
        const sNum = parseInt(vkParts[0] || locParts[0] || '1', 10);
        const aNum = parseInt(vkParts[1] || locParts[1] || '1', 10);
        const wIdx = word.position ? word.position - 1 : parseInt(locParts[2] || '1', 10) - 1;
        const verseKey = sNum + ':' + aNum;

        if (verseKey !== currentAyahKey || !currentAyahContainer) {
          currentAyahKey = verseKey;
          currentAyahContainer = document.createElement('span');
          currentAyahContainer.className = 'ayah-container';
          currentAyahContainer.setAttribute('data-verse-key', verseKey);
          currentAyahContainer.setAttribute('data-surah', sNum);
          currentAyahContainer.setAttribute('data-ayah', aNum);
          lineRow.appendChild(currentAyahContainer);
        }

        const span = document.createElement('span');
        span.className = 'qcf-word';
        if (word.char_type_name === 'end') {
          span.classList.add('qcf-ayah-end');
        }
        if (fontOk) {
          span.style.setProperty('font-family', "'" + fontName + "'", 'important');
          span.innerHTML = word.code_v1 || ''; // رموز QCF تتطلب innerHTML
        } else {
          span.style.setProperty('font-family', "'UthmanicHafs', serif", 'important');
          span.textContent = word.text_qpc_hafs || word.text_imlaei || '';
        }
        span.setAttribute('data-loc', word.location || '');
        span.setAttribute('data-page', pageNum);
        span.setAttribute('data-line', l);
        span.setAttribute('data-type', word.char_type_name || 'word');
        span.setAttribute('data-text', word.text_imlaei || '');
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
            if (navigator.vibrate) try { navigator.vibrate(40); } catch (_) { }
            openAyahActionSheet(sNum, aNum);
          }, 500);
        }, { passive: true });
        span.addEventListener('touchend', () => {
          if (touchTimer) clearTimeout(touchTimer);
        });
        span.addEventListener('touchmove', () => {
          if (touchTimer) clearTimeout(touchTimer);
        });

        currentAyahContainer.appendChild(span);
      });`;

if (!code.includes(oldLinesLoop)) {
  console.error('Could not find oldLinesLoop');
} else {
  code = code.replace(oldLinesLoop, newLinesLoop);
  console.log('Replaced linesLoop');
}

// 3. Update syncQcfWordsDisplay: highlight .ayah-container continuously
const oldSync = `  function syncQcfWordsDisplay() {
    if (!dom.qcfContainer) return;
    const isMasked = MushafState.maskMode && MushafState.maskMode !== 'none';
    const totalWords = (MushafState.targetWords || []).length;

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

      if (!isMasked) {
        span.classList.remove('revealed', 'current-recite-word', 'selected-ayah-word', 'reciting-ayah-word');
        if (isActive) {
          span.classList.add(MushafState.isReciting ? 'reciting-ayah-word' : 'selected-ayah-word');
        }
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
  }`;

const newSync = `  function syncQcfWordsDisplay() {
    if (!dom.qcfContainer) return;
    const isMasked = MushafState.maskMode && MushafState.maskMode !== 'none';
    const totalWords = (MushafState.targetWords || []).length;
    const activeKey = \`\${MushafState.activeSurahId}:\${MushafState.activeAyahNum}\`;

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
  }`;

if (!code.includes(oldSync)) {
  console.error('Could not find oldSync');
} else {
  code = code.replace(oldSync, newSync);
  console.log('Replaced syncQcfWordsDisplay');
}

// 4. Connect Settings Default Reciter and Download Button
const oldInitReciterPicker = `  function initReciterPickerModal() {
    // Restore saved reciter
    const savedReciter = localStorage.getItem('tibyan_current_reciter') || 'Abdurrahmaan_As-Sudais_192kbps';
    const initialReciter = MUSHAF_RECITERS.find(r => r.id === savedReciter) || MUSHAF_RECITERS[0];
    if (dom.currentReciterNameDisplay) {
      dom.currentReciterNameDisplay.textContent = initialReciter.name;
    }
    if (dom.mushafReciterSelect) {
      dom.mushafReciterSelect.value = initialReciter.id;
    }
    ReciterPlayer.reciter = initialReciter.id;`;

const newInitReciterPicker = `  function initReciterPickerModal() {
    // Restore saved reciter
    const savedReciter = localStorage.getItem('tibyan_current_reciter') || localStorage.getItem('tibyan_default_reciter') || 'Abdurrahmaan_As-Sudais_192kbps';
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
    ReciterPlayer.reciter = initialReciter.id;`;

if (!code.includes(oldInitReciterPicker)) {
  console.error('Could not find oldInitReciterPicker');
} else {
  code = code.replace(oldInitReciterPicker, newInitReciterPicker);
  console.log('Replaced initReciterPickerModal');
}

// Also update selectReciter to sync settingsDefaultReciterSelect and save tibyan_default_reciter
const oldSelectReciterStorage = `    localStorage.setItem('tibyan_current_reciter', reciterId);`;
const newSelectReciterStorage = `    localStorage.setItem('tibyan_current_reciter', reciterId);
    localStorage.setItem('tibyan_default_reciter', reciterId);
    const settingsReciterEl = document.getElementById('settingsDefaultReciterSelect');
    if (settingsReciterEl) settingsReciterEl.value = reciterId;`;

if (!code.includes(oldSelectReciterStorage)) {
  console.error('Could not find oldSelectReciterStorage');
} else {
  code = code.replace(oldSelectReciterStorage, newSelectReciterStorage);
  console.log('Updated selectReciter storage');
}

fs.writeFileSync('js/mushaf.js', code, 'utf8');
console.log('Finished updating js/mushaf.js');
