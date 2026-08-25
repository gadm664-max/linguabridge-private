# LINGUA X Architecture

## حدود المرحلة

تستخدم منصة الويب الحالية React وExpress وtRPC وDrizzle. ينفذ الخادم المصادقة، الوصول إلى قاعدة البيانات، وطبقة الترجمة، بينما يبقى العميل مستهلكًا لعقود API ولا يحمل مفاتيح مزودي الخدمات.

```text
Browser
  ├── Manus OAuth / local auth cookies
  ├── tRPC /api/trpc
  └── REST /auth/* and /translate/text
        │
        ├── authRoutes + translationRoutes
        ├── services/localAuth
        ├── services/translationService
        │     └── TranslationProvider → ManusLlmTranslationProvider
        └── Drizzle repositories → MySQL/TiDB schema
```

## الهوية والتفويض

يقرأ `sdk.authenticateRequest` session cookie أو Bearer token، ثم يزامن المستخدم في `users`. تستخدم إجراءات الأعمال `protectedProcedure` أو تحقق REST المكافئ. لا تُقبل ownership fields من العميل عند إنشاء البيانات المحمية؛ تُشتق هوية المستخدم من السياق المصادق عليه.

تضمن `organizations` و`organizationMembers` ربط المستخدم بمساحة عمل وأحد الأدوار الثلاثة: `owner` أو `admin` أو `member`. تنشئ `auth.bootstrap` مساحة عمل شخصية عند غياب عضوية سابقة.

## البيانات

تحتوي migration `0004_dark_leo.sql` على المؤسسات والعضويات. تحتوي migration `0005_flat_omega_sentinel.sql` على `passwordCredentials` و`refreshTokens` و`translationHistory`. لا يخزن `translationHistory` النص الأصلي أو المترجم افتراضيًا.

## الترجمة

يفصل `TranslationService` عقد التطبيق عن المزود. يطبق endpoint حدود اللغة والطول والسياق، ويعيد request ID وlatency. يعالج الخدمة فشل المزود واستجابته المشوهة كأخطاء تطبيقية دون إعادة stack trace أو أسرار.

## الأمن والتوسع

تستخدم كلمات المرور scrypt مع salt عشوائي، وتخزن refresh tokens بصمات SHA-256 فقط مع rotation وrevocation. تستخدم مسارات cookie-backed REST same-origin guard مع `APP_ORIGIN` اختياري، ولا تفتح CORS عامًا. يستخدم rate limiter ذاكرةً مؤقتةً حاليًا؛ يجب استبداله بـ Redis قبل تشغيل أكثر من instance. يستخدم LLM gateway timeout قدره 20 ثانية وإعادة محاولة محدودة لـ429/5xx/network، مع أخطاء منظمة لا تعيد response body أو الأسرار. تظل migration المتوافقة مع MySQL/TiDB ومفاتيح الجداول العددية قرار توافق مع Phase 1، بينما يتطلب الانتقال إلى PostgreSQL/UUID مرحلة ترحيل مستقلة.

## ما بعد Phase 2

لا تشمل هذه المرحلة live microphone streaming أو STT أو TTS أو WebRTC أو mobile أو WhatsApp أو meeting intelligence. يجب تصميم هذه المكونات لاحقًا لتستهلك provider contracts الحالية دون نقل مفاتيح المزود إلى العملاء.
