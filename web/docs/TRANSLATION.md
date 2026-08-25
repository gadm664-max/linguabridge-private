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

النص الوارد يُعامل كمحتوى غير موثوق داخل delimiters واضحة. لا تُسجل قيمة النص أو الترجمة في السجلات التشغيلية. عند فشل المزود لا تُخترع ترجمة بديلة؛ يُعاد خطأ تطبيقي عام مع `requestId` للتتبع.

## التحقق والأخطاء

| الحالة | HTTP | code |
|---|---:|---|
| جلسة مفقودة | 401 | `UNAUTHORIZED` |
| body غير صالح | 400 | `VALIDATION_ERROR` |
| نص فارغ | 400 | `EMPTY_TEXT` |
| لغة غير مدعومة | 422 | `UNSUPPORTED_LANGUAGE` |
| نص يتجاوز 4000 حرف | 413 | `TEXT_TOO_LONG` |
| عدد طلبات زائد | 429 | `RATE_LIMITED` |
| فشل أو timeout أو استجابة غير صالحة من المزود | 502 | `PROVIDER_UNAVAILABLE` أو `MALFORMED_PROVIDER_RESPONSE` |

## Translation History

يسجل `translationHistory` user ID واللغتين وعدد الأحرف وlatency وحالة النجاح ورمز الخطأ والتوقيت. لا يخزن النص الأصلي أو النص المترجم افتراضيًا، لأن النصوص قد تكون حساسة.

## الإعداد

اضبط `TRANSLATION_PROVIDER=manus-llm`، ووفر إعدادات بوابة LLM عبر متغيرات الخادم. لا تضع المفتاح في client bundle أو `.env.example` أو Git.

## الحدود الحالية

التحقق من endpoint ومزود الاختبار ينفذان محليًا، لكن استدعاء المزود الحي يحتاج `BUILT_IN_FORGE_API_KEY` في بيئة التشغيل. لا تشمل هذه المرحلة streaming للصوت أو WebRTC أو STT أو TTS أو ملخصات الاجتماعات.
