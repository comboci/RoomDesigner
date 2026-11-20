# ممیزی عمیق واردکردن/خروجی RoomDesigner — 2026-11-20

- مبنا: `main@c2fcfa617f942c5ea592e61589b234c11b29ce8c`، نسخه محصول `V390-R`
- دامنه: `.nrd/.roomplan/.json`, DXF, DWG، PDF، SVG، کتابخانه SVG، مدل ذخیره و زیرساخت تست
- روش: **بررسی ایستای سورس و تست‌های موجود**؛ اجرای Node، Playwright، تبدیل واقعی DWG و مرورگر: **NOT_RUN**
- این سند صرفاً فهرست یافته‌هاست؛ **اصلاح سورس یا تأیید عملیاتی محسوب نمی‌شود**.
- وضعیت: `OPEN_AUDIT`. ریسک‌های قدیمی OPEN-CROSS-STORE و runtime acceptance همچنان باز هستند.

## خلاصه اولویت و شواهد

| شناسه | اولویت | سطح اطمینان | یافته و اثر |
|---|---|---|---|
| RD-IE-01 | P0 | ثابت در سورس | فایل `.nrd` مراجع کتابخانه SVG محلی را همراه دارایی‌ها حمل نمی‌کند؛ بازکردن روی دستگاه دیگر می‌تواند نماد سفارشی را گم کند |
| RD-IE-02 | P1 | ریسک مستند از طراحی | صفحات PDF به PNG Base64 در `doc.imageAssets` می‌روند، سپس کل `doc` در `rd_last` ذخیره می‌شود؛ محدودیت سهمیهٔ LocalStorage می‌تواند ذخیره اصلی را رد کند |
| RD-IE-03 | P1 | ثابت در سورس | DXF Export هندسه `dxfGeometry` آبجکت تشخیص‌داده‌شده را نمی‌خواند و ممکن است فقط SVG عمومی یا کادر صادر کند؛ round-trip CAD مخدوش می‌شود |
| RD-IE-04 | P1 | ثابت در سورس | دستگاه `kind=image` در DXF Export با `imagePlaceholder()` نمایش داده می‌شود و محتوای Raster واردشده از PDF صادر نمی‌شود |
| RD-IE-05 | P1 | ثابت در سورس و مغایرت سند | DWG تبدیل کامل را برای بیش از ۸۰ MiB فقط به تأیید کاربر وابسته می‌کند؛ سقف سختِ ورودی/خروجی و محدودیت متناظر با راهنما اعمال نشده است |
| RD-IE-06 | P1 | تصمیم طراحی با خطر استفاده | DXF با `$INSUNITS` متفاوت همچنان با سانتی‌متر و ضریب ۱ شروع می‌شود؛ هشدار وجود دارد، تأیید صریح واحد الزام‌آور نیست |
| RD-IE-07 | P1 | ریسک ساختاری | واردکردن DXF و PDF پس از شروع اعمال، مستقیماً روی `doc` تغییر می‌دهند؛ مانند `applyRoomImport` rollback کامل برای شکست میانهٔ عملیات ندارند |
| RD-IE-08 | P1 | ریسک حافظه | Import PDF همه تصاویر انتخاب‌شده را پیش از commit جمع می‌کند؛ Export PDF نیز تمام JPEGهای صفحات را تا ساخت خروجی نگه می‌دارد؛ سقف مجموع حافظه/صفحات ندارد |
| RD-IE-09 | P2 | ثابت در سورس | `file.text()` برای DXF فقط decoding پیش‌فرض را دارد؛ `$DWGCODEPAGE` و فایل‌های غیر UTF-8 بررسی نمی‌شوند؛ نام لایه‌های غیر ASCII ممکن است مخدوش شود |
| RD-IE-10 | P2 | ریسک عملکرد | هنگام Drag برش DXF، هر `pointermove` از `sync()`، فهرست هندسهٔ انتخابی را دوباره clip می‌کند؛ برای ۲۰۰ هزار قطعه‌خط ممکن است رابط کند شود |
| RD-IE-11 | P2 | ثابت در سورس | `file()` و `savePdfBlob()` پس از `anchor.click()`، موفقیت درخواست دانلود را به جای تأیید ذخیره فیزیکی گزارش می‌کنند |
| RD-IE-12 | P2 | تفاوت UX | فیلدهای نسخه/طراح در صفحهٔ PDF فقط در مسیر چاپ مصرف می‌شوند؛ مسیر «ذخیره مستقیم PDF» خروجی تصویرمحور و بدون title block تولید می‌کند |
| RD-IE-13 | P2 | تفاوت مقیاس | واردکردن PDF از کادر ثابت ۴۸۰ واحد برای تصویر استفاده می‌کند، نه MediaBox یا مقیاس حقیقی نقشه؛ PDF پلان مرجع ابعادی کالیبره‌شده نیست |
| RD-IE-14 | محدودیت شناخته‌شده | مستند | DXF واردشونده عمدتاً LINE، پلی‌لاین و منحنی تسطیح‌شده است؛ TEXT/DIMENSION/HATCH/SPLINE و fidelity کامل DWG تضمین نشده‌اند؛ این مورد را خطای جدید قلمداد نکنید |

