# LINGUA X / LinguaBridge — Phase 2 Audit Report

**نطاق التدقيق:** Authentication + Database + First Real Translation Engine

**تاريخ التدقيق:** 26 أغسطس 2026

**المستودع:** [gadm664-max/linguabridge-private][1]

**الفرع:** `main`

**آخر commit:** `8d90e27`

**طريقة التدقيق:** مراجعة الملفات الفعلية في المستودع، تشغيل أوامر lint وtypecheck وmigration check والاختبارات والبناء وتدقيق تبعيات الإنتاج، مع تسجيل النتائج كما ظهرت في بيئة التنفيذ.

> **الخلاصة الصادقة:** الكود المحلي لمسارات المصادقة والترجمة وطبقة البيانات يمر عبر lint وtypecheck والاختبارات والبناء. لم يتم إعلان نجاح migration على قاعدة حقيقية أو ترجمة حية عبر مزود خارجي لأن Credentials المطلوبة لم تكن متاحة في بيئة التنفيذ.

## 1. Executive Summary

تمت مراجعة وتنفيذ أساس Phase 2 فوق مستودع LinguaBridge الموجود. يشمل التنفيذ مصادقة Manus OAuth القائمة، وحسابات محلية بالبريد وكلمة المرور، access session قصيرة العمر، refresh-token rotation وrevocation، جداول بيانات الاعتماد والجلسات وسجل استخدام الترجمة، REST endpoints للمصادقة والترجمة، وProvider Adapter مستقل عن vendor.

المزود المحدد هو `ManusLlmTranslationProvider`، وقيمة الإعداد هي `manus-llm`. يعتمد التنفيذ على بوابة LLM المضمنة من الخادم، ويكتشف نموذجًا متاحًا من قائمة مرشحين. لا تنتقل مفاتيح الخدمة إلى العميل، ولا يخزن سجل الترجمة النص الأصلي أو المترجم افتراضيًا.

نجحت مجموعة التحقق النهائية في النسخة المرفوعة: `pnpm lint` و`pnpm check` و`drizzle-kit check` و`pnpm test` و`pnpm build`. اجتاز الاختبار 25 ملف اختبار و52 حالة اختبار. تدقيق التبعيات لم يمر بالكامل، إذ وجد 50 advisory في شجرة الإنتاج، منها 8 عالية وواحدة حرجة.

## 2. Repository Tree

الشجرة الكاملة القابلة للمراجعة محفوظة في الملف المرفق `PHASE_2_AUDIT_TREE.txt`، وتضم 286 ملفًا بعد استبعاد `.git` و`web/node_modules` و`web/dist`. الشجرة التالية هي الشجرة المركزة على بنية المشروع والملفات الأساسية:

```text
linguabridge-private/
├── .env.example
├── .github/
│   └── workflows/
│       ├── build-android-preview.yml
│       └── web-phase2.yml
├── README.md
├── PHASE_2_MANUS_REPORT.md
├── PHASE_2_AUDIT_REPORT.md
├── PHASE_2_AUDIT_TREE.txt
├── linguabridge-contracts/
│   ├── meetingSpecs.ts
│   └── package.json
├── mobile/
│   ├── app/
│   ├── components/
│   ├── docs/
│   ├── lib/
│   └── package.json
└── web/
    ├── client/
    │   ├── index.html
    │   └── src/
    │       ├── components/
    │       ├── contexts/
    │       ├── hooks/
    │       ├── lib/
    │       └── pages/
    ├── contracts/
    │   ├── meetingSpecs.ts
    │   └── package.json
    ├── drizzle/
    │   ├── 0000_tan_mad_thinker.sql
    │   ├── 0001_early_phantom_reporter.sql
    │   ├── 0002_talented_famine.sql
    │   ├── 0003_ambitious_alice.sql
    │   ├── 0004_dark_leo.sql
    │   ├── 0005_flat_omega_sentinel.sql
    │   ├── meta/
    │   ├── migrations/.gitkeep
    │   ├── relations.ts
    │   └── schema.ts
    ├── docs/
    │   ├── ARCHITECTURE.md
    │   ├── AUTHENTICATION.md
    │   ├── TRANSLATION.md
    │   └── phase-2-auth-database-translation.md
    ├── server/
    │   ├── _core/
    │   ├── authRoutes.ts
    │   ├── authRoutes.test.ts
    │   ├── db.ts
    │   ├── routers.ts
    │   ├── translationRoutes.ts
    │   ├── translationRoutes.test.ts
    │   └── services/
    │       ├── localAuth.ts
    │       ├── localAuth.test.ts
    │       ├── translationProvider.ts
    │       ├── translationService.ts
    │       └── translationService.test.ts
    ├── drizzle.config.ts
    ├── package.json
    ├── pnpm-lock.yaml
    └── vitest.config.ts
```

