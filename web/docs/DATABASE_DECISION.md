# Database Architecture Decision — Phase 2.1

**Decision status:** Architecture decision recorded; production database was not migrated.

## Executive decision

الهدف المعماري طويل الأجل هو **PostgreSQL + UUID**، لأن ذلك يطابق التصميم الموافق عليه للمنتج ويمنح طبقة بيانات موحدة قبل دخول أحمال realtime وanalytics الأكبر. لكن لا ينبغي تنفيذ تحويل جزئي داخل Phase 2.1؛ المستودع الحالي مرتبط فعليًا بـDrizzle MySQL/TiDB ومفاتيح `int` في الجداول والعقود والمستودعات والاختبارات.

**Recommendation:** نفّذ PostgreSQL + UUID قبل Phase 3 فقط كمرحلة ترحيل مستقلة ذات cutover واضح، وبعد توفير PostgreSQL حقيقي ونسخة backup وبيئة staging. لا تُشغّل migration إنتاجية من هذا المستودع الحالي، ولا تمزج تغيير database engine مع ميزات realtime أو الصوت.

## الحالة الحالية

| المحور | الحالة الفعلية الآن |
|---|---|
| ORM | Drizzle ORM |
| driver | `mysql2` |
| database dialect | MySQL/TiDB |
| identifiers | auto-increment numeric `int` |
| auth identity | `users.id` numeric relation، و`openId` لـManus OAuth |
| transactions | Drizzle transaction مستخدمة في إنشاء local user وcredential |
| migrations | SQL migrations مرقمة من `0000` إلى `0005` مع snapshots |
| repositories | `server/db.ts` يستخدم MySQL query builder وnumeric IDs |
| tests | mocks وfixtures تعتمد على numeric user/meeting/participant IDs |
| deployment | متغير `DATABASE_URL` و`drizzle.config.ts` مهيآن للـscaffold الحالي |

## Option A — Keep MySQL/TiDB

الاستمرار على MySQL/TiDB هو أقل خيار مخاطرة الآن. فهو لا يتطلب تغيير driver أو dialect أو migrations، ويحافظ على كل علاقات الاجتماعات والمشاركين والنصوص الحالية. كما يسمح بإكمال auth وtranslation على نفس المخطط دون dual-write أو تحويل بيانات.

| البعد | التقييم |
|---|---|
| existing schema | توافق مباشر مع الجداول الحالية. |
| repositories | لا تغيير جوهري في `server/db.ts`. |
| authentication | تعمل numeric foreign keys وunique constraints الحالية. |
| meetings/participants | أقل خطر؛ لا تتغير العلاقات. |
| transcript storage | لا يحتاج إعادة كتابة أو تحويل IDs. |
| future realtime | صالح كبداية، لكن يجب قياس write throughput وconnection pooling قبل التوسع. |
| WhatsApp | لا يعتمد مباشرة على dialect، لذلك التوافق جيد. |
| analytics | مناسب للـmetadata الحالي؛ يحتاج read replicas أو warehouse لاحقًا عند نمو الحجم. |
| scaling | ممكن، لكن يعتمد على قدرات TiDB أو تصميم read/write splitting. |
| transactions | متاحة ومستخدمة حاليًا. |
| indexing | الفهارس الحالية مباشرة ومفهومة. |
| migrations | استمرار بسيط مع Drizzle migration history القائمة. |
| deployment | أقل تغيير؛ نفس `DATABASE_URL` وdriver. |
| migration complexity | منخفضة. |
| risk | منخفض الآن، أعلى لاحقًا إذا تغيرت المتطلبات أو توسعت الخدمات. |

## Option B — Migrate to PostgreSQL + UUID

الانتقال إلى PostgreSQL + UUID يطابق architecture target، ويجعل الهوية المستقلة عن ترتيب الإدخال أكثر ملاءمة للأنظمة الموزعة والـevent IDs والـexternal references. لكنه ليس تغييرًا في connection string فقط؛ يجب إعادة تعريف الجداول والـforeign keys وDrizzle dialect وrepository assumptions والاختبارات والـseed data.

| البعد | التقييم |
|---|---|
| existing schema | يحتاج إعادة تعريف كاملة لـdialect والأنواع والقيود وtimestamps وJSON. |
| repositories | يحتاج استبدال imports من `mysql2` إلى `node-postgres` أو driver معتمد، ومراجعة كل numeric ID comparison. |
| authentication | يحتاج UUID للمستخدم والمؤسسات والـcredentials والـrefresh tokens، مع إبقاء `openId` unique. |
| meetings/participants | كل foreign key وعقود API وfixtures تحتاج UUID types. |
| transcript storage | يجب تحويل meeting/participant references، مع خطة backfill تمنع orphan rows. |
| future realtime | PostgreSQL هدف قوي للmetadata والtransactions، لكن realtime transport نفسه يجب أن يبقى خارج DB. |
| WhatsApp | يحتاج تحديث أي mapping يخزن user/meeting IDs خارجيًا؛ sender hashes تبقى مستقلة. |
| analytics | مناسب للـmetadata والتقارير التشغيلية، مع فصل warehouse عند الحاجة. |
| scaling | يحتاج pooler وconnection limits وread replicas ومراقبة vacuum/index bloat. |
| transactions | قوية ومناسبة للـauth bootstrap وrefresh rotation وworkspace membership. |
| indexing | يحتاج إعادة إنشاء الفهارس واختبار query plans بعد UUID migration. |
| migrations | لا يجوز خلط migration engine القديمة مع schema الجديدة؛ يلزم baseline أو مسار cutover جديد. |
| deployment | يحتاج PostgreSQL provisioning وbackup/restore وsecret rotation وstaging. |
| migration complexity | عالية. |
| risk | متوسط إلى عالٍ إذا نُفذ جزئيًا؛ منخفض نسبيًا إذا نُفذ كـcutover مستقل مع rehearsal. |

