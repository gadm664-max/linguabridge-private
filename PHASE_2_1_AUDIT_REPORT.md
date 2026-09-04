# LinguaBridge — Phase 2.1 Audit Report

**Author:** Manus AI  
**Repository:** [gadm664-max/linguabridge-private](https://github.com/gadm664-max/linguabridge-private)  
**Final commit:** `38e441f` — `feat: complete phase 2.1 hardening`  
**Scope:** Security hardening, dependency remediation, database decision, provider reliability, authentication/translation verification, and production-readiness review.  
**Decision:** **PASS for Phase 2.1 scope; NOT production-ready until external credentials, a real database, and the documented deployment gates are supplied.**

## 1. Executive summary

تم تطبيق محتوى Phase 2.1 مباشرة على مستودع LinguaBridge. شملت النتيجة تدقيقًا أمنيًا للتبعيات، تخفيضًا فعليًا للثغرات، تحويل dependency audit في CI إلى gate مانع للفشل، إضافة اختبارات تكامل للمسار الكامل من التسجيل إلى الترجمة، تقوية LLM provider configuration، إضافة timeout وretry policy وأخطاء منظمة، وحماية REST cookie-backed routes من origins غير المصرح بها.

تم أيضًا تسجيل قرار قاعدة البيانات: **PostgreSQL + UUID هو الهدف المعماري طويل الأجل، لكن لا تُنفذ هجرة جزئية داخل Phase 2.1**. المستودع الحالي مرتبط بـDrizzle/MySQL-TiDB ومفاتيح رقمية في جداول الاجتماعات والاختبارات والمستودعات، ولا توجد قاعدة PostgreSQL provisioned أو credentials تسمح باختبار cutover آمن. لذلك أُنشئت خطة ترحيل مستقلة مع rollback وbackfill وforeign-key validation بدل تغيير المحرك بصورة غير قابلة للعكس.

> النتيجة العملية: اجتازت النسخة فحوصات lint وtypecheck وmigration consistency والاختبارات والبناء، كما أصبح `pnpm audit --prod --audit-level=high` ناجحًا وظهر `No known vulnerabilities found` في production graph النهائي.

## 2. Repository and delivered changes

المستودع الخاص موجود في [GitHub](https://github.com/gadm664-max/linguabridge-private)، والفرع `main` متزامن مع commit `38e441f`. تم الحفاظ على تحديثات GitHub البعيدة أثناء rebase ولم يُستخدم force-push.

| Area | Delivered implementation |
|---|---|
| Dependency security | تحديث `@aws-sdk/client-s3` و`s3-request-presigner` إلى `3.1118.0`، و`@trpc/*` إلى `11.8.0`، و`drizzle-orm` إلى `0.45.2`، و`express` إلى `5.2.1`، و`streamdown` إلى `2.6.0`، وإضافة `mdast-util-to-hast@13.2.1` ضمن test/build dependency graph. |
| CI | إزالة `continue-on-error` من dependency audit، وجعل `pnpm audit --prod --audit-level=high` blocking. |
| Database decision | إنشاء `web/docs/DATABASE_DECISION.md` مع مقارنة MySQL/TiDB وPostgreSQL+UUID وخطة ترحيل كاملة. |
| Provider reliability | إضافة `LlmGatewayError` و`TranslationProviderError`، وتصنيف auth/rate-limit/timeout/network/upstream/malformed errors، مع timeout 20 ثانية وretry محدود لـ429/5xx/network. |
| Translation safety | عدم إعادة upstream body أو secrets، عدم اختلاق ترجمة عند failure، ودعم `Retry-After` عند provider rate limit. |
| Auth and CSRF | إضافة `APP_ORIGIN` و`sameOriginGuard` لمسارات auth/translation، مع إبقاء CORS العام مغلقًا. |
| Integration verification | إضافة `phase21.integration.test.ts` لمسار Register → session cookie → authenticated translation → usage record. |
| Test coverage | إضافة provider error tests، refresh rotation tests، rate-limit test، CSRF origin tests، وإصلاح assertion متقادم بعد rebase. |
| Documentation | تحديث `README.md` و`ARCHITECTURE.md` و`AUTHENTICATION.md` و`TRANSLATION.md` وإنشاء `PHASE_2_1_SECURITY_HARDENING.md`. |

## 3. Database architecture decision

### Current state

| Property | Current repository state |
|---|---|
| ORM | Drizzle ORM |
| Driver | `mysql2` |
| Dialect | MySQL/TiDB |
| IDs | Auto-increment numeric `int` |
| Auth identity | `users.id` numeric relation plus unique `openId` for Manus OAuth |
| Migrations | Drizzle SQL migrations through `0005_flat_omega_sentinel.sql` |
| Main repository | `web/server/db.ts` with MySQL query builder and numeric ID assumptions |
| Existing graph | Users → organizations/memberships → meetings → participants → transcript artifacts |

### Decision

القرار هو **عدم تغيير المحرك أو types في Phase 2.1**. PostgreSQL+UUID بقي target architecture، ويجب تنفيذه قبل Phase 3 فقط كمرحلة database migration مستقلة بعد provisioned staging وbackup وrestore rehearsal. السبب أن التحويل الحالي ليس connection-string change؛ بل يتطلب تعديل schema وforeign keys وDrizzle dialect وrepository types وfixtures وOAuth/session mappings وtranscript references وanalytics dimensions.

الخطة التفصيلية موثقة في [`web/docs/DATABASE_DECISION.md`](web/docs/DATABASE_DECISION.md)، وتشمل inventory، provisioning، target schema، UUID shadow/mapping، users-first backfill، meetings graph backfill، dual verification، rollback rehearsal، read-only cutover، وpost-cutover monitoring.

## 4. Authentication and session implementation

يدعم المستودع Manus OAuth والحساب المحلي بالتوازي. مسارات الحساب المحلي هي:

| Endpoint | Method | Protection | Behavior |
|---|---:|---|---|
| `/auth/register` | POST | Rate limit + same-origin | Validates email/name/password، ينشئ المستخدم والـcredential ويصدر access/refresh cookies. |
| `/auth/login` | POST | Rate limit + same-origin | يتحقق من scrypt hash برسالة عامة لا تكشف وجود البريد. |
| `/auth/refresh` | POST | Rate limit + same-origin | يتحقق من hash للـrefresh token، يبطل القديم، ويدور رمزًا جديدًا. |
| `/auth/logout` | POST | Same-origin | يبطل refresh token الحالي ويمسح access وrefresh cookies. |
| `/auth/me` | GET | Session + same-origin | يعيد الحقول العامة للمستخدم فقط. |

تستخدم كلمات المرور `scrypt` مع salt عشوائي. لا يُعاد `passwordHash` للعميل. تحفظ refresh tokens كبصمات SHA-256 فقط، مع `revokedAt` و`expiresAt` وrotation. يعتمد REST على `app_session_id` access cookie و`linguabridge_refresh` refresh cookie، وتطبق cookies `HttpOnly` و`Secure` تلقائيًا عند HTTPS وفق التنفيذ الحالي.

أضيف `sameOriginGuard`: إذا أرسل المتصفح `Origin` يجب أن يطابق `APP_ORIGIN` المعرّف في بيئة الإنتاج أو أصل الطلب عند غيابه. لا يفتح التطبيق CORS عامًا، وتبقى الطلبات غير browser التي لا ترسل Origin ممكنة للاستخدام server-to-server.

**قيود تشغيلية:** rate limiter حاليًا in-memory ومناسب لعملية واحدة فقط. قبل التوسع الأفقي يجب نقله إلى Redis أو counter store مركزي. كما يجب ضبط `JWT_SECRET` و`APP_ORIGIN` و`DATABASE_URL` وبيانات Manus OAuth في secret manager.

## 5. Translation provider implementation

اسم المزود المختار هو **`manus-llm`**، والتنفيذ هو `ManusLlmTranslationProvider` عبر بوابة LLM المضمنة من الخادم. لا يوجد provider-specific API key في client bundle. يستخدم المزود `BUILT_IN_FORGE_API_URL` اختياريًا و`BUILT_IN_FORGE_API_KEY` على الخادم، ويكتشف نموذجًا متاحًا من `listLLMModels()` وفق المرشحين الموجودين في الكود، ثم يستدعي `invokeLLM()`.

يُمرر السياق الاختياري إلى system prompt مضبوط، ويُحاط النص الداخل بـ`<SOURCE>` ويُعامل كمحتوى اجتماع غير موثوق لا كتعليمات. يتحقق `TranslationService` من اللغة والطول والسياق، ينفذ passthrough للغتين المتطابقتين، ويرفض النصوص الفارغة أو المخرجات المشوهة أو HTML/code patterns غير الآمنة.

### Reliability contract

| Condition | Internal error code | HTTP | Behavior |
|---|---|---:|---|
| Missing/invalid gateway credentials | `AUTHENTICATION_FAILED` | 502/503 | لا يعاد secret أو upstream body. |
| Gateway 429 | `RATE_LIMITED` | 429 | retry محدود ثم `Retry-After` عند توفره. |
| Gateway timeout | `TIMEOUT` | 504 | timeout بعد 20 ثانية لكل محاولة، مع backoff محدود. |
| Network failure | `NETWORK_FAILURE` | 503 | retry محدود ثم رسالة عامة. |
| Gateway 5xx | `UPSTREAM_FAILURE` | 502 | retry محدود ثم رسالة عامة. |
| Invalid JSON or empty choices | `MALFORMED_RESPONSE` / `MALFORMED_PROVIDER_RESPONSE` | 502 | لا تُخترع ترجمة بديلة. |

سياسة retry لا تعيد محاولة 4xx العادية، وتعتمد backoff مع jitter وتقرأ `Retry-After`. لا يُسجل النص الأصلي أو النص المترجم في logs أو `translationHistory` افتراضيًا؛ يسجل السجل user ID واللغتين وعدد الأحرف والlatency والنجاح ورمز الخطأ والتوقيت.

### API endpoints

| Endpoint | Alias | Auth | Input constraints |
|---|---|---|---|
| `POST /translate/text` | `POST /api/translate/text` | Required session | source/target supported language، text ≤ 4000 chars، context ≤ 500 chars. |

الاستجابة الناجحة تحتوي `sourceLanguage` و`targetLanguage` و`originalText` و`translatedText` و`provider` و`model` و`requestId` و`latencyMs`. لا تحتوي على access token أو provider key أو upstream body.

## 6. Dependency security audit

### Before Phase 2.1

تم تسجيل الوضع السابق كالآتي:

```text
50 vulnerabilities found
Severity: 9 low | 32 moderate | 8 high | 1 critical
```

أهم المسارات كانت `fast-xml-parser` عبر AWS SDK، و`tRPC 11.6.0`، و`drizzle-orm 0.44.6`، و`path-to-regexp 0.1.12` عبر Express 4، و`lodash-es` عبر Streamdown/Mermaid، و`lodash` عبر Recharts 2.

### Remediation

| Finding | Remediation | Result |
|---|---|---|
| `fast-xml-parser` critical/high through AWS SDK | AWS SDK packages to `3.1118.0` and resolved graph refresh | Removed from final production audit. |
| tRPC prototype-pollution advisory | `@trpc/client`, `@trpc/react-query`, `@trpc/server` to `11.8.0` | Removed from final audit. |
| Drizzle SQL identifier advisory | `drizzle-orm` to `0.45.2` | Removed from final audit. |
| Express path-to-regexp ReDoS | Express to `5.2.1` after full typecheck/tests/build | Removed from final audit. |
| Streamdown Mermaid/Lodash-es chain | Streamdown to `2.6.0` and test verification | Removed from final audit. |
| `mdast-util-to-hast` moderate | `13.2.1` resolved in production graph | Removed from final audit. |
| Recharts 2 lodash chain | No unsafe major migration; behavior verified and final audit clean | Recharts 3 migration remains future cleanup. |

### Final scan

تم تشغيل:

```bash
pnpm audit --prod
pnpm audit --prod --audit-level=high
```

والنتيجة الفعلية في الحالتين:

```text
No known vulnerabilities found
```

وحقق blocking high-severity gate exit code `0`. بقيت تحذيرات deprecation غير الأمنية لبعض الحزم، لكنها لا تظهر كـknown vulnerability في final production graph.

## 7. Actual verification results

تم تشغيل الأوامر التالية بعد آخر rebase وإصلاح regression في invite-sharing contract:

| Command | Actual result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS — all listed files formatted. |
| `pnpm check` | PASS — TypeScript no errors. |
| `DATABASE_URL=<placeholder> pnpm drizzle-kit check` | PASS — `Everything's fine`. |
| `pnpm test` | PASS — 29 test files / 69 tests. |
| `pnpm build` | PASS — Vite + server esbuild completed. |
| `pnpm audit --prod --audit-level=high` | PASS — no known vulnerabilities. |
| `git diff --check` | PASS before commit. |
| `git push origin main` | PASS after safe fetch/rebase; `origin/main` = `38e441f`. |

### Test inventory

The final suite includes existing Phase 1 tests plus:

| Test file | Coverage |
|---|---|
| `server/phase21.integration.test.ts` | Register → authenticated session → translation → usage record. |
| `server/services/translationProvider.test.ts` | Model discovery, success, timeout, rate-limit, auth, network, malformed response. |
| `server/security.test.ts` | Same-origin allow/reject behavior. |
| `server/authRoutes.test.ts` | Register, login, weak/duplicate credentials, refresh rotation, invalid refresh, logout. |
| `server/translationRoutes.test.ts` | Auth, context forwarding, validation, and rate limiting. |
| `server/services/translationService.test.ts` | Passthrough, delegated translation, and empty input. |

## 8. Build warnings and known errors

لا توجد أخطاء build أو lint أو typecheck في النتيجة النهائية. ظهرت التحذيرات التالية وهي موثقة وليست مخفية:

| Warning | Meaning | Action |
|---|---|---|
| `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` undefined | Analytics placeholders are absent in local build. | Supply analytics values only if analytics is enabled; otherwise remove placeholders from `index.html`. |
| Umami script lacks `type="module"` | Vite cannot bundle the analytics placeholder script. | Fix analytics integration in a separate cleanup. |
| Client JS chunk >500 kB | Bundle size warning, not build failure. | Add route/component code splitting and manual chunks later. |
| `@builder.io/vite-plugin-jsx-loc` peer expects Vite 4/5 but Vite 7.1.9 is installed | Tooling peer mismatch. | Replace/update plugin or document compatibility in CI. |
| Recharts 2 branch deprecated | Upstream maintenance warning. | Plan Recharts 3 migration; do not mix with Phase 2.1 security work. |
| OAuth test logs report missing `OAUTH_SERVER_URL` | Expected in local unit-test environment; OAuth is not exercised against a live provider. | Supply OAuth env in staging and add live smoke test. |
| Database migration not applied | No real `DATABASE_URL` was available. | Apply migrations only after staging DB provisioning and backup rehearsal. |
| Live LLM call not executed | No real `BUILT_IN_FORGE_API_KEY` was available. | Run authenticated staging smoke test before production claim. |

## 9. Credentials and external prerequisites

لا توجد credentials حقيقية مضافة إلى Git. لتشغيل المسار الكامل في staging أو production يحتاج المشروع إلى:

| Credential / configuration | Why it is needed | Storage rule |
|---|---|---|
| `DATABASE_URL` | Connect and apply MySQL/TiDB migrations currently used by the repo. | Secret manager; never Git. |
| `JWT_SECRET` | Sign access sessions and protect cookie-backed auth. | Secret manager; rotate before production. |
| `OAUTH_SERVER_URL` | Manus OAuth provider endpoint. | Secret/environment configuration. |
| `VITE_APP_ID` | Manus OAuth application identity. | Environment configuration according to deployment policy. |
| `OWNER_OPEN_ID` | Owner bootstrap/authorization behavior where enabled. | Secret/environment configuration. |
| `APP_ORIGIN` | Production same-origin/CSRF allowlist. | Explicit HTTPS origin; no wildcard. |
| `BUILT_IN_FORGE_API_KEY` | Live `manus-llm` translation provider calls. | Server-only secret; never client bundle. |
| `BUILT_IN_FORGE_API_URL` | Optional custom gateway URL. | Server environment only. |

المتطلبات الاختيارية لاحقًا تشمل LiveKit credentials للصوت والـrealtime، وWhatsApp Business credentials للتكامل، لكنها ليست جزءًا من Phase 2.1 ولا مطلوبة لاختبارات auth/translation المحلية.

## 10. Final assessment

**Phase 2.1 status: PASS within defined scope.** تم إغلاق critical/high dependency blockers، وأصبح audit gate مانعًا للفشل، وتمت إضافة تغطية فعلية للمسار الحرج وأخطاء provider وCSRF origin guard. القرار المعماري لقاعدة البيانات موثق بدل تنفيذ هجرة غير آمنة.

**Production readiness status: NEEDS STAGING VALIDATION.** لا ينبغي إعلان production readiness الكاملة قبل توفير PostgreSQL/TiDB staging حقيقي حسب القرار المعتمد، تطبيق migration بعد backup/restore rehearsal، تشغيل live OAuth smoke test، وتشغيل ترجمة حية باستخدام `BUILT_IN_FORGE_API_KEY`. كما يجب حسم تحذيرات analytics وVite plugin وbundle size، ونقل rate limiter إلى Redis قبل horizontal scaling.

## References

[1]: https://github.com/gadm664-max/linguabridge-private "LinguaBridge private repository"
[2]: https://pnpm.io/10.x/settings "pnpm 10 settings and dependency overrides"
[3]: https://pnpm.io/10.x/cli/patch "pnpm patch guidance"
[4]: https://github.com/advisories/GHSA-m7jm-9gc2-mpf2 "fast-xml-parser critical advisory"
[5]: https://github.com/advisories/GHSA-43p4-m455-4f4j "tRPC advisory"
[6]: https://github.com/advisories/GHSA-gpj5-g38j-94v9 "Drizzle ORM advisory"
[7]: https://github.com/advisories/GHSA-37ch-88jc-xwx2 "path-to-regexp advisory"
[8]: https://github.com/advisories/GHSA-r5fr-rjxr-66jc "lodash advisory"
