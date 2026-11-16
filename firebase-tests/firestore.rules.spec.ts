import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import 'firebase/compat/app';
import 'firebase/compat/firestore';
import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { Mortgage } from '../src/app/mortgage-calculator';
import { FirebaseMortgageRepository } from '../src/app/firebase-mortgage-repository';

const projectId = 'mortgage-comparison-rules';
let environment: RulesTestEnvironment;
const generation = 'generation-1';
const modularDatabases = new Map<string, Firestore>();

const mortgage = {
  id: 'mortgage-1',
  name: 'Oferta de prueba',
  bank: 'Banco',
  amount: 180000,
  years: 25,
  interestRate: 3.1,
  rateType: 'fixed',
  generation,
  updatedAt: '2026-01-01T10:00:00.000Z',
};
const scenario = {
  id: 'scenario-1',
  generation,
  index: 0,
  name: 'Base',
  mode: 'reduceInstallment',
};
const bonus = {
  id: 'bonus-1',
  generation,
  index: 0,
  name: 'Nómina',
  active: true,
  interestReduction: 0.5,
  annualCost: 120,
};
const amortization = {
  id: 'amortization-1',
  generation,
  index: 0,
  name: 'Extra',
  active: true,
  type: 'single',
  reductionType: 'term',
  amount: 5000,
  month: 24,
};
const fee = {
  generation,
  kind: 'partial',
  index: 0,
  fromMonth: 1,
  percent: 0.5,
};

function mortgageRef(uid: string, id = mortgage.id) {
  return environment.authenticatedContext(uid).firestore().doc(`users/${uid}/mortgages/${id}`);
}

function childRef(uid: string, path: string) {
  return environment.authenticatedContext(uid).firestore().doc(path);
}

function modularDatabase(uid: string): Firestore {
  const cached = modularDatabases.get(uid);
  if (cached) return cached;
  const compatFirestore = environment.authenticatedContext(uid).firestore();
  const database = compatFirestore._delegate;
  modularDatabases.set(uid, database);
  return database;
}

