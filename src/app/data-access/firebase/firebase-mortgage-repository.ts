import { Inject, Injectable, InjectionToken } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { createId } from '../../domain/mortgage/mortgage-calculator';
import type { Mortgage, Scenario } from '../../domain/mortgage/mortgage.model';
import { initializeFirebaseApp } from '../../core/firebase/firebase-app';
import { validateMortgage } from '../../domain/mortgage/mortgage-validation';

const MAX_BATCH_WRITES = 450;
const MAX_SCENARIOS = 8;
const MAX_BONUSES_PER_SCENARIO = 16;
const MAX_AMORTIZATIONS_PER_SCENARIO = 32;
const MAX_FEE_TIERS_PER_TYPE = 20;

export const FIRESTORE_DATABASE = new InjectionToken<Firestore | null>('FIRESTORE_DATABASE', {
  providedIn: 'root',
  factory: () => {
    const app = initializeFirebaseApp();
    return app ? getFirestore(app) : null;
  },
});

interface WriteOperation {
  path: string;
  data?: DocumentData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(
  data: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  const keys = Object.keys(data);
  return (
    required.every((key) => key in data) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Registro Firestore inválido: ${label}.`);
  return value;
}

function requireId(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    value.includes('/')
  ) {
    throw new Error(`Identificador Firestore inválido: ${label}.`);
  }
  return value;
}

function requireText(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new Error(`Texto Firestore inválido: ${label}.`);
  }
  return value;
}

function requireIndex(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Índice Firestore inválido: ${label}.`);
  }
  return value as number;
}

function requireGeneration(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new Error('Generación Firestore inválida.');
  }
  return value;
}

function requireGeneratedId(
  document: QueryDocumentSnapshot<DocumentData>,
  generation: string,
  id: string,
): void {
  if (document.id !== `${generation}__${id}`) {
    throw new Error(`Identificador de documento Firestore incoherente: ${document.ref.path}.`);
  }
}

function sortByIndex<T>(
  documents: QueryDocumentSnapshot<DocumentData>[],
  parse: (document: QueryDocumentSnapshot<DocumentData>) => { index: number; value: T },
  label: string,
): T[] {
  const entries = documents.map(parse).sort((left, right) => left.index - right.index);
  if (entries.some((entry, index) => entry.index !== index)) {
    throw new Error(`Orden Firestore inválido: ${label}.`);
  }
  return entries.map((entry) => entry.value);
}

function generatedDocumentId(generation: string, id: string): string {
  return `${generation}__${id}`;
}

function mortgagePath(uid: string, mortgageId: string): string {
  return `users/${uid}/mortgages/${mortgageId}`;
}

function scenarioPath(
  uid: string,
  mortgageId: string,
  generation: string,
  scenarioId: string,
): string {
  return `${mortgagePath(uid, mortgageId)}/scenarios/${generatedDocumentId(generation, scenarioId)}`;
}

function createOperations(uid: string, mortgage: Mortgage, generation: string): WriteOperation[] {
  const root = mortgagePath(uid, mortgage.id);
  const operations: WriteOperation[] = [
    {
      path: root,
      data: {
        id: mortgage.id,
        name: mortgage.name,
        bank: mortgage.bank,
        amount: mortgage.amount,
        years: mortgage.years,
        interestRate: mortgage.interestRate,
        rateType: mortgage.rateType,
        ...(mortgage.startDate === undefined ? {} : { startDate: mortgage.startDate }),
        generation,
        updatedAt: mortgage.updatedAt,
      },
    },
  ];

  mortgage.scenarios.forEach((scenario, index) => {
    const scenarioDocumentPath = scenarioPath(uid, mortgage.id, generation, scenario.id);
    operations.push({
      path: scenarioDocumentPath,
      data: {
        id: scenario.id,
        generation,
        index,
        name: scenario.name,
        mode: scenario.mode,
        ...(scenario.monthlyBudget ? { monthlyBudget: scenario.monthlyBudget } : {}),
      },
    });
    scenario.bonuses.forEach((bonus, bonusIndex) => {
      operations.push({
        path: `${scenarioDocumentPath}/bonuses/${generatedDocumentId(generation, bonus.id)}`,
        data: {
          id: bonus.id,
          generation,
          index: bonusIndex,
          name: bonus.name,
          active: bonus.active,
          interestReduction: bonus.interestReduction,
          annualCost: bonus.annualCost,
          ...(bonus.startMonth === undefined ? {} : { startMonth: bonus.startMonth }),
          ...(bonus.endMonth === undefined ? {} : { endMonth: bonus.endMonth }),
        },
      });
    });
    scenario.amortizations.forEach((amortization, amortizationIndex) => {
      operations.push({
        path: `${scenarioDocumentPath}/amortizations/${generatedDocumentId(generation, amortization.id)}`,
        data: {
          id: amortization.id,
          generation,
          index: amortizationIndex,
          name: amortization.name,
          active: amortization.active,
          type: amortization.type,
          reductionType: amortization.reductionType,
          amount: amortization.amount,
          month: amortization.month,
          ...(amortization.frequencyMonths === undefined
            ? {}
            : { frequencyMonths: amortization.frequencyMonths }),
        },
      });
    });
  });

  for (const kind of ['partial', 'total'] as const) {
    mortgage.cancellationFees[kind].forEach((tier, index) => {
      operations.push({
        path: `${root}/cancellationFees/${generatedDocumentId(generation, `${kind}-${index}`)}`,
        data: {
          generation,
          kind,
          index,
          fromMonth: tier.fromMonth,
          ...(tier.toMonth === undefined ? {} : { toMonth: tier.toMonth }),
          percent: tier.percent,
        },
      });
    });
  }
  return operations;
}

