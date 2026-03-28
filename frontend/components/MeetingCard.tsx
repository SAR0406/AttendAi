import type { Meeting } from '@/app/dashboard/page';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDuration, formatDateTime } from '@/lib/utils';

export function MeetingCard({ meeting }: { meeting: Meeting }) {
  const date = meeting.started_at ?? meeting.scheduled_at ?? meeting.created_at;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">
            {meeting.title ?? 'Untitled Meeting'}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{formatDateTime(date)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meeting.duration_secs !== null && meeting.duration_secs !== undefined && (
            <span className="text-xs text-gray-400">
              {formatDuration(meeting.duration_secs)}
            </span>
          )}
          <StatusBadge status={meeting.status} />
        </div>
      </div>
    </div>
  );
}