function validMortgage(id = 'repository-mortgage'): Mortgage {
  return {
    id,
    name: 'Oferta de repositorio',
    bank: 'Banco',
    amount: 180000,
    years: 25,
    interestRate: 3.1,
    rateType: 'fixed',
    cancellationFees: { partial: [], total: [] },
    scenarios: [
      {
        id: 'scenario-1',
        name: 'Base',
        mode: 'reduceInstallment',
        bonuses: [],
        amortizations: [],
      },
    ],
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
}

describe('Firestore security rules', () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    modularDatabases.clear();
  });

  it('allows the owner to create, read, update, and delete a valid v2 mortgage', async () => {
    const ref = mortgageRef('owner');
    await assertSucceeds(ref.set(mortgage));
    const result = await assertSucceeds(ref.get());
    expect(result.data()).toEqual(mortgage);
    await assertSucceeds(ref.update({ name: 'Oferta actualizada' }));
    await assertSucceeds(ref.delete());
  });

  it('allows the owner to create and read valid scenario and item documents', async () => {
    const db = environment.authenticatedContext('owner').firestore();
    const scenarioRef = db.doc(
      `users/owner/mortgages/mortgage-1/scenarios/${generation}__${scenario.id}`,
    );
    const bonusRef = db.doc(
      `users/owner/mortgages/mortgage-1/scenarios/${generation}__${scenario.id}/bonuses/${generation}__${bonus.id}`,
    );
    const amortizationRef = db.doc(
      `users/owner/mortgages/mortgage-1/scenarios/${generation}__${scenario.id}/amortizations/${generation}__${amortization.id}`,
    );
    const feeRef = db.doc(
      `users/owner/mortgages/mortgage-1/cancellationFees/${generation}__partial-0`,
    );

    const batch = db.batch();
    batch.set(db.doc(`users/owner/mortgages/${mortgage.id}`), mortgage);
    batch.set(scenarioRef, scenario);
    batch.set(bonusRef, bonus);
    batch.set(amortizationRef, amortization);
    batch.set(feeRef, fee);
    await assertSucceeds(batch.commit());
    expect((await assertSucceeds(scenarioRef.get())).data()).toEqual(scenario);
    expect((await assertSucceeds(bonusRef.get())).data()).toEqual(bonus);
    expect((await assertSucceeds(amortizationRef.get())).data()).toEqual(amortization);
    expect((await assertSucceeds(feeRef.get())).data()).toEqual(fee);
  });

  it('denies access when there is no authenticated session', async () => {
    const ref = environment
      .unauthenticatedContext()
      .firestore()
      .doc(`users/owner/mortgages/${mortgage.id}`);
    await assertFails(ref.get());
    await assertFails(ref.set(mortgage));
  });

  it('denies a different UID from reading or writing the owner document', async () => {
    await assertSucceeds(mortgageRef('owner').set(mortgage));
    const otherUserRef = childRef(
      'other-user',
      `users/owner/mortgages/${mortgage.id}/scenarios/${scenario.id}`,
    );
    await assertFails(otherUserRef.get());
    await assertFails(otherUserRef.set(scenario));
  });

  it('rejects unknown calculated fields', async () => {
    await assertFails(mortgageRef('owner').set({ ...mortgage, totalInterest: 78891.58 }));
  });

  it('rejects a name that exceeds the configured document text limit', async () => {
    await assertFails(mortgageRef('owner').set({ ...mortgage, name: 'x'.repeat(201) }));
  });

  it('rejects calculated fields and oversized names in child documents', async () => {
    const scenarioRef = childRef(
      'owner',
      `users/owner/mortgages/mortgage-1/scenarios/${generation}__${scenario.id}`,
    );
    await assertFails(scenarioRef.set({ ...scenario, totalInterest: 78891.58 }));
    await assertFails(scenarioRef.set({ ...scenario, name: 'x'.repeat(201) }));
  });

  it('rejects child documents outside the active mortgage generation', async () => {
    await assertSucceeds(mortgageRef('owner').set(mortgage));
    const orphan = childRef(
      'owner',
      `users/owner/mortgages/${mortgage.id}/scenarios/generation-2__scenario-2`,
    );
    await assertFails(orphan.set({ ...scenario, id: 'scenario-2', generation: 'generation-2' }));
  });

  it('recomposes, atomically replaces, and deletes mortgage generations', async () => {
    const uid = 'repository-owner';
    const database = modularDatabase(uid);
    const repository = new FirebaseMortgageRepository(database);
    const mortgage = validMortgage();

    await repository.saveIfNewer(uid, mortgage);
    expect(await repository.get(uid, mortgage.id)).toEqual(mortgage);

    const originalRoot = await getDoc(doc(database, `users/${uid}/mortgages/${mortgage.id}`));
    const originalGeneration = originalRoot.data()?.['generation'];
    const updated = {
      ...mortgage,
      name: 'Oferta actualizada',
      updatedAt: '2026-01-02T10:00:00.000Z',
    };
    await repository.save(uid, updated);
    expect(await repository.list(uid)).toEqual([updated]);

    const root = await getDoc(doc(database, `users/${uid}/mortgages/${mortgage.id}`));
    expect(root.data()?.['generation']).not.toBe(originalGeneration);
    expect(root.data()).not.toHaveProperty('scenarios');
    expect(root.data()).not.toHaveProperty('totalInterest');
    expect(
      (await getDocs(collection(database, `users/${uid}/mortgages/${mortgage.id}/scenarios`))).size,
    ).toBe(1);

    await repository.delete(uid, mortgage.id);
    expect(await repository.get(uid, mortgage.id)).toBeNull();
    expect(
      (await getDocs(collection(database, `users/${uid}/mortgages/${mortgage.id}/scenarios`))).size,
    ).toBe(0);
  }, 30000);

  it('does not let concurrent generation cleanup remove the active version', async () => {
    const uid = 'repository-concurrent';
    const database = modularDatabase(uid);
    const repository = new FirebaseMortgageRepository(database);
    const first = validMortgage('concurrent-mortgage');
    const second = {
      ...first,
      name: 'Segunda escritura',
      updatedAt: '2026-01-02T10:00:00.000Z',
    };

    await Promise.all([repository.save(uid, first), repository.save(uid, second)]);

    const root = await getDoc(doc(database, `users/${uid}/mortgages/${first.id}`));
    const activeGeneration = root.data()?.['generation'];
    const activeScenarios = await getDocs(
      query(
        collection(database, `users/${uid}/mortgages/${first.id}/scenarios`),
        where('generation', '==', activeGeneration),
      ),
    );
    expect(activeScenarios.size).toBe(1);
    expect(await repository.get(uid, first.id)).toMatchObject({
      name: expect.stringMatching(/Oferta de repositorio|Segunda escritura/),
    });
  }, 30000);

  it('applies updatedAt conflicts atomically to account writes and tombstones', async () => {
    const uid = 'repository-conflicts';
    const repository = new FirebaseMortgageRepository(modularDatabase(uid));
    const newer = {
      ...validMortgage('conflict-mortgage'),
      updatedAt: '2026-01-03T10:00:00.000Z',
    };
    const older = {
      ...newer,
      name: 'Versión antigua',
      updatedAt: '2026-01-02T10:00:00.000Z',
    };

    await expect(repository.saveIfNewer(uid, newer)).resolves.toBe(true);
    await expect(repository.saveIfNewer(uid, older)).resolves.toBe(false);
    expect(await repository.get(uid, newer.id)).toMatchObject({ name: newer.name });
    await expect(repository.deleteIfOlder(uid, newer.id, '2026-01-02T10:00:00.000Z')).resolves.toBe(
      false,
    );
    await expect(repository.deleteIfOlder(uid, newer.id, '2026-01-04T10:00:00.000Z')).resolves.toBe(
      true,
    );
    expect(await repository.get(uid, newer.id)).toBeNull();
  }, 30000);

  it('delivers an atomic generation update between two clients', async () => {
    const uid = 'two-client-owner';
    const writer = new FirebaseMortgageRepository(modularDatabase(uid));
    const readerDatabase = environment.authenticatedContext(uid).firestore()._delegate;
    const reader = new FirebaseMortgageRepository(readerDatabase);
    const initial = validMortgage('shared-mortgage');
    await writer.save(uid, initial);

    let resolveUpdate!: (mortgages: Mortgage[]) => void;
    let rejectUpdate!: (error: unknown) => void;
    const updateReceived = new Promise<Mortgage[]>((resolve, reject) => {
      resolveUpdate = resolve;
      rejectUpdate = reject;
    });
    const stop = reader.watch(
      uid,
      (mortgages) => {
        if (mortgages[0]?.name === 'Oferta actualizada desde otro cliente') {
          resolveUpdate(mortgages);
        }
      },
      rejectUpdate,
    );
    try {
      await writer.save(uid, {
        ...initial,
        name: 'Oferta actualizada desde otro cliente',
        updatedAt: '2026-01-02T10:00:00.000Z',
      });
      await expect(updateReceived).resolves.toMatchObject([
        { name: 'Oferta actualizada desde otro cliente' },
      ]);
    } finally {
      stop();
    }
  }, 30000);

  it('writes the configured maximum as one atomic batch and rejects values above it', async () => {
    const uid = 'repository-limits';
    const repository = new FirebaseMortgageRepository(modularDatabase(uid));
    const mortgage = validMortgage('maximum-mortgage');
    mortgage.scenarios = Array.from({ length: 8 }, (_, scenarioIndex) => ({
      id: `scenario-${scenarioIndex}`,
      name: `Scenario ${scenarioIndex}`,
      mode: 'reduceInstallment' as const,
      bonuses: Array.from({ length: 16 }, (_, index) => ({
        id: `bonus-${scenarioIndex}-${index}`,
        name: `Bonus ${index}`,
        active: true,
        interestReduction: 0.1,
        annualCost: 1,
      })),
      amortizations: Array.from({ length: 32 }, (_, index) => ({
        id: `amortization-${scenarioIndex}-${index}`,
        name: `Extra ${index}`,
        active: true,
        type: 'single' as const,
        reductionType: 'term' as const,
        amount: 100,
        month: index + 1,
      })),
    }));
    mortgage.cancellationFees = {
      partial: Array.from({ length: 20 }, (_, index) => ({
        fromMonth: index + 1,
        toMonth: index + 1,
        percent: 0.5,
      })),
      total: Array.from({ length: 20 }, (_, index) => ({
        fromMonth: index + 1,
        toMonth: index + 1,
        percent: 0.5,
      })),
    };

    await repository.saveIfNewer(uid, mortgage);
    expect((await repository.get(uid, mortgage.id))?.scenarios).toHaveLength(8);
    await expect(
      repository.save(uid, {
        ...mortgage,
        scenarios: [...mortgage.scenarios, mortgage.scenarios[0]],
      }),
    ).rejects.toThrow('como máximo 8 escenarios');
  }, 60000);

  it('rejects malformed indexed child records when recomposing an offer', async () => {
    const uid = 'repository-malformed';
    const database = modularDatabase(uid);
    const repository = new FirebaseMortgageRepository(database);
    const mortgage = validMortgage('malformed-mortgage');
    mortgage.scenarios.push({
      ...mortgage.scenarios[0],
      id: 'scenario-2',
      name: 'Alternativo',
    });
    await repository.save(uid, mortgage);

    const root = await getDoc(doc(database, `users/${uid}/mortgages/${mortgage.id}`));
    const activeGeneration = root.data()?.['generation'];
    const secondScenarioId = `${activeGeneration}__scenario-2`;
    await environment
      .authenticatedContext(uid)
      .firestore()
      .doc(`users/${uid}/mortgages/${mortgage.id}/scenarios/${secondScenarioId}`)
      .update({ index: 0 });

    await expect(repository.get(uid, mortgage.id)).rejects.toThrow('Orden Firestore inválido');
  }, 30000);
});