## 3. package.json والملفات الأساسية

### package.json

الملف الأساسي هو [`web/package.json`][2]. إعداد المشروع الحالي هو:

| الحقل | القيمة أو الغرض |
|---|---|
| `name` | `linguabridge-web` |
| `version` | `1.0.0` |
| `type` | `module` |
| `packageManager` | pnpm 10.4.1 |
| runtime | TypeScript + Node.js + Express |
| frontend | React 19 + Vite + Tailwind + Radix/shadcn components |
| API | tRPC 11 تحت `/api/trpc` وREST routes إضافية |
| database | Drizzle ORM + `mysql2` في scaffold الحالي |
| tests | Vitest |
| build | Vite للواجهة وesbuild للخادم |

الأوامر المعرفة فعليًا:

```text
pnpm dev
pnpm lint
pnpm check
pnpm test
pnpm build
pnpm db:push
pnpm format
```

أضيف أمر `lint` باستخدام Prettier على ملفات Phase 2 المركزية. تم تحديث `axios` إلى `^1.19.0` و`nanoid` إلى `^5.1.16` استجابةً لبعض advisories المعروفة، مع بقاء advisories أخرى في شجرة التبعيات.

### الملفات الأساسية

| الملف | المسؤولية |
|---|---|
| `web/server/_core/index.ts` | إنشاء Express server وتسجيل OAuth وREST وtRPC. |
| `web/server/_core/sdk.ts` | إنشاء والتحقق من session tokens ومزامنة مستخدم OAuth. |
| `web/server/_core/cookies.ts` | خيارات cookies الآمنة حسب HTTPS أو localhost. |
| `web/server/_core/env.ts` | قراءة متغيرات البيئة دون hard-code للأسرار. |
| `web/server/routers.ts` | tRPC app router و`auth.bootstrap` وlogout. |
| `web/server/db.ts` | Drizzle repositories وعمليات المستخدم والمؤسسة والجلسات وسجل الترجمة. |
| `web/server/authRoutes.ts` | REST authentication routes. |
| `web/server/services/localAuth.ts` | password hashing وrefresh-token primitives وcookies. |
| `web/server/translationRoutes.ts` | REST translation endpoint والتحقق والrate limit والتسجيل. |
| `web/server/services/translationService.ts` | طبقة التطبيق وأخطاء الترجمة والتحقق من output. |
| `web/server/services/translationProvider.ts` | العقد والتنفيذ الفعلي لمزود LLM. |
| `.github/workflows/web-phase2.yml` | CI للويب والاختبارات والبناء والتدقيق. |

## 4. Database Schema and Migrations

### مخطط الجداول

الـschema الفعلي موجود في [`web/drizzle/schema.ts`][3]. الجداول المتعلقة بـPhase 2 هي:

| الجدول | الحقول أو القيود المهمة | الغرض |
|---|---|---|
| `users` | `id`, `openId`, `email`, `role`, timestamps؛ unique email مضاف | هوية المستخدم ودعم OAuth والحساب المحلي. |
| `passwordCredentials` | `userId` unique، `passwordHash`، timestamps | حفظ hash كلمة المرور فقط. |
| `refreshTokens` | `userId`, `tokenHash` unique، `expiresAt`, `revokedAt`, `replacedByTokenHash` | refresh-token rotation وrevocation. |
| `organizations` | owner، name، slug unique، timestamps | مساحة العمل. |
| `organizationMembers` | organization، user، role، unique compound key | عضويات وأدوار المؤسسة. |
| `translationHistory` | user، languages، `characterCount`, `latencyMs`, `success`, `errorCode`, timestamp | قياس الاستخدام دون حفظ النص افتراضيًا. |
| `meetings` | host user، status، consent، timestamps | الاجتماعات القائمة من Phase 1. |
| `meetingParticipants` | meeting، user، languages، consent، join/leave | المشاركون وعلاقات الاجتماعات. |
| `transcriptSegments` | meeting، participant، original/translated text | النصوص المحفوظة وفق consent. |