@Injectable({ providedIn: 'root' })
export class FirebaseMortgageRepository {
  constructor(@Inject(FIRESTORE_DATABASE) private readonly firestore: Firestore | null) {}

  async list(uid: string): Promise<Mortgage[]> {
    const mortgages = await getDocs(
      collection(this.database(), 'users', this.userId(uid), 'mortgages'),
    );
    return Promise.all(mortgages.docs.map((mortgage) => this.readMortgage(uid, mortgage)));
  }

  async get(uid: string, mortgageId: string): Promise<Mortgage | null> {
    const id = requireId(mortgageId, 'oferta');
    const mortgages = await getDocs(
      query(
        collection(this.database(), 'users', this.userId(uid), 'mortgages'),
        where('id', '==', id),
      ),
    );
    if (mortgages.empty) return null;
    if (mortgages.size !== 1) throw new Error(`Identificador de oferta duplicado: ${id}.`);
    return this.readMortgage(uid, mortgages.docs[0]);
  }

  async save(uid: string, mortgage: Mortgage): Promise<void> {
    const userId = this.userId(uid);
    const candidate = this.validateCandidate(mortgage);
    const generation = createId();
    const operations = createOperations(userId, candidate, generation);
    if (operations.length > MAX_BATCH_WRITES) {
      throw new Error(
        'La oferta supera el máximo de documentos admitido por una escritura atómica.',
      );
    }

    await this.commit(operations);
    await this.cleanupStaleGenerations(userId, candidate.id, generation);
  }

  async saveIfNewer(uid: string, mortgage: Mortgage): Promise<boolean> {
    const userId = this.userId(uid);
    const candidate = this.validateCandidate(mortgage);
    const generation = createId();
    const operations = createOperations(userId, candidate, generation);
    if (operations.length > MAX_BATCH_WRITES) {
      throw new Error(
        'La oferta supera el máximo de documentos admitido por una escritura atómica.',
      );
    }

    const database = this.database();
    const rootReference = doc(database, mortgagePath(userId, candidate.id));
    const saved = await runTransaction(database, async (transaction) => {
      const current = await transaction.get(rootReference);
      if (current.exists()) {
        const currentUpdatedAt = current.data()['updatedAt'];
        if (
          typeof currentUpdatedAt !== 'string' ||
          !Number.isFinite(Date.parse(currentUpdatedAt))
        ) {
          throw new Error('Fecha de actualización Firestore inválida.');
        }
        if (Date.parse(currentUpdatedAt) >= Date.parse(candidate.updatedAt)) return false;
      }
      for (const operation of operations) {
        if (!operation.data) throw new Error(`Documento Firestore sin datos: ${operation.path}.`);
        transaction.set(doc(database, operation.path), operation.data);
      }
      return true;
    });
    if (saved) await this.cleanupStaleGenerations(userId, candidate.id, generation);
    return saved;
  }

