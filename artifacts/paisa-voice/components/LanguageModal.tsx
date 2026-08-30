import { useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { LANGUAGES } from '@/constants/languages';
import { useLanguage } from '@/context/LanguageContext';

type Props = {
  visible: boolean;
  /** Whether the user can dismiss without picking (false on very first launch). */
  dismissable?: boolean;
  onClose: () => void;
};

export default function LanguageModal({ visible, dismissable = true, onClose }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language, setLanguage, t } = useLanguage();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={dismissable ? onClose : undefined}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.globeBadge}>
              <Ionicons name="language" size={18} color={colors.primary} />
            </View>
            {dismissable && (
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>

          <Text style={styles.title}>{t.languagePickerTitle}</Text>
          <Text style={styles.subtitle}>{t.languagePickerSubtitle}</Text>

          <FlatList
            data={LANGUAGES}
            keyExtractor={(item) => item.code}
            style={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const selected = item.code === language;
              return (
                <Pressable
                  onPress={() => setLanguage(item.code)}
                  style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
                >
                  <View>
                    <Text style={[styles.native, selected && styles.textSelected]}>{item.native}</Text>
                    {item.native !== item.label && (
                      <Text style={[styles.label, selected && styles.textSelected]}>{item.label}</Text>
                    )}
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    sheet: { width: '100%', maxWidth: 380, maxHeight: '78%', backgroundColor: colors.card, borderRadius: 22, padding: 24 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    globeBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    closeButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.foreground, fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 4 },
    subtitle: { color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 6, marginBottom: 10, lineHeight: 18 },
    list: { marginTop: 6 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, marginBottom: 6 },
    rowSelected: { backgroundColor: colors.primarySoft },
    pressed: { opacity: 0.72 },
    native: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    label: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
    textSelected: { color: colors.primary },
  });
}
