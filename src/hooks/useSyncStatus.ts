// React hook subscribing to the process-wide sync engine (src/lib/sync.ts).
// The engine is started once, on the first call, with the provided client.
// Reuses the shared Supabase singleton when no client is passed.
import { useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startSyncEngine, getSyncEngine, type SyncStatus } from '../lib/sync';
import { supabase } from '../lib/supabase';

let started = false;

export function useSyncStatus(client?: SupabaseClient): SyncStatus {
  if (!started) {
    startSyncEngine(client ?? supabase);
    started = true;
  }
  const engine = getSyncEngine();
  if (!engine) {
    throw new Error('useSyncStatus: sync engine failed to start');
  }
  return useSyncExternalStore(
    (onStoreChange) => engine.subscribe(onStoreChange),
    () => engine.getStatus(),
    () => engine.getStatus()
  );
}

export { getSyncEngine };
