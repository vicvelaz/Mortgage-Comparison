import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { FIREBASE_APP_CHECK_SITE_KEY, FIREBASE_CONFIG } from './firebase-config';

const APP_NAME = 'mortgage-comparison';
let appCheck: AppCheck | null = null;

export function initializeFirebaseApp(
  config: FirebaseOptions | null = FIREBASE_CONFIG,
): FirebaseApp | null {
  if (!config) return null;

  return getApps().find((app) => app.name === APP_NAME) ?? initializeApp(config, APP_NAME);
}

export function initializeFirebaseAppCheck(
  siteKey: string | null = FIREBASE_APP_CHECK_SITE_KEY,
): AppCheck | null {
  const app = initializeFirebaseApp();
  if (!app || !siteKey) return null;

  appCheck ??= initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheck;
}
