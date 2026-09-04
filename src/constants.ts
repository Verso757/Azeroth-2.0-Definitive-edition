import { auth } from './firebase';
import { OperationType, FirestoreErrorInfo } from './types';

export const AREAS = [
  { id: 'prod', name: 'Producción', color: '#3b82f6' }, // Blue
  { id: 'log', name: 'Logística', color: '#60a5fa' },
  { id: 'rrhh', name: 'RRHH', color: '#93c5fd' },
  { id: 'maint', name: 'Mantenimiento', color: '#2563eb' },
  { id: 'admin', name: 'Administración', color: '#1d4ed8' },
];

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
