import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getDeviceIdentity } from '@/lib/deviceIdentity';
import { apiUrl } from '@/lib/apiUrl';

type DeviceWalletState = {
  deviceId: string | null;
  registered: boolean;
  balance: number;
  currency: string;
  error: string | null;
};

const DEFAULT_LABEL = Platform.OS === 'android' ? "Someone's Android" : Platform.OS === 'ios' ? "Someone's iPhone" : 'This device';

/**
 * Registers this install's keypair with the server (idempotent — safe to call
 * on every launch) so it has its own wallet for device-to-device offline
 * payments, separate from the shared single-device demo wallet used
 * elsewhere in the app. Requires network the first time; after that the
 * device's identity/keys are cached locally and registration is a formality.
 */
export function useDeviceWallet(label: string = DEFAULT_LABEL) {
  const [state, setState] = useState<DeviceWalletState>({
    deviceId: null,
    registered: false,
    balance: 0,
    currency: 'INR',
    error: null,
  });

  const register = useCallback(async () => {
    try {
      const identity = await getDeviceIdentity();
      const res = await fetch(apiUrl('/finance/device/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: identity.deviceId, publicKey: identity.publicKey, label }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setState((s) => ({ ...s, deviceId: identity.deviceId, error: data?.message ?? 'Could not register this device' }));
        return;
      }
      setState({
        deviceId: identity.deviceId,
        registered: true,
        balance: Number(data.balance ?? 0),
        currency: data.currency ?? 'INR',
        error: null,
      });
    } catch (error) {
      setState((s) => ({ ...s, error: error instanceof Error ? error.message : 'Could not reach the server' }));
    }
  }, [label]);

  useEffect(() => {
    void register();
  }, [register]);

  return { ...state, refresh: register };
}
