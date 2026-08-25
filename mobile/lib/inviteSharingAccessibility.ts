export const inviteSharingAccessibility = {
  label: "تفعيل أو إيقاف أدوات مشاركة رابط الدعوة",
  state: (enabled: boolean) => ({ checked: enabled }),
} as const;
