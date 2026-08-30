import { Feather, Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useColors } from '@/hooks/useColors';
import PinModal from '@/components/PinModal';
import LanguageModal from '@/components/LanguageModal';
import ConfirmPaymentDialog from '@/components/ConfirmPaymentDialog';
import { useLanguage } from '@/context/LanguageContext';
import { DEFAULT_LANGUAGE, getSpeechLocale } from '@/constants/languages';

type Transaction = {
  id: string;
  title: string;
  amount: number;
  direction: 'in' | 'out';
  createdAt: string;
};
type Dashboard = { balance: number; currency: string; transactions: Transaction[] };
type PendingPayment = { amount: number; recipient: string };
type CommandResult = {
  intent: 'send_money' | 'check_balance' | 'apply_loan';
  message: string;
  balance?: number | null;
  transaction?: Transaction | null;
  requiresPin?: boolean;
  pinSet?: boolean;
  pendingPayment?: PendingPayment | null;
  confirmPrompt?: string;
};

const emptyDashboard: Dashboard = { balance: 0, currency: 'INR', transactions: [] };

function apiUrl(path: string) {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const base = process.env.EXPO_PUBLIC_API_URL ?? (domain ? `https://${domain}` : '');
  return `${base}/api${path}`;
}

function formatMoney(value: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function HomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { language, t, pickerVisible, openPicker, closePicker } = useLanguage();
  const lang = language ?? DEFAULT_LANGUAGE;

  const getGreeting = (hour: number = new Date().getHours()) => {
    if (hour < 5) return t.greetingNight;
    if (hour < 12) return t.greetingMorning;
    if (hour < 17) return t.greetingAfternoon;
    if (hour < 21) return t.greetingEvening;
    return t.greetingNight;
  };
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [confirmDialogVisible, setConfirmDialogVisible] = useState(false);
  const [confirmPrompt, setConfirmPrompt] = useState('');
  const [pendingPinMode, setPendingPinMode] = useState<'verify' | 'setup'>('verify');
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinMode, setPinMode] = useState<'verify' | 'setup'>('verify');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      setError('');
      const response = await fetch(apiUrl(`/finance/dashboard?lang=${encodeURIComponent(lang)}`));
      const data = (await response.json()) as Dashboard & { message?: string };
      if (!response.ok) throw new Error(data.message ?? t.loadWalletError);
      setDashboard(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.loadWalletError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lang, t.loadWalletError]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Handles a /finance/command response: if it's a payment, first ask the user to
  // confirm out loud (ConfirmPaymentDialog) before ever showing the PIN modal.
  const handleCommandResult = (data: CommandResult) => {
    if (data.requiresPin && data.pendingPayment) {
      setPendingPayment(data.pendingPayment);
      setPendingPinMode(data.pinSet ? 'verify' : 'setup');
      setConfirmPrompt(data.confirmPrompt ?? data.message);
      setConfirmDialogVisible(true);
      setMessage('');
      return;
    }
    setMessage(data.message);
    setRequest('');
  };

  // User tapped "Confirm" on the spoken are-you-sure dialog — now ask for the PIN.
  const handleConfirmPayment = () => {
    setConfirmDialogVisible(false);
    setPinMode(pendingPinMode);
    setPinError('');
    setPinModalVisible(true);
  };

  // User tapped "Cancel" on the are-you-sure dialog — drop the pending payment entirely.
  const handleCancelConfirm = () => {
    setConfirmDialogVisible(false);
    setPendingPayment(null);
    setError(t.paymentCancelled);
  };

  const confirmPayment = async (pin: string) => {
    if (!pendingPayment) return;
    setPinLoading(true);
    setPinError('');
    try {
      if (pinMode === 'setup') {
        const setPinResponse = await fetch(apiUrl('/finance/pin/set'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, lang }),
        });
        const setPinData = (await setPinResponse.json()) as { message?: string };
        if (!setPinResponse.ok) throw new Error(setPinData.message ?? t.pinSaveError);
      }

      const response = await fetch(apiUrl('/finance/confirm-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingPayment, pin, lang }),
      });
      const data = (await response.json()) as CommandResult & { message?: string };
      if (!response.ok) throw new Error(data.message ?? t.pinIncorrectFallback);

      setPinModalVisible(false);
      setPendingPayment(null);
      const successMessage = data.message ?? t.paymentSentFallback;
      setMessage(successMessage);
      setRequest('');
      // Speak the payment confirmation out loud, in the user's chosen language.
      Speech.stop();
      Speech.speak(successMessage, { language: getSpeechLocale(language), rate: 0.95 });
      await loadDashboard();
    } catch (caught) {
      setPinError(caught instanceof Error ? caught.message : t.pinIncorrectFallback);
    } finally {
      setPinLoading(false);
    }
  };

  const cancelPin = () => {
    setPinModalVisible(false);
    setPendingPayment(null);
    setPinError('');
    setError(t.paymentCancelled);
  };

  const submitRequest = async () => {
    const text = request.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(apiUrl('/finance/command'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      });
      const data = (await response.json()) as CommandResult & { message?: string };
      if (!response.ok) throw new Error(data.message ?? t.commandErrorFallback);
      handleCommandResult(data);
      if (!data.requiresPin) await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.commandErrorFallback);
    } finally {
      setSubmitting(false);
    }
  };

  const transcribeRecording = async (audio: Blob): Promise<string> => {
    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      const buffer = await audio.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const audioBase64 = btoa(binary);
      const transcriptionResponse = await fetch(apiUrl('/finance/transcribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType: audio.type || 'audio/webm', lang }),
      });
      const transcription = (await transcriptionResponse.json()) as { text?: string; message?: string };
      if (!transcriptionResponse.ok || !transcription.text) {
        throw new Error(transcription.message ?? t.transcriptionErrorFallback);
      }
      setRequest(transcription.text);
      const commandResponse = await fetch(apiUrl('/finance/command'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcription.text, lang }),
      });
      const command = (await commandResponse.json()) as CommandResult & { message?: string };
      if (!commandResponse.ok) throw new Error(command.message ?? t.commandErrorFallback);
      handleCommandResult(command);
      if (!command.requiresPin) await loadDashboard();
      return transcription.text;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.recordingErrorFallback);
      throw caught instanceof Error ? caught : new Error(t.recordingErrorFallback);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRecording = async () => {
    if (submitting) return;
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      Alert.alert(t.voiceUnavailableTitle, t.voiceUnavailableText);
      return;
    }
    try {
      setError('');
      let permissionState = 'unavailable';
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          permissionState = permission.state;
        } catch {
          permissionState = 'query-failed';
        }
      }
      console.log('Microphone permission state before recording:', permissionState);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone permission granted:', true);
      const recorder = new MediaRecorder(stream);
      console.log(recorder.mimeType);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        console.log('MediaRecorder dataavailable:', event.data.size, 'bytes');
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
      };
      recorder.onstop = () => {
        const audio = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        console.log('Recorded audio blob size (bytes):', audio.size);
        console.log('Recorded audio blob mime type:', audio.type);
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        recorderRef.current = null;
        if (audio.size > 0) {
          const audioUrl = URL.createObjectURL(audio);
          const playback = new Audio(audioUrl);
          playback.onended = () => URL.revokeObjectURL(audioUrl);
          void playback.play()
            .then(() => console.log('Temporary audio playback started'))
            .catch((playbackError) => {
              console.error('Temporary audio playback failed:', playbackError);
              URL.revokeObjectURL(audioUrl);
            });
          void transcribeRecording(audio).then((text) => {
            console.log('Transcribed:', text);
          }).catch(() => undefined);
        }
      };
      recorderRef.current = recorder;
      try {
        recorder.start(250);
        console.log('MediaRecorder.start() called successfully:', recorder.state);
      } catch (startError) {
        console.error('MediaRecorder.start() failed:', startError);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        throw startError;
      }
      setRecording(true);
    } catch (caught) {
      setRecording(false);
      setError(caught instanceof Error ? caught.message : t.micPermissionError);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <FlatList
        data={dashboard.transactions}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadDashboard(); }} tintColor={colors.primary} />}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 18), paddingBottom: insets.bottom + 112 }]}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>PAISA VOICE</Text>
                <Text style={styles.greeting}>{getGreeting()}</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  testID="language-button"
                  onPress={openPicker}
                  style={({ pressed }) => [styles.langButton, pressed && styles.pressed]}
                >
                  <Ionicons name="language" size={18} color={colors.primary} />
                </Pressable>
                <View style={styles.avatar}><Text style={styles.avatarText}>P</Text></View>
              </View>
            </View>

            <View style={styles.balanceCard}>
              <View style={styles.balanceTop}>
                <Text style={styles.balanceLabel}>{t.availableBalance}</Text>
                <Ionicons name="shield-checkmark-outline" size={19} color={colors.gold} />
              </View>
              {loading ? <ActivityIndicator color={colors.gold} style={styles.loader} /> : <Text style={styles.balance}>{formatMoney(dashboard.balance, dashboard.currency)}</Text>}
              <Text style={styles.balanceHint}>{t.balanceHint}</Text>
              <View style={styles.balanceOrb} />
            </View>

            <View style={styles.askBlock}>
              <Text style={styles.sectionTitle}>{t.askTitle}</Text>
              <Text style={styles.sectionHint}>{t.askHint}</Text>
              <View style={styles.composer}>
                <TextInput
                  testID="finance-request-input"
                  value={request}
                  onChangeText={setRequest}
                  onSubmitEditing={() => void submitRequest()}
                  placeholder={t.inputPlaceholder}
                  placeholderTextColor={colors.placeholder}
                  returnKeyType="send"
                  style={styles.input}
                  multiline
                  maxLength={240}
                />
                <View style={styles.composerActions}>
                  <Pressable testID="voice-input-button" onPress={() => void toggleRecording()} disabled={submitting} style={({ pressed }) => [styles.iconButton, recording && styles.recordingButton, submitting && styles.disabled, pressed && styles.pressed]}>
                    <Feather name={recording ? "square" : "mic"} size={19} color={recording ? colors.destructive : colors.primary} />
                  </Pressable>
                  <Pressable testID="send-request-button" onPress={() => void submitRequest()} disabled={!request.trim() || submitting} style={({ pressed }) => [styles.sendButton, (!request.trim() || submitting) && styles.disabled, pressed && styles.pressed]}>
                    {submitting ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="arrow-up" size={20} color={colors.primaryForeground} />}
                  </Pressable>
                </View>
              </View>
              {!!message && <View style={styles.feedback}><Ionicons name="checkmark-circle" size={19} color={colors.success} /><Text style={styles.feedbackText}>{message}</Text></View>}
              {!!error && <View style={[styles.feedback, styles.errorFeedback]}><Ionicons name="alert-circle-outline" size={19} color={colors.destructive} /><Text style={styles.errorText}>{error}</Text></View>}
            </View>

            <View style={styles.transactionsHeader}>
              <Text style={styles.sectionTitle}>{t.recentActivity}</Text>
              <Text style={styles.transactionCount}>{dashboard.transactions.length} {dashboard.transactions.length === 1 ? t.transactionSingular : t.transactionPlural}</Text>
            </View>
            {!loading && dashboard.transactions.length === 0 && !error && <View style={styles.empty}><Feather name="inbox" size={22} color={colors.mutedForeground} /><Text style={styles.emptyTitle}>{t.emptyTitle}</Text><Text style={styles.emptyText}>{t.emptyText}</Text></View>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.transaction}>
            <View style={[styles.transactionIcon, item.direction === 'in' ? styles.inIcon : styles.outIcon]}>
              <Feather name={item.direction === 'in' ? 'arrow-down-left' : 'arrow-up-right'} size={18} color={item.direction === 'in' ? colors.success : colors.primary} />
            </View>
            <View style={styles.transactionCopy}><Text style={styles.transactionTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.transactionDate}>{formatDate(item.createdAt)}</Text></View>
            <Text style={[styles.transactionAmount, item.direction === 'in' ? styles.inAmount : styles.outAmount]}>{item.direction === 'in' ? '+' : '-'}{formatMoney(item.amount, dashboard.currency)}</Text>
          </View>
        )}
      />
      <ConfirmPaymentDialog
        visible={confirmDialogVisible}
        amount={pendingPayment?.amount ?? 0}
        recipient={pendingPayment?.recipient ?? ''}
        currency={dashboard.currency}
        message={confirmPrompt}
        onCancel={handleCancelConfirm}
        onConfirm={handleConfirmPayment}
      />
      <PinModal
        visible={pinModalVisible}
        mode={pinMode}
        subtitle={
          pendingPayment
            ? t.pinSendSubtitle
                .replace('{amount}', formatMoney(pendingPayment.amount, dashboard.currency))
                .replace('{recipient}', pendingPayment.recipient)
            : undefined
        }
        loading={pinLoading}
        errorText={pinError}
        onCancel={cancelPin}
        onSubmit={(pin) => void confirmPayment(pin)}
      />
      <LanguageModal
        visible={pickerVisible}
        dismissable={language !== null}
        onClose={closePicker}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    langButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
    eyebrow: { color: colors.primary, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.8 },
    greeting: { color: colors.foreground, fontSize: 27, fontFamily: 'Inter_700Bold', marginTop: 4 },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.primaryForeground, fontSize: 16, fontFamily: 'Inter_700Bold' },
    balanceCard: { backgroundColor: colors.ink, borderRadius: 24, padding: 22, minHeight: 166, overflow: 'hidden', marginBottom: 27 },
    balanceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    balanceLabel: { color: colors.inkMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2 },
    balance: { color: colors.gold, fontSize: 38, fontFamily: 'Inter_700Bold', marginTop: 23, letterSpacing: -1.2 },
    balanceHint: { color: colors.inkMuted, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 7 },
    balanceOrb: { position: 'absolute', right: -34, bottom: -65, width: 170, height: 170, borderRadius: 85, borderWidth: 22, borderColor: colors.inkAccent, opacity: 0.55 },
    loader: { alignSelf: 'flex-start', marginTop: 30, marginBottom: 10 },
    askBlock: { marginBottom: 30 },
    sectionTitle: { color: colors.foreground, fontSize: 18, fontFamily: 'Inter_700Bold' },
    sectionHint: { color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 5, marginBottom: 13 },
    composer: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, minHeight: 118, padding: 13, justifyContent: 'space-between' },
    input: { color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21, minHeight: 46, textAlignVertical: 'top', padding: 0 },
    composerActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
    iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
    recordingButton: { backgroundColor: colors.errorSoft },
    sendButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.72 },
    feedback: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 12, paddingHorizontal: 2 },
    feedbackText: { color: colors.success, fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1, lineHeight: 19 },
    errorFeedback: { backgroundColor: colors.errorSoft, borderRadius: 11, padding: 10 },
    errorText: { color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1, lineHeight: 19 },
    transactionsHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 },
    transactionCount: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 },
    transaction: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
    transactionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    inIcon: { backgroundColor: colors.successSoft },
    outIcon: { backgroundColor: colors.primarySoft },
    transactionCopy: { flex: 1, minWidth: 0 },
    transactionTitle: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    transactionDate: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
    transactionAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginLeft: 10 },
    inAmount: { color: colors.success }, outAmount: { color: colors.foreground },
    empty: { alignItems: 'center', backgroundColor: colors.card, borderRadius: 17, paddingVertical: 25, paddingHorizontal: 20 },
    emptyTitle: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 10 },
    emptyText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5, textAlign: 'center' },
  });
}