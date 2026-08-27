# LINGUA X — Manus Report for Phase 3A

**Author:** Manus AI
**Repository:** [gadm664-max/linguabridge-private](https://github.com/gadm664-max/linguabridge-private)
**Baseline HEAD before Phase 3A:** `ca96a00` — `docs: add phase 2.1 audit report`
**Current report state:** implementation committed and pushed إلى `main` بنجاح.

## 1. Executive conclusion

بدأ تنفيذ Phase 3A بعد التفويض الصريح المحدد لهذا المسار:

> **Microphone → Audio Stream → Speech-to-Text Provider → Partial Transcript → Final Transcript → Translation Engine**

أصبحت هناك implementation فعلية تشمل التقاط الميكروفون عبر `MediaRecorder`، إرسال chunks قصيرة إلى tRPC، تحقق المصادقة وعضوية الاجتماع والموافقة، طبقة STT قابلة للاستبدال، partial preview اختياري، final transcript خادمي، وتمرير النص النهائي إلى `TranslationService`. لا يُخزن الصوت الخام افتراضيًا.

لا تشمل هذه المرحلة WebRTC أو الصوت متعدد المشاركين أو WhatsApp أو meeting intelligence أو background jobs.

## 2. Provider choices

| Capability              | Selected implementation                                                                                           | Credential location                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Speech-to-text          | `ManusWhisperSpeechToTextProvider` خلف `SpeechToTextProvider`، باستخدام `whisper-1` عبر `v1/audio/transcriptions` | Server-side `BUILT_IN_FORGE_API_URL` و`BUILT_IN_FORGE_API_KEY` |
| Translation             | Existing vendor-neutral `TranslationService` → `TranslationProvider` → `ManusLlmTranslationProvider`              | Server-side built-in gateway credentials                       |
| Browser partial preview | Native `SpeechRecognition` / `webkitSpeechRecognition` when available; preview only وليس مصدر final               | Browser permission فقط، ولا يحتاج API key                      |

لا توجد مفاتيح أو passwords أو session secrets أو raw audio في Git أو client bundle أو logs.

## 3. API endpoint and contract

العقد المنشأ هو tRPC mutation التالي:

`POST /api/trpc/voice.transcribeAndTranslate`

ويُستهلك typed عبر `trpc.voice.transcribeAndTranslate.useMutation()`.

| Input            | Rule                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| `inviteCode`     | 4–16 characters، normalized uppercase                                          |
| `audioBase64`    | 4–8,000,000 characters تقريبًا، مع حد buffer فعلي 16MB                         |
| `mimeType`       | `audio/webm`, `audio/mp4`, `audio/m4a`, `audio/mpeg`, `audio/ogg`, `audio/wav` |
| `sourceLanguage` | 2–16 characters                                                                |
| `targetLanguage` | 2–16 characters                                                                |

النتيجة typed وتحتوي `originalText`, `translatedText`, `detectedLanguage`, `durationSeconds`, `segments`, `provider`, و`model`. يرفض الخادم الطلب قبل STT إذا لم يكن المستخدم authenticated، أو ليس active participant، أو لم تكتمل موافقة جميع المشاركين النشطين.

## 4. Implementation evidence

| File                                         | Implemented responsibility                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `web/server/routers/voice.ts`                | tRPC contract، invite authorization، consent gate، STT→translation chaining، safe errors، Retry-After              |
| `web/server/services/speechToTextService.ts` | `SpeechToTextProvider` interface وManus Whisper adapter وerror mapping                                             |
| `web/server/_core/voiceTranscription.ts`     | multipart STT request، 20-second timeout، 16MB guard، 401/403/429 mapping، malformed response handling             |
| `web/client/src/hooks/useAudioPipeline.ts`   | getUserMedia، MediaRecorder، 4-second bounded chunks، base64، one-at-a-time backpressure، cleanup، partial preview |
| `web/client/src/pages/Meeting.tsx`           | تشغيل/إيقاف pipeline، provisional partial region، وإضافة final original/translation فقط بعد نجاح الخادم            |
| `web/server/routers.ts`                      | تسجيل namespace `voice` داخل `appRouter`                                                                           |
| `web/docs/PHASE_3A.md`                       | العقد، المعمارية، الخصوصية، القيود، environment requirements                                                       |
| `web/docs/ARCHITECTURE.md`                   | تحديث baseline architecture من Phase 2 إلى Phase 3A                                                                |

لا توجد database migrations جديدة؛ لا يحتاج chunked non-persisted audio إلى schema جديد.

## 5. Privacy and retention policy

الصوت الخام يُرسل في الذاكرة إلى endpoint الخادمي ولا يُرفع إلى S3 ولا يُحفظ في database. لا يكتب client hook audio bytes أو transcript content إلى console. بعد final response، تستطيع Meeting استخدام `meetings.saveSegment` لحفظ final text فقط، وبشرط أن تُثبت سياسة الموافقة الجماعية السماح بالحفظ. معالجة الصوت نفسها محمية بالموافقة نفسها اتساقًا مع المسار الصوتي القائم في `mobile.ts`.

## 6. Error semantics

يحوّل STT provider الأخطاء إلى رسائل تطبيقية دون raw upstream body أو exception details. الحالات المغطاة هي empty/oversized/invalid audio، authentication failure 401/403، rate limit 429، timeout، network failure، malformed JSON، malformed response shape، وفشل الترجمة. عند إرسال upstream لـ`Retry-After`، يمرر الخادم قيمة رقمية بالثواني في header نفسه.

| Failure                      | Application behavior                   |
| ---------------------------- | -------------------------------------- |
| Invalid Base64               | tRPC `BAD_REQUEST`                     |
| Audio >16MB                  | `PAYLOAD_TOO_LARGE`                    |
| Missing participant/meeting  | `NOT_FOUND` أو `FORBIDDEN`             |
| Consent incomplete           | `PRECONDITION_FAILED` قبل STT          |
| STT 429                      | `TOO_MANY_REQUESTS` مع `Retry-After`   |
| STT timeout                  | `TIMEOUT`                              |
| STT network/provider failure | `SERVICE_UNAVAILABLE` أو `BAD_GATEWAY` |
| Translation provider failure | safe `BAD_GATEWAY`/service code        |

## 7. Verification record

تم تشغيل النتائج التالية حتى نقطة إعداد هذا التقرير:

| Command                                                                                                                            | Actual result                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `pnpm check` بعد contract/UI wiring                                                                                                | **PASS**                                       |
| `pnpm lint` بعد توسيع script ليشمل ملفات Phase 3A                                                                                  | **PASS**                                       |
| `pnpm vitest run server/routers/voice.test.ts server/services/speechToTextService.test.ts server/routers/mobile.test.ts`           | **12 tests passed**                            |
| `pnpm vitest run server/_core/voiceTranscription.test.ts server/services/speechToTextService.test.ts server/routers/voice.test.ts` | **16 tests passed** |
| `pnpm test` | **PASS — 33 test files / 88 tests passed** |
| `pnpm build` | **PASS**؛ مع تحذيرات analytics placeholders وbundle أكبر من 500kB كما في baseline |
| `pnpm audit --prod` | **PASS — No known vulnerabilities found** |
| `pnpm exec drizzle-kit check` | **BLOCKED/NOT RUNNABLE في sandbox** لأن `DATABASE_URL` غير مضبوط؛ لا توجد schema changes أو migrations في Phase 3A |

ظهرت أثناء التطوير ملاحظة اختبار غير مانعة: تهيئة OAuth تطبع تحذير `OAUTH_SERVER_URL is not configured` في test environment. هذا لا يفشل الاختبارات، ولا يكشف secret.

## 8. Live provider constraint

لم يُنفذ live STT provider call في الاختبارات؛ الاختبارات تستخدم mocks deterministic حتى لا تعتمد على quota أو credentials خارجية ولا ترسل صوتًا حقيقيًا. التشغيل الفعلي يحتاج في بيئة الخادم إلى `BUILT_IN_FORGE_API_URL` و`BUILT_IN_FORGE_API_KEY`، إضافة إلى `DATABASE_URL` وsession/auth configuration الخاصة بالتطبيق للاختبار داخل اجتماع حقيقي. لا يحتاج العميل إلى هذه الأسرار.

## 9. Known limitations

الـpartial transcript ليس partial result من Whisper؛ هو preview محلي اختياري من Web Speech API، بينما final transcript مصدره STT الخادمي فقط. بعض المتصفحات لا توفر `SpeechRecognition` أو لا تدعم صيغة MIME نفسها، وفي هذه الحالة يستمر server STT عند توفر `MediaRecorder` لكن قد لا يظهر partial preview. المسار يرسل chunks قصيرة متتابعة عبر tRPC وليس WebRTC، ولا يعالج صوت مشاركين آخرين.

## 10. GitHub and release status

**GitHub repository:** [https://github.com/gadm664-max/linguabridge-private](https://github.com/gadm664-max/linguabridge-private)

تم تشغيل التحقق النهائي بنجاح قبل الالتزام. commit المنشور هو `0663ff5a3eaa6b249e53361787f13a563f05f6a5` (`feat: implement phase 3A microphone transcription pipeline`) على فرع `main`.

## References

[1]: https://github.com/gadm664-max/linguabridge-private "LinguaBridge private repository"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder "MDN MediaRecorder API"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia "MDN getUserMedia API"
