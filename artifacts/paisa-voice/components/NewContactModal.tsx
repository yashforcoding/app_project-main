import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const MOBILE_PATTERN = /^\d{10}$/;

type Props = {
  visible: boolean;
  /** Name of the new recipient, e.g. "Ramesh". */
  recipient: string;
  loading?: boolean;
  errorText?: string;
  onCancel: () => void;
  /** Called with the entered mobile number once it's a valid 10-digit number. */
  onSubmit: (mobileNumber: string) => void;
};

export default function NewContactModal({ visible, recipient, loading, errorText, onCancel, onSubmit }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mobileNumber, setMobileNumber] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setMobileNumber('');
      const timeout = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timeout);
    }
  }, [visible]);

  const handleChange = (raw: string) => setMobileNumber(raw.replace(/\D/g, '').slice(0, 10));
  const canSubmit = MOBILE_PATTERN.test(mobileNumber) && !loading;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.badge}>
              <Ionicons name="person-add" size={18} color={colors.primary} />
            </View>
            <Pressable onPress={onCancel} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Text style={styles.title}>New recipient</Text>
          <Text style={styles.subtitle}>
            {recipient
              ? `${recipient} isn't in your contacts yet. Add their mobile number to continue.`
              : 'Add a mobile number to continue.'}
          </Text>

          <TextInput
            ref={inputRef}
            value={mobileNumber}
            onChangeText={handleChange}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="10-digit mobile number"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            editable={!loading}
            testID="new-contact-mobile-input"
          />

          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
          {loading && <ActivityIndicator style={styles.spinner} color={colors.primary} />}

          {!loading && (
            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              disabled={!canSubmit}
              onPress={() => onSubmit(mobileNumber)}
            >
              <Text style={styles.submitButtonText}>Save & Continue</Text>
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
    badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    closeButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.foreground, fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 4 },
    subtitle: { color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 6, textAlign: 'center' },
    input: {
      width: '100%',
      marginTop: 20,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
      textAlign: 'center',
    },
    errorText: { color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 12, textAlign: 'center' },
    spinner: { marginTop: 14 },
    submitButton: { width: '100%', marginTop: 18, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
    submitButtonDisabled: { opacity: 0.4 },
    submitButtonText: { color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 15 },
  });
}
