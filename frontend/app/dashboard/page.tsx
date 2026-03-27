'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { MeetingCard } from '@/components/MeetingCard';
import { ScheduleMeetingModal } from '@/components/ScheduleMeetingModal';
import { MeetingCardSkeleton } from '@/components/ui/Skeleton';

export interface Meeting {
  id: string;
  title: string;
  status: string;
  zoom_join_url: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_secs: number | null;
  created_at: string;
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'joining', label: 'Joining' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export default function DashboardPage() {
  const { user } = useUser();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const orgId =
    (user?.organizationMemberships?.[0]?.organization?.id as string | undefined) ?? '';

  const fetchMeetings = useCallback(async () => {
    if (!orgId) return;
    setError(null);
    try {
      const params = new URLSearchParams({ orgId });
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/meetings?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json() as { meetings: Meeting[] };
      setMeetings(json.meetings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchMeetings();
    const interval = setInterval(() => void fetchMeetings(), 30_000);
    return () => clearInterval(interval);
  }, [fetchMeetings]);

  // Client-side filter + search
  const filtered = meetings.filter((m) => {
    const matchesSearch =
      !search || m.title?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Meetings</h1>
          <p className="text-gray-500 mt-1">AI-attended sessions, transcripts &amp; notes</p>
        </div>
        <button
          onClick={() => setShowSchedule(true)}
          className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 transition-colors text-sm"
        >
          + Schedule Meeting
        </button>
      </div>

      {/* Search + filter bar */}
      {!loading && !error && meetings.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              aria-label="Search meetings"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-4" aria-label="Loading meetings" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <MeetingCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-500 font-medium mb-3">{error}</p>
          <button
            onClick={() => { setLoading(true); void fetchMeetings(); }}
            className="text-sm text-brand-600 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {meetings.length === 0 ? (
            <>
              <p className="text-5xl mb-4" aria-hidden="true">🤖</p>
              <p className="font-medium">No meetings yet.</p>
              <p className="text-sm mt-1">
                Schedule one or drop in a recording URL to generate notes for free.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">No meetings match your filters.</p>
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); }}
                className="text-sm text-brand-600 hover:underline mt-2"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
              <MeetingCard meeting={m} />
            </Link>
          ))}
          <p className="text-xs text-gray-400 text-right pt-2">
            {filtered.length} of {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {showSchedule && (
        <ScheduleMeetingModal
          orgId={orgId}
          userId={user?.id ?? ''}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => {
            setShowSchedule(false);
            void fetchMeetings();
          }}
        />
      )}
    </div>
  );
}
