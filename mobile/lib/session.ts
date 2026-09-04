import { encode } from "base-64";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { mobileConfig, requireApiBaseUrl } from "./config";

const SESSION_TOKEN_KEY = "linguabridge.session-token";
const OAUTH_NONCE_KEY = "linguabridge.oauth-nonce";

export async function getSessionToken() {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
    SecureStore.deleteItemAsync(OAUTH_NONCE_KEY),
  ]);
}

export async function signInWithLinguaBridge() {
  const apiBaseUrl = requireApiBaseUrl();
  if (!mobileConfig.oauthPortalUrl || !mobileConfig.appId) {
    throw new Error("تسجيل الدخول غير مهيأ لهذا الإصدار من التطبيق.");
  }

  const nonce = Crypto.randomUUID();
  await SecureStore.setItemAsync(OAUTH_NONCE_KEY, nonce);
  const returnUrl = Linking.createURL("oauth");
  const backendCallback = `${apiBaseUrl}/api/oauth/native/callback?return_to=${encodeURIComponent(returnUrl)}`;
  const state = encode(JSON.stringify({ redirectUri: backendCallback, nonce }));
  const authorizeUrl = new URL(`${mobileConfig.oauthPortalUrl}/app-auth`);
  authorizeUrl.searchParams.set("appId", mobileConfig.appId);
  authorizeUrl.searchParams.set("redirectUri", backendCallback);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("type", "signIn");

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl.toString(), returnUrl);
  if (result.type !== "success") {
    throw new Error(result.type === "cancel" ? "تم إلغاء تسجيل الدخول." : "لم يكتمل تسجيل الدخول.");
  }

  const parsed = Linking.parse(result.url);
  const sessionToken = typeof parsed.queryParams?.session_token === "string" ? parsed.queryParams.session_token : "";
  const returnedNonce = typeof parsed.queryParams?.state === "string" ? parsed.queryParams.state : "";
  const expectedNonce = await SecureStore.getItemAsync(OAUTH_NONCE_KEY);
  if (!sessionToken || !expectedNonce || returnedNonce !== expectedNonce) {
    throw new Error("تعذر التحقق من عودة تسجيل الدخول بأمان.");
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, sessionToken);
  await SecureStore.deleteItemAsync(OAUTH_NONCE_KEY);
  return sessionToken;
}
