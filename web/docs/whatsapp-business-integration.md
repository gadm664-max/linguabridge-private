# تكامل LinguaBridge مع WhatsApp

## الهدف

يوفر التكامل مسارين متكاملين. المسار الأول هو مشاركة رابط دعوة الاجتماع أو رابط المحضر من واجهة LinguaBridge إلى تطبيق WhatsApp الذي يختاره المستخدم بنفسه، ولا يحتاج إلى رمز وصول أو رقم أعمال. المسار الثاني هو مساعد WhatsApp Business اختياري يستقبل نصًا أو مقطعًا صوتيًا من رقم وافق على المراسلة، وينسخه ويترجمه ثم يرد برسالة واضحة لا تحفظ المحتوى إلا وفق سياسة الموافقة.

## حدود المنصة

لا يعمل LinguaBridge داخل حساب WhatsApp شخصي ولا يستبدل مكالمات WhatsApp باجتماعاته. يستخدم المساعد واجهة WhatsApp Business الرسمية فقط. الرسائل الحرة ترسل خلال نافذة خدمة العميل التي تبدأ عندما يراسل المستخدم النشاط، أما خارجها فتتطلب قوالب معتمدة وموافقة المستلم. لذلك لا يُرسل النظام دعوات أو محاضر آلية بلا موافقة ظاهرة.

## تدفق النص

يتحقق الخادم من توقيع `X-Hub-Signature-256` قبل قراءة أي طلب. ثم يستخرج النص، ويتحقق من عدم تكرار معرّف رسالة WhatsApp، ويرسل النص إلى ترجمة LinguaBridge الخادمية. يرد المساعد بالنص الأصلي والترجمة، من دون تسجيل دائم افتراضيًا.

## تدفق الصوت

يرسل WhatsApp في الويب هوك معرف الوسيط الصوتي. يحصل الخادم على رابط تنزيله باستخدام رمز الوصول الخادمي، ويتحقق من النوع والحجم قبل رفع نسخة مؤقتة إلى التخزين ونسخها. ينطبق حد LinguaBridge البالغ 16 MB، كما تتوافق صيغ WhatsApp الصوتية الشائعة مثل AAC وMP3 وM4A وOGG/OPUS. لا تُرسل ملاحظة صوتية مولدة إلا إذا سمح المستخدم بالنطق، وبصيغة OGG/OPUS عند طلب رسالة صوتية أصلية.

## الأمن والخصوصية

| الضابط | التطبيق |
|---|---|
| التحقق | مصافحة GET عبر `hub.verify_token` وتحقق HMAC-SHA256 في POST باستخدام سر تطبيق Meta |
| الأسرار | رمز وصول WhatsApp، سر التطبيق، ومعرّف الرقم تحفظ في الخادم فقط |
| التكرار | تخزن معرفات الرسائل المعالجة بمدة صلاحية لمنع إعادة المعالجة عند محاولات إعادة التسليم |
| الموافقة | لا تحفظ نصوص أو صوتًا في محاضر LinguaBridge دون موافقة الاجتماع؛ لا ترسل رسائل استباقية بلا موافقة مستلم |
| الفشل | يعاد HTTP 200 بعد التحقق والاستلام الآمن؛ تعالج المهام الثقيلة خارج معالجة الويب هوك عند تفعيل الإنتاج |

## متطلبات التفعيل لاحقًا

يتطلب المساعد حساب Meta Business، رقم WhatsApp Business، تطبيق Meta مفعلًا، ومعرّف رقم الهاتف ورمز وصول وسر تطبيق ورمز تحقق للويب هوك. يحتاج العنوان إلى HTTPS بشهادة موثوقة؛ لا تقبل Meta شهادة ذاتية التوقيع.

## ملكية الرقم والتعايش

يوصى باستخدام رقم مخصص لـ LinguaBridge يملكه صاحب المشروع ضمن حساب Meta Business الخاص به. يراه المستخدمون كوجهة لمراسلة المشروع فقط؛ ولا تمنحهم الواجهة أو رقم الأعمال وصولًا إلى حساب المالك أو الرسائل خارج محادثاتهم أو مفاتيح Meta. يمكن لرقم يعمل أصلًا في تطبيق WhatsApp Business أن يتعايش مع Cloud API في مسار Meta الرسمي المناسب، وتبقى المحادثات الفردية متزامنة بين تطبيق الأعمال وCloud API عندما يختار مالك الرقم هذا الربط. لا ينبغي ربط رقم WhatsApp شخصي مع المنصة؛ فالرقم الذي لا يستخدم تطبيق أعمال قد يحتاج إلى حذفه من WhatsApp قبل التسجيل في Cloud API.

يطلب الربط إثبات ملكية الرقم عبر رمز SMS أو مكالمة وإعداد PIN للتحقق الثنائي. يظل المالك أو مسؤولو محفظة الأعمال هم من يديرون التسجيل والحذف والصلاحيات. تُفعّل مزامنة سجل المحادثات فقط إن اختار المالك ذلك صراحة، ولا يحتاج LinguaBridge إلى مزامنة السجل لتشغيل مساعده للرسائل الجديدة.

## مراجع رسمية

- [نظرة WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)
- [إنشاء نقطة ويب هوك والتحقق](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/)
- [رسائل الخدمة وحدود نافذة العميل](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)
- [الرسائل الصوتية والصيغ المدعومة](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages)
- [ربط تطبيق WhatsApp Business وCloud API بالرقم نفسه](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [متطلبات وملكية أرقام الأعمال](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)
- [تسجيل رقم أعمال في Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration)
