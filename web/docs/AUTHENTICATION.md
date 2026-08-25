# Authentication

## الاستراتيجية

يدعم التطبيق مسارين متكاملين: **Manus OAuth** للمستخدمين القادمين من منصة Manus، و**حسابات البريد وكلمة المرور** لواجهات المنتج المستقلة. يظل العميل بعيدًا عن مفاتيح التوقيع وعن password hashes.

مسار OAuth الحالي في `server/_core/oauth.ts` و`server/_core/sdk.ts` لا يُستبدل. بعد نجاح OAuth، تُزامن هوية المستخدم في `users` وتُستخدم `protectedProcedure` لحماية إجراءات tRPC.

## الحساب المحلي

يسجل `POST /auth/register` مستخدمًا باسم وبريد وكلمة مرور مستوفية للشروط. تُخزّن كلمة المرور بصيغة scrypt مع salt عشوائي، ولا تُعاد قيمة `passwordHash` في أي استجابة. يسجل `POST /auth/login` الدخول برسالة خطأ عامة حتى لا يكشف وجود البريد.

بعد التسجيل أو الدخول، يصدر النظام access token قصير العمر داخل cookie محمية، ويصدر refresh token عشوائيًا لا يُخزن خامًا؛ تُحفظ فقط بصمته SHA-256 في `refreshTokens`. يُدوّر refresh token عند `POST /auth/refresh` ويُبطل القديم، بينما يبطل `POST /auth/logout` الرمز الحالي ويمسح cookies.

| المسار | الحماية | الوظيفة |
|---|---|---|
| `POST /auth/register` | rate limit | إنشاء حساب وإصدار جلسة. |
| `POST /auth/login` | rate limit | التحقق من بيانات الدخول وإصدار جلسة. |
| `POST /auth/refresh` | rate limit | تدوير refresh token وإصدار access token جديد. |
| `POST /auth/logout` | عامة | إبطال refresh token الحالي ومسح cookies. |
| `GET /auth/me` | جلسة | إعادة الحقول العامة للمستخدم فقط. |

## الحماية

تستخدم endpoints الخاصة بالمصادقة rate limiter ذاكرةً مؤقتًا لكل عنوان عميل، وتستخدم واجهة الترجمة limiter مستقلة. هذه حماية أساسية مناسبة للتشغيل أحادي العملية؛ يجب نقل counters إلى Redis قبل التوسع الأفقي.

تعتمد الجلسات على cookies `httpOnly` و`Secure` في HTTPS، وتُحافظ على `SameSite=None` بما يتوافق مع البنية الحالية. تضيف مسارات REST `sameOriginGuard`؛ إذا أرسل المتصفح `Origin` يجب أن يطابق `APP_ORIGIN` في production أو أصل الطلب، ولا يفتح التطبيق CORS عامًا. الطلبات غير browser التي لا ترسل Origin لا تُرفض تلقائيًا. لا يثق الخادم في `userId` القادم من العميل عند إنشاء سجلات محمية؛ يتم اشتقاقه من الجلسة المصادق عليها.

## Credentials التشغيلية

للتشغيل الحقيقي يلزم `DATABASE_URL` لقاعدة MySQL/TiDB الحالية و`JWT_SECRET` لتوقيع الجلسات و`OAUTH_SERVER_URL` و`VITE_APP_ID` لمسار Manus OAuth، إضافة إلى `APP_ORIGIN` في الإنتاج لتثبيت سياسة origin. لا تُحفظ هذه القيم في Git أو client bundle.

## ملاحظة توافق

المستودع الحالي مبني على قالب Manus الذي يستخدم Drizzle مع MySQL/TiDB ومفاتيح عددية في الجداول القائمة. لذلك أضيفت جداول المصادقة إلى المخطط المتوافق بدل تحويل النظام القائم إلى PostgreSQL/UUID في منتصف السلسلة؛ هذا التحويل يحتاج migration مستقلة ومراجعة ترحيل كاملة قبل اعتماده.