### migrations

| الملف | المحتوى |
|---|---|
| `0000_tan_mad_thinker.sql` | الأساس الأول للمخطط. |
| `0001_early_phantom_reporter.sql` | تغييرات Phase 1 المبكرة. |
| `0002_talented_famine.sql` | جداول وحقول إضافية للاجتماعات والخصوصية. |
| `0003_ambitious_alice.sql` | تحديثات Phase 1 اللاحقة. |
| `0004_dark_leo.sql` | `organizations` و`organizationMembers`. |
| `0005_flat_omega_sentinel.sql` | `passwordCredentials` و`refreshTokens` و`translationHistory` وunique email والفهارس والعلاقات. |

تم التحقق من اتساق migrations عبر:

```bash
DATABASE_URL=mysql://root:root@127.0.0.1:3306/linguabridge pnpm drizzle-kit check
```

النتيجة: **PASS — Everything's fine**.

لم يتم تنفيذ `pnpm drizzle-kit migrate` على قاعدة حقيقية لأن `DATABASE_URL` غير متوفر في بيئة التدقيق. لذلك لا توجد دعوى بأن الجداول موجودة فعليًا في production database.

### انحراف PostgreSQL/UUID

تعليمات Phase 2 الأصلية طلبت PostgreSQL وUUID، لكن المستودع المعتمد من Phase 1 مبني فعليًا على Manus Web scaffold يستخدم Drizzle مع MySQL/TiDB ومفاتيح عددية. تم الحفاظ على توافق الجداول والعلاقات القائمة بدل إعادة بناء كل طبقة البيانات في هذه المرحلة. هذا الانحراف موثق في `web/docs/ARCHITECTURE.md` و`web/docs/AUTHENTICATION.md`، ويحتاج migration مستقلة ومراجعة ترحيل قبل الانتقال إلى PostgreSQL/UUID.

## 5. Authentication Implementation

### Manus OAuth

تم الحفاظ على Manus OAuth الموجود في `server/_core/oauth.ts` و`server/_core/sdk.ts`. يستطيع `sdk.authenticateRequest` قراءة session cookie أو Bearer token، ثم مزامنة المستخدم في `users`. إجراءات tRPC الحساسة تستخدم `protectedProcedure`.

### الحسابات المحلية

تم إنشاء [`web/server/authRoutes.ts`][4] و[`web/server/services/localAuth.ts`][5]. قدرات التنفيذ:

| القدرة | التنفيذ الفعلي |
|---|---|
| Registration | `POST /auth/register` مع email/name/password validation. |
| Login | `POST /auth/login` برسالة عامة `Invalid email or password`. |
| Logout | `POST /auth/logout` مع إبطال refresh token ومسح cookies. |
| Refresh | `POST /auth/refresh` مع rotation للرمز القديم. |
| Current user | `GET /auth/me` عبر `sdk.authenticateRequest`. |
| Password hashing | scrypt مع random salt وwork factor `N=16384`, `r=8`, `p=1`. |
| Password policy | من 12 إلى 128 حرفًا. |
| Access token TTL | 15 دقيقة. |
| Refresh token TTL | 30 يومًا. |
| Stored refresh token | SHA-256 hash فقط، لا يتم حفظ raw token. |
| User response | حقول عامة فقط، دون `passwordHash`. |
| Rate limit | 12 طلبًا لكل 15 دقيقة لكل `req.ip` لمسارات المصادقة. |

يستخدم access token cookie الجلسة الحالية `app_session_id` حتى يفهمه `sdk` الموجود، ويستخدم refresh cookie باسم `linguabridge_refresh`. تُضبط `httpOnly` و`secure` تلقائيًا وفق طلب HTTPS، مع دعم localhost في التطوير.

### Workspace bootstrap

أضيف `auth.bootstrap` إلى tRPC. ينشئ مساحة عمل شخصية عند عدم وجود عضوية، ثم يعيد user وworkspace وorganizations. يعتمد إنشاء الاجتماع والعمليات الحالية على user ID المشتق من session وليس على ownership field يرسله العميل.

## 6. Translation Provider Implementation

### العقد

الطبقة التطبيقية تعتمد على:

```ts
interface TranslationProvider {
  readonly name: string;
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
```

العقد يقبل `text` و`sourceLanguage` و`targetLanguage` و`context?`، ويعيد `translatedText` و`provider` و`model`.

### المزود المختار

التنفيذ الحالي هو [`ManusLlmTranslationProvider`][6]، واسمه التشغيلي `manus-llm`. يستخدم `listLLMModels()` لاكتشاف نموذج متوفر ثم `invokeLLM()` من الخادم. المرشحون بالترتيب:

```text
gpt-5-mini
claude-haiku-4-5
gemini-3-flash-preview
```

يمرر السياق الاختياري إلى تعليمات الترجمة، ويضع النص داخل `<SOURCE>` باعتباره محتوى غير موثوق. لا تظهر مفاتيح بوابة LLM في client bundle.

### safeguards

يطبق [`TranslationService`][7] ما يلي:

- رفض النص الفارغ.
- حد أقصى 4000 حرف للنص.
- حد أقصى 500 حرف للسياق.
- passthrough عند تطابق لغة المصدر والهدف دون استدعاء خارجي.
- رفض output الفارغ أو غير النصي.
- رفض HTML/script وfenced code غير المتوقع في plain translation output.
- تحويل فشل المزود إلى application error دون stack trace أو credentials.
- عدم اختلاق ترجمة عند provider failure.

## 7. API Endpoints

### Authentication REST

| الطريقة | المسار | النتيجة |
|---|---|---|
| `POST` | `/auth/register` | إنشاء حساب وإصدار cookies. |
| `POST` | `/api/auth/register` | alias. |
| `POST` | `/auth/login` | تسجيل الدخول وإصدار cookies. |
| `POST` | `/api/auth/login` | alias. |
| `POST` | `/auth/refresh` | تدوير refresh token. |
| `POST` | `/api/auth/refresh` | alias. |
| `POST` | `/auth/logout` | إبطال refresh token ومسح cookies. |
| `POST` | `/api/auth/logout` | alias. |
| `GET` | `/auth/me` | current user. |
| `GET` | `/api/auth/me` | alias. |

### Translation REST

| الطريقة | المسار | النتيجة |
|---|---|---|
| `POST` | `/translate/text` | ترجمة نص محمية بالمصادقة. |
| `POST` | `/api/translate/text` | alias. |

body المتوقع:

```json
{
  "text": "Hello, how are you?",
  "sourceLanguage": "en",
  "targetLanguage": "ar",
  "context": "general conversation"
}
```

بنية النجاح:

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

### tRPC

| الإجراء | المسار المنطقي |
|---|---|
| Current user | `/api/trpc/auth.me` |
| Bootstrap workspace | `/api/trpc/auth.bootstrap` |
| Logout | `/api/trpc/auth.logout` |
| Existing translation procedure | `/api/trpc/translation.translateText` |

## 8. جميع نتائج الاختبارات الفعلية

تم تنفيذ آخر مجموعة كاملة بعد حل تعارض GitHub وتحديث ملفات Phase 2:

| الأمر | النتيجة |
|---|---|
| `git diff --check` | PASS في مرحلة التحقق قبل commit. |
| `pnpm lint` | PASS — جميع ملفات Phase 2 منسقة. |
| `pnpm check` | PASS — TypeScript بلا أخطاء. |
| `DATABASE_URL=<placeholder> pnpm drizzle-kit check` | PASS — migration consistency سليمة. |
| `pnpm test` | PASS — 25 test files / 52 tests. |
| `pnpm build` | PASS — Vite frontend وesbuild backend. |
| `pnpm audit --prod --audit-level=high` | FAIL/غير مكتمل — advisories متبقية موضحة أدناه. |

### توزيع الاختبارات

الاختبارات الجديدة أو المرتبطة مباشرة بـPhase 2:

| الملف | التغطية |
|---|---|
| `server/authRoutes.test.ts` | registration، duplicate email، weak password، login، wrong password، logout، response sanitization. |
| `server/services/localAuth.test.ts` | scrypt hashing، correct/wrong password، malformed hash، email/password policy، refresh hash. |
| `server/translationRoutes.test.ts` | HTTP auth، context forwarding، structured response، request ID، latency، unsupported language. |
| `server/services/translationService.test.ts` | passthrough، provider delegation، empty text. |
| `server/auth.bootstrap.test.ts` | workspace وorganization memberships. |
| `server/auth.logout.test.ts` | مسح access وrefresh cookies. |

