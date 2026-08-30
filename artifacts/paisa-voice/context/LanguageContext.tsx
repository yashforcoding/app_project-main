import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_LANGUAGE } from '@/constants/languages';
import { DEFAULT_STRINGS, STRING_KEYS, type Strings } from '@/constants/strings';

const LANGUAGE_STORAGE_KEY = 'paisaVoice.language';
// Bump this whenever DEFAULT_STRINGS gets new/renamed keys. It's folded into the cache
// key so anyone with an old translation blob transparently gets a fresh one instead of
// silently missing the new keys (which used to render as blank/undefined UI text).
const STRINGS_VERSION = 2;
const STRINGS_CACHE_PREFIX = `paisaVoice.strings.v${STRINGS_VERSION}.`;

function apiUrl(path: string) {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const base = process.env.EXPO_PUBLIC_API_URL ?? (domain ? `https://${domain}` : '');
  return `${base}/api${path}`;
}

async function fetchTranslatedStrings(language: string): Promise<Strings> {
  const values = STRING_KEYS.map((key) => DEFAULT_STRINGS[key]);
  const response = await fetch(apiUrl('/finance/localize'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: values, lang: language }),
  });
  if (!response.ok) throw new Error('Translation request failed');
  const data = (await response.json()) as { texts?: string[] };
  const translated = data.texts;
  if (!Array.isArray(translated) || translated.length !== STRING_KEYS.length) {
    throw new Error('Translation response was malformed');
  }
  const result = { ...DEFAULT_STRINGS };
  STRING_KEYS.forEach((key, index) => {
    const value = translated[index];
    if (typeof value === 'string' && value.trim()) {
      (result as Strings)[key] = value;
    }
  });
  return result;
}

type LanguageContextValue = {
  /** Chosen language, e.g. "Hindi". Null until we've checked storage and the user hasn't picked one yet. */
  language: string | null;
  /** True once we've finished reading AsyncStorage for a saved language. */
  ready: boolean;
  /** True while translated strings for the current language are being fetched. */
  translating: boolean;
  /** UI strings for the current language, falling back to English until translation finishes. */
  t: Strings;
  setLanguage: (language: string) => void;
  pickerVisible: boolean;
  openPicker: () => void;
  closePicker: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [strings, setStrings] = useState<Strings>(DEFAULT_STRINGS);
  const [pickerVisible, setPickerVisible] = useState(false);
  const requestIdRef = useRef(0);

  const applyLanguageStrings = useCallback(async (nextLanguage: string) => {
    if (nextLanguage === DEFAULT_LANGUAGE) {
      setStrings(DEFAULT_STRINGS);
      return;
    }
    const requestId = ++requestIdRef.current;
    try {
      const cached = await AsyncStorage.getItem(`${STRINGS_CACHE_PREFIX}${nextLanguage}`);
      if (cached) {
        // Merge over DEFAULT_STRINGS (English) rather than trusting the cached blob
        // verbatim — if a key is missing (e.g. it was added after this was cached),
        // this falls back to readable English instead of `undefined`.
        const parsedCache = JSON.parse(cached) as Partial<Strings>;
        if (requestId === requestIdRef.current) setStrings({ ...DEFAULT_STRINGS, ...parsedCache });
        return;
      }
    } catch {
      // Ignore cache read errors, fall through to a fresh fetch.
    }
    setTranslating(true);
    try {
      const translated = await fetchTranslatedStrings(nextLanguage);
      if (requestId === requestIdRef.current) {
        setStrings(translated);
        void AsyncStorage.setItem(`${STRINGS_CACHE_PREFIX}${nextLanguage}`, JSON.stringify(translated));
      }
    } catch {
      // Keep whatever strings were already showing (English fallback on first run).
    } finally {
      if (requestId === requestIdRef.current) setTranslating(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (saved) {
          setLanguageState(saved);
          void applyLanguageStrings(saved);
        } else {
          setPickerVisible(true);
        }
      } finally {
        setReady(true);
      }
    })();
  }, [applyLanguageStrings]);

  const setLanguage = useCallback(
    (nextLanguage: string) => {
      setLanguageState(nextLanguage);
      setPickerVisible(false);
      void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
      void applyLanguageStrings(nextLanguage);
    },
    [applyLanguageStrings],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      ready,
      translating,
      t: strings,
      setLanguage,
      pickerVisible,
      openPicker: () => setPickerVisible(true),
      closePicker: () => setPickerVisible(false),
    }),
    [language, ready, translating, strings, setLanguage, pickerVisible],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
