import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { NavEvent, Session, Step } from './types';

interface SierraDB extends DBSchema {
  sessions: { key: string; value: Session };
  steps: {
    key: string;
    value: Step;
    indexes: { 'by-session': string };
  };
  navs: {
    key: string;
    value: NavEvent;
    indexes: { 'by-session': string };
  };
}

let dbPromise: Promise<IDBPDatabase<SierraDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SierraDB>('sierra', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('sessions', { keyPath: 'id' });
          const steps = db.createObjectStore('steps', { keyPath: 'id' });
          steps.createIndex('by-session', 'sessionId');
        }
        if (oldVersion < 2) {
          const navs = db.createObjectStore('navs', { keyPath: 'id' });
          navs.createIndex('by-session', 'sessionId');
        }
      },
    });
  }
  return dbPromise;
}

export async function createSession(title: string): Promise<Session> {
  const db = await getDB();
  const session: Session = {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put('sessions', session);
  return session;
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAll('sessions');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSession(id: string) {
  return (await getDB()).get('sessions', id);
}

export async function updateSession(s: Session) {
  const db = await getDB();
  await db.put('sessions', { ...s, updatedAt: Date.now() });
}

export async function deleteSession(id: string) {
  const db = await getDB();
  const tx = db.transaction(['sessions', 'steps', 'navs'], 'readwrite');
  await tx.objectStore('sessions').delete(id);
  const stepIdx = tx.objectStore('steps').index('by-session');
  for await (const cursor of stepIdx.iterate(id)) await cursor.delete();
  const navIdx = tx.objectStore('navs').index('by-session');
  for await (const cursor of navIdx.iterate(id)) await cursor.delete();
  await tx.done;
}

export async function addStep(step: Step) {
  const db = await getDB();
  await db.put('steps', step);
  const s = await db.get('sessions', step.sessionId);
  if (s) await db.put('sessions', { ...s, updatedAt: Date.now() });
}

export async function listSteps(sessionId: string): Promise<Step[]> {
  const db = await getDB();
  const steps = await db.getAllFromIndex('steps', 'by-session', sessionId);
  return steps.sort((a, b) => a.order - b.order);
}

export async function countSteps(sessionId: string): Promise<number> {
  const db = await getDB();
  const keys = await db.getAllKeysFromIndex('steps', 'by-session', sessionId);
  return keys.length;
}

export async function updateStep(step: Step) {
  const db = await getDB();
  await db.put('steps', step);
}

export async function deleteStep(id: string) {
  const db = await getDB();
  await db.delete('steps', id);
}

export async function reorderSteps(sessionId: string, orderedIds: string[]) {
  const db = await getDB();
  const tx = db.transaction('steps', 'readwrite');
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (!id) continue;
    const s = await tx.store.get(id);
    if (s && s.sessionId === sessionId) await tx.store.put({ ...s, order: i });
  }
  await tx.done;
}

export async function addNav(nav: NavEvent) {
  const db = await getDB();
  await db.put('navs', nav);
}

export async function listNavs(sessionId: string): Promise<NavEvent[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('navs', 'by-session', sessionId);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function lastNavUrl(sessionId: string): Promise<string | null> {
  const all = await listNavs(sessionId);
  return all.length ? all[all.length - 1]!.url : null;
}
