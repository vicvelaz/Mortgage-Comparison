import { Inject, Injectable, InjectionToken, signal } from '@angular/core';
import { createId, type Mortgage } from './mortgage-calculator';
import { parseMortgageFile, serializeMortgages, STORAGE_KEY } from './mortgage-storage';
import { FirebaseMortgageRepository } from './firebase-mortgage-repository';

const USER_CACHE_PREFIX = `${STORAGE_KEY}:user:`;
const PENDING_PREFIX = `${STORAGE_KEY}:pending:`;

export type FirebaseSyncStatus =
  | { kind: 'idle'; message: string }
  | { kind: 'syncing'; message: string }
  | { kind: 'synced'; message: string }
  | { kind: 'pending'; message: string }
  | { kind: 'error'; message: string };

export type PendingMortgageOperation =
  | { operationId: string; kind: 'upsert'; mortgage: Mortgage }
  | { operationId: string; kind: 'delete'; id: string; updatedAt: string };

export interface MortgageRemoteStore {
  list(uid: string): Promise<Mortgage[]>;
  saveIfNewer(uid: string, mortgage: Mortgage): Promise<boolean>;
  delete(uid: string, mortgageId: string): Promise<void>;
  deleteIfOlder(uid: string, mortgageId: string, deletedAt: string): Promise<boolean>;
  watch(
    uid: string,
    onMortgages: (mortgages: Mortgage[]) => void,
    onError: (error: unknown) => void,
  ): () => void;
}

export interface GuestMergeResult {
  merged: Mortgage[];
  transfer: Mortgage[];
}

export const FIREBASE_SYNC_STORAGE = new InjectionToken<Storage>('FIREBASE_SYNC_STORAGE', {
  providedIn: 'root',
  factory: () => localStorage,
});

export function mergeMortgageCollections(
  local: readonly Mortgage[],
  remote: readonly Mortgage[],
): Mortgage[] {
  const merged: Mortgage[] = [];
  const positions = new Map<string, number>();
  for (const mortgage of remote) {
    const position = positions.get(mortgage.id);
    if (position === undefined) {
      positions.set(mortgage.id, merged.length);
      merged.push(mortgage);
    } else if (Date.parse(mortgage.updatedAt) > Date.parse(merged[position].updatedAt)) {
      merged[position] = mortgage;
    }
  }
  for (const mortgage of local) {
    const position = positions.get(mortgage.id);
    if (position === undefined) {
      positions.set(mortgage.id, merged.length);
      merged.push(mortgage);
    } else if (Date.parse(mortgage.updatedAt) > Date.parse(merged[position].updatedAt)) {
      merged[position] = mortgage;
    }
  }
  return merged;
}

