import { describe, expect, it, vi } from 'vitest';
import type { Mortgage } from '../../domain/mortgage/mortgage.model';
import {
  FirebaseMortgageSyncService,
  mergeMortgageCollections,
  reconcileGuestOffers,
  type MortgageRemoteStore,
} from './firebase-mortgage-sync';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  entries(): [string, string][] {
    return [...this.values.entries()];
  }
}

class FakeMortgageRemoteStore implements MortgageRemoteStore {
  records: Mortgage[] = [];
  fail = false;
  saved: Mortgage[] = [];
  deleted: string[] = [];
  onChange: ((mortgages: Mortgage[]) => void) | null = null;
  onError: ((error: unknown) => void) | null = null;

  async list(): Promise<Mortgage[]> {
    if (this.fail) throw new Error('offline');
    return this.records;
  }

  async saveIfNewer(_uid: string, mortgage: Mortgage): Promise<boolean> {
    if (this.fail) throw new Error('offline');
    this.saved.push(mortgage);
    this.records = mergeMortgageCollections([mortgage], this.records);
    return true;
  }

  async delete(_uid: string, mortgageId: string): Promise<void> {
    if (this.fail) throw new Error('offline');
    this.deleted.push(mortgageId);
    this.records = this.records.filter((mortgage) => mortgage.id !== mortgageId);
  }

  async deleteIfOlder(uid: string, mortgageId: string, _deletedAt: string): Promise<boolean> {
    await this.delete(uid, mortgageId);
    return true;
  }

  watch(
    _uid: string,
    onMortgages: (mortgages: Mortgage[]) => void,
    onError: (error: unknown) => void,
  ): () => void {
    this.onChange = onMortgages;
    this.onError = onError;
    return () => {
      this.onChange = null;
      this.onError = null;
    };
  }
}

function mortgage(id: string, updatedAt = '2026-01-01T10:00:00.000Z'): Mortgage {
  return {
    id,
    name: `Oferta ${id}`,
    bank: 'Banco',
    amount: 180000,
    years: 25,
    interestRate: 3.1,
    rateType: 'fixed',
    cancellationFees: { partial: [], total: [] },
    scenarios: [
      {
        id: `scenario-${id}`,
        name: 'Base',
        mode: 'reduceInstallment',
        bonuses: [],
        amortizations: [],
      },
    ],
    updatedAt,
  };
}

