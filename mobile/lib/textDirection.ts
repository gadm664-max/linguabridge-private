import { supportedLanguages } from "./specs";

export function isLeftToRightMeetingLanguage(language: string) {
  const normalizedCode = language.trim().toLowerCase().split("-")[0];
  return supportedLanguages.some(option => (option.code === normalizedCode || option.label === language) && option.direction === "ltr");
}
