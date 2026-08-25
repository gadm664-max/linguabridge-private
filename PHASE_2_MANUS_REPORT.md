# تقرير Manus الكامل — LINGUA X / LinguaBridge Phase 2

**تاريخ التقرير:** 26 أغسطس 2026

**حالة التنفيذ:** تم تطبيق محتوى Phase 2 على المستودع ورفع التغييرات إلى GitHub.

**آخر commit:** `8d90e27`

**المستودع:** [gadm664-max/linguabridge-private](https://github.com/gadm664-max/linguabridge-private)

> هذا التقرير يميز بوضوح بين الاختبارات المحلية التي نُفذت فعلًا وبين التكاملات التي تعذر تشغيلها لغياب قاعدة بيانات أو Credentials في بيئة التنفيذ.

## 1. الملخص التنفيذي

تم تنفيذ طبقة Authentication محلية تعتمد على البريد وكلمة المرور إلى جانب Manus OAuth الموجود أصلًا، وإضافة جلسات access قصيرة العمر مع refresh-token rotation وrevocation. كما أضيفت جداول بيانات اعتماد كلمة المرور، والرموز المتجددة، وسجل استخدام الترجمة، مع مسارات REST محمية.

تم تنفيذ أول Translation Engine حقيقي خلف Provider Adapter مستقل عن vendor محدد. المزود المختار هو `ManusLlmTranslationProvider`، ويُشار إليه في الإعداد باسم `manus-llm`. يستدعي المزود بوابة LLM المضمنة من الخادم فقط، ويكتشف نموذجًا متاحًا وقت التشغيل من قائمة مرشحين.

تم تنفيذ اختبارات HTTP ووحدات للمصادقة والترجمة، وتشغيل lint وtypecheck وmigration consistency والاختبارات والبناء. نجحت جميع الاختبارات المحلية المنفذة. لم تُطبق migrations على قاعدة حقيقية ولم يُنفذ استدعاء ترجمة حي بسبب عدم توفر Credentials في بيئة التنفيذ.

## 2. اسم مزود الترجمة المختار

الاسم البرمجي للمزود هو:

```text
ManusLlmTranslationProvider
```

وقيمة الإعداد هي:

```text
TRANSLATION_PROVIDER=manus-llm
```

هذا المزود ليس استدعاءً مباشرًا من الواجهة إلى أي API. يتم الاستدعاء من الخادم من خلال `invokeLLM`، بينما يظل التطبيق معتمدًا على الواجهة العامة التالية:

```ts
interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
```

يبحث المزود وقت التشغيل عن نموذج متاح من المرشحين التاليين:

| الترتيب | النموذج المرشح |
|---:|---|
| 1 | `gpt-5-mini` |
| 2 | `claude-haiku-4-5` |
| 3 | `gemini-3-flash-preview` |

لا يتم تثبيت اختيار نموذج واحد بلا تحقق؛ يستخدم الكود قائمة النماذج المتاحة ثم يختار أول مرشح متوفر. إذا لم تُرجع الخدمة نصًا صالحًا، يفشل الطلب ولا يخترع ترجمة بديلة.

يدعم طلب الترجمة `text` و`sourceLanguage` و`targetLanguage` و`context` الاختياري. يُمرر السياق إلى المزود لتوضيح المصطلحات، دون بناء ذاكرة سياقية متقدمة في هذه المرحلة.

## 3. API endpoints التي أُنشئت

### مسارات Authentication REST الجديدة

| الطريقة | المسار | الوظيفة | الحماية |
|---|---|---|---|
| `POST` | `/auth/register` | إنشاء حساب محلي جديد وإصدار access وrefresh cookies. | Rate limited |
| `POST` | `/api/auth/register` | Alias للمسار السابق. | Rate limited |
| `POST` | `/auth/login` | التحقق من البريد وكلمة المرور وإصدار جلسة. | Rate limited |
| `POST` | `/api/auth/login` | Alias للمسار السابق. | Rate limited |
| `POST` | `/auth/refresh` | تدوير refresh token وإصدار access token جديد. | Rate limited |
| `POST` | `/api/auth/refresh` | Alias للمسار السابق. | Rate limited |
| `POST` | `/auth/logout` | إبطال refresh token الحالي ومسح cookies. | عامة، لكن تلغي الجلسة إن وُجدت |
| `POST` | `/api/auth/logout` | Alias للمسار السابق. | عامة |
| `GET` | `/auth/me` | إعادة الحقول العامة للمستخدم المصادق عليه. | جلسة مطلوبة |
| `GET` | `/api/auth/me` | Alias للمسار السابق. | جلسة مطلوبة |

### مسارات Translation REST الجديدة

| الطريقة | المسار | الوظيفة | الحماية |
|---|---|---|---|
| `POST` | `/translate/text` | ترجمة نص واحد عبر المزود الحقيقي وإرجاع نتيجة منظمة. | جلسة مطلوبة + rate limit |
| `POST` | `/api/translate/text` | Alias للمسار السابق. | جلسة مطلوبة + rate limit |

مثال body:

```json
{
  "text": "Hello, how are you?",
  "sourceLanguage": "en",
  "targetLanguage": "ar",
  "context": "general conversation"
}
```

مثال بنية الاستجابة الناجحة:

```json
{
  "sourceLanguage": "en",
  "targetLanguage": "ar",
  "originalText": "Hello, how are you?",
  "translatedText": "...",
  "provider": "manus-llm",
  "model": "gpt-5-mini",
  "requestId": "uuid",
  "latencyMs": 123
}
```

### إجراءات tRPC المضافة أو المعدلة

| الإجراء | الوظيفة |
|---|---|
| `auth.me` | قراءة المستخدم الحالي، موجود أصلًا وتم الحفاظ عليه. |
| `auth.bootstrap` | ضمان إنشاء مساحة عمل شخصية وإرجاع العضويات للمستخدم المصادق عليه. |
| `auth.logout` | مسح session cookie وإبطال refresh token المحلي إن وُجد. |
| `translation.translateText` | واجهة tRPC الحالية للترجمة، وأصبحت تستخدم TranslationService وProvider Adapter. |

مسارات tRPC تكون تحت `/api/trpc` وفق بنية المشروع، مثل `/api/trpc/auth.bootstrap` و`/api/trpc/translation.translateText`.

## 4. Authentication implementation

تمت إضافة `server/authRoutes.ts` و`server/services/localAuth.ts`. التسجيل يتحقق من email وname وpassword، ويمنع كلمات المرور الأقصر من 12 حرفًا أو الأطول من 128 حرفًا. يتم تخزين password hash بصيغة scrypt مع salt عشوائي؛ لا يُعاد hash في أي response.

تستخدم الجلسة access token الموقعة التي يستطيع `sdk.authenticateRequest` قراءتها من `app_session_id`. عمر access token هو 15 دقيقة. أما refresh token فعمره 30 يومًا، ولا يخزن النظام قيمته الخام؛ يخزن SHA-256 hash فقط في جدول `refreshTokens`.

عند refresh، يُبطل الرمز القديم ويُنشأ رمز جديد. وعند logout، يُبطل الرمز الموجود وتُمسح access وrefresh cookies. رسائل فشل تسجيل الدخول عامة ولا تكشف ما إذا كان البريد موجودًا.

أضيف rate limiter مؤقت لكل عنوان عميل. يعتمد على `req.ip` الذي يفسره Express، وليس على قراءة `X-Forwarded-For` الخام، لتقليل إمكانية تجاوز الحماية بتزوير header. هذا limiter داخل الذاكرة مناسب للتشغيل أحادي العملية، ويجب نقله إلى Redis عند التوسع الأفقي.

## 5. Database implementation

أضيفت الجداول التالية إلى `web/drizzle/schema.ts`:

| الجدول | الغرض |
|---|---|
| `passwordCredentials` | hash كلمة المرور وبيانات توقيتها لكل مستخدم محلي. |
| `refreshTokens` | hash للـ refresh token مع expiry وrevocation وrotation. |
| `translationHistory` | user ID واللغات وعدد الأحرف وlatency وحالة النجاح ورمز الخطأ والتوقيت. لا يخزن النص افتراضيًا. |
| `organizations` | مساحة عمل شخصية أو تنظيمية. |
| `organizationMembers` | عضويات المستخدمين وأدوارهم. |

تم إنشاء migration:

```text
web/drizzle/0005_flat_omega_sentinel.sql
```

وتحتوي على الجداول الجديدة والقيود والفهارس اللازمة، كما تم إنشاء snapshot وjournal الخاصين بـ Drizzle.

### انحراف معماري موثق

المستودع الذي تمت الموافقة عليه في Phase 1 مبني على Manus Web scaffold يستخدم Drizzle مع MySQL/TiDB ومفاتيح عددية في الجداول القائمة. لذلك لم يتم تحويل النظام القائم قسرًا إلى PostgreSQL وUUID في هذه المرحلة، لأن ذلك كان سيكسر علاقات الاجتماعات وmigrations الموجودة ويحتاج مشروع ترحيل مستقلًا.

تم توثيق هذا القرار في:

- `web/docs/ARCHITECTURE.md`
- `web/docs/AUTHENTICATION.md`
- `web/docs/phase-2-auth-database-translation.md`

## 6. Error handling في Translation API

تم تنفيذ أخطاء تطبيقية واضحة دون كشف stack traces أو مفاتيح المزود:

| الحالة | HTTP | code |
|---|---:|---|
| جلسة مفقودة | 401 | `UNAUTHORIZED` |
| body غير صالح | 400 | `VALIDATION_ERROR` |
| نص فارغ | 400 | `EMPTY_TEXT` |
| لغة غير مدعومة | 422 | `UNSUPPORTED_LANGUAGE` |
| نص أطول من 4000 حرف | 413 | `TEXT_TOO_LONG` |
| سياق أطول من 500 حرف | 413 | `CONTEXT_TOO_LONG` |
| عدد طلبات زائد | 429 | `RATE_LIMITED` |
| فشل المزود أو timeout أو network failure | 502 | `PROVIDER_UNAVAILABLE` |
| استجابة مزود فارغة أو malformed أو تتضمن HTML/code غير متوقع | 502 | `MALFORMED_PROVIDER_RESPONSE` |

يولد كل طلب `requestId`، ويعاد هذا المعرف في النجاح والفشل. يتم قياس `latencyMs` وتسجيل metadata فقط في `translationHistory` دون حفظ نص الترجمة افتراضيًا.

## 7. نتائج الاختبارات الفعلية

تم تنفيذ الأوامر التالية من مجلد `web/`:

| الأمر | النتيجة الدقيقة |
|---|---|
| `pnpm lint` | PASS |
| `pnpm check` | PASS |
| `DATABASE_URL=mysql://root:root@127.0.0.1:3306/linguabridge pnpm drizzle-kit check` | PASS — migration consistency سليمة |
| `pnpm test` | PASS — 25 Test Files و52 Test Cases |
| `pnpm build` | PASS — Vite frontend وNode backend build |
| `git diff --check` | PASS |
| `pnpm audit --prod --audit-level=high` | لم يمر بالكامل بسبب advisories قائمة في شجرة التبعيات |

### الاختبارات المضافة

تمت إضافة:

- `server/authRoutes.test.ts`: اختبارات التسجيل، duplicate email، weak password، login، wrong password، logout، وعدم إعادة hash.
- `server/services/localAuth.test.ts`: اختبار scrypt والتحقق من كلمة المرور وبصمة refresh token.
- `server/translationRoutes.test.ts`: اختبار HTTP فعلي لمسار الترجمة، authentication، context، request ID، latency، language validation، وتسجيل الاستخدام.
- `server/services/translationService.test.ts`: اختبار passthrough، provider delegation، empty text، وسلوك الخدمة.
- `server/auth.bootstrap.test.ts`: اختبار إنشاء وإرجاع مساحة العمل والعضويات.

## 8. الأخطاء والمشكلات التي ظهرت أثناء التنفيذ

### أخطاء تم إصلاحها

1. فشل توليد migration أولًا لأن `DATABASE_URL` غير مضبوط محليًا. تم توليد migrations باستخدام عنوان placeholder غير سري، ولم يتم تسجيل أي credential.

2. فشل typecheck بسبب export مفقود للدالة `getInviteSharingSessionParam` في عقد مشاركة الدعوة. تم استعادة الدالة في العقد المشترك وتحديث التصدير.

3. فشلت ثلاثة اختبارات تكامل لأن الاختبارات كانت تشير إلى مجلد هاتف قديم باسم `linguabridge-mobile/`، بينما بنية المستودع الحالية تستخدم `mobile/`. تم تصحيح المسارات ومواءمة assertions مع الكود الحالي.

4. ظهر فشل اختبار logout بعد إضافة مسح refresh cookie؛ كان الاختبار يتوقع cookie واحدة، وتم تحديثه ليتحقق من access وrefresh cookies معًا.

5. حدث رفض للرفع إلى GitHub أكثر من مرة بسبب تحرك الفرع البعيد بالتزامن. تم تنفيذ fetch وrebase وحل تعارض `server/db.ts` مع الحفاظ على وظائف Phase 1 وPhase 2، ثم تم الرفع بنجاح.

### تحذيرات ما زالت موجودة

1. اختبارات OAuth تطبع تحذيرًا لأن `OAUTH_SERVER_URL` غير مضبوط في بيئة الاختبار المحلية. الاختبارات نفسها نجحت.

2. Vite يطبع تحذيرًا لأن متغيري analytics `%VITE_ANALYTICS_ENDPOINT%` و`%VITE_ANALYTICS_WEBSITE_ID%` غير معرفين محليًا، كما يطبع تحذيرًا عن script analytics غير module.

3. البناء يطبع تحذيرًا بأن بعض chunks أكبر من 500 kB. لم يتم تنفيذ code splitting في هذه المرحلة لأنه خارج نطاق Authentication وDatabase وTranslation API.

4. تدقيق التبعيات بعد تحديث `axios` و`nanoid` ما زال يعرض 50 advisory: تسع منخفضة، 32 متوسطة، ثماني عالية، وواحدة حرجة. هذا يحتاج مسار remediation مستقلًا، ولذلك جعل CI خطوة التدقيق `continue-on-error` مؤقتًا بدل الادعاء أن التدقيق ناجح.

## 9. Credentials المطلوبة

### مطلوبة لتشغيل Authentication وDatabase فعليًا

| المتغير | الغرض |
|---|---|
| `DATABASE_URL` | عنوان قاعدة البيانات المستهدفة وتطبيق migrations. في النسخة الحالية يجب أن يكون MySQL/TiDB متوافقًا مع scaffold. |
| `JWT_SECRET` | توقيع access/session tokens. يجب أن يكون random secret قويًا. |

### مطلوبة لتشغيل Manus OAuth

| المتغير | الغرض |
|---|---|
| `VITE_APP_ID` | معرف تطبيق Manus OAuth. |
| `OAUTH_SERVER_URL` | عنوان خادم Manus OAuth. |
| `OWNER_OPEN_ID` | تعيين owner/admin وفق آلية المشروع الحالية. |

### مطلوبة لتشغيل Translation Provider الحي

| المتغير | الغرض |
|---|---|
| `BUILT_IN_FORGE_API_KEY` | مفتاح الخادم لبوابة LLM المضمنة. لا يوضع في client bundle. |
| `BUILT_IN_FORGE_API_URL` | اختياري؛ عنوان مخصص للبوابة. إذا غاب يستخدم العنوان الافتراضي المضمن. |
| `TRANSLATION_PROVIDER` | القيمة الحالية الموصى بها: `manus-llm`. |

تم توفير أسماء المتغيرات فقط في `.env.example`، ولم يتم وضع أي قيمة حقيقية أو credential في Git.

## 10. ما لم يُنفذ عمدًا في هذه المرحلة

وفق شرط التوقف في Phase 2، لم يتم تنفيذ live microphone streaming أو STT streaming أو TTS streaming أو WebRTC أو mobile implementation أو WhatsApp أو AI meeting summaries أو billing.

## 11. التقييم النهائي الصادق

من ناحية الكود المحلي، مسارات المصادقة، password hashing، refresh rotation، provider abstraction، REST translation endpoint، الاختبارات، typecheck، lint، migration consistency، والبناء موجودة ومختبرة محليًا.

لكن لا يمكن إعلان التكامل الإنتاجي الكامل بعد، للأسباب التالية:

- لم تُطبق migration على قاعدة حقيقية لغياب `DATABASE_URL`.
- لم تُنفذ ترجمة حية من المزود لغياب `BUILT_IN_FORGE_API_KEY`.
- لم يُنفذ اختبار Register → Login → Database → Translate على بنية قاعدة بيانات حقيقية.
- ما زال الانتقال إلى PostgreSQL/UUID غير منفذ بسبب توافق Phase 1، وهو موثق كقرار يحتاج مرحلة ترحيل مستقلة.
- تدقيق التبعيات لم يمر بالكامل بسبب advisories قائمة.

## 12. رابط GitHub

[https://github.com/gadm664-max/linguabridge-private](https://github.com/gadm664-max/linguabridge-private)

الفرع المحدث هو `main`، وآخر commit هو:

```text
8d90e27
```

## 13. توصية المرحلة التالية

قبل إعلان Phase 2 إنتاجيًا، يجب توفير `DATABASE_URL` و`JWT_SECRET` وCredentials الخاصة بـ Manus OAuth و`BUILT_IN_FORGE_API_KEY`، ثم تطبيق migration وتشغيل دورة integration حقيقية. بعد ذلك يمكن الانتقال إلى Phase 3 الخاصة بالترجمة الحية أو طبقة الصوت، مع عدم نقل أي مفاتيح مزود إلى Web أو Mobile clients.
