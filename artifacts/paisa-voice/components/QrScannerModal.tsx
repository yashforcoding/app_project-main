import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

export type ParsedUpiQr = {
  payeeVpa: string | null;
  payeeName: string | null;
  amount: number | null;
};

/**
 * Parses a UPI deep link like:
 *   upi://pay?pa=merchant@bank&pn=Merchant%20Name&am=250.00&cu=INR
 * Runs entirely on-device — no network call. Returns null if this isn't a UPI QR code.
 */
export function parseUpiQr(data: string): ParsedUpiQr | null {
  if (!data.toLowerCase().startsWith('upi://')) return null;
  try {
    const query = data.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    const payeeVpa = params.get('pa');
    const payeeName = params.get('pn');
    const amountRaw = params.get('am');
    return {
      payeeVpa: payeeVpa ? decodeURIComponent(payeeVpa) : null,
      payeeName: payeeName ? decodeURIComponent(payeeName) : null,
      amount: amountRaw ? Number(amountRaw) : null,
    };
  } catch {
    return null;
  }
}

type Props = {
  visible: boolean;
  onCancel: () => void;
  onScanned: (data: ParsedUpiQr) => void;
};

export default function QrScannerModal({ visible, onCancel, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [notUpiWarning, setNotUpiWarning] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setNotUpiWarning(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    const parsed = parseUpiQr(data);
    if (!parsed) {
      setNotUpiWarning(true);
      return; // keep the camera running so they can try a different code
    }
    setScanned(true);
    onScanned(parsed);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Camera access is needed to scan a UPI QR code.</Text>
            <Pressable style={styles.permissionButton} onPress={() => void requestPermission()}>
              <Text style={styles.permissionButtonText}>Grant camera access</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.frame} pointerEvents="none" />
        <Text style={styles.hint}>
          {notUpiWarning ? "That's not a UPI QR code — try another" : 'Point your camera at a UPI QR code'}
        </Text>

        <Pressable style={styles.closeButton} onPress={onCancel} hitSlop={12}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  frame: {
    position: 'absolute',
    top: '32%',
    left: '15%',
    width: '70%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: '#ffffffcc',
    borderRadius: 20,
  },
  hint: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permissionText: { color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 16, fontFamily: 'Inter_500Medium' },
  permissionButton: { backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 },
  permissionButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});
