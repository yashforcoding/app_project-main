import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDeviceIdentity, signMessage } from '@/lib/deviceIdentity';
import { canonicalizeIntent, type OfflinePaymentIntent, type QueuedOfflinePayment } from '@/lib/offlinePaymentIntent';
import { apiUrl } from '@/lib/apiUrl';

const QUEUE_STORAGE_KEY = 'paisaVoice.offlinePaymentQueue';

async function loadQueue(): Promise<QueuedOfflinePayment[]> {
  const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedOfflinePayment[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedOfflinePayment[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

export function useOfflinePaymentQueue() {
  const [queue, setQueue] = useState<QueuedOfflinePayment[]>([]);
  const [syncing, setSyncing] = useState(false);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  useEffect(() => {
    void loadQueue().then(setQueue);
  }, []);

  /** Creates a signed intent for an amount+recipient captured while offline, and adds it to the local queue immediately (before any network/BLE exchange happens). */
  const createIntent = useCallback(async (toDeviceId: string, toLabel: string, amount: number, currency: string) => {
    const identity = await getDeviceIdentity();
    const intent: OfflinePaymentIntent = {
      nonce: Crypto.randomUUID(),
      fromDeviceId: identity.deviceId,
      toDeviceId,
      toLabel,
      amount,
      currency,
      createdAt: Date.now(),
    };
    const signature = await signMessage(canonicalizeIntent(intent));
    const entry: QueuedOfflinePayment = { intent, signature, status: 'pending' };
    const next = [...queueRef.current, entry];
    setQueue(next);
    await saveQueue(next);
    return entry;
  }, []);

  /** Adds an intent that arrived FROM another phone (e.g. over BLE) — used on the receiving side so it shows up as "incoming, pending settlement" until the sender's phone actually settles it server-side. */
  const receiveIntent = useCallback(async (intent: OfflinePaymentIntent, signature: string) => {
    const entry: QueuedOfflinePayment = { intent, signature, status: 'pending' };
    const next = [...queueRef.current, entry];
    setQueue(next);
    await saveQueue(next);
    return entry;
  }, []);

  const settleOne = useCallback(async (entry: QueuedOfflinePayment): Promise<QueuedOfflinePayment> => {
    try {
      const res = await fetch(apiUrl('/finance/offline/settle'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: entry.intent, signature: entry.signature }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ...entry, status: 'failed', error: data?.message ?? `Settlement failed (${res.status})` };
      }
      return { ...entry, status: 'settled' };
    } catch {
      // Still offline or server unreachable — leave it pending, we'll retry on the next sync.
      return entry;
    }
  }, []);

  /** Attempts to settle every still-pending intent. Safe to call repeatedly (e.g. on every reconnect) — already-settled/failed entries are skipped. */
  const sync = useCallback(async () => {
    const pending = queueRef.current.filter((e) => e.status === 'pending');
    if (pending.length === 0) return;
    setSyncing(true);
    try {
      const results = await Promise.all(pending.map(settleOne));
      const byNonce = new Map(results.map((r) => [r.intent.nonce, r]));
      const next = queueRef.current.map((e) => byNonce.get(e.intent.nonce) ?? e);
      setQueue(next);
      await saveQueue(next);
    } finally {
      setSyncing(false);
    }
  }, [settleOne]);

  // Auto-sync whenever the device regains connectivity.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void sync();
      }
    });
    return unsubscribe;
  }, [sync]);

  const clearSettled = useCallback(async () => {
    const next = queueRef.current.filter((e) => e.status !== 'settled');
    setQueue(next);
    await saveQueue(next);
  }, []);

  return { queue, syncing, createIntent, receiveIntent, sync, clearSettled };
}
