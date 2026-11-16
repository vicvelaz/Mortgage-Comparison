import { initializeFirebaseApp } from './firebase-app';

describe('firebase-app', () => {
  it('does not initialize Firebase when public configuration is absent', () => {
    expect(initializeFirebaseApp(null)).toBeNull();
  });
});
