const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Replace the settings group
const oldSettingsGroup = `<!-- قسم الحفظ والورد -->\r
                <div class="settings-group">\r
                    <span class="settings-group-title">الحفظ والورد اليومي</span>\r
                    <div class="settings-group-card">\r
                                                <div class="settings-item-row" id="reopenOnboardingBtn" role="button" tabindex="0">\n                            <div class="settings-item-icon" style="background:rgba(16, 185, 129, 0.1);color:#10b981;">\n                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                                    <circle cx="12" cy="12" r="5"></circle>\n                                    <line x1="12" y1="1" x2="12" y2="3"></line>\n                                    <line x1="12" y1="21" x2="12" y2="23"></line>\n                                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>\n                                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>\n                                    <line x1="1" y1="12" x2="3" y2="12"></line>\n                                    <line x1="21" y1="12" x2="23" y2="12"></line>\n                                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>\n                                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>\n                                </svg>\n                            </div>\n                            <div class="settings-item-content">\n                                <div class="settings-item-title">معالج تهيئة الخطة والورد</div>\n                                <div class="settings-item-desc">إعادة تشغيل معالج سراج لتحديد مستواك ومسار حفظك وجدولك</div>\n                            </div>\n                            <div class="settings-item-chevron">\n                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                                    <polyline points="15 18 9 12 15 6"></polyline>\n                                </svg>\n                            </div>\n                        </div>\r
\r
<div class="settings-item-row" id="openSurahSettingsSubpageBtn" role="button" tabindex="0">\r
                            <div class="settings-item-icon"\r
                                style="background:rgba(15, 61, 46, 0.08);color:var(--primary);">\r
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                                    <path d="M12 20h9"></path>\r
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>\r
                                </svg>\r
                            </div>\r
                            <div class="settings-item-content">\r
                                <div class="settings-item-title">تخصيص السورة والورد اليومي</div>\r
                                <div class="settings-item-desc">تحديد السورة الحالية وعدد الآيات والهدف اليومي</div>\r
                            </div>\r
                            <div class="settings-item-chevron">\r
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                                    <polyline points="15 18 9 12 15 6"></polyline>\r
                                </svg>\r
                            </div>\r
                        </div>\r
\r
                        <div class="settings-item-row" id="openPlanSettingsSubpageBtn" role="button" tabindex="0">\r
                            <div class="settings-item-icon"\r
                                style="background:rgba(13, 148, 136, 0.08);color:var(--primary-medium);">\r
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                                    <path d="M9 11l3 3L22 4"></path>\r
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>\r
                                </svg>\r
                            </div>\r
                            <div class="settings-item-content">\r
                                <div class="settings-item-title">تخصيص خطة المهام اليومية (الصفحة الرئيسية)</div>\r
                                <div class="settings-item-desc">تعديل بنود الحفظ والاستماع والتكرار وتخصيص الأهداف</div>\r
                            </div>\r
                            <div class="settings-item-chevron">\r
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                                    <polyline points="15 18 9 12 15 6"></polyline>\r
                                </svg>\r
                            </div>\r
                        </div>\r
\r
                        <div class="settings-item-row" id="openScheduleSubpageBtn" role="button" tabindex="0">\r
                            <div class="settings-item-icon" style="background:rgba(217, 119, 6, 0.08);color:#d97706;">\r
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>\r
                                    <line x1="16" y1="2" x2="16" y2="6"></line>\r
                                    <line x1="8" y1="2" x2="8" y2="6"></line>\r
                                    <line x1="3" y1="10" x2="21" y2="10"></line>\r
                                </svg>\r
                            </div>\r
                            <div class="settings-item-content">\r
                                <div class="settings-item-title">الجداول</div>\r
                                <div class="settings-item-desc">جداول وخطط المراجعة وتوزيع أيام الأسبوع</div>\r
                            </div>\r
                            <div class="settings-item-chevron">\r
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                                    <polyline points="15 18 9 12 15 6"></polyline>\r
                                </svg>\r
                            </div>\r
                        </div>\r
                    </div>\r
                </div>`;

const newSettingsGroup = `<!-- قسم خطة الحفظ والمراجعة والورد الموحد -->
                <div class="settings-group">
                    <span class="settings-group-title">الخطة والمراجعة والجداول</span>
                    <div class="settings-group-card">
                        <!-- البند الشامل الموحد الذي يجمع كافة البيانات ويسمح بتعديلها وإعادة بناء الجداول -->
                        <div class="settings-item-row" id="openUnifiedPlanSettingsBtn" role="button" tabindex="0">
                            <div class="settings-item-icon" style="background:rgba(15, 61, 46, 0.1);color:var(--primary);">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                </svg>
                            </div>
                            <div class="settings-item-content">
                                <div class="settings-item-title">خطة الحفظ والمراجعة والورد الشامل</div>
                                <div class="settings-item-desc">تعديل المحفوظ السابق، السورة، وتوليد جدول المراجعة والأرباع تلقائياً</div>
                            </div>
                            <div class="settings-item-chevron">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </div>
                        </div>

                        <!-- استعراض الجداول وتفاصيل أيام الأسبوع -->
                        <div class="settings-item-row" id="openScheduleSubpageBtn" role="button" tabindex="0">
                            <div class="settings-item-icon" style="background:rgba(217, 119, 6, 0.08);color:#d97706;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                            </div>
                            <div class="settings-item-content">
                                <div class="settings-item-title">معاينة الجداول والروتين الأسبوعي</div>
                                <div class="settings-item-desc">استعراض مهام دورة المراجعة وأيام الأسبوع مع إمكانية التعديل اليدوي</div>
                            </div>
                            <div class="settings-item-chevron">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </div>
                        </div>

                        <!-- إعادة تشغيل معالج التهيئة كخطوات تفاعلية إن أراد المستخدم -->
                        <div class="settings-item-row" id="reopenOnboardingBtn" role="button" tabindex="0">
                            <div class="settings-item-icon" style="background:rgba(16, 185, 129, 0.1);color:#10b981;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="5"></circle>
                                    <line x1="12" y1="1" x2="12" y2="3"></line>
                                    <line x1="12" y1="21" x2="12" y2="23"></line>
                                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                    <line x1="1" y1="12" x2="3" y2="12"></line>
                                    <line x1="21" y1="12" x2="23" y2="12"></line>
                                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                                </svg>
                            </div>
                            <div class="settings-item-content">
                                <div class="settings-item-title">إعادة تشغيل معالج التهيئة (خطوة بخطوة)</div>
                                <div class="settings-item-desc">تشغيل معالج سراج كشاشات تفاعلية متسلسلة</div>
                            </div>
                            <div class="settings-item-chevron">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>`;

if (!html.includes(oldSettingsGroup)) {
  console.error('Could not find oldSettingsGroup in html!');
  process.exit(1);
}

html = html.replace(oldSettingsGroup, newSettingsGroup);
fs.writeFileSync('index.html', html, 'utf8');
console.log('Successfully updated index.html settings group!');

