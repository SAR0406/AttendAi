import type { Meeting } from '@/app/dashboard/page';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-yellow-100 text-yellow-800',
  joining: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-green-100 text-green-800',
  processing: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-700',
  failed: 'bg-red-100 text-red-800',
};

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function MeetingCard({ meeting }: { meeting: Meeting }) {
  const date = meeting.started_at ?? meeting.scheduled_at ?? meeting.created_at;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">
            {meeting.title ?? 'Untitled Meeting'}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(date).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meeting.duration_secs && (
            <span className="text-xs text-gray-400">
              {formatDuration(meeting.duration_secs)}
            </span>
          )}
          <span
            className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
              STATUS_COLORS[meeting.status] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {meeting.status.replace('_', ' ')}
          </span>
        </div>
      </div>
    </div>
  );
}
