import type { ExpoConfig } from "expo/config";

const config: ExpoConfig & { newArchEnabled?: boolean } = {
  name: "LinguaBridge",
  slug: "linguabridge-mobile",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "linguabridge",
  userInterfaceStyle: "light",
  newArchEnabled: false,
  ios: { supportsTablet: true, bundleIdentifier: "space.manus.linguabridge.mobile" },
  android: { package: "space.manus.linguabridge.mobile", versionCode: 1, permissions: ["RECORD_AUDIO"] },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
    oauthPortalUrl: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
    appId: process.env.EXPO_PUBLIC_APP_ID ?? "",
  },
  plugins: [
    "expo-router",
    "expo-asset",
    ["expo-audio", { microphonePermission: "اسمح لـ LinguaBridge بالوصول إلى الميكروفون للنسخ والترجمة الفورية.", enableBackgroundRecording: false }],
    "expo-secure-store",
    "expo-web-browser",
    "@livekit/react-native-expo-plugin",
    "@config-plugins/react-native-webrtc"
  ],
  experiments: { typedRoutes: true }
};

export default config;