## جزئیات، ارجاعات و مسیر اصلاح

### RD-IE-01 — فایل بازیابی NRD واقعاً مستقل نیست (P0)

- شاهد: `index.html:582,589-603`: `svgDrafts.assets` در `rd_svg_drafts` نگهداری می‌شود و `normalizeSvgReferences` محتوا را به `svgAssetId` تبدیل می‌کند.
- شاهد: `index.html:1952,2025,2224,2241`: خروجی `.nrd` فقط `{doc,types,catalog}` را سریالایز می‌کند؛ دارایی‌های `svgDrafts` در Envelope وجود ندارند.
- شاهد: `index.html:637`: بارگذاری artwork به کتابخانهٔ SVG همان مرورگر متکی است.
- پیامد: Export→Import روی پروفایل جدید ممکن است نماد سفارشی را گم کند؛ ادعای «بسته کامل» بدون بررسی دارایی‌ها معتبر نیست.
- اصلاح پیشنهادی: Envelope نسخه‌دار با `assets.svg` فقط برای مراجع استفاده‌شده، hash/schema/size/ID collision guards و import دو مرحله‌ای با rollback؛ compatibility با NRD قدیمی.
- تست لازم: ورود SVG محلی، export NRD، پاک‌سازی عمدی محیط تست دوم، import و مقایسه باینری/هندسی نماد؛ شکست ذخیره asset و rollback.

### RD-IE-02 — ریسک quota هنگام PDF/تصاویر پرحجم (P1)

- شاهد: `assets/pdf-import.js:39-44` از `toDataURL('image/png')` استفاده کرده و خروجی‌ها را در آرایه جمع می‌کند.
- شاهد: `index.html:628,445` تصاویر را داخل `doc.imageAssets` می‌گذارد و `saveAuto` تمام `doc` را به `rd_last` می‌نویسد.
- در V388/V389 هشدار شکست Primary بهتر شده اما معماری مشترک LocalStorage/IndexedDB همچنان atomic نیست.
- اصلاح پیشنهادی: ارزیابی بودجهٔ حجم پیش از commit؛ ذخیره جداگانه binary assets در IndexedDB با شناسه محتوامحور، transaction/journal قابل بازیابی و Export مستقل؛ هشدار و توقف قبل از ریسک از دست رفتن snapshot.

### RD-IE-03 — عدم حفظ `dxfGeometry` در Export DXF (P1)

