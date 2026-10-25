// Complete Quran Surahs Data with Arabic names, total Ayah counts, and Madani Mushaf page ranges
const QURAN_SURAHS = [
  { id: 1, name: "الفاتحة", verses: 7, type: "مكية", startPage: 1, endPage: 1 },
  { id: 2, name: "البقرة", verses: 286, type: "مدنية", startPage: 2, endPage: 49 },
  { id: 3, name: "آل عمران", verses: 200, type: "مدنية", startPage: 50, endPage: 76 },
  { id: 4, name: "النساء", verses: 176, type: "مدنية", startPage: 77, endPage: 106 },
  { id: 5, name: "المائدة", verses: 120, type: "مدنية", startPage: 106, endPage: 127 },
  { id: 6, name: "الأنعام", verses: 165, type: "مكية", startPage: 128, endPage: 150 },
  { id: 7, name: "الأعراف", verses: 206, type: "مكية", startPage: 151, endPage: 176 },
  { id: 8, name: "الأنفال", verses: 75, type: "مدنية", startPage: 177, endPage: 186 },
  { id: 9, name: "التوبة", verses: 129, type: "مدنية", startPage: 187, endPage: 207 },
  { id: 10, name: "يونس", verses: 109, type: "مكية", startPage: 208, endPage: 221 },
  { id: 11, name: "هود", verses: 123, type: "مكية", startPage: 221, endPage: 235 },
  { id: 12, name: "يوسف", verses: 111, type: "مكية", startPage: 235, endPage: 248 },
  { id: 13, name: "الرعد", verses: 43, type: "مدنية", startPage: 249, endPage: 255 },
  { id: 14, name: "إبراهيم", verses: 52, type: "مكية", startPage: 255, endPage: 261 },
  { id: 15, name: "الحجر", verses: 99, type: "مكية", startPage: 262, endPage: 267 },
  { id: 16, name: "النحل", verses: 128, type: "مكية", startPage: 267, endPage: 281 },
  { id: 17, name: "الإسراء", verses: 111, type: "مكية", startPage: 282, endPage: 293 },
  { id: 18, name: "الكهف", verses: 110, type: "مكية", startPage: 293, endPage: 304 },
  { id: 19, name: "مريم", verses: 98, type: "مكية", startPage: 305, endPage: 312 },
  { id: 20, name: "طه", verses: 135, type: "مكية", startPage: 312, endPage: 321 },
  { id: 21, name: "الأنبياء", verses: 112, type: "مكية", startPage: 322, endPage: 331 },
  { id: 22, name: "الحج", verses: 78, type: "مدنية", startPage: 332, endPage: 341 },
  { id: 23, name: "المؤمنون", verses: 118, type: "مكية", startPage: 342, endPage: 349 },
  { id: 24, name: "النور", verses: 64, type: "مدنية", startPage: 350, endPage: 359 },
  { id: 25, name: "الفرقان", verses: 77, type: "مكية", startPage: 359, endPage: 366 },
  { id: 26, name: "الشعراء", verses: 227, type: "مكية", startPage: 367, endPage: 376 },
  { id: 27, name: "النمل", verses: 93, type: "مكية", startPage: 377, endPage: 385 },
  { id: 28, name: "القصص", verses: 88, type: "مكية", startPage: 385, endPage: 396 },
  { id: 29, name: "العنكبوت", verses: 69, type: "مكية", startPage: 396, endPage: 404 },
  { id: 30, name: "الروم", verses: 60, type: "مكية", startPage: 404, endPage: 410 },
  { id: 31, name: "لقمان", verses: 34, type: "مكية", startPage: 411, endPage: 414 },
  { id: 32, name: "السجدة", verses: 30, type: "مكية", startPage: 415, endPage: 417 },
  { id: 33, name: "الأحزاب", verses: 73, type: "مدنية", startPage: 418, endPage: 427 },
  { id: 34, name: "سبأ", verses: 54, type: "مكية", startPage: 428, endPage: 434 },
  { id: 35, name: "فاطر", verses: 45, type: "مكية", startPage: 434, endPage: 440 },
  { id: 36, name: "يس", verses: 83, type: "مكية", startPage: 440, endPage: 445 },
  { id: 37, name: "الصافات", verses: 182, type: "مكية", startPage: 446, endPage: 452 },
  { id: 38, name: "ص", verses: 88, type: "مكية", startPage: 453, endPage: 458 },
  { id: 39, name: "الزمر", verses: 75, type: "مكية", startPage: 458, endPage: 467 },
  { id: 40, name: "غافر", verses: 85, type: "مكية", startPage: 467, endPage: 476 },
  { id: 41, name: "فصلت", verses: 54, type: "مكية", startPage: 477, endPage: 482 },
  { id: 42, name: "الشورى", verses: 53, type: "مكية", startPage: 483, endPage: 489 },
  { id: 43, name: "الزخرف", verses: 89, type: "مكية", startPage: 489, endPage: 495 },
  { id: 44, name: "الدخان", verses: 59, type: "مكية", startPage: 496, endPage: 498 },
  { id: 45, name: "الجاثية", verses: 37, type: "مكية", startPage: 499, endPage: 502 },
  { id: 46, name: "الأحقاف", verses: 35, type: "مكية", startPage: 502, endPage: 506 },
  { id: 47, name: "محمد", verses: 38, type: "مدنية", startPage: 507, endPage: 510 },
  { id: 48, name: "الفتح", verses: 29, type: "مدنية", startPage: 511, endPage: 515 },
  { id: 49, name: "الحجرات", verses: 18, type: "مدنية", startPage: 515, endPage: 517 },
  { id: 50, name: "ق", verses: 45, type: "مكية", startPage: 518, endPage: 520 },
  { id: 51, name: "الذاريات", verses: 60, type: "مكية", startPage: 520, endPage: 523 },
  { id: 52, name: "الطور", verses: 49, type: "مكية", startPage: 523, endPage: 525 },
  { id: 53, name: "النجم", verses: 62, type: "مكية", startPage: 526, endPage: 528 },
  { id: 54, name: "القمر", verses: 55, type: "مكية", startPage: 528, endPage: 531 },
  { id: 55, name: "الرحمن", verses: 78, type: "مدنية", startPage: 531, endPage: 534 },
  { id: 56, name: "الواقعة", verses: 96, type: "مكية", startPage: 534, endPage: 537 },
  { id: 57, name: "الحديد", verses: 29, type: "مدنية", startPage: 537, endPage: 541 },
  { id: 58, name: "المجادلة", verses: 22, type: "مدنية", startPage: 542, endPage: 545 },
  { id: 59, name: "الحشر", verses: 24, type: "مدنية", startPage: 545, endPage: 548 },
  { id: 60, name: "الممتحنة", verses: 13, type: "مدنية", startPage: 549, endPage: 551 },
  { id: 61, name: "الصف", verses: 14, type: "مدنية", startPage: 551, endPage: 552 },
  { id: 62, name: "الجمعة", verses: 11, type: "مدنية", startPage: 553, endPage: 554 },
  { id: 63, name: "المنافقون", verses: 11, type: "مدنية", startPage: 554, endPage: 555 },
  { id: 64, name: "التغابن", verses: 18, type: "مدنية", startPage: 556, endPage: 557 },
  { id: 65, name: "الطلاق", verses: 12, type: "مدنية", startPage: 558, endPage: 559 },
  { id: 66, name: "التحريم", verses: 12, type: "مدنية", startPage: 560, endPage: 561 },
  { id: 67, name: "الملك", verses: 30, type: "مكية", startPage: 562, endPage: 564 },
  { id: 68, name: "القلم", verses: 52, type: "مكية", startPage: 564, endPage: 566 },
  { id: 69, name: "الحاقة", verses: 52, type: "مكية", startPage: 566, endPage: 568 },
  { id: 70, name: "المعارج", verses: 44, type: "مكية", startPage: 568, endPage: 570 },
  { id: 71, name: "نوح", verses: 28, type: "مكية", startPage: 570, endPage: 571 },
  { id: 72, name: "الجن", verses: 28, type: "مكية", startPage: 572, endPage: 573 },
  { id: 73, name: "المزمل", verses: 20, type: "مكية", startPage: 574, endPage: 575 },
  { id: 74, name: "المدثر", verses: 56, type: "مكية", startPage: 575, endPage: 577 },
  { id: 75, name: "القيامة", verses: 40, type: "مكية", startPage: 577, endPage: 578 },
  { id: 76, name: "الإنسان", verses: 31, type: "مدنية", startPage: 578, endPage: 580 },
  { id: 77, name: "المرسلات", verses: 50, type: "مكية", startPage: 580, endPage: 581 },
  { id: 78, name: "النبأ", verses: 40, type: "مكية", startPage: 582, endPage: 583 },
  { id: 79, name: "النازعات", verses: 46, type: "مكية", startPage: 583, endPage: 584 },
  { id: 80, name: "عبس", verses: 42, type: "مكية", startPage: 585, endPage: 585 },
  { id: 81, name: "التكوير", verses: 29, type: "مكية", startPage: 586, endPage: 586 },
  { id: 82, name: "الانفطار", verses: 19, type: "مكية", startPage: 587, endPage: 587 },
  { id: 83, name: "المطففين", verses: 36, type: "مكية", startPage: 587, endPage: 589 },
  { id: 84, name: "الانشقاق", verses: 25, type: "مكية", startPage: 589, endPage: 589 },
  { id: 85, name: "البروج", verses: 22, type: "مكية", startPage: 590, endPage: 590 },
  { id: 86, name: "الطارق", verses: 17, type: "مكية", startPage: 591, endPage: 591 },
  { id: 87, name: "الأعلى", verses: 19, type: "مكية", startPage: 591, endPage: 592 },
  { id: 88, name: "الغاشية", verses: 26, type: "مكية", startPage: 592, endPage: 592 },
  { id: 89, name: "الفجر", verses: 30, type: "مكية", startPage: 593, endPage: 594 },
  { id: 90, name: "البلد", verses: 20, type: "مكية", startPage: 594, endPage: 594 },
  { id: 91, name: "الشمس", verses: 15, type: "مكية", startPage: 595, endPage: 595 },
  { id: 92, name: "الليل", verses: 21, type: "مكية", startPage: 595, endPage: 596 },
  { id: 93, name: "الضحى", verses: 11, type: "مكية", startPage: 596, endPage: 596 },
  { id: 94, name: "الشرح", verses: 8, type: "مكية", startPage: 596, endPage: 596 },
  { id: 95, name: "التين", verses: 8, type: "مكية", startPage: 597, endPage: 597 },
  { id: 96, name: "العلق", verses: 19, type: "مكية", startPage: 597, endPage: 597 },
  { id: 97, name: "القدر", verses: 5, type: "مكية", startPage: 598, endPage: 598 },
  { id: 98, name: "البينة", verses: 8, type: "مدنية", startPage: 598, endPage: 599 },
  { id: 99, name: "الزلزلة", verses: 8, type: "مدنية", startPage: 599, endPage: 599 },
  { id: 100, name: "العاديات", verses: 11, type: "مكية", startPage: 599, endPage: 600 },
  { id: 101, name: "القارعة", verses: 11, type: "مكية", startPage: 600, endPage: 600 },
  { id: 102, name: "التكاثر", verses: 8, type: "مكية", startPage: 600, endPage: 600 },
  { id: 103, name: "العصر", verses: 3, type: "مكية", startPage: 601, endPage: 601 },
  { id: 104, name: "الهمزة", verses: 9, type: "مكية", startPage: 601, endPage: 601 },
  { id: 105, name: "الفيل", verses: 5, type: "مكية", startPage: 601, endPage: 601 },
  { id: 106, name: "قريش", verses: 4, type: "مكية", startPage: 602, endPage: 602 },
  { id: 107, name: "الماعون", verses: 7, type: "مكية", startPage: 602, endPage: 602 },
  { id: 108, name: "الكوثر", verses: 3, type: "مكية", startPage: 602, endPage: 602 },
  { id: 109, name: "الكافرون", verses: 6, type: "مكية", startPage: 603, endPage: 603 },
  { id: 110, name: "النصر", verses: 3, type: "مدنية", startPage: 603, endPage: 603 },
  { id: 111, name: "المسد", verses: 5, type: "مكية", startPage: 603, endPage: 603 },
  { id: 112, name: "الإخلاص", verses: 4, type: "مكية", startPage: 604, endPage: 604 },
  { id: 113, name: "الفلق", verses: 5, type: "مكية", startPage: 604, endPage: 604 },
  { id: 114, name: "الناس", verses: 6, type: "مكية", startPage: 604, endPage: 604 }
];

