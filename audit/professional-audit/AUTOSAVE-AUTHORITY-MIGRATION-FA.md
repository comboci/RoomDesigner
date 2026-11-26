# طرح مهاجرت نهایی Autosave — RoomDesigner

مبنای بررسی: V406-R / 714cecabbb51d14cf9a5a43ea3e80177fbbd152a؛ طرح V407-R. وضعیت: DESIGN_ONLY / BLOCKED_PENDING_RUNTIME_VALIDATION. این سند مجوز تغییر داده کاربر یا اجرای تست نیست.

## تصمیم معماری
IndexedDB باید پس از مهاجرت کنترل‌شده تنها مرجع authoritative برای **فضای کاری فعال** باشد. LocalStorage پس از Cutover صرفاً projection سازگاری و cache است؛ در اختلاف هرگز با timestamp یا نسل غیراتمی انتخاب خودکار انجام نشود. `workspace-commit-v1` فعلی فقط نقطه بازیابی صریح است، نه سند جاری؛ نباید معنای آن در نسخه جدید عوض شود. کلید پیشنهادی مستقل `workspace-active-v2` با schema و commitId یکتا، predecessorId و exact managed values. Receipt داخل همان تراکنش IDB قرار گیرد. شناسه یکتا و تطبیق دقیق بایت‌ها برای CAS؛ checksum صرفاً تشخیص خرابی تصادفی.

## مسیرهای نوشتن شناسایی‌شده
| مسیر | فایل/تابع | مشکل |
|---|---|---|
| Autosave | index.html: saveAuto / scheduleSave / flushPendingSave | LocalStorage پیش از mirror، نتیجه sync و async متفاوت |
| Import سند | applyRoomImport | چند کلید و Journal محلی، سپس آینه |
| PDF | commitPdfPageRecords / schedulePdfImportMirror | مسیر مستقل تراکنش و mirror |
| Revision | saveLocal / rollback compensation | Profile و سند و mirror در مراحل جدا |
| منابع SVG و کاتالوگ | normalizeSvgReferences / saveSvgDrafts / safeStorage | سند و resource ممکن است مستقل تغییر کنند |
| شورتکات | saveShortcutFromSelection / data-shortcut-action | نوشتن مستقیم LocalStorage؛ V407 فقط guard بازیابی |
| کاربر و UI | activateUser / saveDockSettings / toolbox order | خارج از چرخه ذخیره سند |
| Migration/Restore | RoomEquipment.migrateStorage / RoomConnections.migrateStorage / journal replay / resumeWorkspaceRestore | تغییر قبل از عادی شدن editor |
| خطا و تنظیم موقت | rd_error_log_v1 / sessionStorage rd_layout | خارج از دامنه commit پروژه؛ policy جداگانه |

## مراحل Cutover پیشنهادی
A. Inventory تمام نویسندگان/خوانندگان کلیدهای مدیریت‌شده و قراردادهای sync/async و UI؛ هیچ writer مستقیمی بی‌صاحب نماند. مسیرهای ورود/Revision/Undo باید نتیجه تراکنش واقعی بگیرند.
B. ایجاد StorageCoordinator مستقل با single-writer lock موجود و صف commit. یک snapshot immutable از مدل کامل و منابع وابسته در آغاز عملیات. validate و bound قبل از شروع تراکنش. CAS روی predecessor؛ commit در IDB فقط با oncomplete موفق است. برگشت cache یا UI صرفاً بر اساس commitId معتبر.
C. Shadow mode opt-in: snapshot آماده با داده قدیمی دقیقاً مقایسه شود؛ ثبت diagnostic بدون تغییر authority. بررسی مصرف quota و latency و سازگاری موبایل. Shadow record هرگز به‌عنوان جدیدترین سند خودکار Restore نشود.
D. مهاجرت اولیه opt-in: قبل از mutation، از هر دو مخزن و workspace و منابع خروجی خارجی قابل بازیابی تهیه شود؛ اختلاف/Journal ابتدا حل شود. snapshot کامل validated به IDB ثبت و commit marker نسخه‌بندی‌شده به‌صورت قابل‌ادامه نوشته شود. در نبود IDB برای origin مهاجرت‌یافته، حالت read-only/export؛ هرگز fallback خودکار به local قدیمی.
E. فعال‌سازی فقط پس از acceptance: خواندن startup فقط از active authority معتبر؛ LocalStorage projection پس از commit، نه قبل آن. شکست projection cache، شکست commit محسوب نشود؛ UI باید هشدار مجزا نشان دهد. هنگام بسته شدن، ذخیره async تضمین نمی‌شود؛ dirty state و امکان خروجی فوری حفظ شود.
F. rollback: انتخاب snapshot خارجی/آخرین commit validated با تأیید صریح، حفظ هر دو نسخه، journal قابل‌ادامه. هیچ حذف خودکار تاریخچه یا data migration destructive. V406 recovery checkpoint همچنان جداگانه و دارای مسیر سازگار.

## Acceptance اجباری قبل از فعال‌سازی
- Chrome/Edge/Firefox و iPhone Safari در origin آزمایشی با داده مصنوعی و فایل واقعی کنترل‌شده.
- قطع در هر boundary: قبل از IDB transaction، بعد از put قبل از complete، بعد از commit قبل از projection، حین projection، هنگام pagehide، و هم‌زمان با Undo/Revision/Import.
- Quota denied، IDB unavailable/blocked، LocalStorage unavailable، conflict و external mutation، نسخه قدیمی و چند تب.
- تطابق کامل سند، تمام profileها، Revisionها، SVG، shortcuts و metadata؛ عدم ایجاد orphan و عدم حذف فایل/آرشیو.
- معیار کارایی ثبت شود: latency commit، peak heap، اندازه record، تعداد تراکنش، responsiveness. آستانه بر اساس baseline واقعی تعیین شود، نه تخمین.
- Test/Build/Runtime تا مجوز جدید مالک اجرا نشود؛ در نتیجه در V407 هیچ cutover خودکار فعال نیست و OPEN-CROSS-STORE باز است.
