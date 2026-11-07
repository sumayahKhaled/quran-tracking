const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const targetHtml = `<div id="surahCompletionActionsRow" class="surah-completion-actions" style="display: none;">\r
                    <button id="btnGoToConsolidation" class="btn-completion-action btn-completion-cons" type="button">\r
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:16px;height:16px;">\r
                            <path d="M12 20h9"></path>\r
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>\r
                        </svg>\r
                        <span>الانتقال للتثبيت</span>\r
                    </button>\r
                    <button id="btnGoToNextSurah" class="btn-completion-action btn-completion-next" type="button">\r
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:16px;height:16px;">\r
                            <polygon points="5 4 15 12 5 20 5 4"></polygon>\r
                            <line x1="19" y1="5" x2="19" y2="19"></line>\r
                        </svg>\r
                        <span id="btnGoToNextSurahLabel">الانتقال للسورة الجديدة</span>\r
                    </button>\r
                </div>`;

const newHtml = `<!-- زرّا إتمام السورة 100%: الانتقال للتثبيت أو الانتقال للسورة الجديدة -->
                <div id="surahCompletionActionsRow" class="surah-completion-actions" style="display: none;">
                    <button id="btnGoToConsolidation" class="btn-completion-action btn-completion-cons" type="button">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:16px;height:16px;">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                        <span>الانتقال للتثبيت</span>
                    </button>
                    <button id="btnGoToNextSurah" class="btn-completion-action btn-completion-next" type="button">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:16px;height:16px;">
                            <polygon points="5 4 15 12 5 20 5 4"></polygon>
                            <line x1="19" y1="5" x2="19" y2="19"></line>
                        </svg>
                        <span id="btnGoToNextSurahLabel">الانتقال للسورة الجديدة</span>
                    </button>
                </div>

                <!-- شريط إشعار مرحلة التثبيت الحالية عند انتقال السورة للتثبيت -->
                <div id="surahInTathbeetNotice" class="surah-tathbeet-notice" style="display: none;">
                    <div class="tathbeet-notice-content">
                        <div class="tathbeet-notice-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:18px;height:18px;">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 14 14"></polyline>
                            </svg>
                        </div>
                        <div class="tathbeet-notice-texts">
                            <div class="tathbeet-notice-title" id="tathbeetNoticeTitle">أنت الآن في مرحلة تثبيت سورة الأنفال</div>
                            <div class="tathbeet-notice-desc">تم نقل سورة التوبة للمراجعة الدورية وتوزيعها بالأيام</div>
                        </div>
                    </div>
                    <button id="btnOpenTathbeetPage" class="btn-tathbeet-open" type="button">
                        <span>فتح صفحة التثبيت</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:14px;height:14px;">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                </div>`;

if (!html.includes(targetHtml)) {
  console.error('targetHtml not found!');
  process.exit(1);
}

html = html.replace(targetHtml, newHtml);
fs.writeFileSync('index.html', html, 'utf8');
console.log('Successfully inserted surahInTathbeetNotice in index.html!');

