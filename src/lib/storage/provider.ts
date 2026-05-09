import { firebaseStorageAdapter } from '@/lib/storage/firebase';
import { postgresStorageAdapter } from '@/lib/storage/postgres';
import type { DreamDbProvider, Sweet404StorageAdapter } from '@/lib/storage/types';

export function getDreamDbProvider(): DreamDbProvider {
  const provider = process.env.DREAM_DB_PROVIDER ?? 'firebase';

  if (provider === 'postgres') return 'postgres';
  return 'firebase';
}

export function getStorageAdapter(): Sweet404StorageAdapter {
  return getDreamDbProvider() === 'postgres'
    ? postgresStorageAdapter
    : firebaseStorageAdapter;
}
