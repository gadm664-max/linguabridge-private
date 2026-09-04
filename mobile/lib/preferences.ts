import * as SecureStore from "expo-secure-store";
import { defaultMobilePreferences, normalizeMobilePreferences, type MobilePreferences } from "./preferenceModel";

export { defaultMobilePreferences, normalizeMobilePreferences, type MobilePreferences } from "./preferenceModel";

const STORAGE_KEY = "linguabridge.mobile.preferences.v1";

export async function loadMobilePreferences() {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    return normalizeMobilePreferences(stored ? JSON.parse(stored) : null);
  } catch {
    return defaultMobilePreferences;
  }
}

export async function saveMobilePreferences(preferences: MobilePreferences) {
  const normalized = normalizeMobilePreferences(preferences);
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