export function reconcileGuestOffers(
  guest: readonly Mortgage[],
  account: readonly Mortgage[],
  pending: readonly PendingMortgageOperation[],
): GuestMergeResult {
  const tombstones = new Map(
    pending
      .filter(
        (operation): operation is Extract<PendingMortgageOperation, { kind: 'delete' }> =>
          operation.kind === 'delete',
      )
      .map((operation) => [operation.id, operation.updatedAt]),
  );
  const transferableGuest = guest.filter((mortgage) => {
    const deletedAt = tombstones.get(mortgage.id);
    return !deletedAt || Date.parse(mortgage.updatedAt) > Date.parse(deletedAt);
  });
  const survivingAccount = account.filter((mortgage) => {
    const deletedAt = tombstones.get(mortgage.id);
    return !deletedAt || Date.parse(mortgage.updatedAt) >= Date.parse(deletedAt);
  });
  const accountById = new Map(survivingAccount.map((mortgage) => [mortgage.id, mortgage]));
  const transfer = transferableGuest.filter((mortgage) => {
    const remote = accountById.get(mortgage.id);
    return !remote || Date.parse(mortgage.updatedAt) > Date.parse(remote.updatedAt);
  });
  return {
    merged: mergeMortgageCollections(transferableGuest, survivingAccount),
    transfer,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cacheKey(uid: string): string {
  return `${USER_CACHE_PREFIX}${encodeURIComponent(uid)}`;
}

function pendingKey(uid: string): string {
  return `${PENDING_PREFIX}${encodeURIComponent(uid)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido de sincronización.';
}

function validatedMortgage(value: unknown): Mortgage {
  const parsed = parseMortgageFile(JSON.stringify({ schemaVersion: 2, mortgages: [value] }));
  if (!parsed.ok || parsed.value.length !== 1) {
    throw new Error(parsed.ok ? 'Oferta pendiente inválida.' : parsed.error);
  }
  return parsed.value[0];
}

@Injectable({ providedIn: 'root' })
export class FirebaseMortgageSyncService {
  readonly status = signal<FirebaseSyncStatus>({ kind: 'idle', message: '' });
  private activeUid: string | null = null;
  private stopWatching: (() => void) | null = null;
  private readonly flushingUsers = new Set<string>();
  private onOnline: (() => void) | null = null;
  private onMortgages: ((mortgages: Mortgage[]) => void) | null = null;

  constructor(
    @Inject(FirebaseMortgageRepository)
    private readonly repository: MortgageRemoteStore,
    @Inject(FIREBASE_SYNC_STORAGE)
    private readonly storage: Storage,
  ) {}

  readCache(uid: string): Mortgage[] | null {
    const raw = this.storage.getItem(cacheKey(uid));
    if (raw === null) return null;
    const parsed = parseMortgageFile(raw);
    if (!parsed.ok) throw new Error(`La caché de la cuenta está dañada: ${parsed.error}`);
    return parsed.value;
  }

  cachedView(uid: string): Mortgage[] | null {
    const cached = this.readCache(uid);
    return cached === null ? null : this.applyPending(uid, cached, false);
  }

  pendingOperations(uid: string): PendingMortgageOperation[] {
    return this.readPending(uid);
  }

  async previewAccount(uid: string): Promise<Mortgage[]> {
    const remote = await this.repository.list(uid);
    return this.applyPending(uid, remote, false);
  }

  activate(
    uid: string,
    mortgages: Mortgage[],
    transfer: readonly Mortgage[],
    onMortgages: (mortgages: Mortgage[]) => void,
  ): void {
    this.stop();
    this.setPendingOperations(
      uid,
      transfer.map((mortgage) => ({
        operationId: createId(),
        kind: 'upsert',
        mortgage,
      })),
    );
    this.writeCache(uid, mortgages);
    this.activeUid = uid;
    this.onMortgages = onMortgages;
    try {
      this.stopWatching = this.repository.watch(
        uid,
        (remote) => {
          if (this.activeUid !== uid) return;
          const visible = this.applyRemoteSnapshot(uid, remote);
          this.writeCache(uid, visible);
          this.onMortgages?.(visible);
          this.setSyncState(uid);
        },
        (error) => {
          if (this.activeUid === uid) {
            this.status.set({
              kind: 'pending',
              message: `Sin conexión con la nube; los cambios siguen guardados localmente. ${errorMessage(error)}`,
            });
          }
        },
      );
    } catch (error) {
      this.activeUid = null;
      this.onMortgages = null;
      throw error;
    }
    this.onOnline = () => {
      if (this.activeUid === uid) void this.flushPending(uid);
    };
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
    void this.flushPending(uid);
  }

  recordUpsert(uid: string, mortgage: Mortgage, mortgages: Mortgage[]): void {
    this.ensureActive(uid);
    this.addPending(uid, {
      operationId: createId(),
      kind: 'upsert',
      mortgage,
    });
    this.writeCache(uid, mortgages);
    void this.flushPending(uid);
  }

  recordDelete(uid: string, id: string, updatedAt: string, mortgages: Mortgage[]): void {
    this.ensureActive(uid);
    this.addPending(uid, { operationId: createId(), kind: 'delete', id, updatedAt });
    this.writeCache(uid, mortgages);
    void this.flushPending(uid);
  }

  recordReplacement(
    uid: string,
    mortgages: Mortgage[],
    deletedIds: readonly string[],
    updatedAt: string,
  ): void {
    this.ensureActive(uid);
    const replacements: PendingMortgageOperation[] = [
      ...deletedIds.map((id) => ({
        operationId: createId(),
        kind: 'delete' as const,
        id,
        updatedAt,
      })),
      ...mortgages.map((mortgage) => ({
        operationId: createId(),
        kind: 'upsert' as const,
        mortgage,
      })),
    ];
    let operations = this.readPending(uid);
    for (const replacement of replacements) {
      const id = replacement.kind === 'upsert' ? replacement.mortgage.id : replacement.id;
      operations = operations.filter(
        (operation) => (operation.kind === 'upsert' ? operation.mortgage.id : operation.id) !== id,
      );
      operations.push(replacement);
    }
    this.writePending(uid, operations);
    this.writeCache(uid, mortgages);
    void this.flushPending(uid);
  }

  stop(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    if (this.onOnline && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
    }
    this.onOnline = null;
    this.activeUid = null;
    this.onMortgages = null;
    this.status.set({ kind: 'idle', message: '' });
  }

  private ensureActive(uid: string): void {
    if (this.activeUid !== uid) throw new Error('La caché de la cuenta no está activa.');
  }

  private writeCache(uid: string, mortgages: Mortgage[]): void {
    this.storage.setItem(cacheKey(uid), serializeMortgages(mortgages));
  }

  private readPending(uid: string): PendingMortgageOperation[] {
    const raw = this.storage.getItem(pendingKey(uid));
    if (raw === null) return [];
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`La cola de sincronización está dañada: ${errorMessage(error)}`);
    }
    if (!Array.isArray(value))
      throw new Error('La cola de sincronización tiene un formato inválido.');
    return value.map((operation) => {
      if (!isRecord(operation) || typeof operation['operationId'] !== 'string') {
        throw new Error('La cola de sincronización contiene una operación inválida.');
      }
      if (operation['kind'] === 'upsert') {
        const mortgage = validatedMortgage(operation['mortgage']);
        return {
          operationId: operation['operationId'],
          kind: 'upsert',
          mortgage,
        };
      }
      if (
        operation['kind'] === 'delete' &&
        typeof operation['id'] === 'string' &&
        typeof operation['updatedAt'] === 'string' &&
        Number.isFinite(Date.parse(operation['updatedAt']))
      ) {
        return {
          operationId: operation['operationId'],
          kind: 'delete',
          id: operation['id'],
          updatedAt: operation['updatedAt'],
        };
      }
      throw new Error('La cola de sincronización contiene una operación inválida.');
    });
  }

  private writePending(uid: string, operations: PendingMortgageOperation[]): void {
    const key = pendingKey(uid);
    if (operations.length === 0) this.storage.removeItem(key);
    else this.storage.setItem(key, JSON.stringify(operations));
  }

  private addPending(uid: string, operation: PendingMortgageOperation): void {
    const operations = this.readPending(uid).filter(
      (item) =>
        (item.kind === 'upsert' ? item.mortgage.id : item.id) !==
        (operation.kind === 'upsert' ? operation.mortgage.id : operation.id),
    );
    this.writePending(uid, [...operations, operation]);
  }

  private setPendingOperations(uid: string, additions: PendingMortgageOperation[]): void {
    for (const operation of additions) this.addPending(uid, operation);
  }

  private applyPending(uid: string, mortgages: Mortgage[], persistQueue = true): Mortgage[] {
    const byId = new Map(mortgages.map((mortgage) => [mortgage.id, mortgage]));
    const remaining: PendingMortgageOperation[] = [];
    for (const operation of this.readPending(uid)) {
      const id = operation.kind === 'upsert' ? operation.mortgage.id : operation.id;
      const current = byId.get(id);
      if (operation.kind === 'upsert') {
        if (!current || Date.parse(operation.mortgage.updatedAt) > Date.parse(current.updatedAt)) {
          byId.set(id, operation.mortgage);
          remaining.push(operation);
        }
      } else if (!current || Date.parse(operation.updatedAt) > Date.parse(current.updatedAt)) {
        byId.delete(id);
        remaining.push(operation);
      }
    }
    if (persistQueue) this.writePending(uid, remaining);
    return [...byId.values()];
  }

  private applyRemoteSnapshot(uid: string, remote: Mortgage[]): Mortgage[] {
    const visibleRemote = this.applyPending(uid, remote);
    const pendingIds = new Set(
      this.readPending(uid).map((operation) =>
        operation.kind === 'upsert' ? operation.mortgage.id : operation.id,
      ),
    );
    const cachedWithoutPending = (this.readCache(uid) ?? []).filter(
      (mortgage) => !pendingIds.has(mortgage.id),
    );
    return mergeMortgageCollections(cachedWithoutPending, visibleRemote);
  }

  private async flushPending(uid: string): Promise<void> {
    if (this.activeUid !== uid || this.flushingUsers.has(uid)) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.status.set({
        kind: 'pending',
        message: 'Sin conexión. Los cambios se sincronizarán al reconectar.',
      });
      return;
    }
    this.flushingUsers.add(uid);
    let completed = false;
    let hasPending = false;
    try {
      this.status.set({ kind: 'syncing', message: 'Sincronizando cambios…' });
      for (const operation of this.readPending(uid)) {
        if (this.activeUid !== uid) return;
        if (operation.kind === 'upsert') {
          await this.repository.saveIfNewer(uid, operation.mortgage);
        } else {
          await this.repository.deleteIfOlder(uid, operation.id, operation.updatedAt);
        }
        const remaining = this.readPending(uid).filter(
          (item) => item.operationId !== operation.operationId,
        );
        this.writePending(uid, remaining);
      }
      this.setSyncState(uid);
      hasPending = this.readPending(uid).length > 0;
      completed = true;
    } catch (error) {
      if (this.activeUid === uid) {
        this.status.set({
          kind: 'pending',
          message: `La sincronización queda pendiente. ${errorMessage(error)}`,
        });
      }
    } finally {
      this.flushingUsers.delete(uid);
      if (completed && hasPending && this.activeUid === uid) {
        void this.flushPending(uid);
      }
    }
  }

  private setSyncState(uid: string): void {
    if (this.activeUid !== uid) return;
    const pending = this.readPending(uid).length;
    this.status.set(
      pending === 0
        ? { kind: 'synced', message: 'Cuenta sincronizada.' }
        : { kind: 'pending', message: `${pending} cambio(s) pendientes de sincronización.` },
    );
  }
}
