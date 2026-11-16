import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIREBASE_AUTH_SESSION_KEY,
  FirebaseAuthService,
  type FirebaseAuthClient,
  type FirebaseUserSummary,
} from './firebase-auth';

const user: FirebaseUserSummary = {
  uid: 'user-1',
  displayName: 'Ana',
  email: 'ana@example.com',
  photoURL: null,
};

class FakeFirebaseAuth implements FirebaseAuthClient {
  private onUser: ((user: FirebaseUserSummary | null) => void) | null = null;
  popup = vi.fn<() => Promise<FirebaseUserSummary>>(async () => user);
  redirect = vi.fn<() => Promise<void>>(async () => undefined);
  redirectResult = vi.fn<() => Promise<FirebaseUserSummary | null>>(async () => null);
  signOutCall = vi.fn<() => Promise<void>>(async () => {
    this.onUser?.(null);
  });

  observe(
    onUser: (user: FirebaseUserSummary | null) => void,
    _onError: (error: unknown) => void,
  ): () => void {
    this.onUser = onUser;
    onUser(null);
    return () => {
      this.onUser = null;
    };
  }

  signInWithPopup(): Promise<FirebaseUserSummary> {
    return this.popup().then((signedInUser) => {
      this.onUser?.(signedInUser);
      return signedInUser;
    });
  }

  signInWithRedirect(): Promise<void> {
    return this.redirect();
  }

  getRedirectResult(): Promise<FirebaseUserSummary | null> {
    return this.redirectResult();
  }

  signOut(): Promise<void> {
    return this.signOutCall();
  }
}

describe('FirebaseAuthService', () => {
  beforeEach(() => {
    localStorage.removeItem(FIREBASE_AUTH_SESSION_KEY);
  });

  it('keeps guest mode without creating an Auth client when configuration is absent', async () => {
    const createClient = vi.fn(() => null);
    const service = new FirebaseAuthService(createClient);

    expect(service.state()).toEqual({ kind: 'guest' });
    await expect(service.signInWithGoogle()).resolves.toBe('unavailable');
    expect(createClient).toHaveBeenCalledOnce();
    expect(service.state()).toEqual({ kind: 'guest' });
  });

  it('enters authenticated state after Google popup sign-in', async () => {
    const client = new FakeFirebaseAuth();
    const service = new FirebaseAuthService(() => client);

    await expect(service.signInWithGoogle()).resolves.toBe('authenticated');
    expect(service.state()).toEqual({ kind: 'authenticated', user });
    expect(localStorage.getItem(FIREBASE_AUTH_SESSION_KEY)).toBe('true');
  });

  it('restores a prior authenticated session when the local session marker exists', async () => {
    localStorage.setItem(FIREBASE_AUTH_SESSION_KEY, 'true');
    const client = new FakeFirebaseAuth();
    client.redirectResult.mockResolvedValue(user);
    const service = new FirebaseAuthService(() => client);

    await vi.waitFor(() => {
      expect(service.state()).toEqual({ kind: 'authenticated', user });
    });
  });

  it('returns to guest mode when a saved session marker has no authenticated user', async () => {
    localStorage.setItem(FIREBASE_AUTH_SESSION_KEY, 'true');
    const client = new FakeFirebaseAuth();
    const service = new FirebaseAuthService(() => client);

    await vi.waitFor(() => {
      expect(service.state()).toEqual({ kind: 'guest' });
    });
  });

  it('reports popup cancellation and leaves the user able to continue as a guest', async () => {
    const client = new FakeFirebaseAuth();
    client.popup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    const service = new FirebaseAuthService(() => client);

    await expect(service.signInWithGoogle()).resolves.toBe('cancelled');
    expect(service.state()).toMatchObject({ kind: 'cancelled' });
    expect(localStorage.getItem(FIREBASE_AUTH_SESSION_KEY)).toBeNull();
  });

  it('falls back to redirect when the popup is blocked', async () => {
    const client = new FakeFirebaseAuth();
    client.popup.mockRejectedValue({ code: 'auth/popup-blocked' });
    const service = new FirebaseAuthService(() => client);

    await expect(service.signInWithGoogle()).resolves.toBe('redirecting');
    expect(client.redirect).toHaveBeenCalledOnce();
    expect(localStorage.getItem(FIREBASE_AUTH_SESSION_KEY)).toBe('true');
  });

  it('surfaces authentication errors without entering authenticated state', async () => {
    const client = new FakeFirebaseAuth();
    client.popup.mockRejectedValue({ code: 'auth/network-request-failed' });
    const service = new FirebaseAuthService(() => client);

    await expect(service.signInWithGoogle()).resolves.toBe('error');
    expect(service.state()).toMatchObject({ kind: 'error' });
  });

  it('closes the session and clears its restore marker', async () => {
    const client = new FakeFirebaseAuth();
    const service = new FirebaseAuthService(() => client);
    await service.signInWithGoogle();

    await service.signOut();

    expect(client.signOutCall).toHaveBeenCalledOnce();
    expect(service.state()).toEqual({ kind: 'guest' });
    expect(localStorage.getItem(FIREBASE_AUTH_SESSION_KEY)).toBeNull();
  });
});