// Juz boundaries (Madani Mushaf 604 pages)
const JUZ_DATA = [
  { juz: 1, startPage: 1, name: "الجزء الأول" },
  { juz: 2, startPage: 22, name: "الجزء الثاني" },
  { juz: 3, startPage: 42, name: "الجزء الثالث" },
  { juz: 4, startPage: 62, name: "الجزء الرابع" },
  { juz: 5, startPage: 82, name: "الجزء الخامس" },
  { juz: 6, startPage: 102, name: "الجزء السادس" },
  { juz: 7, startPage: 122, name: "الجزء السابع" },
  { juz: 8, startPage: 142, name: "الجزء الثامن" },
  { juz: 9, startPage: 162, name: "الجزء التاسع" },
  { juz: 10, startPage: 182, name: "الجزء العاشر" },
  { juz: 11, startPage: 202, name: "الجزء الحادي عشر" },
  { juz: 12, startPage: 222, name: "الجزء الثاني عشر" },
  { juz: 13, startPage: 242, name: "الجزء الثالث عشر" },
  { juz: 14, startPage: 262, name: "الجزء الرابع عشر" },
  { juz: 15, startPage: 282, name: "الجزء الخامس عشر" },
  { juz: 16, startPage: 302, name: "الجزء السادس عشر" },
  { juz: 17, startPage: 322, name: "الجزء السابع عشر" },
  { juz: 18, startPage: 342, name: "الجزء الثامن عشر" },
  { juz: 19, startPage: 362, name: "الجزء التاسع عشر" },
  { juz: 20, startPage: 382, name: "الجزء العشرون" },
  { juz: 21, startPage: 402, name: "الجزء الحادي والعشرون" },
  { juz: 22, startPage: 422, name: "الجزء الثاني والعشرون" },
  { juz: 23, startPage: 442, name: "الجزء الثالث والعشرون" },
  { juz: 24, startPage: 462, name: "الجزء الرابع والعشرون" },
  { juz: 25, startPage: 482, name: "الجزء الخامس والعشرون" },
  { juz: 26, startPage: 502, name: "الجزء السادس والعشرون" },
  { juz: 27, startPage: 522, name: "الجزء السابع والعشرون" },
  { juz: 28, startPage: 542, name: "الجزء الثامن والعشرون" },
  { juz: 29, startPage: 562, name: "الجزء التاسع والعشرون" },
  { juz: 30, startPage: 582, name: "الجزء الثلاثون" }
];

function getSurahById(id) {
  return QURAN_SURAHS.find(s => s.id === parseInt(id));
}

function getSurahsForPage(pageNum) {
  const p = parseInt(pageNum);
  return QURAN_SURAHS.filter(s => p >= s.startPage && p <= s.endPage);
}

function getJuzForPage(pageNum) {
  const p = parseInt(pageNum);
  let found = JUZ_DATA[0];
  for (let i = 0; i < JUZ_DATA.length; i++) {
    if (p >= JUZ_DATA[i].startPage) {
      found = JUZ_DATA[i];
    } else {
      break;
    }
  }
  return found;
}

window.QURAN_SURAHS = QURAN_SURAHS;
window.JUZ_DATA = JUZ_DATA;
window.getSurahById = getSurahById;
window.getSurahsForPage = getSurahsForPage;
window.getJuzForPage = getJuzForPage;
