// Compact sync status badge for the navbar (src/components/common/SyncBadge.tsx).
// Shows: colored dot + Online/Offline (bilingual), pending write count when > 0
// (bilingual "N pending"), failed (quarantined) count when > 0 as a tappable
// red pill that retries them, and a sync-now button (RefreshCw, spins while
// syncing). The failed pill's tooltip carries the underlying error.
import { RefreshCw } from 'lucide-react';
import { useSyncStatus, getSyncEngine } from '../../hooks/useSyncStatus';

interface SyncBadgeProps {
  language: 'en' | 'ur';
}

export default function SyncBadge({ language }: SyncBadgeProps) {
  const status = useSyncStatus();
  const ur = language === 'ur';

  const dot = !status.isOnline
    ? 'bg-red-500'
    : status.isSyncing
      ? 'bg-amber-400 animate-pulse'
      : 'bg-emerald-500';

  const onlineLabel = status.isOnline ? (ur ? 'آن لائن' : 'Online') : ur ? 'آف لائن' : 'Offline';
  const pendingLabel = ur ? `${status.pendingCount} زیر التواء` : `${status.pendingCount} pending`;
  const deadLabel = ur ? `${status.deadCount} ناکام` : `${status.deadCount} failed`;
  const syncTitle = ur ? 'ابھی سنک کریں' : 'Sync now';
  const retryTitle = status.deadError
    ? ur
      ? `خرابی: ${status.deadError} — دوبارہ کوشش کے لیے دبائیں`
      : `Failed: ${status.deadError} — tap to retry`
    : ur
      ? 'ناکام تبدیلیاں دوبارہ بھیجیں'
      : 'Retry failed changes';

  const handleSync = () => {
    const engine = getSyncEngine();
    if (engine) void engine.syncNow();
  };

  const handleRetryFailed = () => {
    const engine = getSyncEngine();
    if (engine) void engine.retryFailed();
  };

  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      <span>{onlineLabel}</span>
      {status.pendingCount > 0 && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
          {pendingLabel}
        </span>
      )}
      {status.deadCount > 0 && (
        <button
          type="button"
          onClick={handleRetryFailed}
          disabled={status.isSyncing}
          title={retryTitle}
          aria-label={retryTitle}
          className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-800 transition hover:bg-red-200 disabled:opacity-60"
        >
          {deadLabel}
        </button>
      )}
      <button
        type="button"
        onClick={handleSync}
        disabled={status.isSyncing}
        title={syncTitle}
        aria-label={syncTitle}
        className="flex items-center justify-center rounded-full p-0.5 text-slate-500 transition hover:text-slate-800 disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${status.isSyncing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
