import { supportedLanguages } from "./specs";

export function isLeftToRightMeetingLanguage(language: string) {
  return supportedLanguages.some(option => (option.code === language || option.label === language) && option.direction === "ltr");
}
