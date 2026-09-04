import Constants from "expo-constants";

type RuntimeExtra = {
  apiBaseUrl?: string;
  oauthPortalUrl?: string;
  appId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as RuntimeExtra;

function cleanBaseUrl(value: string | undefined) {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export const mobileConfig = {
  apiBaseUrl: cleanBaseUrl(extra.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL),
  oauthPortalUrl: cleanBaseUrl(extra.oauthPortalUrl || process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL),
  appId: (extra.appId || process.env.EXPO_PUBLIC_APP_ID || "").trim(),
};

export function requireApiBaseUrl() {
  if (!mobileConfig.apiBaseUrl) {
    throw new Error("لم يتم إعداد عنوان خدمة LinguaBridge لهذا الإصدار.");
  }
  return mobileConfig.apiBaseUrl;
}
