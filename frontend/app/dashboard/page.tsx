'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { Plus, Search, RefreshCw } from 'lucide-react';
import { MeetingCard } from '@/components/MeetingCard';
import { ScheduleMeetingModal } from '@/components/ScheduleMeetingModal';
import { Skeleton } from '@/components/ui/Skeleton';
import { MEETING_STATUSES } from '@/lib/constants';

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

function MeetingCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

const DEFAULT_ORG_NAME = 'Personal';

export default function DashboardPage() {
  const { user } = useUser();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const orgId =
    (user?.organizationMemberships?.[0]?.organization?.id as string | undefined) ??
    user?.id ??
    '';
  const orgName = user?.organizationMemberships?.[0]?.organization?.name ?? DEFAULT_ORG_NAME;
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? '';
  const userName = user?.fullName ?? user?.username;

  const syncIdentity = useCallback(async () => {
    if (!orgId || !user?.id) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          orgName: orgName || undefined,
          userId: user.id,
          userEmail: userEmail || undefined,
          userName: userName || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        console.warn('[identity] Sync failed', body.error ?? res.statusText);
      }
    } catch (err) {
      console.warn('[identity] Sync failed', err);
    }
  }, [orgId, orgName, user?.id, userEmail, userName]);

  async function fetchMeetings(isManual = false) {
    if (!orgId) return;
    if (isManual) setRefreshing(true);

    try {
      await syncIdentity();
      const params = new URLSearchParams({ orgId });
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/meetings?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`Failed to load meetings (${res.status})`);
      const json = (await res.json()) as { meetings: Meeting[] };
      setMeetings(json.meetings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void fetchMeetings();
    const interval = setInterval(() => void fetchMeetings(), 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const matchesSearch =
        !search || (m.title ?? '').toLowerCase().includes(search.toLowerCase());
      const matchesStatus = !statusFilter || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [meetings, search, statusFilter]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI-attended sessions, transcripts & smart notes
          </p>
        </div>
        <button
          onClick={() => setShowSchedule(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2.5 transition-colors text-sm"
        >
          <Plus size={16} />
          New Meeting
        </button>
      </div>

      {/* Search & filter bar */}
      {!loading && meetings.length > 0 && (
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-700"
          >
            <option value="">All statuses</option>
            {MEETING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button
            onClick={() => void fetchMeetings(true)}
            disabled={refreshing}
            title="Refresh"
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-gray-500 disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <MeetingCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-500 font-medium">{error}</p>
          <button
            onClick={() => void fetchMeetings()}
            className="mt-4 text-sm text-brand-600 hover:text-brand-700 underline"
          >
            Try again
          </button>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="text-center py-20">
          {meetings.length === 0 ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4 text-3xl">
                🤖
              </div>
              <p className="font-semibold text-gray-700">No meetings yet</p>
              <p className="text-sm text-gray-400 mt-1 mb-6 max-w-sm mx-auto">
                Schedule a meeting or drop in a recording URL to generate smart notes for
                free.
              </p>
              <button
                onClick={() => setShowSchedule(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 transition-colors text-sm"
              >
                <Plus size={16} />
                Schedule your first meeting
              </button>
            </>
          ) : (
            <p className="text-gray-400">No meetings match your search.</p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3 animate-fade-in">
            {filteredMeetings.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`}>
                <MeetingCard meeting={m} />
              </Link>
            ))}
          </div>
          {(search || statusFilter) && (
            <p className="text-xs text-gray-400 text-center mt-6">
              Showing {filteredMeetings.length} of {meetings.length} meetings
            </p>
          )}
        </>
      )}

      {showSchedule && (
        <ScheduleMeetingModal
          orgId={orgId}
          orgName={orgName}
          userId={user?.id ?? ''}
          userEmail={userEmail}
          userName={userName}
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
