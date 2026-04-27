/**
 * src/lib/firebase/admin.ts
 *
 * Shared Firebase Admin SDK singleton for all server-side API routes.
 *
 * Init priority:
 *   1. FIREBASE_SERVICE_ACCOUNT_KEY (JSON string) — used by refresh/promote-hits routes
 *   2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY — used by v2.2 routes
 *   3. Application Default Credentials fallback (gcloud auth in dev)
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let _db: ReturnType<typeof getFirestore> | null = null;

export function getAdminDb(): ReturnType<typeof getFirestore> {
  if (_db) return _db;

  if (!getApps().length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      // Pattern 1: JSON service account key (used by refresh + promote-hits)
      try {
        initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
      } catch (e) {
        throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${e}`);
      }
    } else {
      // Pattern 2: individual env vars (used by v2.2 backtest routes)
      const projectId   = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!projectId) {
        throw new Error('Firebase Admin: neither FIREBASE_SERVICE_ACCOUNT_KEY nor FIREBASE_PROJECT_ID is set.');
      }

      if (clientEmail && privateKey) {
        initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
          projectId,
        });
      } else {
        // Dev fallback: Application Default Credentials
        initializeApp({ projectId });
      }
    }
  }

  _db = getFirestore();
  return _db;
}

/**
 * Resolve ownerUid: query param → SWEET404_OWNER_UID env → error.
 */
export function resolveOwnerUid(fromQuery: string | null | undefined): string {
  const uid = (fromQuery || '').trim() || (process.env.SWEET404_OWNER_UID || '').trim();
  if (!uid) throw new Error('ownerUid is required. Pass ?ownerUid= or set SWEET404_OWNER_UID in env.');
  return uid;
}