- شاهد: `index.html:2429-2436` هندسهٔ منبع را در `d.dxfGeometry` ثبت می‌کند.
- شاهد: `index.html:945` در رندر از `dxfGeometry` استفاده می‌کند.
- شاهد: `index.html:2103-2175` خروجی DXF تنها `effectiveArtwork` یا `deviceOutlinePoints` را به LINE تبدیل می‌کند؛ شاخه‌ای برای `dxfGeometry` نیست.
- اصلاح پیشنهادی: انتقال segmentهای `dxfGeometry` با همان transform/rotation/flip به تابع `line()` و منطق لایه/رنگ؛ پرهیز از صادرات آرت‌ورک عمومی وقتی هندسه CAD موجود است.
- تست لازم: DXF ورودی با در/میز تشخیص‌داده‌شده → تبدیل به native object → Export DXF → Parse دوباره؛ مقایسه endpoints/layers/shape tolerance.

### RD-IE-04 — Raster PDF در خروجی DXF جایگزین می‌شود (P1)

- شاهد: `index.html:628` صفحات PDF را در `kind:'image'` ذخیره می‌کند؛ `index.html:637` برای آن `imagePlaceholder()` ارائه می‌کند؛ `index.html:2175` خروجی DXF از `svgGeometry`/fallback تشکیل می‌شود و Raster را در فایل نمی‌گنجاند.
- اصلاح پیشنهادی: قبل از خروجی DXF فهرست محتواهای پشتیبانی‌نشده و هشدار lossiness ارائه شود؛ مسیر SVG/PDF پیشنهاد شود؛ در صورت نیاز DXF+تصویر جانبی با IMAGE entity/تعریف ارجاع مستقل طراحی شود.

### RD-IE-05 — DWG conversion size governance (P1)

- شاهد: `assets/dwg-import.js:35-55` برای `file.size > 80 MiB` فقط `confirm` می‌گیرد؛ `file.arrayBuffer()` را کامل می‌خواند.
- شاهد: `assets/dwg-worker.mjs:6-14` خروجی WASM به TypedArray کپی می‌شود و بدون سقف خروجی ارسال می‌شود.
- مغایرت: `IMPORT-FORMATS.md:23-24` سقف ۲۵ MiB DWG و ۸۰ MiB خروجی را ادعا می‌کند، اما در کد کنونی الزام متناظر برقرار نیست.
- اصلاح پیشنهادی: یک policy مشخص و enforceable، cap ورودی/خروجی بر اساس توان دستگاه، پاسخ دقیق خطای resource limit، و اصلاح سند. تبدیل کامل DWG بزرگ همچنان آزمایشی تلقی شود.

### RD-IE-06 — Scale/INSUNITS DXF (P1)

- شاهد: `assets/dxf-import.js:84-90` واحد تشخیص‌داده‌شده را می‌خواند ولی مقدار UI را عمداً ۱ سانتی‌متر قرار می‌دهد؛ دکمه Import در `sync` بدون تأیید mismatch فعال می‌شود.
- این رفتار در `DXF-IMPORT.md:6` صریحاً تصمیم سابق محصول ثبت شده است، نه رگرسیون تصادفی.
- اصلاح پیشنهادی: برای mismatch، کاربر واحد را صریح تأیید کند؛ ابعاد حاصل با واحد ورودی/خروجی نمایش یابد و انتخاب به provenance واردکردن ثبت شود. تغییر پیش‌فرض صرفاً پس از تأیید UX.

### RD-IE-07 — Partial apply و rollback (P1)

- شاهد: `index.html:2421-2439` با `checkpoint` و افزودن مستقیم لایه‌ها/دیوارها/آبجکت‌ها کار می‌کند و هیچ `try/catch/rollback` برای خطای میانهٔ اعمال ندارد.
- شاهد: `index.html:628` درج چند تصویر PDF هم پس از checkpoint روی `doc.devices`/assets انجام می‌شود و rollback هنگام خطای render/asset ندارد.
- مقایسه: `index.html:2329-2355` برای واردکردن `.nrd` یک مسیر rollback برای LocalStorage و مدل دارد.
- اصلاح پیشنهادی: candidate document/asset staging بدون جهش در doc جاری، prevalidation، commit معین، rollback در خطای render/persistence؛ حفظ Undo و هشدار عدم دوام تا تکمیل save.

### RD-IE-08 — Peak memory PDF imports/exports (P1)