## Impact analysis by subsystem

### Schema and repositories

المخطط الحالي يصدّر أنواع `InsertUser` و`InsertMeeting` وغيرها من Drizzle، وتظهر `number` في دوال `server/db.ts` وrouters واختبارات الاجتماعات. الانتقال يتطلب تغيير types إلى UUID strings، وإعادة تعريف `references` وunique/index names، ثم تحديث كل query وfixture وعدم الاكتفاء بتغيير driver.

### Authentication

`users.id` هو مرجع password credentials وrefresh tokens وorganizations وmeeting ownership. يجب إنشاء UUID للمستخدمين الجدد، ثم backfill UUID لكل مستخدم قديم، وتحديث session payload أو mapping layer. يجب اختبار OAuth callback وlocal registration وrefresh rotation وlogout بعد التحويل، مع إبقاء `openId` immutable وunique.

### Meetings and participants

`meetings.hostUserId` و`meetingParticipants.meetingId/userId` و`transcriptSegments.meetingId/participantId` هي سلسلة علاقات واحدة. أي تحويل جزئي سيؤدي إلى مفاتيح لا تتطابق بين الاجتماعات والمشاركين والنصوص. يجب تنفيذ mapping tables أو dual-column backfill قبل إسقاط numeric IDs.

### Transcript storage and privacy

لا يجوز أثناء migration نسخ النصوص الحساسة إلى staging غير محمي. يجب تطبيق backup encryption وaccess controls، والتحقق من storage consent، ومقارنة row counts وhashes للـmetadata دون طباعة النص الأصلي أو المترجم في logs.

### Future realtime and integrations

WebRTC وSTT/TTS وWhatsApp ليست سببًا لتنفيذ migration جزئية الآن. يجب أن تستخدم تلك الخدمات contracts مستقلة وUUID event identifiers عند اعتماد PostgreSQL، لكن transport state وephemeral audio لا ينبغي تخزينه كله في PostgreSQL.

## Complete migration plan if approved

1. **Freeze and inventory:** تجميد تغييرات schema، إنشاء catalog لكل جدول وforeign key وindex وquery وAPI field يعتمد على numeric IDs.
2. **Provision staging:** إنشاء PostgreSQL staging مطابق للإنتاج، وتفعيل backups وrestore rehearsal وpooler وmonitoring.
3. **Define target schema:** كتابة schema PostgreSQL كاملة بـUUID، مع naming convention موحد و`uuid` default generation وقيود ownership وunique constraints.
4. **Update ORM layer:** تبديل Drizzle dialect/driver، إنشاء package dependencies، وتحديث `drizzle.config.ts` و`DATABASE_URL` وrepository types.
5. **Add compatibility mapping:** خلال cutover المؤقت، إضافة old-to-new ID mapping tables أو UUID shadow columns؛ يمنع ذلك تحويلًا مبهمًا للعلاقات.
6. **Backfill users first:** تحويل users وopenId mapping، ثم credentials وpreferences وorganizations وmemberships.
7. **Backfill meetings graph:** تحويل meetings ثم participants ثم transcript segments/messages/minutes، مع foreign-key validation بعد كل batch.
8. **Migrate integrations:** تحديث OAuth/session payloads، translation history، WhatsApp mappings، exports، and analytics dimensions.
9. **Dual verification:** مقارنة counts وforeign-key checks وselected deterministic hashes للـmetadata، وتشغيل كامل الاختبارات وquery-plan review.
10. **Rehearse rollback:** اختبار rollback إلى MySQL snapshot قبل cutover، وتحديد read-only window وmaximum recovery point.
11. **Cutover:** إيقاف writes، أخذ final backup، تطبيق delta، تحويل `DATABASE_URL`، smoke test auth → meeting → translation → history، ثم فتح writes.
12. **Post-cutover:** مراقبة latency/errors/locks، إبقاء rollback snapshot، ثم إزالة compatibility columns فقط بعد فترة ثبات موثقة.

## Recommendation for Phase 2.1

لا تُنفذ PostgreSQL migration في هذه المرحلة لأن البيئة الحالية لا تحتوي PostgreSQL provisioned ولا connection credentials، ولأن التنفيذ الآمن يتطلب تعديلات واسعة لا يمكن إثباتها باختبارات TypeScript وحدها. القرار النهائي هو:

> **Target: PostgreSQL + UUID. Immediate action: STOP at the migration plan, keep the existing MySQL/TiDB schema operational, and make PostgreSQL cutover a gated phase before Phase 3.**

هذا يحافظ على عدم كسر Phase 1، ويمنع migration صامتة، ويجعل قرار التحويل قابلًا للمراجعة مع rollback واضح.

## References

[1]: ../../README.md "LinguaBridge repository overview"
[2]: ../drizzle/schema.ts "Current Drizzle schema"
[3]: ../server/db.ts "Current repository layer"
[4]: ../server/authRoutes.ts "Current authentication routes"
[5]: ../server/translationRoutes.ts "Current translation route"
