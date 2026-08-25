# LinguaBridge — المصدر الخاص

هذا المستودع **خاص** ومملوك لصاحب مشروع LinguaBridge. يحتوي على نسخة مرجعية قابلة للتطوير من تطبيق الويب وتطبيق Expo الأصلي وعقود المشاركة.

| المسار | المحتوى |
|---|---|
| `web/` | منصة LinguaBridge للويب والخادم وقاعدة البيانات وتكامل WhatsApp الآمن. |
| `mobile/` | تطبيق Expo الأصلي لنظامي Android وiOS. |
| `linguabridge-contracts/` | عقود اللغات والخصوصية المشتركة بين المنصتين. |
| `release/` | ملفات التسليم القابلة للتحميل، ولا يحتوي على أسرار. |

## الأمان والملكية

لا يحتوي المستودع على ملفات `.env` أو مفاتيح API أو رموز OAuth أو كلمات مرور. أضف القيم الحساسة إلى إعدادات البيئة أو أسرار الاستضافة فقط، ولا تلتزم بها في Git. يبقى رقم WhatsApp Business وحساب Meta Business وبياناته ملكًا لصاحب المشروع؛ لا يملك المستخدمون الوصول إلى هذه البيانات أو إلى محادثات الآخرين.

## التشغيل المختصر

ابدأ من `web/` لتشغيل منصة الويب، ومن `mobile/` لتشغيل أو بناء التطبيق الأصلي. راجع وثائق التشغيل في `web/docs/` قبل تفعيل تكامل WhatsApp Business أو الاتصال الحي.

> هذه النسخة مرجعية خاصة. لا تجعل المستودع عامًا قبل إزالة أي تكوينات خاصة ومراجعة سياسة الخصوصية.

## Phase 2

أضيفت طبقة المصادقة ومساحات العمل والعضويات، إلى جانب أول Translation Provider حقيقي يعمل عبر بوابة LLM على الخادم. راجع [توثيق Phase 2](web/docs/phase-2-auth-database-translation.md)، و[Authentication](web/docs/AUTHENTICATION.md)، و[Translation API](web/docs/TRANSLATION.md)، و[Architecture](web/docs/ARCHITECTURE.md)، و[Database Decision](web/docs/DATABASE_DECISION.md)، و[Phase 2.1 Security Hardening](web/docs/PHASE_2_1_SECURITY_HARDENING.md) قبل تشغيل migration أو إعداد بيانات الاعتماد.
