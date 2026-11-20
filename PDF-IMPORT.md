# PDF pages as images

Implemented locally for RD-277; published/visible release remains V276 until the user requests publication. Vector object import is deferred.

Use **فایل > واردکردن PDF**. Select a PDF, tick pages, click a thumbnail to preview it, drag a crop rectangle. Move it by dragging inside; resize it using eight corner/edge handles. Crops are independent per page. Reset restores the full page. Quality sets the long side of each full-page raster to 1500/2400/3200 pixels before cropping. PDF page rotation is honored. Import adds the selected pages in document order as independent, proportionally resizable image objects with a 24-unit gap.

`assets/pdf-import.js` owns the modal and lazy thumbnail rendering. Only visible thumbnail pages are queued; preview fits the available area on desktop and mobile. Closing cancels the loading/rendering session without adding objects. Invalid/encrypted files show a readable message. All selected images are prepared before the callback changes the drawing; the batch has one Undo checkpoint. The original PDF is not saved in the document. Each image stores imageAssetId plus pdfSource filename/page/normalized crop. Existing document/image persistence and exports apply.

Mozilla PDF.js 5.6.205 is bundled in assets/vendor/pdfjs with its worker, CMaps, standard fonts, WASM and license notices. It loads only when PDF import is used. All processing stays in the browser, with no CDN or upload. The preview server serves .mjs as JavaScript, .css as CSS and .wasm as application/wasm. Serve through HTTP (local preview or GitHub Pages). File size cap is 80 MB; existing per-image limits remain enforced.

Validation: tests/pdf-import.browser.test.cjs uses ROOM_PDF_FIXTURE if set, otherwise the supplied local ATOUSA sample when present, otherwise generates a portable rotated six-page PDF fixture. It covers actual PDF rendering, pointer crops, page switching, all/none and multiple selection, independent crop state, two non-overlapping image objects, aspect ratio, schema validation, one-step Undo/Redo, reload, cancel, invalid files and mobile dimensions. Reviewed screenshots are ignored under work/. User acceptance remains pending.


RD-278 supersedes the numeric crop UI: percentage fields are removed. Crop-body movement preserves dimensions and stays inside the page. Edge/corner resizing anchors the opposite edge/corner, with a small minimum size. Pointer cancellation restores the previous crop. Keyboard arrows adjust a focused crop/handle by one display pixel; Shift uses ten pixels. Independent page crops, reset and raster import remain unchanged.

## V395-R — مدیریت منابع PDF و ذخیره پیش از اعمال (فقط سورس)

- ورود PDF در هر مرحله حداکثر ۱۶ صفحه انتخاب‌شده و حداکثر ۳٬۰۰۰٬۰۰۰ نویسه Base64 می‌پذیرد؛ فایل‌هایی با بیش از ۵۰۰ صفحه پیش از ساخت فهرست رد می‌شوند. کیفیت‌های تصویر موجود حفظ شده‌اند و در تجاوز از بودجه باید صفحات یا کیفیت کاهش یابد.
- تمام تصاویر ابتدا در یک سند موقت آماده، اعتبارسنجی و در آن ثبت می‌شوند؛ سقف محافظه‌کارانه JSON سند هنگام این ورود ۳٬۲۰۰٬۰۰۰ نویسه است. در صورت خطای رندر یا رد نوشتن واقعی rd_last در LocalStorage، سند و تاریخچه فعال قبلی حفظ می‌شوند. این پیش‌شرط، تضمین سهمیه واقعی ذخیره برای تمام مرورگرها نیست.
- خروجی مستقیم PDF صفحات را یک‌به‌یک با canvas.toBlob() تبدیل و پس از رهاکردن Canvas می‌نویسد؛ دیگر JPEG تمام صفحات در آرایه دوم تجمیع نمی‌شود. سقف خروجی مستقیم ۲۰ صفحه و ۳۲ MiB است؛ برای نقشه‌های بیشتر مسیر چاپ توصیه می‌شود.
- معامله LocalStorage و IndexedDB اتمیک نشده؛ انتقال تصاویر به مخزن binary جداگانه و crash recovery بین مخزن‌ها همچنان کار معماری مستقل است.
- موارد رگرسیونِ منبع افزوده شده‌اند ولی اجرای Node/Playwright/Build/PDF واقعی/iOS هنوز NOT_RUN و تأیید کاربر PENDING_USER است.

