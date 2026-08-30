import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';

const PIN_LENGTH = 6;

type Mode = 'verify' | 'setup';

type Props = {
  visible: boolean;
  /** 'setup' when the wallet has no PIN yet, 'verify' when confirming an existing PIN. */
  mode: Mode;
  /** Short context line, e.g. "Send ₹500 to Ramesh". */
  subtitle?: string;
  loading?: boolean;
  errorText?: string;
  onCancel: () => void;
  /** Called with the 6-digit PIN once fully entered (and, in setup mode, confirmed twice). */
  onSubmit: (pin: string) => void;
};

export default function PinModal({ visible, mode, subtitle, loading, errorText, onCancel, onSubmit }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useLanguage();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setPin('');
      setConfirmPin('');
      setStage('enter');
      const timeout = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timeout);
    }
  }, [visible, mode]);

  const activeValue = stage === 'enter' ? pin : confirmPin;

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (stage === 'enter') {
      setPin(digits);
      if (digits.length === PIN_LENGTH) {
        if (mode === 'setup') {
          setStage('confirm');
        } else {
          onSubmit(digits);
        }
      }
    } else {
      setConfirmPin(digits);
      if (digits.length === PIN_LENGTH) {
        if (digits === pin) {
          onSubmit(digits);
        } else {
          setConfirmPin('');
          setStage('enter');
          setPin('');
        }
      }
    }
  };

  const title = mode === 'setup'
    ? (stage === 'enter' ? t.pinSetupTitle : t.pinConfirmTitle)
    : t.pinVerifyTitle;

  const helper = mode === 'setup'
    ? (stage === 'enter' ? t.pinSetupHelper : t.pinConfirmHelper)
    : subtitle;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={18} color={colors.primary} />
            </View>
            <Pressable onPress={onCancel} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Text style={styles.title}>{title}</Text>
          {!!helper && <Text style={styles.subtitle}>{helper}</Text>}

          <Pressable style={styles.dotsRow} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: PIN_LENGTH }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index < activeValue.length && styles.dotFilled,
                  !!errorText && styles.dotError,
                ]}
              />
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={activeValue}
            onChangeText={handleChange}
            keyboardType="number-pad"
            maxLength={PIN_LENGTH}
            secureTextEntry
            style={styles.hiddenInput}
            editable={!loading}
            testID="pin-input"
          />

          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
          {loading && <ActivityIndicator style={styles.spinner} color={colors.primary} />}

          {mode === 'setup' && stage === 'confirm' && !loading && (
            <Pressable onPress={() => { setStage('enter'); setPin(''); setConfirmPin(''); }}>
              <Text style={styles.linkText}>{t.pinStartOver}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    sheet: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: 22, padding: 24, alignItems: 'center' },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 6 },
    lockBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    closeButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.foreground, fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 4 },
    subtitle: { color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 6, textAlign: 'center' },
    dotsRow: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 8 },
    dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: 'transparent' },
    dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
    dotError: { borderColor: colors.destructive },
    hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
    errorText: { color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 12, textAlign: 'center' },
    spinner: { marginTop: 14 },
    linkText: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 16 },
  });
}
