const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const unifiedSubpageHtml = `
            <!-- 3. الصفحة الفرعية الموحدة: خطة الحفظ والمراجعة الشاملة (Unified Plan Sub-page) -->
            <div id="settingsUnifiedPlanSubpage" class="settings-subpage" hidden>
                <div class="subpage-header">
                    <button type="button" id="backFromUnifiedPlanBtn" class="subpage-back-btn" aria-label="الرجوع">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                    <h3 class="subpage-header-title">خطة الحفظ والمراجعة والورد الشامل</h3>
                </div>

                <div class="subpage-body">
                    <div style="background:var(--bg-subtle, #f0fdf4); border:1px solid rgba(16, 185, 129, 0.2); border-radius:12px; padding:12px 14px; margin-bottom:16px;">
                        <div style="display:flex; align-items:center; gap:8px; color:var(--primary, #0f3d2e); font-weight:700; font-size:0.9rem;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                            <span>لوحة التخصيص وإعادة التوزيع التلقائي</span>
                        </div>
                        <p style="font-size:0.78rem; color:var(--text-muted, #64748b); margin:6px 0 0 0; line-height:1.5;">
                            هنا تجد كافة بيانات خطتك التي عبيتها في معالج التهيئة. يمكنك تعديل أي حقل، وعند الحفظ سيتم تلقائياً إعادة بناء جدول دورة المراجعة والأرباع والروتين اليومي بناءً عليها.
                        </p>
                    </div>

                    <!-- بطاقة 1: رصيد المحفوظ السابق ومسار الحفظ -->
                    <section class="official-section-card" style="margin-bottom:16px;">
                        <div class="official-section-header">
                            <div class="section-title-wrap">
                                <div class="section-icon-box" style="background:rgba(16, 185, 129, 0.1);color:#10b981;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                    </svg>
                                </div>
                                <h3>رصيد المحفوظ السابق ومسار الحفظ</h3>
                            </div>
                        </div>

                        <div class="form-field-group">
                            <label class="field-label" for="unifMemTypeSelect">نوع وتحديد المحفوظ السابق:</label>
                            <select id="unifMemTypeSelect" class="field-select">
                                <option value="khatim">خاتم المصحف كامل (30 جزءاً)</option>
                                <option value="juz">تحديد بعدد الأجزاء</option>
                                <option value="surah_range">تحديد من سورة إلى سورة</option>
                                <option value="beginner">بداية الطريق (من الصفر)</option>
                            </select>
                        </div>

                        <!-- حاوية خيار الأجزاء -->
                        <div id="unifJuzContainer" class="form-field-group" style="display:none;">
                            <label class="field-label" for="unifJuzCount">عدد الأجزاء المحفوظة:</label>
                            <select id="unifJuzCount" class="field-select">
                                <option value="1">جزء واحد</option>
                                <option value="2">جزئين</option>
                                <option value="3">3 أجزاء</option>
                                <option value="5">5 أجزاء</option>
                                <option value="10">10 أجزاء</option>
                                <option value="15">15 جزءاً (نصف المصحف)</option>
                                <option value="20">20 جزءاً</option>
                                <option value="25">25 جزءاً</option>
                                <option value="29">29 جزءاً</option>
                            </select>
                        </div>

                        <!-- حاوية نطاق السور -->
                        <div id="unifSurahRangeContainer" style="display:none; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                            <div class="form-field-group" style="margin-bottom:0;">
                                <label class="field-label" for="unifRangeFromSurah">من سورة:</label>
                                <select id="unifRangeFromSurah" class="field-select"></select>
                            </div>
                            <div class="form-field-group" style="margin-bottom:0;">
                                <label class="field-label" for="unifRangeToSurah">إلى سورة:</label>
                                <select id="unifRangeToSurah" class="field-select"></select>
                            </div>
                        </div>

                        <!-- مسار الحفظ (عكسي تصاعدي أو ترتيبي) -->
                        <div class="form-field-group" style="margin-top:10px; margin-bottom:6px;">
                            <label class="field-label" for="unifDirectionSelect">مسار الحفظ المفضل:</label>
                            <select id="unifDirectionSelect" class="field-select">
                                <option value="nas_to_fatihah">من الناس للفاتحة (قِصار السور وتصاعدي)</option>
                                <option value="fatihah_to_nas">من الفاتحة للناس (من أول المصحف)</option>
                            </select>
                        </div>
                    </section>

                    <!-- بطاقة 2: المحطة الحالية والسورة المستهدفة -->
                    <section class="official-section-card" style="margin-bottom:16px;">
                        <div class="official-section-header">
                            <div class="section-title-wrap">
                                <div class="section-icon-box" style="background:rgba(15, 61, 46, 0.1);color:var(--primary);">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                </div>
                                <h3>المحطة الحالية والوجهة القادمة</h3>
                            </div>
                        </div>

                        <div class="form-field-group">
                            <label class="field-label" for="unifTargetSurahSelect">السورة المستهدفة حالياً:</label>
                            <select id="unifTargetSurahSelect" class="field-select"></select>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                            <div class="form-field-group" style="margin-bottom:0;">
                                <label class="field-label" for="unifTargetPageInput">رقم الصفحة في المصحف:</label>
                                <input type="number" id="unifTargetPageInput" class="field-input" min="1" max="604" />
                            </div>
                            <div class="form-field-group" style="margin-bottom:0;">
                                <label class="field-label" for="unifCurrentVerseInput">الآية التي وصلت إليها:</label>
                                <input type="number" id="unifCurrentVerseInput" class="field-input" min="0" />
                            </div>
                        </div>

                        <div class="form-field-group" style="margin-bottom:6px;">
                            <label class="field-label" for="unifSurahStatusSelect">حالة هذه السورة:</label>
                            <select id="unifSurahStatusSelect" class="field-select">
                                <option value="new">سورة جديدة توي أبدأ فيها</option>
                                <option value="memorizing">شغال عليها تكرار وتسميع أولي</option>
                                <option value="ready_for_tathbeet">خلصت حفظها وأبي أدخلها مرحلة التثبيت بالأرباع</option>
                            </select>
                        </div>
                    </section>

                    <!-- بطاقة 3: إيقاع الورد ودورة المراجعة -->
                    <section class="official-section-card" style="margin-bottom:16px;">
                        <div class="official-section-header">
                            <div class="section-title-wrap">
                                <div class="section-icon-box" style="background:rgba(217, 119, 6, 0.1);color:#d97706;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="16" y1="2" x2="16" y2="6"></line>
                                        <line x1="8" y1="2" x2="8" y2="6"></line>
                                        <line x1="3" y1="10" x2="21" y2="10"></line>
                                    </svg>
                                </div>
                                <h3>إيقاع الورد ودورة المراجعة والأيام</h3>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
                            <div class="form-field-group" style="margin-bottom:0;">
                                <label class="field-label" for="unifDailyNewSelect">مقدار الحفظ الجديد يومياً:</label>
                                <select id="unifDailyNewSelect" class="field-select">
                                    <option value="0.5">نصف صفحة</option>
                                    <option value="1">صفحة كاملة (وجه)</option>
                                    <option value="2">صفحتين (وجهين)</option>
                                </select>
                            </div>
                            <div class="form-field-group" style="margin-bottom:0;">
                                <label class="field-label" for="unifCycleDaysSelect">دورة ختم المحفوظ القديم:</label>
                                <select id="unifCycleDaysSelect" class="field-select">
                                    <option value="7">كل 7 أيام</option>
                                    <option value="10">كل 10 أيام (المقترح)</option>
                                    <option value="15">كل 15 يوماً</option>
                                    <option value="30">كل 30 يوماً (شهر)</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-field-group" style="margin-bottom:14px;">
                            <label class="field-label" for="unifConsolidationDaySelect">يوم الربط والتثبيت والتمكين:</label>
                            <select id="unifConsolidationDaySelect" class="field-select">
                                <option value="0">الأحد</option>
                                <option value="1">الإثنين</option>
                                <option value="2">الثلاثاء</option>
                                <option value="3">الأربعاء</option>
                                <option value="4">الخميس</option>
                                <option value="5">الجمعة</option>
                                <option value="6">السبت</option>
                            </select>
                        </div>

                        <div class="form-field-group" style="margin-bottom:6px;">
                            <label class="field-label">أيام الحفظ والتسميع النشطة خلال الأسبوع:</label>
                            <div id="unifActiveDaysGrid" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
                                <button type="button" class="onb-day-chip unif-day-btn" data-day="0">الأحد</button>
                                <button type="button" class="onb-day-chip unif-day-btn" data-day="1">الإثنين</button>
                                <button type="button" class="onb-day-chip unif-day-btn" data-day="2">الثلاثاء</button>
                                <button type="button" class="onb-day-chip unif-day-btn" data-day="3">الأربعاء</button>
                                <button type="button" class="onb-day-chip unif-day-btn" data-day="4">الخميس</button>
                                <button type="button" class="onb-day-chip unif-day-btn" data-day="5">الجمعة</button>
                                <button type="button" class="onb-day-chip unif-day-btn" data-day="6">السبت</button>
                            </div>
                        </div>
                    </section>

                    <!-- زر الحفظ وإعادة بناء الجداول بالكامل -->
                    <div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;">
                        <button id="saveUnifiedPlanBtn" type="button" class="btn-formal-primary" style="width:100%; padding:14px; font-size:1rem; font-weight:700; background:var(--primary, #0f3d2e); display:flex; align-items:center; justify-content:center; gap:8px;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                            <span>حفظ الخطة وإعادة بناء الجداول والتقسيم كاملاً</span>
                        </button>
                        <p style="font-size:0.75rem; color:var(--text-muted); text-align:center; margin:0;">
                            سيتم فوراً تحديث وتوزيع سور المراجعة البعيدة وأرباع الربط القريب في الجداول وأداة التثبيت.
                        </p>
                    </div>
                </div>
            </div>
`;

const targetIndex = html.indexOf('<!-- 3. الصفحة الفرعية: تخصيص السورة والورد');
if (targetIndex === -1) {
  console.error('Target comment for subpage not found!');
  process.exit(1);
}

html = html.substring(0, targetIndex) + unifiedSubpageHtml + '\n' + html.substring(targetIndex);
fs.writeFileSync('index.html', html, 'utf8');
console.log('Successfully inserted settingsUnifiedPlanSubpage into index.html!');