## V397-R — PDF transaction journal and rollback (source only)

PDF raster import builds and validates a detached document and renders it before opening the recovery journal. It uses the existing rd_pending_import journal (format 3, scope pdf) and unique txId with previous rd_last bytes and candidate checksum. After a successful actual LocalStorage rd_last write, the importer persists a matching rd_import_committed marker before final Undo/epoch publication. The IndexedDB mirror runs with generation guards; only a matched committed payload clears the journal. Later autosaves keep the txId in the marker.

Synchronous failures attempt rollback of primary bytes, marker, editor drawing and undo history. Failed restoration retains the journal and blocks unsafe persistence. Startup recovery requires a matching txId and checksum for PDF: staged bytes alone do not prove commit. Exact unmarked staged content is treated as rollback eligible, while ambiguous changed data is preserved for manual recovery.

LocalStorage and IndexedDB are not a joint atomic transaction; this is a protective journal rather than guaranteed crash-consistent storage. Tests, Build, real PDF quota failures and Safari acceptance are NOT_RUN / PENDING_USER.

## V398-R — دو نقطه برای کالیبراسیون فیزیکی و Title Block مستقیم

پیش از ورود تصویر PDF، در پیش‌نمایش هر صفحه مقدار فاصلهٔ واقعی به سانتی‌متر را وارد کرده، «تعیین مقیاس با دو نقطه» را فعال کنید و دو نقطه متناظر را روی همان صفحه انتخاب کنید. فاصله در پیکسل‌های رندر همان صفحه و نسبت cm/pixel محاسبه می‌شود و ابعاد عرض/ارتفاع آبجکت از خروجی واقعی با لحاظ Crop استخراج می‌گردد. داده‌های کالیبراسیون همان صفحه در pdfSource.calibration ذخیره می‌شوند؛ تغییر فاصله واقعی یا حذف کالیبراسیون آن را باطل می‌کند. هر صفحه مستقل کالیبره می‌شود.

بدون دو نقطه معتبر، تصویر غیرکالیبره است و برای سازگاری قدیمی با عرض نمایشی ۴۸۰ واحد اضافه می‌شود؛ این عرض مقیاس واقعی CAD نیست. رابط کاربر و سند خروجی، وضعیت mode: uncalibrated را روشن ثبت می‌کنند. MediaBox، DPI و مقیاس چاپ درج‌شده در PDF به‌تنهایی اعتبار طول فیزیکی پلان ندارند. این قابلیت، کالیبراسیون دستی مرجع Raster است نه بازیابی خودکار هندسه Vector.

خروجی مستقیم PDF اکنون، مانند نسخه چاپی، نام نقشه، نام طراح، Revision، تاریخ و شماره صفحه را داخل کادر عنوان به‌صورت Raster قرار می‌دهد و فراداده PDF Info شامل Title/Author/Subject را در UTF-16BE می‌نویسد. جدول ارتباطات همچنان فقط در مسیر چاپ پشتیبانی می‌شود. محدودیت ۲۰ صفحه / ۳۲ MiB نسخه قبلی حفظ می‌شود.

برای ذخیره با File System Access تنها پس از نوشتن و بستن handle پیام «نوشته شد» نمایش داده می‌شود؛ Anchor fallback فقط یک درخواست دانلود است و ذخیره‌شدن فیزیکی آن قابل تأیید توسط نرم‌افزار نیست. تست‌های Node، Playwright، PDF حقیقی، Windows/iOS و Build NOT_RUN هستند و پذیرش کاربر باز است.
