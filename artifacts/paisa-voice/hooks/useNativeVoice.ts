import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Voice, { type SpeechErrorEvent, type SpeechResultsEvent } from '@react-native-voice/voice';

type UseNativeVoiceOptions = {
  /** BCP-47 locale to recognize in, e.g. 'en-IN', 'hi-IN'. */
  locale?: string;
  /** Called with the final recognized transcript once the phone finishes recognizing. */
  onResult: (text: string) => void;
  onError?: (message: string) => void;
};

/**
 * Wraps @react-native-voice/voice, which bridges directly to the phone's built-in
 * speech recognizer (the Speech framework on iOS, SpeechRecognizer on Android).
 * Recognition happens entirely on-device — no audio is ever uploaded anywhere.
 *
 * IMPORTANT: this native module is not available in Expo Go, and has no web
 * implementation. `supported` is false in both of those cases, so callers should
 * keep a fallback path (e.g. the existing MediaRecorder + cloud transcription flow)
 * for web, and prompt the user to use a development build for Expo Go.
 */
export function useNativeVoice({ locale, onResult, onError }: UseNativeVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [partialText, setPartialText] = useState('');

  // Keep the latest callbacks in refs so the effect below doesn't need to
  // re-subscribe every time the caller passes a new inline function.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  const supported = Platform.OS === 'ios' || Platform.OS === 'android';

  useEffect(() => {
    if (!supported) return;

    Voice.onSpeechStart = () => setListening(true);
    Voice.onSpeechEnd = () => setListening(false);
    Voice.onSpeechPartialResults = (event: SpeechResultsEvent) => {
      const text = event.value?.[0];
      if (text) setPartialText(text);
    };
    Voice.onSpeechResults = (event: SpeechResultsEvent) => {
      const text = event.value?.[0];
      setListening(false);
      setPartialText('');
      if (text) onResultRef.current(text);
    };
    Voice.onSpeechError = (event: SpeechErrorEvent) => {
      setListening(false);
      setPartialText('');
      // Code 7/"No match" just means silence — don't surface that as an error.
      if (event.error?.code === '7') return;
      onErrorRef.current?.(event.error?.message ?? 'Speech recognition failed. Please try again.');
    };

    return () => {
      void Voice.destroy().then(() => Voice.removeAllListeners());
    };
  }, [supported]);

  const start = useCallback(async () => {
    if (!supported) {
      onErrorRef.current?.('On-device voice input needs a development build — it is not available in Expo Go or on web.');
      return;
    }
    try {
      setPartialText('');
      await Voice.start(locale ?? 'en-IN');
    } catch (error) {
      setListening(false);
      onErrorRef.current?.(error instanceof Error ? error.message : 'Could not start listening.');
    }
  }, [locale, supported]);

  const stop = useCallback(async () => {
    if (!supported) return;
    try {
      await Voice.stop();
    } catch {
      // onSpeechEnd/onSpeechError still fire in the vast majority of cases.
    }
  }, [supported]);

  return { listening, partialText, start, stop, supported };
}
