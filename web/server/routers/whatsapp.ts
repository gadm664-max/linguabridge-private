import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getWhatsAppConfig } from "../whatsapp";

function publicWhatsAppStatus() {
  const config = getWhatsAppConfig();
  return {
    assistantReady: config.configured,
    consentRequired: true,
    ownerOnlyManagement: true,
    message: config.configured
      ? "مساعد WhatsApp جاهز لاستقبال النصوص والرسائل الصوتية بعد موافقة المرسل."
      : "المشاركة عبر واتساب متاحة، بينما المساعد النصي والصوتي ينتظر ربط رقم WhatsApp Business رسمي.",
  } as const;
}

export const whatsappRouter = router({
  status: protectedProcedure.query(() => publicWhatsAppStatus()),
  adminStatus: adminProcedure.query(({ ctx }) => ({
    ...publicWhatsAppStatus(),
    managedBy: ctx.user.name || "مالك المشروع",
    webhookPath: "/api/whatsapp/webhook",
    secretsExposed: false,
  })),
});