  async delete(uid: string, mortgageId: string): Promise<void> {
    const userId = this.userId(uid);
    const id = requireId(mortgageId, 'oferta');
    const rootPath = mortgagePath(userId, id);
    await this.deleteDocumentsIfRootStaysDeleted(userId, id, [
      { path: rootPath },
      ...(await this.staleDocuments(userId, id, null)),
    ]);
    await this.deleteDocumentsIfRootStaysDeleted(
      userId,
      id,
      await this.staleDocuments(userId, id, null),
      rootPath,
      false,
    );
  }

  async deleteIfOlder(uid: string, mortgageId: string, deletedAt: string): Promise<boolean> {
    const userId = this.userId(uid);
    const id = requireId(mortgageId, 'oferta');
    if (!Number.isFinite(Date.parse(deletedAt))) {
      throw new Error('Fecha de eliminación Firestore inválida.');
    }
    const database = this.database();
    const rootPath = mortgagePath(userId, id);
    const rootReference = doc(database, rootPath);
    const deleted = await runTransaction(database, async (transaction) => {
      const current = await transaction.get(rootReference);
      if (current.exists()) {
        const currentUpdatedAt = current.data()['updatedAt'];
        if (
          typeof currentUpdatedAt !== 'string' ||
          !Number.isFinite(Date.parse(currentUpdatedAt))
        ) {
          throw new Error('Fecha de actualización Firestore inválida.');
        }
        if (Date.parse(currentUpdatedAt) >= Date.parse(deletedAt)) return false;
      }
      if (current.exists()) transaction.delete(rootReference);
      return true;
    });
    if (deleted) {
      await this.deleteDocumentsIfRootStaysDeleted(
        userId,
        id,
        await this.staleDocuments(userId, id, null),
        rootPath,
        false,
      );
    }
    return deleted;
  }

  watch(
    uid: string,
    onMortgages: (mortgages: Mortgage[]) => void,
    onError: (error: unknown) => void,
  ): () => void {
    const userId = this.userId(uid);
    let revision = 0;
    return onSnapshot(
      collection(this.database(), 'users', userId, 'mortgages'),
      (snapshot) => {
        const currentRevision = ++revision;
        void Promise.all(snapshot.docs.map((mortgage) => this.readMortgage(userId, mortgage)))
          .then((mortgages) => {
            if (currentRevision === revision) onMortgages(mortgages);
          })
          .catch(onError);
      },
      onError,
    );
  }

  private database(): Firestore {
    if (!this.firestore)
      throw new Error('Firebase no está configurado; la sincronización no está disponible.');
    return this.firestore;
  }

  private userId(uid: string): string {
    return requireId(uid, 'usuario');
  }