- شاهد: `assets/pdf-import.js:41-43` همه PNGها به Base64 در `result` باقی می‌مانند تا `onImport`.
- شاهد: `index.html:2035-2080` تمام jpegها را در آرایه `images` نگه می‌دارد و در `parts` هم می‌ریزد؛ برای صفحات زیاد می‌تواند حافظه بزرگی مصرف کند.
- اصلاح پیشنهادی: سقف تعداد/حجم کل صفحه، بودجه پیک حافظه و feedback، پردازش قطعه‌ای/Blob builder، آزمون با ۱۰/۵۰/۱۰۰ صفحه و Safari iOS.

### RD-IE-09 — DXF encoding (P2)

- شاهد: `assets/dxf-import.js:80-81` از `file.text()` استفاده می‌کند و `dxf-engine.js:27-31` متن را به جفت‌کدها تقسیم می‌کند؛ مسیر تفسیر `$DWGCODEPAGE` وجود ندارد.
- اصلاح پیشنهادی: بررسی version/codepage پیش از decode، fallback قابل‌انتخاب، هشدار جایگزینی نویسه‌ها و تست layer names غیر ASCII. هیچ encoding به‌صورت خودکار و بدون شواهد اعلام نشود.

### RD-IE-10 — Hot path برش DXF (P2)

- شاهد: `assets/dxf-import.js:75` در pointermove برای crop، `sync()` فراخوانی می‌شود؛ `47-54` تابع sync، `selectedSegments()` را دوباره اجرا می‌کند؛ `dxf-engine.js:59` همه segmentها را پیمایش و clip می‌کند.
- اصلاح پیشنهادی: جداسازی ترسیم کادر از محاسبه clip، throttle/debounce، درخواست محاسبه در پایان drag یا worker، profiling روی ۲۰k و ۲۰۰k segment.

### RD-IE-11 — Export confirmation (P2)

- شاهد: `index.html:574,2081-2087` fallback دانلود با کلیک anchor و `return true` می‌دهد، اما امکان تأیید نوشته‌شدن فایل توسط browser API ندارد.
- اصلاح پیشنهادی: UI بین «درخواست دانلود صادر شد» و «فایل توسط File System Access API نوشته شد» فرق بگذارد؛ عملیات حذف تاریخچه نیازمند تأیید انسانی جداگانه باقی بماند.

### RD-IE-12 — PDF metadata UX (P2)

- شاهد: `index.html:2088` ورودی‌های طراح و Revision نشان داده می‌شود؛ `saveDrawingPdf:2035-2080` از آنها استفاده نمی‌کند؛ `printNow:2213-2221` از آنها استفاده می‌کند.
- اصلاح پیشنهادی: حالت ذخیرهٔ PDF و حالت چاپ را شفاف تفکیک کنید یا title block / metadata را در خروجی مستقیم نیز پیاده‌سازی کنید.

### RD-IE-13 — PDF physical calibration (P2)

- شاهد: `index.html:628` عرض ۴۸۰ واحد به تصویر PDF اختصاص داده می‌شود، بدون تبدیل ابعاد صفحه/مقیاس CAD.
- این تصویر یک مرجع Raster است، نه هندسه‌ای با طول‌های حقیقی.
- اصلاح پیشنهادی: نمایش «فاقد کالیبراسیون»، اندازه‌گذاری دو نقطه شناخته‌شده و محاسبه scale؛ ذخیره روش کالیبراسیون در سند.

### RD-IE-14 — محدودیت‌های صریح (Not a new defect)

- `DXF-IMPORT.md:15-17`: entities پشتیبانی‌شده و حد تعداد segment ثبت شده‌اند؛ TEXT، ابعاد، HATCH و SPLINE به semantics کامل تبدیل نمی‌شوند.
- `DWG-IMPORT-V347.md:5`: thumbnail مدل مختصاتی نیست؛ تبدیل کامل برای فایل‌های بسیار بزرگ تضمین نشده است.
- `PDF-IMPORT.md:5-9`: PDF واردشده به Raster تبدیل می‌شود نه editable vectors.
- این‌ها در UI باید قبل از Import/Export صریح باشند؛ رفع آنها پروژهٔ جداگانهٔ fidelity است.

