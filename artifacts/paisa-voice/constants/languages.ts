/**
 * Languages the user can choose as their preferred language.
 *
 * `code` is a plain English name we send to the backend (Gemini uses this to
 * know what to translate into — no ISO code lookups needed on that end).
 * `label` is the English name shown under the native name in the picker.
 * `native` is how the language is written in itself, used as the primary
 * label so people can find their own language at a glance.
 */
export type Language = {
  code: string;
  label: string;
  native: string;
  /** BCP-47 locale passed to expo-speech so confirmations are read in the right voice. */
  speechLocale: string;
};

export const LANGUAGES: Language[] = [
  { code: 'English', label: 'English', native: 'English', speechLocale: 'en-IN' },
  { code: 'Hindi', label: 'Hindi', native: 'हिंदी', speechLocale: 'hi-IN' },
  { code: 'Marathi', label: 'Marathi', native: 'मराठी', speechLocale: 'mr-IN' },
  { code: 'Bengali', label: 'Bengali', native: 'বাংলা', speechLocale: 'bn-IN' },
  { code: 'Tamil', label: 'Tamil', native: 'தமிழ்', speechLocale: 'ta-IN' },
  { code: 'Telugu', label: 'Telugu', native: 'తెలుగు', speechLocale: 'te-IN' },
  { code: 'Kannada', label: 'Kannada', native: 'ಕನ್ನಡ', speechLocale: 'kn-IN' },
  { code: 'Gujarati', label: 'Gujarati', native: 'ગુજરાતી', speechLocale: 'gu-IN' },
  { code: 'Malayalam', label: 'Malayalam', native: 'മലയാളം', speechLocale: 'ml-IN' },
  { code: 'Punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', speechLocale: 'pa-IN' },
  { code: 'Urdu', label: 'Urdu', native: 'اردو', speechLocale: 'ur-IN' },
  { code: 'Odia', label: 'Odia', native: 'ଓଡ଼ିଆ', speechLocale: 'or-IN' },
];

export const DEFAULT_LANGUAGE = 'English';

export function getSpeechLocale(languageCode: string | null): string {
  return LANGUAGES.find((entry) => entry.code === languageCode)?.speechLocale ?? 'en-IN';
}
