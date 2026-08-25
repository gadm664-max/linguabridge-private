# Translation API

## endpoint

يقدم الخادم `POST /translate/text`، ويتاح أيضًا عبر `/api/translate/text`. يتطلب endpoint جلسة مصادقًا عليها، ويتحقق من body قبل أي استدعاء خارجي.

```json
{
  "text": "Hello, how are you?",
  "sourceLanguage": "en",
  "targetLanguage": "ar",
  "context": "general conversation"
}
```

الاستجابة الناجحة لا تحتوي على أسرار المزود:

```json
{
  "sourceLanguage": "en",
  "targetLanguage": "ar",
  "originalText": "Hello, how are you?",
  "translatedText": "...",
  "provider": "manus-llm",
  "model": "...",
  "requestId": "...",
  "latencyMs": 123
}
```

## Provider Adapter

تعتمد طبقة التطبيق على `TranslationProvider` فقط. التنفيذ الحالي `ManusLlmTranslationProvider` يستخدم بوابة LLM المضمنة على الخادم، يكتشف نموذجًا متاحًا من قائمة النماذج، ويمرر السياق الاختياري إلى prompt مضبوط. يمكن استبداله لاحقًا بمزود ترجمة متخصص دون تعديل endpoint أو المستهلكين.

النص الوارد يُعامل كمحتوى غير موثوق داخل delimiters واضحة. لا تُسجل قيمة النص أو الترجمة في السجلات التشغيلية. عند فشل المزود لا تُخترع ترجمة بديلة؛ يُعاد خطأ تطبيقي عام مع `requestId` للتتبع. بوابة LLM تستخدم timeout قدره 20 ثانية، وتعيد المحاولة حتى أربع مرات فقط لـ429 و5xx وأخطاء الشبكة، بينما لا تعيد محاولة 4xx الأخرى. لا يُعاد upstream response body إلى العميل.

## التحقق والأخطاء

| الحالة | HTTP | code |
|---|---:|---|
| جلسة مفقودة | 401 | `UNAUTHORIZED` |
| body غير صالح | 400 | `VALIDATION_ERROR` |
| نص فارغ | 400 | `EMPTY_TEXT` |
| لغة غير مدعومة | 422 | `UNSUPPORTED_LANGUAGE` |
| نص يتجاوز 4000 حرف | 413 | `TEXT_TOO_LONG` |
| عدد طلبات زائد | 429 | `RATE_LIMITED` |
| فشل مصادقة بوابة المزود | 502 | `AUTHENTICATION_FAILED` |
| بوابة المزود غير متاحة أو خطأ شبكة | 503 | `NETWORK_FAILURE` أو `UPSTREAM_FAILURE` |
| timeout من بوابة المزود | 504 | `TIMEOUT` |
| rate limit من بوابة المزود | 429 | `RATE_LIMITED` مع `Retry-After` |
| استجابة مزود مشوهة أو بلا نص | 502 | `MALFORMED_RESPONSE` أو `MALFORMED_PROVIDER_RESPONSE` |

## Translation History

يسجل `translationHistory` user ID واللغتين وعدد الأحرف وlatency وحالة النجاح ورمز الخطأ والتوقيت. لا يخزن النص الأصلي أو النص المترجم افتراضيًا، لأن النصوص قد تكون حساسة.

## الإعداد

اضبط `TRANSLATION_PROVIDER=manus-llm`، ووفر `BUILT_IN_FORGE_API_URL` اختياريًا و`BUILT_IN_FORGE_API_KEY` على الخادم. لا تضع المفتاح في client bundle أو `.env.example` أو Git. في production اضبط `APP_ORIGIN` حتى يرفض REST router origins غير المصرح بها؛ الطلبات غير browser يمكنها العمل دون Origin header.

## الحدود الحالية

التحقق من endpoint ومزود الاختبار ينفذان محليًا، لكن استدعاء المزود الحي يحتاج `BUILT_IN_FORGE_API_KEY` في بيئة التشغيل. لا تشمل هذه المرحلة streaming للصوت أو WebRTC أو STT أو TTS أو ملخصات الاجتماعات.