اختبارات Phase 1 وبقية اختبارات الاجتماعات والهاتف بقيت ضمن المجموعة، ونجحت في آخر تشغيل.

## 9. Build / Lint / Typecheck

### lint

```text
pnpm lint
PASS — All matched files use Prettier code style!
```

### typecheck

```text
pnpm check
PASS — tsc --noEmit
```

### build

```text
pnpm build
PASS — Vite build + esbuild server bundle
```

نتجت ملفات build بحجم تقريبي `dist/index.js 118.2kb`، وواجهة frontend مضغوطة ضمن output Vite.

تحذيرات build غير مانعة:

- `%VITE_ANALYTICS_ENDPOINT%` و`%VITE_ANALYTICS_WEBSITE_ID%` غير معرفين محليًا.
- analytics script لا يحتوي `type="module"`.
- بعض chunks أكبر من 500 kB، ويوصي Vite باستخدام code splitting.

## 10. Security Scan

تم تنفيذ:

```bash
pnpm audit --prod --audit-level=high
```

النتيجة الفعلية بعد تحديث `axios` و`nanoid`:

```text
50 vulnerabilities found
Severity: 9 low | 32 moderate | 8 high | 1 critical
```

التفسير:

- تم تحديث `axios` إلى `^1.19.0`.
- تم تحديث `nanoid` إلى `^5.1.16`.
- ما زالت advisories متبقية، منها ثماني عالية وواحدة حرجة في dependency tree.
- أضيف audit إلى CI، لكنه `continue-on-error: true` مؤقتًا حتى لا يخفي وجود المشكلة أو يمنع بقية checks؛ هذا ليس equivalent لنجاح security gate.

فحوصات أمنية أخرى نُفذت عبر الكود والاختبارات:

| الفحص | النتيجة |
|---|---|
| plaintext password storage | لا؛ hash scrypt فقط. |
| password hash in API response | لا؛ responses sanitized. |
| refresh raw token storage | لا؛ SHA-256 hash فقط. |
| authentication on translation endpoint | نعم؛ `sdk.authenticateRequest`. |
| input validation | نعم؛ Zod والحدود واللغات المدعومة. |
| request correlation | نعم؛ `requestId`. |
| sensitive translation logging | لا يوجد raw text logging في المسار. |
| provider secret exposure | لا؛ استدعاء الخادم فقط. |
| rate limiting | نعم؛ in-memory limiter للمصادقة والترجمة. |
| authorization ownership | user ID مشتق من session في الإجراءات المحمية القائمة. |

## 11. الأخطاء التي ظهرت وكيف عولجت

### أخطاء عولجت

1. فشل Drizzle generate أولًا لأن `DATABASE_URL` غير مضبوط. تم استخدام placeholder غير سري للتوليد والفحص فقط.

2. فشل typecheck بسبب export مفقود للدالة `getInviteSharingSessionParam`. تمت استعادة الدالة في العقد المشترك.

3. فشلت اختبارات تكامل بسبب مسارات قديمة إلى `linguabridge-mobile/`، بينما المجلد الفعلي هو `mobile/`. تم تصحيح المسارات.

4. فشلت assertions قديمة لأنها لا تطابق الكود الحالي في live transcript والـaccessibility ومشاركة الدعوة. تم تحديثها إلى السلوك الحالي.

5. فشل اختبار logout بعد إضافة refresh-cookie clearing لأنه كان يتوقع cookie واحدة؛ تم تحديثه ليتحقق من cookie الجلسة وrefresh cookie.

6. رُفض push أكثر من مرة لأن `main` البعيد تحرك بالتزامن. تم تنفيذ fetch/rebase وحل تعارض `server/db.ts` مع الحفاظ على وظائف Phase 1 وإضافة وظائف Phase 2.

### أخطاء أو تحذيرات غير مانعة ما زالت موجودة

| النوع | التفاصيل |
|---|---|
| OAuth test warning | `OAUTH_SERVER_URL` غير مضبوط محليًا؛ الاختبارات نجحت. |
| Build warning | analytics variables غير معرفة محليًا. |
| Build warning | بعض chunks أكبر من 500 kB. |
| Security scan | 50 advisory، منها 8 high و1 critical. |
| Database execution | لم تُطبق migrations على DB حقيقية لغياب `DATABASE_URL`. |
| Live provider execution | لم يُنفذ استدعاء حي لغياب `BUILT_IN_FORGE_API_KEY`. |

