import { Inject, Injectable, InjectionToken, OnDestroy, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { initializeFirebaseApp, initializeFirebaseAppCheck } from './firebase-app';

export const FIREBASE_AUTH_SESSION_KEY = 'mortgage-comparison-auth-enabled';

export interface FirebaseUserSummary {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface FirebaseAuthClient {
  observe(
    onUser: (user: FirebaseUserSummary | null) => void,
    onError: (error: unknown) => void,
  ): () => void;
  signInWithPopup(): Promise<FirebaseUserSummary>;
  signInWithRedirect(): Promise<void>;
  getRedirectResult(): Promise<FirebaseUserSummary | null>;
  signOut(): Promise<void>;
}

export type FirebaseAuthClientFactory = () => FirebaseAuthClient | null;

export type FirebaseAuthState =
  | { kind: 'guest' }
  | { kind: 'loading' }
  | { kind: 'authenticated'; user: FirebaseUserSummary }
  | { kind: 'cancelled'; message: string }
  | { kind: 'error'; message: string };

export type FirebaseSignInResult =
  'authenticated' | 'redirecting' | 'cancelled' | 'unavailable' | 'error';

export const FIREBASE_AUTH_CLIENT_FACTORY = new InjectionToken<FirebaseAuthClientFactory>(
  'FIREBASE_AUTH_CLIENT_FACTORY',
  {
    providedIn: 'root',
    factory: () => createFirebaseAuthClient,
  },
);

function createFirebaseAuthClient(): FirebaseAuthClient | null {
  const app = initializeFirebaseApp();
  if (!app) return null;

  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  const summarize = (user: User): FirebaseUserSummary => ({
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  });

  return {
    observe: (onUser, onError) =>
      onAuthStateChanged(auth, (user) => onUser(user ? summarize(user) : null), onError),
    signInWithPopup: async () => summarize((await signInWithPopup(auth, provider)).user),
    signInWithRedirect: () => signInWithRedirect(auth, provider),
    getRedirectResult: async () => {
      const result = await getRedirectResult(auth);
      return result ? summarize(result.user) : null;
    },
    signOut: () => signOut(auth),
  };
}

function errorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class FirebaseAuthService implements OnDestroy {
  readonly state = signal<FirebaseAuthState>({ kind: 'guest' });

  private client: FirebaseAuthClient | null = null;
  private unsubscribe: (() => void) | null = null;
  private redirectResult: Promise<void> = Promise.resolve();

  constructor(
    @Inject(FIREBASE_AUTH_CLIENT_FACTORY)
    private readonly createClient: FirebaseAuthClientFactory,
  ) {
    try {
      if (localStorage.getItem(FIREBASE_AUTH_SESSION_KEY) === 'true') {
        this.startSessionRestore();
      }
    } catch (error) {
      this.showError(error);
    }
  }

  async signInWithGoogle(): Promise<FirebaseSignInResult> {
    let client: FirebaseAuthClient | null;
    try {
      initializeFirebaseAppCheck();
      client = this.getClient();
    } catch (error) {
      this.showError(error);
      return 'error';
    }
    if (!client) return 'unavailable';

    this.state.set({ kind: 'loading' });
    await this.redirectResult;

    try {
      const user = await client.signInWithPopup();
      this.setAuthenticated(user);
      return 'authenticated';
    } catch (error) {
      const code = errorCode(error);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        this.state.set({
          kind: 'cancelled',
          message: 'Se canceló el inicio de sesión. Puedes seguir como invitado.',
        });
        return 'cancelled';
      }
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          localStorage.setItem(FIREBASE_AUTH_SESSION_KEY, 'true');
          await client.signInWithRedirect();
          return 'redirecting';
        } catch (redirectError) {
          this.showError(redirectError);
          return 'error';
        }
      }
      this.showError(error);
      return 'error';
    }
  }

  async signOut(): Promise<void> {
    if (!this.client) {
      this.state.set({ kind: 'guest' });
      this.clearSessionMarker();
      return;
    }

    this.state.set({ kind: 'loading' });
    try {
      await this.client.signOut();
      this.clearSessionMarker();
      this.state.set({ kind: 'guest' });
    } catch (error) {
      this.showError(error);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private getClient(): FirebaseAuthClient | null {
    if (this.client) return this.client;

    const client = this.createClient();
    if (!client) return null;
    this.client = client;
    this.unsubscribe = client.observe(
      (user) => {
        if (user) this.setAuthenticated(user);
        else if (this.state().kind !== 'loading') this.state.set({ kind: 'guest' });
      },
      (error) => this.showError(error),
    );
    this.redirectResult = client
      .getRedirectResult()
      .then((user) => {
        if (user) this.setAuthenticated(user);
        else if (this.state().kind === 'loading') this.state.set({ kind: 'guest' });
      })
      .catch((error: unknown) => {
        this.showError(error);
      });
    return client;
  }

  private startSessionRestore(): void {
    this.state.set({ kind: 'loading' });
    try {
      initializeFirebaseAppCheck();
      if (!this.getClient()) this.state.set({ kind: 'guest' });
    } catch (error) {
      this.showError(error);
    }
  }

  private setAuthenticated(user: FirebaseUserSummary): void {
    try {
      localStorage.setItem(FIREBASE_AUTH_SESSION_KEY, 'true');
      this.state.set({ kind: 'authenticated', user });
    } catch (error) {
      this.showError(error);
    }
  }

  private clearSessionMarker(): void {
    try {
      localStorage.removeItem(FIREBASE_AUTH_SESSION_KEY);
    } catch (error) {
      this.showError(error);
    }
  }

  private showError(error: unknown): void {
    const code = errorCode(error);
    this.state.set({
      kind: 'error',
      message: code
        ? `No se pudo completar la autenticación (${code}).`
        : 'No se pudo completar la autenticación. Comprueba la conexión e inténtalo de nuevo.',
    });
  }
}
