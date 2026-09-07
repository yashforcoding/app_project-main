import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

const DEVICE_ID_KEY = 'paisaVoice.deviceId';
const SECRET_KEY_KEY = 'paisaVoice.deviceSecretKey'; // base64, 64 bytes (nacl sign secret key)
const PUBLIC_KEY_KEY = 'paisaVoice.devicePublicKey'; // base64, 32 bytes

export type DeviceIdentity = {
  deviceId: string;
  publicKey: string; // base64
};

let cached: (DeviceIdentity & { secretKey: Uint8Array }) | null = null;

/**
 * Loads this device's signing identity from secure storage, generating one on
 * first run. The private key never leaves the device — only the public key is
 * ever sent to the server (during registration) or to another phone (as part
 * of a signed payment intent, so the recipient/server can verify it later).
 */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (cached) return { deviceId: cached.deviceId, publicKey: cached.publicKey };

  const [existingId, existingSecret] = await Promise.all([
    SecureStore.getItemAsync(DEVICE_ID_KEY),
    SecureStore.getItemAsync(SECRET_KEY_KEY),
  ]);

  if (existingId && existingSecret) {
    const secretKey = decodeBase64(existingSecret);
    const publicKey = encodeBase64(secretKey.slice(32)); // nacl sign secret keys embed the public key in the last 32 bytes
    cached = { deviceId: existingId, secretKey, publicKey };
    return { deviceId: existingId, publicKey };
  }

  const keyPair = nacl.sign.keyPair();
  const deviceId = Crypto.randomUUID();
  const secretKeyB64 = encodeBase64(keyPair.secretKey);
  const publicKeyB64 = encodeBase64(keyPair.publicKey);

  await Promise.all([
    SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId),
    SecureStore.setItemAsync(SECRET_KEY_KEY, secretKeyB64),
    SecureStore.setItemAsync(PUBLIC_KEY_KEY, publicKeyB64),
  ]);

  cached = { deviceId, secretKey: keyPair.secretKey, publicKey: publicKeyB64 };
  return { deviceId, publicKey: publicKeyB64 };
}

/** Signs an arbitrary UTF-8 string (typically a canonical JSON payment intent) and returns a base64 signature. */
export async function signMessage(message: string): Promise<string> {
  await getDeviceIdentity(); // ensures `cached` is populated
  if (!cached) throw new Error('Device identity not initialized');
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, cached.secretKey);
  return encodeBase64(signature);
}