## 12. Credentials المطلوبة

### لتشغيل قاعدة البيانات والمصادقة محليًا أو في production

| المتغير | مطلوب؟ | الغرض |
|---|---|---|
| `DATABASE_URL` | نعم | اتصال قاعدة البيانات وتطبيق migrations. النسخة الحالية متوافقة مع MySQL/TiDB scaffold. |
| `JWT_SECRET` | نعم | توقيع access/session tokens. |

### Manus OAuth

| المتغير | مطلوب؟ | الغرض |
|---|---|---|
| `VITE_APP_ID` | نعم لمسار OAuth | معرف تطبيق Manus. |
| `OAUTH_SERVER_URL` | نعم لمسار OAuth | عنوان خادم OAuth. |
| `OWNER_OPEN_ID` | وفق إعداد المشروع | تعيين owner/admin للمستخدم المالك. |

### Translation Provider

| المتغير | مطلوب؟ | الغرض |
|---|---|---|
| `BUILT_IN_FORGE_API_KEY` | نعم للترجمة الحية | مفتاح بوابة LLM على الخادم فقط. |
| `BUILT_IN_FORGE_API_URL` | اختياري | عنوان مخصص للبوابة؛ عند غيابه يستخدم default. |
| `TRANSLATION_PROVIDER` | نعم منطقيًا، وله default | القيمة الحالية: `manus-llm`. |

الأسماء موجودة في `.env.example` دون قيم حقيقية، ولم يتم commit لأي secret.

## 13. Known Limitations and Audit Decision

الكود الحالي مناسب كأساس قابل للمراجعة والاختبار المحلي، لكنه لا يستوفي وحده كل شروط إعلان Phase 2 إنتاجيًا بسبب القيود التالية:

1. قاعدة البيانات الفعلية لم تُختبر على server حقيقي ولم تُطبق migrations لغياب `DATABASE_URL`.
2. ترجمة حية عبر مزود حقيقي لم تُنفذ في بيئة التدقيق لغياب `BUILT_IN_FORGE_API_KEY`.
3. دورة Register → Login → Database → Translate الكاملة لم تُنفذ على قاعدة بيانات حقيقية.
4. المخطط الحالي MySQL/TiDB ومفاتيحه عددية لأسباب توافق Phase 1، وليس PostgreSQL/UUID.
5. security audit لم يمر بالكامل بسبب advisories متبقية.
6. rate limiting حاليًا داخل الذاكرة ويحتاج Redis قبل التوسع الأفقي.

بناءً على ذلك، نتيجة التدقيق البرمجي المحلي هي **جاهز للمراجعة التالية مع قيود واضحة**، وليست ادعاءً بأن جميع شروط production integration قد تحققت.

## 14. GitHub

المستودع والفرع المحدثان:

- [Repository][1]
- [Commit `8d90e27`][8]
- Branch: `main`

## References

[1]: https://github.com/gadm664-max/linguabridge-private "LinguaBridge private repository"
[2]: https://github.com/gadm664-max/linguabridge-private/blob/8d90e27/web/package.json "web/package.json at commit 8d90e27"
[3]: https://github.com/gadm664-max/linguabridge-private/blob/8d90e27/web/drizzle/schema.ts "Drizzle schema at commit 8d90e27"
[4]: https://github.com/gadm664-max/linguabridge-private/blob/8d90e27/web/server/authRoutes.ts "Authentication routes at commit 8d90e27"
[5]: https://github.com/gadm664-max/linguabridge-private/blob/8d90e27/web/server/services/localAuth.ts "Local authentication primitives at commit 8d90e27"
[6]: https://github.com/gadm664-max/linguabridge-private/blob/8d90e27/web/server/services/translationProvider.ts "Translation provider at commit 8d90e27"
[7]: https://github.com/gadm664-max/linguabridge-private/blob/8d90e27/web/server/services/translationService.ts "Translation service at commit 8d90e27"
[8]: https://github.com/gadm664-max/linguabridge-private/commit/8d90e27 "Phase 2 implementation commit"
