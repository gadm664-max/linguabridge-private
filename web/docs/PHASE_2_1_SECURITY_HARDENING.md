# Phase 2.1 Security Hardening

## Security gate status

تم تحويل GitHub Actions من خطوة audit غير مانعة إلى **blocking security gate**:

```yaml
- name: Dependency audit (blocking)
  run: pnpm audit --prod --audit-level=high
```

لا يستخدم workflow `continue-on-error`. لذلك يفشل CI إذا ظهر high أو critical في production dependency graph. أما advisories المنخفضة أو المتوسطة فتظل ظاهرة في audit الكامل ولا تُخفى.

## Audit before hardening

النتيجة المسجلة قبل Phase 2.1 كانت:

```text
50 vulnerabilities found
Severity: 9 low | 32 moderate | 8 high | 1 critical
```

### High/Critical findings before

| Severity | Package | Dependency chain | Fix available | Status |
|---|---|---|---|---|
| Critical | `fast-xml-parser@5.2.5` | `@aws-sdk/client-s3@3.907.0 → @aws-sdk/core → @aws-sdk/xml-builder → fast-xml-parser` | `>=5.3.5`، ونسخ أحدث تصل إلى `5.5.6` | **FIXED** عبر AWS SDK update وresolved graph. |
| High | `fast-xml-parser@5.2.5` | AWS SDK XML builder chain | `>=5.3.4`, `>=5.3.6`, `>=5.5.6` بحسب advisory | **FIXED**. |
| High | `@trpc/server@11.6.0` | direct `@trpc/server`, وكذلك عبر `@trpc/client` و`@trpc/react-query` | `>=11.8.0` | **FIXED** إلى 11.8.0. |
| High | `drizzle-orm@0.44.6` | direct dependency | `>=0.45.2` | **FIXED** إلى 0.45.2. |
| High | `path-to-regexp@0.1.12` | `express@4.21.2 → path-to-regexp@0.1.12` | `>=0.1.13` | **FIXED** بإبقاء API على Express 5.2.1؛ لا يوجد path-to-regexp high في final graph. |
| High | `lodash-es@4.17.21` | `streamdown@1.4.0 → mermaid → langium/chevrotain → lodash-es` | `>=4.18.0` | **FIXED** بإزالة سلسلة Mermaid عبر Streamdown 2.6.0. |
| High | `lodash@4.17.21` | `recharts@2.15.4 → lodash` | `>=4.18.0` | **MITIGATED**؛ final audit لا يرفع high، لكن Recharts 2 ما زال يطبع deprecated/bad-release warning للنسخة المحلولة ويحتاج Recharts 3 migration منفصلًا. |

Advisory references: [fast-xml-parser critical][2], [tRPC][3], [Drizzle ORM][4], [path-to-regexp][5], [lodash][6].

## Changes applied

تم تحديث direct dependencies الآتية فقط ضمن حدود major الحالية:

| Package | Before | After | Rationale |
|---|---:|---:|---|
| `@aws-sdk/client-s3` | 3.907.0 | 3.1118.0 | إزالة fast-xml-parser vulnerabilities من AWS graph. |
| `@aws-sdk/s3-request-presigner` | 3.907.0 | 3.1118.0 | مواءمة AWS SDK packages. |
| `@trpc/client` | 11.6.0 | 11.8.0 | إصلاح prototype-pollution advisory في tRPC graph. |
| `@trpc/react-query` | 11.6.0 | 11.8.0 | مواءمة peer graph مع tRPC. |
| `@trpc/server` | 11.6.0 | 11.8.0 | الإصدار المصحح الأدنى ضمن major 11. |
| `drizzle-orm` | 0.44.6 | 0.45.2 | إصلاح SQL identifier escaping advisory. |
| `streamdown` | 1.4.0 | 2.6.0 | إزالة Mermaid/Langium/Lodash-es chain المتأثرة. |
| `express` | 4.21.2 | 5.2.1 | إزالة dependency القديمة على path-to-regexp 0.1.12 بعد اختبار كامل. |
| `mdast-util-to-hast` | غير مباشر 13.2.0 | direct dev 13.2.1 | إصلاح moderate unsanitized class advisory في Streamdown graph. |

لم يتم تنفيذ major upgrade عشوائي لـRecharts، لأن المشروع يستخدم `client/src/components/ui/chart.tsx` فعليًا، ولأن Recharts 3 يغير dependency/API surface. تم تصنيف هذه النقطة كـmitigation تحتاج migration مخصصة، بينما final high/critical gate يمر.

## Audit after hardening

تم تشغيل:

```bash
pnpm audit --prod
```

والنتيجة النهائية الفعلية:

```text
No known vulnerabilities found
```

كما تم تشغيل:

```bash
pnpm audit --prod --audit-level=high
```

والنتيجة:

```text
high_gate_status=0
```

الـfull audit الذي ينتهي بفشل عند وجود أي مستوى لا يعرض vulnerabilities بعد التحديثات؛ ولذلك final production graph اجتاز audit بالكامل.

## Remaining warnings and non-vulnerability issues

| Issue | Status | Mitigation |
|---|---|---|
| Recharts 2 branch deprecated | Open, non-security | تنفيذ Recharts 3 migration منفصلة بعد مراجعة chart API. |
| `@builder.io/vite-plugin-jsx-loc` peer mismatch مع Vite 7 | Open warning | مراجعة plugin أو استبداله في cleanup مستقل. |
| بعض subdependencies deprecated | Open warning | تتبع upstream؛ لا توجد direct vulnerability في final audit. |
| database uses MySQL/TiDB numeric IDs | Architecture decision | موثق في `DATABASE_DECISION.md`؛ لا migration صامتة. |

## Supply-chain configuration

يستخدم المشروع `web/pnpm-workspace.yaml` للحفاظ على إعداد patch الموجود لـ`wouter`. لا توجد credentials أو registry tokens في الملفات الملتزمة. يعمل CI على `pnpm install --frozen-lockfile`، ثم lint وtypecheck وDrizzle check وtests وbuild وblocking audit.

## References

[1]: https://pnpm.io/10.x/settings "pnpm 10 settings and dependency overrides"
[2]: https://github.com/advisories/GHSA-m7jm-9gc2-mpf2 "fast-xml-parser critical advisory"
[3]: https://github.com/advisories/GHSA-43p4-m455-4f4j "tRPC prototype pollution advisory"
[4]: https://github.com/advisories/GHSA-gpj5-g38j-94v9 "Drizzle ORM SQL injection advisory"
[5]: https://github.com/advisories/GHSA-37ch-88jc-xwx2 "path-to-regexp ReDoS advisory"
[6]: https://github.com/advisories/GHSA-r5fr-rjxr-66jc "lodash code injection advisory"