## ترتیب اجرایی برای دستورهای N بعدی

1. **N1 — RD-IE-01**: self-contained portable NRD با SVG assets و round-trip
2. **N2 — RD-IE-03/04**: اصلاح DXF round-trip برای `dxfGeometry` و علامت‌گذاری تصاویر unsupported
3. **N3 — RD-IE-02/08**: budget و fail-safe برای PDF image/base64 و حافظه
4. **N4 — RD-IE-05**: DWG hard-cap + enforce output size + مستندات همسو
5. **N5 — RD-IE-06/07**: تأیید واحدها و commit/rollback ایمن
6. **N6 — RD-IE-09/10/11/12/13**: encoding، responsiveness و صداقت UX خروجی

## ماتریس تست پذیرش پیشنهادی

- DXF mm/cm/m + unknown + Windows ANSI/UTF-8؛ مقایسه قطر، جهت محور Y، endpoints، layer names، crop و layer visibility
- DXF recognized-bed/door: `import → identify → save NRD → reopen → export DXF → parse` و مقایسهٔ هندسه
- NRD با SVG سفارشی/کتابخانه محلی: در محیط خالی دیگر restore شود و hash و هندسه برابر باشند
- PDF با ۱/۱۰/۵۰ صفحه، ۳ کیفیت، حالت quota-denied، رندر خراب و انصراف؛ commit نیمه‌کاره نماند
- DWG یک فایل کوچک معتبر، خروجی بسیار بزرگ، کمبود حافظه، timeout، cancellation و خطای worker
- DXF خروجی شامل PDF image و نمادهای unsupported: هشدار قبل از خروجی و قابل فهم بودن lossiness
- هر تست Browser و User Acceptance باید جدا از ممیزی ایستا ثبت شود و تا اجرا `NOT_RUN` بماند.

## پرونده‌های مرجع

