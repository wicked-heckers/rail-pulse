import { NativeModules, Platform } from 'react-native';

/**
 * Default backend URL:
 * 1. Uses EXPO_PUBLIC_API_URL if explicitly set.
 * 2. Auto-detects the Metro bundler host IP from NativeModules.SourceCode.scriptURL
 *    (so physical phones on Wi-Fi automatically get http://<PC-LAN-IP>:8000).
 * 3. Falls back to 10.0.2.2:8000 (Android Emulator) or localhost:8000 (iOS/Web).
 */
export function getDefaultBackendOrigin(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.replace(/\/+$/, '');
  }

  try {
    const sourceCode = NativeModules?.SourceCode;
    const scriptURL: string | undefined =
      sourceCode?.getConstants?.()?.scriptURL ?? sourceCode?.scriptURL;
    if (scriptURL && scriptURL.startsWith('http')) {
      const match = scriptURL.match(/^https?:\/\/([^/:]+)/);
      if (match?.[1]) {
        return `http://${match[1]}:8000`;
      }
    }
  } catch {
    // Ignore and fall back to platform default
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }
  return 'http://localhost:8000';
}

export function toWsOrigin(httpOrigin: string): string {
  const clean = httpOrigin.replace(/\/+$/, '');
  if (clean.startsWith('https://')) {
    return clean.replace('https://', 'wss://');
  }
  if (clean.startsWith('http://')) {
    return clean.replace('http://', 'ws://');
  }
  return `ws://${clean}`;
}

export function formatIstTime(epochSecs: number): string {
  if (!epochSecs || epochSecs <= 0) return '--:--';
  const ist = new Date((epochSecs + 19800) * 1000);
  const hours24 = ist.getUTCHours();
  const mins = ist.getUTCMinutes().toString().padStart(2, '0');
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${mins} ${ampm}`;
}
