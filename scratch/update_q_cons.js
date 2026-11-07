const fs = require('fs');

let qJs = fs.readFileSync('js/quarter-consolidation.js', 'utf8');

const checkSurahCompletionLogic = `
  // فحص ما إذا تم إنجاز وتثبيت جميع أرباع السورة بالكامل
  function checkAllQuartersOfSurahCompleted() {
    if (!quartersData || quartersData.length === 0) return false;
    const allDone = quartersData.every(q => {
      const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
      return prog && prog.heardFirstTime && prog.recordedRecitation && prog.repetitionCount >= 7;
    });

    if (allDone) {
      // إنجاز تثبيت السورة بالكامل!
      const sObj = (typeof window.getSurahById === 'function') ? window.getSurahById(currentSurahId) : null;
      const sName = sObj ? sObj.name : 'السورة';

      if (window.showToast) {
        window.showToast(\`هنيئاً لك! أتممت تثبيت وتمكين سورة \${sName} بالكامل بالصدر والقرطاس 🌿\`);
      }

      // 1. نقل السورة المثبتة (مثلاً الأنفال) إلى قائمة المراجعة الدورية تلقائياً
      if (window.AppState) {
        if (!window.AppState.completedSurahs) window.AppState.completedSurahs = [];
        if (!window.AppState.completedSurahs.includes(sName)) {
          window.AppState.completedSurahs.push(sName);
        }

        // تحديث البروفايل وإعادة توزيع جدول المراجعة الدورية
        let profile = null;
        try {
          profile = JSON.parse(localStorage.getItem('tibyan_user_profile'));
        } catch (_) {}

        if (profile) {
          // السورة المثبتة تصبح جزءاً معتمداً من رصيد المحفوظ والمراجعة
          if (typeof window.applyProfileToAppState === 'function') {
            window.applyProfileToAppState(profile);
          }
        }
        if (typeof window.persistState === 'function') {
          window.persistState();
        }
        if (typeof window.renderAll === 'function') {
          window.renderAll();
        }
      }
    }
    return allDone;
  }
`;

// Insert checkAllQuartersOfSurahCompleted call inside updateQuarterCardStatus
const targetStatusFunc = `  function updateQuarterCardStatus(card, q, prog) {
    const isComplete = (prog.heardFirstTime && prog.recordedRecitation && prog.repetitionCount >= 7);
    card.classList.toggle('is-completed', isComplete);
    const badge = card.querySelector('.quarter-status-badge');
    if (badge) {
      badge.className = \`quarter-status-badge \${isComplete ? 'done' : ''}\`;
      badge.textContent = isComplete ? 'مكتمل ✓' : \`\${prog.repetitionCount}/7 تكرارات\`;
    }
  }`;

const newStatusFunc = `  function updateQuarterCardStatus(card, q, prog) {
    const isComplete = (prog.heardFirstTime && prog.recordedRecitation && prog.repetitionCount >= 7);
    card.classList.toggle('is-completed', isComplete);
    const badge = card.querySelector('.quarter-status-badge');
    if (badge) {
      badge.className = \`quarter-status-badge \${isComplete ? 'done' : ''}\`;
      badge.textContent = isComplete ? 'مكتمل ✓' : \`\${prog.repetitionCount}/7 تكرارات\`;
    }
    if (isComplete) {
      checkAllQuartersOfSurahCompleted();
    }
  }`;

qJs = qJs.replace(targetStatusFunc, checkSurahCompletionLogic + '\n' + newStatusFunc);

fs.writeFileSync('js/quarter-consolidation.js', qJs, 'utf8');
console.log('Successfully updated quarter-consolidation.js with checkAllQuartersOfSurahCompleted!');

