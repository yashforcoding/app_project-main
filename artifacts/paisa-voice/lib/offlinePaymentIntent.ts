/**
 * A signed, self-contained "promise to pay" created entirely on-device, with no
 * network involved. It's exchanged with the recipient's phone over Bluetooth
 * (optionally preceded by an NFC tap for pairing — see nfc.ts), then queued
 * locally by both sides until connectivity returns, at which point the SENDER's
 * phone posts it to POST /finance/offline/settle for real settlement.
 *
 * IMPORTANT: this signature proves "the device holding this keypair authored
 * this exact intent" — it does NOT move money by itself. Money only moves when
 * the server verifies the signature and debits/credits real wallet rows.
 */
export type OfflinePaymentIntent = {
  /** Random UUID, unique per intent — the server enforces this as a uniqueness
   * key so replaying/retrying the same intent never double-charges. */
  nonce: string;
  fromDeviceId: string;
  toDeviceId: string;
  /** Display name captured at creation time, in case the sender typed/spoke a name
   * rather than picking a known device (e.g. "Ramesh" via voice command). */
  toLabel: string;
  amount: number;
  currency: string;
  /** Unix ms timestamp when the intent was created (used for display + expiry, not for security). */
  createdAt: number;
};

/**
 * Deterministic JSON stringification (fixed key order) — required so the exact
 * same bytes get hashed/signed on the sender's device and re-verified on the
 * server. Do NOT swap this for plain JSON.stringify(obj) elsewhere, since
 * object key order isn't guaranteed to round-trip identically otherwise.
 */
export function canonicalizeIntent(intent: OfflinePaymentIntent): string {
  return JSON.stringify({
    nonce: intent.nonce,
    fromDeviceId: intent.fromDeviceId,
    toDeviceId: intent.toDeviceId,
    toLabel: intent.toLabel,
    amount: intent.amount,
    currency: intent.currency,
    createdAt: intent.createdAt,
  });
}

export type QueuedOfflinePayment = {
  intent: OfflinePaymentIntent;
  signature: string; // base64
  status: 'pending' | 'settled' | 'failed';
  /** Only set once status is 'failed' — shown in the UI so the user knows why a retry might not help. */
  error?: string;
};
