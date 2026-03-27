'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { MeetingCard } from '@/components/MeetingCard';
import { ScheduleMeetingModal } from '@/components/ScheduleMeetingModal';

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

export default function DashboardPage() {
  const { user } = useUser();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);

  const orgId =
    (user?.organizationMemberships?.[0]?.organization?.id as string | undefined) ?? '';

  async function fetchMeetings() {
    if (!orgId) return;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/meetings?orgId=${orgId}`,
    );
    if (res.ok) {
      const json = await res.json() as { meetings: Meeting[] };
      setMeetings(json.meetings);
    }
    setLoading(false);
  }

  useEffect(() => {
    void fetchMeetings();
    // Refresh every 30s to pick up status changes
    const interval = setInterval(() => void fetchMeetings(), 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Meetings</h1>
          <p className="text-gray-500 mt-1">AI-attended sessions, transcripts & notes</p>
        </div>
        <button
          onClick={() => setShowSchedule(true)}
          className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 transition-colors text-sm"
        >
          + Schedule Meeting
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading meetings…</div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">🤖</p>
          <p className="font-medium">No meetings yet.</p>
          <p className="text-sm mt-1">
            Schedule one and AttendAi will join in your place.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {meetings.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
              <MeetingCard meeting={m} />
            </Link>
          ))}
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
