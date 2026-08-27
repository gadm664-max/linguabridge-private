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
        │     └── TranslationProviderRegistry → Provider A / Provider B / Provider C
        │           └── ManusLlmTranslationProvider (registered production provider)
        ├── services/speechToTextService
        │     └── SpeechProvider → STT A / STT B
        │           └── ManusWhisperSpeechProvider (registered production provider)
        └── Drizzle repositories → MySQL/TiDB schema
```

## الهوية والتفويض

يقرأ `sdk.authenticateRequest` session cookie أو Bearer token، ثم يزامن المستخدم في `users`. تستخدم إجراءات الأعمال `protectedProcedure` أو تحقق REST المكافئ. لا تُقبل ownership fields من العميل عند إنشاء البيانات المحمية؛ تُشتق هوية المستخدم من السياق المصادق عليه.

تضمن `organizations` و`organizationMembers` ربط المستخدم بمساحة عمل وأحد الأدوار الثلاثة: `owner` أو `admin` أو `member`. تنشئ `auth.bootstrap` مساحة عمل شخصية عند غياب عضوية سابقة.

## البيانات

تحتوي migration `0004_dark_leo.sql` على المؤسسات والعضويات. تحتوي migration `0005_flat_omega_sentinel.sql` على `passwordCredentials` و`refreshTokens` و`translationHistory`. لا يخزن `translationHistory` النص الأصلي أو المترجم افتراضيًا.

## الترجمة

يفصل `TranslationService` عقد التطبيق عن المزود عبر `TranslationProviderRegistry`. يقرأ `TRANSLATION_PROVIDER` ترتيبًا مفصولًا بفواصل، ويبني fallback chain من المزودين المسجلين؛ عند نجاح أحدهم تُعاد metadata الخاصة بالمزود الذي خدم الطلب، وعند فشل الجميع يُعاد آخر خطأ structured دون stack trace أو أسرار. المزود المتاح والمسجل حاليًا هو `ManusLlmTranslationProvider` باسم `manus-llm`، بينما Provider B/C نقاط توسعة لا تُفعل قبل تسجيل implementation وcredentials مستقلة.

## الأمن والتوسع

تستخدم كلمات المرور scrypt مع salt عشوائي، وتخزن refresh tokens بصمات SHA-256 فقط مع rotation وrevocation. تستخدم مسارات cookie-backed REST same-origin guard مع `APP_ORIGIN` اختياري، ولا تفتح CORS عامًا. يستخدم rate limiter ذاكرةً مؤقتةً حاليًا؛ يجب استبداله بـ Redis قبل تشغيل أكثر من instance. يستخدم LLM gateway timeout قدره 20 ثانية وإعادة محاولة محدودة لـ429/5xx/network، مع أخطاء منظمة لا تعيد response body أو الأسرار. تظل migration المتوافقة مع MySQL/TiDB ومفاتيح الجداول العددية قرار توافق مع Phase 1، بينما يتطلب الانتقال إلى PostgreSQL/UUID مرحلة ترحيل مستقلة.

## Phase 3A — الصوت القصير والنص المترجم

تضيف Phase 3A مسارًا محدودًا من `MediaRecorder` في المتصفح إلى `voice.transcribeAndTranslate` عبر tRPC، مع chunks افتراضية مدتها 4 ثوانٍ. يتحقق الخادم من الجلسة، والعضوية الفعالة، وموافقة جميع المشاركين قبل معالجة الصوت. يمر STT عبر `SpeechService` و`SpeechProvider` مع registry/fallback داخلي لـSTT A/B، بينما تمر الترجمة عبر `TranslationService` و`TranslationProviderRegistry`. لا يُخزن الصوت الخام؛ ويُحفظ النص النهائي فقط عبر مسار الاجتماع القائم عندما تسمح سياسة الموافقة. المزود المسجل فعليًا حاليًا هو `ManusWhisperSpeechProvider` باسم `manus-whisper`، مع `STT_PROVIDER` لترتيب المزودين المسجلين.

التفاصيل التشغيلية والعقود والقيود موثقة في [`PHASE_3A.md`](./PHASE_3A.md). لا تشمل هذه المرحلة WebRTC أو الصوت متعدد المشاركين أو WhatsApp أو meeting intelligence أو أي تشغيل خلفي.
