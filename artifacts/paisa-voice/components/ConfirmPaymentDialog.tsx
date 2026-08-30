import { useEffect, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { getSpeechLocale } from '@/constants/languages';

type Props = {
  visible: boolean;
  amount: number;
  recipient: string;
  currency?: string;
  /** The "are you sure...?" line, already translated server-side into the user's language. */
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmPaymentDialog({ visible, amount, recipient, currency = 'INR', message, onCancel, onConfirm }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language, t } = useLanguage();

  const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  const spokenText = message ?? t.confirmPromptFallback;
  const speechLocale = getSpeechLocale(language);

  // Read the confirmation out loud, in the user's chosen language, whenever the
  // dialog opens. Stop any in-progress speech once it closes (confirm, cancel, or unmount)
  // so it never keeps talking over the next screen.
  useEffect(() => {
    if (visible) {
      Speech.stop();
      Speech.speak(spokenText, { language: speechLocale, rate: 0.95 });
    } else {
      Speech.stop();
    }
    return () => {
      Speech.stop();
    };
  }, [visible, spokenText, speechLocale]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconBadge}>
            <Ionicons name="paper-plane" size={20} color={colors.primary} />
          </View>

          <Text style={styles.title}>{t.confirmTitle}</Text>
          <Text style={styles.amount}>{formatted}</Text>
          <Text style={styles.subtitle}>{recipient}</Text>
          {/* Shown on screen too, not just spoken — some devices don't have a TTS
              voice installed for every language, so this is the only guaranteed
              way the user sees the localized confirmation sentence. */}
          {!!spokenText && <Text style={styles.spokenPrompt}>{spokenText}</Text>}

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>{t.confirmCancel}</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.confirmButton]} onPress={onConfirm}>
              <Text style={styles.confirmButtonText}>{t.confirmButton}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    sheet: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: 22, padding: 24, alignItems: 'center' },
    iconBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    title: { color: colors.mutedForeground, fontSize: 14, fontFamily: 'Inter_500Medium' },
    amount: { color: colors.foreground, fontSize: 30, fontFamily: 'Inter_700Bold', marginTop: 8 },
    subtitle: { color: colors.mutedForeground, fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 4 },
    spokenPrompt: { color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 14, textAlign: 'center', lineHeight: 18 },
    buttonRow: { flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' },
    button: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { backgroundColor: colors.secondary },
    cancelButtonText: { color: colors.secondaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    confirmButton: { backgroundColor: colors.primary },
    confirmButtonText: { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  });
}