- [main index](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/index.html)
- [DXF parser](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/dxf-engine.js)
- [DXF importer](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/assets/dxf-import.js)
- [DWG converter](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/assets/dwg-import.js)
- [DWG worker](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/assets/dwg-worker.mjs)
- [PDF importer](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/assets/pdf-import.js)
- [DXF docs](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/DXF-IMPORT.md)
- [DWG docs](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/DWG-IMPORT-V347.md)
- [PDF docs](https://github.com/comboci/RoomDesigner/blob/c2fcfa617f942c5ea592e61589b234c11b29ce8c/PDF-IMPORT.md)

## وضعیت تحویل

گزارش ایستا و backlog آماده شد. اجرای unit test، browser test، build و تست فایل DWG/PDF واقعی: **NOT_RUN**. پروژه محصول همچنان `V390-R` است. هیچ یک از یافته‌ها با ثبت این سند `FIXED` یا `DONE` نشده‌اند.

## V392-R — تکمیل ایمنی مرز ثبت DXF (بدون اجرای تست)

در ادامهٔ V391-R، پیش از تحویل نقشهٔ واردشده، وجود gesture فعال روی بوم باعث رد ورود می‌شود؛ رندر سند موقت پیش از `clearPointerState()` انجام می‌گیرد تا ذخیرهٔ ناشی از پاک‌سازی gesture پیش از موفقیت رندر فعال نشود. آزمون خطای مرحلهٔ ساخت آبجکت نیز به مسیر واقعی staging منتقل شد و آزمون رد ورود هنگام gesture فعال اضافه شد.

**RD-IE-07 فقط در مسیر DXF به‌صورت سورس اصلاح شده؛ PDF همچنان باز است.** Node/Playwright/Build انجام نشده و پذیرش مرورگری معلق است. RD-IE-01، سایر یافته‌های CAD و تراکنش چندمخزنه نیز باز هستند.

## V393-R — رفع سورسی RD-IE-01 (بدون اجرای تست)

خروجی NRD از این نسخه، یک بسته نسخه‌دار با نمادهای SVG موردارجاع، checksum و سقف حجم است. Import منابع را پیش‌اعتبارسنجی و در یک کپی موقت SVG Draft آماده می‌کند، برخورد شناسه را بدون تخریب نماد موجود مدیریت کرده و تغییر ذخیره‌سازی `rd_svg_drafts` را به Journal ورود پیوند می‌دهد. ۹ سناریوی رگرسیون به سورس اضافه شده‌اند و **اجرا نشده‌اند**؛ Build و پذیرش مرورگری نیز **NOT_RUN** هستند. `RD-IE-01` فقط در سطح سورس **SOURCE_FIXED_RUNTIME_PENDING** است. خطای کمبود فضای ذخیره‌سازی و تراکنش بین LocalStorage/IndexedDB همچنان ریسک مستقل هستند.
 
## V394-R — اصلاح سورسی RD-IE-03 و RD-IE-04 (بدون اجرای تست)

- RD-IE-03: برای آبجکت دارای `dxfGeometry`، قطعه‌خط‌های CAD از مختصات نرمال‌شده با `SvgEngine.transform`، جابه‌جایی، دوران و flip به DXF LINE برگردانده می‌شوند؛ هندسه منبع با نماد عمومی/کادر جایگزین نمی‌شود. حفظ لایهٔ DXF اصلی در صورت موجود بودن ادامه دارد؛ هندسه نامعتبر، Export را متوقف می‌کند.
- RD-IE-04: در خروجی DXF R12، تصاویر Raster از نوع `kind=image` (از جمله PDF) قابل درج نیستند. پیش از بازشدن انتخاب مسیر ذخیره، تأیید صریح درباره تعداد تصاویر حذف‌شونده لازم است؛ لغو هیچ فایلی نمی‌نویسد. حتی پس از تأیید، هیچ `imagePlaceholder()` به‌جای تصویر به DXF صادر نمی‌شود.
- هشت سناریوی رگرسیون برای هندسهٔ door/rotate/flip/source layer، داده CAD نامعتبر، مسیر استاندارد بدون هندسه CAD و هشدار/لغو/پذیرش تصویر به سورس افزوده شدند. هیچ آزمون Node، Playwright، Build، CAD واقعی یا پذیرش کاربر اجرا نشده است (**NOT_RUN / PENDING_USER**).
- هر دو یافته صرفاً در سطح سورس **SOURCE_FIXED_RUNTIME_PENDING** هستند. RD-IE-02/05/06/07(PDF)/08 و سایر موارد باز، همراه با ریسک تراکنش IndexedDB و LocalStorage، محفوظ‌اند.

## V395-R — کنترل منابع و fail-safe ورود/خروج PDF (بدون اجرا)

- RD-IE-08: ورود PDF سقف ۱۶ صفحه در نوبت، ۳٬۰۰۰٬۰۰۰ نویسه Base64 در مجموع و ۵۰۰ صفحه PDF مبدأ دارد؛ خروجی مستقیم نیز به ۲۰ صفحه و ۳۲MiB محدود شده و JPEG صفحات را با Blob صفحه‌به‌صفحه تولید می‌کند. آرایه دوم JPEGهای همه صفحات حذف شده است.
- RD-IE-02: پیش از دستکاری سند زنده، نسخه candidate از PDF با crop/asset/JSON validation ساخته می‌شود. بودجه JSON برابر ۳٬۲۰۰٬۰۰۰ نویسه است و یک نوشتن واقعی در LocalStorage برای rd_last باید موفق شود؛ quota-denied و render failure پیش از افزودن به Undo به کاربر اعلام و وضعیت قبلی حفظ می‌شود.
- ده سناریوی رگرسیون منبع به tests/pdf-resource-budget.test.cjs افزوده شده‌اند: dedup/staging، ورودی نامعتبر، بودجه سند، اعتبارسنجی، quota، render، Undo، stale import و کنترل مسیر خروجی/حدود حافظه.
- وضعیت هر دو مورد: SOURCE_FIXED_RUNTIME_PENDING فقط برای این کنترل‌های سورسی؛ معماری نگهداری تصاویر Base64 در rd_last، تراکنش مستقل IndexedDB/LocalStorage و محدودیت حافظه واقعی موبایل **باز** هستند.
- milestone نسخه V395-R: ممیزی دوره‌ای سورس due است؛ اجرا و پذیرش مرورگری عمداً انجام نشده است (NOT_RUN / PENDING_USER).


## V396-R — RD-IE-05 source remediation (NOT_RUN)

The main DWG dialog now preserves large-file thumbnail preview but blocks full conversion for files over 25 MiB, without user override. Worker guards input size before WASM initialization, output size before its second copy/transfer, and the main thread rejects oversized worker responses before creating File. Both guide and historical preview document are updated.

**RD-IE-05: SOURCE_FIXED_RUNTIME_PENDING.** Native conversion can still allocate excess WASM memory before returning bytes; input/output caps do not impose a hard process-memory limit. Four source regression cases are authored, Node/Playwright/Build/real DWG NOT_RUN, and other open findings remain.

## V397-R — N5 static remediation RD-IE-06 and PDF portion of RD-IE-07 (NOT_RUN)

DXF Import retains centimeter factor 1 as its initial option but requires a separate affirmative scale checkbox before enabling Import for known, mismatched and unknown INSUNITS. Displays source dimensions and converted centimeters, and clears approval when factor/unit changes. Native imported layers carry dxfUnitProvenance and the selected factor is rechecked on entry.

PDF Import retains V395 bounded detached staging, and adds a format-3 rd_pending_import journal scoped to PDF with txId, expected payload checksum, and original rd_last. It persists the image-bearing payload to primary LocalStorage, then a matching rd_import_committed marker, before publishing Undo and scheduling the generation-guarded IndexedDB mirror. Synchronous errors roll back editor, prior bytes and marker where possible. On failed rollback, the journal is retained and writes blocked. Startup treats unmarked staged PDF bytes as uncommitted rather than as proof of success; divergent valid content is preserved for manual review. Later autosaves preserve txId until cleanup.

RD-IE-06: SOURCE_FIXED_RUNTIME_PENDING. RD-IE-07 PDF portion: SOURCE_FIXED_RUNTIME_PENDING. All unit, PDF, quota/failure, Chromium, iOS Safari, Node/Playwright/Build tests NOT_RUN; full cross-store atomicity still OPEN.

## V398-R — N6 source remediation RD-IE-09/10/11/12/13 (NOT_RUN)

- RD-IE-09: byte-level HEADER $DWGCODEPAGE/BOM detection with supported Windows/Asian aliases and manual selector; fatal decoding and U+FFFD refusal for ambiguous legacy bytes. No automatic confidence is claimed for undocumented encodings.
- RD-IE-10: DXF crop pointermove updates only overlay; clipping/recognition occurs after release/cancel. No performance benchmark or real 200k-segment profile was performed.
- RD-IE-11: browser anchor fallback returns requested, never a physical-save acknowledgement; DXF/PDF and recovery messages distinguish it from a successfully closed file handle. User confirmation remains necessary before destructive action.
- RD-IE-12: direct JPEG-based PDF now includes title, designer, revision, date, page number and PDF Info Title/Author/Subject UTF-16BE. The connection report remains print-only and is explicitly disclosed.
- RD-IE-13: each PDF page can be manually calibrated using two points and a known centimeter distance, saved in pdfSource.calibration; uncalibrated legacy width 480 is labeled nonphysical. PDF MediaBox alone is not presumed to define drawing scale.

All five findings are SOURCE_FIXED_RUNTIME_PENDING, not runtime DONE. 21 new source regression scenarios were authored, the existing jsdom DXF concurrency harness was updated, tests/build/Chromium/iOS/real CAD/PDF/performance profiling NOT_RUN. Limits of DXF entity fidelity, browser download confirmation, raster export, font fidelity and cross-store LocalStorage/IndexedDB atomicity remain open.
