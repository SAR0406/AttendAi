export const STATUS_COLORS: Record<string, string> = {
  scheduled:   'bg-yellow-100 text-yellow-800',
  joining:     'bg-blue-100 text-blue-800',
  in_progress: 'bg-green-100 text-green-800',
  processing:  'bg-purple-100 text-purple-800',
  completed:   'bg-gray-100 text-gray-700',
  failed:      'bg-red-100 text-red-800',
};

/** Replace all underscores with spaces and title-case the result. */
export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTimestamp(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