  private validateCandidate(value: Mortgage): Mortgage {
    if (!isRecord(value)) throw new Error('Oferta Firestore inválida.');
    const mortgage = value as Mortgage;
    requireId(mortgage.id, 'oferta');
    if (
      typeof mortgage.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(mortgage.updatedAt))
    ) {
      throw new Error('Fecha de actualización Firestore inválida.');
    }
    requireText(mortgage.name, 'oferta.name');
    requireText(mortgage.bank, 'oferta.bank');
    if (mortgage.startDate !== undefined) requireText(mortgage.startDate, 'oferta.startDate', 32);
    if (!Array.isArray(mortgage.scenarios) || mortgage.scenarios.length > MAX_SCENARIOS) {
      throw new Error(`La oferta debe contener como máximo ${MAX_SCENARIOS} escenarios.`);
    }
    if (
      !mortgage.cancellationFees ||
      !Array.isArray(mortgage.cancellationFees.partial) ||
      !Array.isArray(mortgage.cancellationFees.total) ||
      mortgage.cancellationFees.partial.length > MAX_FEE_TIERS_PER_TYPE ||
      mortgage.cancellationFees.total.length > MAX_FEE_TIERS_PER_TYPE
    ) {
      throw new Error(`Cada tipo de comisión admite como máximo ${MAX_FEE_TIERS_PER_TYPE} tramos.`);
    }
    const scenarioIds = new Set<string>();
    for (const scenario of mortgage.scenarios) {
      if (!isRecord(scenario)) throw new Error('Escenario Firestore inválido.');
      requireId(scenario.id, 'escenario');
      if (scenarioIds.has(scenario.id))
        throw new Error('La oferta contiene escenarios duplicados.');
      scenarioIds.add(scenario.id);
      requireText(scenario.name, 'escenario.name');
      if (!Array.isArray(scenario.bonuses) || scenario.bonuses.length > MAX_BONUSES_PER_SCENARIO) {
        throw new Error(
          `Cada escenario admite como máximo ${MAX_BONUSES_PER_SCENARIO} bonificaciones.`,
        );
      }
      if (
        !Array.isArray(scenario.amortizations) ||
        scenario.amortizations.length > MAX_AMORTIZATIONS_PER_SCENARIO
      ) {
        throw new Error(
          `Cada escenario admite como máximo ${MAX_AMORTIZATIONS_PER_SCENARIO} amortizaciones.`,
        );
      }
      const bonusIds = new Set<string>();
      for (const bonus of scenario.bonuses) {
        if (!isRecord(bonus)) throw new Error('Bonificación Firestore inválida.');
        requireId(bonus.id, 'bonificación');
        requireText(bonus.name, 'bonificación.name');
        if (bonusIds.has(bonus.id))
          throw new Error('El escenario contiene bonificaciones duplicadas.');
        bonusIds.add(bonus.id);
      }
      const amortizationIds = new Set<string>();
      for (const amortization of scenario.amortizations) {
        if (!isRecord(amortization)) throw new Error('Amortización Firestore inválida.');
        requireId(amortization.id, 'amortización');
        requireText(amortization.name, 'amortización.name');
        if (amortizationIds.has(amortization.id)) {
          throw new Error('El escenario contiene amortizaciones duplicadas.');
        }
        amortizationIds.add(amortization.id);
      }
    }
    const error = validateMortgage(mortgage);
    if (error) throw new Error(`Oferta Firestore inválida: ${error}`);
    return mortgage;
  }

  private async readMortgage(
    uid: string,
    document: QueryDocumentSnapshot<DocumentData>,
  ): Promise<Mortgage> {
    const root = requireRecord(document.data(), document.ref.path);
    const required = [
      'id',
      'name',
      'bank',
      'amount',
      'years',
      'interestRate',
      'rateType',
      'generation',
      'updatedAt',
    ];
    if (!exactKeys(root, required, ['startDate']))
      throw new Error(`Esquema Firestore inválido: ${document.ref.path}.`);
    const id = requireId(root['id'], 'oferta');
    if (id !== document.id)
      throw new Error(`Identificador de oferta incoherente: ${document.ref.path}.`);
    const generation = requireGeneration(root['generation']);
    const rootPath = mortgagePath(uid, id);
    const database = this.database();
    const scenarioSnapshots = await getDocs(
      query(collection(database, rootPath, 'scenarios'), where('generation', '==', generation)),
    );
    const feeSnapshots = await getDocs(
      query(
        collection(database, rootPath, 'cancellationFees'),
        where('generation', '==', generation),
      ),
    );
    if (
      feeSnapshots.docs.some(
        (fee) => fee.data()['kind'] !== 'partial' && fee.data()['kind'] !== 'total',
      )
    ) {
      throw new Error(`Tipo de comisión Firestore inválido: ${id}.`);
    }
    const scenarioEntries = await Promise.all(
      scenarioSnapshots.docs.map((scenarioDocument) =>
        this.readScenario(scenarioDocument, generation),
      ),
    );
    scenarioEntries.sort((left, right) => left.index - right.index);
    if (scenarioEntries.some((entry, index) => entry.index !== index)) {
      throw new Error(`Orden Firestore inválido: escenarios de ${id}.`);
    }
    const scenarios = scenarioEntries.map((entry) => entry.value);
    const cancellationFees = {
      partial: [] as Mortgage['cancellationFees']['partial'],
      total: [] as Mortgage['cancellationFees']['total'],
    };
    for (const kind of ['partial', 'total'] as const) {
      cancellationFees[kind] = sortByIndex(
        feeSnapshots.docs.filter((fee) => fee.data()['kind'] === kind),
        (fee) => {
          const data = requireRecord(fee.data(), fee.ref.path);
          if (
            !exactKeys(
              data,
              ['generation', 'kind', 'index', 'fromMonth', 'percent'],
              ['toMonth'],
            ) ||
            data['generation'] !== generation ||
            data['kind'] !== kind
          ) {
            throw new Error(`Esquema de comisión Firestore inválido: ${fee.ref.path}.`);
          }
          const expectedId = generatedDocumentId(
            generation,
            `${kind}-${requireIndex(data['index'], fee.ref.path)}`,
          );
          if (fee.id !== expectedId)
            throw new Error(`Identificador de comisión incoherente: ${fee.ref.path}.`);
          return {
            index: requireIndex(data['index'], fee.ref.path),
            value: {
              fromMonth: requireIndex(data['fromMonth'], fee.ref.path),
              ...(data['toMonth'] === undefined
                ? {}
                : { toMonth: requireIndex(data['toMonth'], fee.ref.path) }),
              percent: data['percent'] as number,
            },
          };
        },
        `comisiones ${kind}`,
      );
    }
    const mortgage: Mortgage = {
      id,
      name: requireText(root['name'], 'oferta.name'),
      bank: requireText(root['bank'], 'oferta.bank'),
      amount: root['amount'] as number,
      years: root['years'] as number,
      interestRate: root['interestRate'] as number,
      rateType: root['rateType'] as Mortgage['rateType'],
      cancellationFees,
      ...(root['startDate'] === undefined
        ? {}
        : { startDate: requireText(root['startDate'], 'oferta.startDate', 32) }),
      scenarios,
      updatedAt: requireText(root['updatedAt'], 'oferta.updatedAt', 40),
    };
    return this.validateCandidate(mortgage);
  }

  private async readScenario(
    document: QueryDocumentSnapshot<DocumentData>,
    generation: string,
  ): Promise<{ index: number; value: Scenario }> {
    const data = requireRecord(document.data(), document.ref.path);
    if (
      !exactKeys(data, ['id', 'generation', 'index', 'name', 'mode'], ['monthlyBudget']) ||
      data['generation'] !== generation
    ) {
      throw new Error(`Esquema de escenario Firestore inválido: ${document.ref.path}.`);
    }
    const id = requireId(data['id'], 'escenario');
    requireGeneratedId(document, generation, id);
    const index = requireIndex(data['index'], document.ref.path);
    const bonusSnapshots = await getDocs(collection(document.ref, 'bonuses'));
    const amortizationSnapshots = await getDocs(collection(document.ref, 'amortizations'));
    const bonuses = sortByIndex(
      bonusSnapshots.docs,
      (bonus) => {
        const value = requireRecord(bonus.data(), bonus.ref.path);
        const fields = [
          'id',
          'generation',
          'index',
          'name',
          'active',
          'interestReduction',
          'annualCost',
        ];
        if (
          !exactKeys(value, fields, ['startMonth', 'endMonth']) ||
          value['generation'] !== generation
        ) {
          throw new Error(`Esquema de bonificación Firestore inválido: ${bonus.ref.path}.`);
        }
        const bonusId = requireId(value['id'], 'bonificación');
        requireGeneratedId(bonus, generation, bonusId);
        return {
          index: requireIndex(value['index'], bonus.ref.path),
          value: {
            id: bonusId,
            name: requireText(value['name'], 'bonificación.name'),
            active: value['active'] as boolean,
            interestReduction: value['interestReduction'] as number,
            annualCost: value['annualCost'] as number,
            ...(value['startMonth'] === undefined
              ? {}
              : { startMonth: value['startMonth'] as number }),
            ...(value['endMonth'] === undefined ? {} : { endMonth: value['endMonth'] as number }),
          },
        };
      },
      `bonificaciones de ${id}`,
    );
    const amortizations = sortByIndex(
      amortizationSnapshots.docs,
      (amortization) => {
        const value = requireRecord(amortization.data(), amortization.ref.path);
        const fields = [
          'id',
          'generation',
          'index',
          'name',
          'active',
          'type',
          'reductionType',
          'amount',
          'month',
        ];
        if (!exactKeys(value, fields, ['frequencyMonths']) || value['generation'] !== generation) {
          throw new Error(`Esquema de amortización Firestore inválido: ${amortization.ref.path}.`);
        }
        const amortizationId = requireId(value['id'], 'amortización');
        requireGeneratedId(amortization, generation, amortizationId);
        return {
          index: requireIndex(value['index'], amortization.ref.path),
          value: {
            id: amortizationId,
            name: requireText(value['name'], 'amortización.name'),
            active: value['active'] as boolean,
            type: value['type'] as 'single' | 'recurring',
            reductionType: value['reductionType'] as 'term' | 'payment',
            amount: value['amount'] as number,
            month: value['month'] as number,
            ...(value['frequencyMonths'] === undefined
              ? {}
              : { frequencyMonths: value['frequencyMonths'] as number }),
          },
        };
      },
      `amortizaciones de ${id}`,
    );
    const monthlyBudget = data['monthlyBudget'];
    if (
      monthlyBudget !== undefined &&
      (!isRecord(monthlyBudget) ||
        !exactKeys(monthlyBudget, ['amount', 'startMonth'], ['endMonth']))
    ) {
      throw new Error(`Presupuesto mensual Firestore inválido: ${document.ref.path}.`);
    }
    return {
      index,
      value: {
        id,
        name: requireText(data['name'], 'escenario.name'),
        mode: data['mode'] as Scenario['mode'],
        bonuses,
        amortizations,
        ...(monthlyBudget === undefined
          ? {}
          : {
              monthlyBudget: {
                amount: monthlyBudget['amount'] as number,
                startMonth: monthlyBudget['startMonth'] as number,
                ...(monthlyBudget['endMonth'] === undefined
                  ? {}
                  : { endMonth: monthlyBudget['endMonth'] as number }),
              },
            }),
      },
    };
  }

  private async staleDocuments(
    uid: string,
    mortgageId: string,
    activeGeneration: string | null,
  ): Promise<WriteOperation[]> {
    const database = this.database();
    const rootPath = mortgagePath(uid, mortgageId);
    const scenarios = await getDocs(collection(database, rootPath, 'scenarios'));
    const fees = await getDocs(collection(database, rootPath, 'cancellationFees'));
    const operations: WriteOperation[] = [];
    for (const fee of fees.docs) {
      if (activeGeneration === null || fee.data()['generation'] !== activeGeneration) {
        operations.push({ path: fee.ref.path });
      }
    }
    for (const scenario of scenarios.docs) {
      const children = await Promise.all([
        getDocs(collection(scenario.ref, 'bonuses')),
        getDocs(collection(scenario.ref, 'amortizations')),
      ]);
      for (const childCollection of children) {
        for (const child of childCollection.docs) {
          if (activeGeneration === null || child.data()['generation'] !== activeGeneration) {
            operations.push({ path: child.ref.path });
          }
        }
      }
      if (activeGeneration === null || scenario.data()['generation'] !== activeGeneration) {
        operations.push({ path: scenario.ref.path });
      }
    }
    return operations;
  }

  private async cleanupStaleGenerations(
    uid: string,
    mortgageId: string,
    activeGeneration: string,
  ): Promise<void> {
    const database = this.database();
    const operations = await this.staleDocuments(uid, mortgageId, activeGeneration);
    const rootReference = doc(database, mortgagePath(uid, mortgageId));
    for (let offset = 0; offset < operations.length; offset += MAX_BATCH_WRITES) {
      const batch = operations.slice(offset, offset + MAX_BATCH_WRITES);
      await runTransaction(database, async (transaction) => {
        const root = await transaction.get(rootReference);
        if (!root.exists() || root.data()['generation'] !== activeGeneration) return;
        for (const operation of batch) transaction.delete(doc(database, operation.path));
      });
    }
  }

  private async deleteDocumentsIfRootStaysDeleted(
    uid: string,
    mortgageId: string,
    operations: WriteOperation[],
    rootPath = mortgagePath(uid, mortgageId),
    deleteRoot = true,
  ): Promise<void> {
    const database = this.database();
    const rootReference = doc(database, rootPath);
    for (let offset = 0; offset < operations.length; offset += MAX_BATCH_WRITES) {
      const batch = operations.slice(offset, offset + MAX_BATCH_WRITES);
      await runTransaction(database, async (transaction) => {
        const root = await transaction.get(rootReference);
        if (root.exists()) {
          if (!deleteRoot || offset !== 0) return;
          transaction.delete(rootReference);
        }
        for (const operation of batch) {
          if (operation.path !== rootPath) transaction.delete(doc(database, operation.path));
        }
      });
    }
  }

  private async commit(operations: WriteOperation[]): Promise<void> {
    const database = this.database();
    for (let offset = 0; offset < operations.length; offset += MAX_BATCH_WRITES) {
      const batch = writeBatch(database);
      for (const operation of operations.slice(offset, offset + MAX_BATCH_WRITES)) {
        const reference = doc(database, operation.path);
        if (operation.data === undefined) batch.delete(reference);
        else batch.set(reference, operation.data);
      }
      await batch.commit();
    }
  }
}
