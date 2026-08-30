/**
 * All fixed (non-dynamic) UI text in the app, in English.
 *
 * This object is the source of truth for translation: LanguageContext sends
 * the values (in this exact key order) to /finance/localize and stores the
 * translated values back under the same keys. Anything the server generates
 * dynamically (payment confirmations, errors from /finance/command, etc.) is
 * translated separately, server-side, and doesn't live here.
 */
export const DEFAULT_STRINGS = {
  greetingNight: 'Good night',
  greetingMorning: 'Good morning',
  greetingAfternoon: 'Good afternoon',
  greetingEvening: 'Good evening',
  availableBalance: 'AVAILABLE BALANCE',
  balanceHint: 'Your money, at a glance',
  askTitle: 'What would you like to do?',
  askHint: "Ask in your own words. I'll take care of the details.",
  inputPlaceholder: 'Try "send ₹500 to Ramesh"',
  recentActivity: 'Recent activity',
  transactionSingular: 'transaction',
  transactionPlural: 'transactions',
  emptyTitle: 'No activity yet',
  emptyText: 'Your recent transactions will appear here.',
  loadWalletError: 'Unable to load your wallet',
  micPermissionError: 'Microphone permission was not granted',
  pinSaveError: 'Could not save your PIN',
  paymentSentFallback: 'Payment sent.',
  pinIncorrectFallback: 'Incorrect PIN. Please try again.',
  paymentCancelled: 'Payment cancelled.',
  commandErrorFallback: 'I could not complete that request',
  recordingErrorFallback: 'I could not process that recording',
  transcriptionErrorFallback: 'I could not understand that recording',
  voiceUnavailableTitle: 'Voice input unavailable',
  voiceUnavailableText: 'Microphone recording is not supported on this device.',
  pinSetupTitle: 'Create a payment PIN',
  pinConfirmTitle: 'Confirm your PIN',
  pinVerifyTitle: 'Enter your PIN',
  pinSetupHelper: 'Set a 6-digit PIN. You will use it to authorize every payment.',
  pinConfirmHelper: 'Re-enter the same 6 digits to confirm.',
  pinStartOver: 'Start over',
  // Keep the {amount} and {recipient} tokens exactly as-is — they're filled in
  // with real values on-device after translation, not translated themselves.
  pinSendSubtitle: 'Send {amount} to {recipient}',
  languagePickerTitle: 'Choose your language',
  languagePickerSubtitle: "Paisa Voice will speak to you in this language, including payment confirmations.",
  languageChangeCta: 'Change language',
  languageUpdating: 'Updating language…',
  confirmTitle: 'Are you sure?',
  confirmCancel: 'Cancel',
  confirmButton: 'Confirm',
  confirmPromptFallback: 'Are you sure you want to send this payment?',
};

export type StringKey = keyof typeof DEFAULT_STRINGS;
export type Strings = typeof DEFAULT_STRINGS;

/** Values in stable key order — this exact array is what gets sent for translation. */
export const STRING_KEYS = Object.keys(DEFAULT_STRINGS) as StringKey[];
