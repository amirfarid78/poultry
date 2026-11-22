// React hook subscribing to the process-wide sync engine (src/lib/sync.ts).
// The engine is started once, on the first call, with the provided client.
// Reuses the shared Supabase singleton when no client is passed.
//
// Degraded mode: if the engine fails to start (startSyncEngine throws, so
// getSyncEngine() stays null), this used to throw and render a crash screen.
// It now returns a static degraded SyncStatus instead — the app stays usable
// with data on this device only. The hook is never called in that path, so
// there is no conditional-hook hazard in practice: the engine is started
// exactly once (module-level `started`), and a failed start is never
// retried, so a component that renders the fallback keeps rendering it.
import { useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startSyncEngine, getSyncEngine, type SyncStatus } from '../lib/sync';
import { supabase } from '../lib/supabase';

let started = false;

/** Static degraded status: online state known, nothing syncing, engine down. */
const DEGRADED_STATUS: SyncStatus = {
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  isSyncing: false,
  pendingCount: 0,
  deadCount: 0,
  deadError: null,
  lastSyncAt: null,
  lastError: 'Sync engine failed to start — data stays on this device',
};

export function useSyncStatus(client?: SupabaseClient): SyncStatus {
  if (!started) {
    try {
      startSyncEngine(client ?? supabase);
    } catch {
      // Engine failed to start — fall through to the degraded status below
      // instead of crashing the app.
    }
    started = true;
  }
  const engine = getSyncEngine();
  if (!engine) {
    return DEGRADED_STATUS;
  }
  return useSyncExternalStore(
    (onStoreChange) => engine.subscribe(onStoreChange),
    () => engine.getStatus(),
    () => engine.getStatus()
  );
}

export { getSyncEngine };