describe('FirebaseMortgageSyncService', () => {
  it('merges by ID, selects the newer timestamp, and prefers remote on ties', () => {
    const local = [mortgage('local'), mortgage('same', '2026-01-01T10:00:00.000Z')];
    const remote = [
      mortgage('remote'),
      { ...mortgage('same', '2026-01-01T10:00:00.000Z'), name: 'Versión remota' },
    ];

    expect(mergeMortgageCollections(local, remote)).toEqual([remote[0], remote[1], local[0]]);
  });

  it('previews account data without changing local caches or the pending queue', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'hipoteca-comparador-v2:pending:uid',
      JSON.stringify([
        {
          operationId: 'pending-1',
          kind: 'upsert',
          mortgage: mortgage('pending', '2026-01-02T10:00:00.000Z'),
        },
      ]),
    );
    const remote = new FakeMortgageRemoteStore();
    remote.records = [mortgage('remote')];
    const service = new FirebaseMortgageSyncService(remote, storage as unknown as Storage);

    await expect(service.previewAccount('uid')).resolves.toEqual([
      remote.records[0],
      mortgage('pending', '2026-01-02T10:00:00.000Z'),
    ]);
    expect(storage.entries()).toHaveLength(1);
    expect(storage.getItem('hipoteca-comparador-v2:pending:uid')).toContain('pending-1');
  });

  it('prepares confirmable guest transfer using timestamp and tombstone conflicts', () => {
    const guest = [
      mortgage('guest-only'),
      mortgage('newer-local', '2026-01-03T10:00:00.000Z'),
      mortgage('tie', '2026-01-02T10:00:00.000Z'),
      mortgage('deleted-local', '2026-01-01T10:00:00.000Z'),
    ];
    const account = [
      mortgage('account-only'),
      mortgage('newer-local', '2026-01-02T10:00:00.000Z'),
      { ...mortgage('tie', '2026-01-02T10:00:00.000Z'), name: 'Versión remota' },
      mortgage('deleted-local', '2026-01-01T10:00:00.000Z'),
    ];
    const pending = [
      {
        operationId: 'delete-1',
        kind: 'delete' as const,
        id: 'deleted-local',
        updatedAt: '2026-01-02T10:00:00.000Z',
      },
    ];
    const result = reconcileGuestOffers(guest, account, pending);

    expect(result.transfer.map((mortgage) => mortgage.id)).toEqual(['guest-only', 'newer-local']);
    expect(result.merged.map((mortgage) => mortgage.id)).toEqual([
      'account-only',
      'newer-local',
      'tie',
      'guest-only',
    ]);
    expect(result.merged.find((mortgage) => mortgage.id === 'tie')?.name).toBe('Versión remota');
  });

  it('uploads guest winners only after the merged account state is activated', async () => {
    const remote = new FakeMortgageRemoteStore();
    remote.records = [mortgage('overlap', '2026-01-01T10:00:00.000Z')];
    const service = new FirebaseMortgageSyncService(
      remote,
      new MemoryStorage() as unknown as Storage,
    );
    const guest = [mortgage('guest-only'), mortgage('overlap', '2026-01-02T10:00:00.000Z')];
    const account = await service.previewAccount('uid');
    const merge = reconcileGuestOffers(guest, account, service.pendingOperations('uid'));
    expect(remote.saved).toEqual([]);

    service.activate('uid', merge.merged, merge.transfer, () => undefined);
    await vi.waitFor(() => {
      expect(remote.saved.map((mortgage) => mortgage.id)).toEqual(['guest-only', 'overlap']);
      expect(service.status().kind).toBe('synced');
    });
  });

  it('keeps per-UID cache and pending tombstones across reload, then retries them', async () => {
    const storage = new MemoryStorage();
    const remote = new FakeMortgageRemoteStore();
    remote.fail = true;
    const service = new FirebaseMortgageSyncService(remote, storage as unknown as Storage);
    const original = mortgage('account-offer');
    const updatedOffer = mortgage('another-offer', '2026-01-02T10:00:00.000Z');
    service.activate('uid-one', [original, mortgage('another-offer')], [], () => undefined);
    service.recordUpsert('uid-one', updatedOffer, [original, updatedOffer]);
    service.recordDelete('uid-one', original.id, '2026-01-02T10:00:00.000Z', [updatedOffer]);

    await vi.waitFor(() => {
      expect(service.status().kind).toBe('pending');
    });
    const cacheKey = storage.entries().find(([key]) => key.includes(':user:uid-one'))?.[0];
    const queueKey = storage.entries().find(([key]) => key.includes(':pending:uid-one'))?.[0];
    expect(cacheKey).toBeDefined();
    expect(queueKey).toBeDefined();
    expect(JSON.parse(storage.getItem(queueKey!)!)).toMatchObject([
      { kind: 'upsert', mortgage: { id: updatedOffer.id } },
      { kind: 'delete', id: original.id },
    ]);

    const restartedRemote = new FakeMortgageRemoteStore();
    restartedRemote.records = [original, mortgage('another-offer')];
    const restarted = new FirebaseMortgageSyncService(
      restartedRemote,
      storage as unknown as Storage,
    );
    const cached = restarted.readCache('uid-one');
    expect(cached).toEqual([updatedOffer]);
    expect(restarted.cachedView('uid-one')).toEqual([updatedOffer]);
    expect(restarted.readCache('uid-two')).toBeNull();
    restarted.activate('uid-one', cached!, [], () => undefined);

    await vi.waitFor(() => {
      expect(restartedRemote.deleted).toEqual([original.id]);
      expect(restartedRemote.saved).toEqual([updatedOffer]);
      expect(restarted.status().kind).toBe('synced');
    });
    expect(storage.getItem(queueKey!)).toBeNull();
  });

  it('retains the newest pending upsert when an older remote version arrives', async () => {
    const storage = new MemoryStorage();
    const remote = new FakeMortgageRemoteStore();
    const service = new FirebaseMortgageSyncService(remote, storage as unknown as Storage);
    const local = mortgage('same', '2026-01-02T10:00:00.000Z');
    service.activate('uid', [local], [], () => undefined);
    service.recordUpsert('uid', local, [local]);

    remote.onChange?.([mortgage('same', '2026-01-01T10:00:00.000Z')]);
    await vi.waitFor(() => {
      expect(service.readCache('uid')).toEqual([local]);
    });
    expect(service.status().kind).toBe('synced');
    expect(remote.saved).toEqual([local]);
  });

  it('stops account listeners when the active session closes', () => {
    const remote = new FakeMortgageRemoteStore();
    const service = new FirebaseMortgageSyncService(
      remote,
      new MemoryStorage() as unknown as Storage,
    );
    service.activate('uid', [], [], () => undefined);

    expect(remote.onChange).toBeTypeOf('function');
    service.stop();

    expect(remote.onChange).toBeNull();
    expect(remote.onError).toBeNull();
    expect(service.status().kind).toBe('idle');
  });
});
