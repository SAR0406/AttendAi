'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';

interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
  is_final: boolean;
}

interface MeetingNotes {
  summary: string;
  action_items: string[];
  decisions: string[];
  key_points: string[];
  questions: string[];
}

interface Screenshot {
  id: string;
  public_url: string;
  url: string;
  captured_at: number;
}

interface Meeting {
  id: string;
  title: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_secs: number | null;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-yellow-100 text-yellow-800',
  joining: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-green-100 text-green-800',
  processing: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-700',
  failed: 'bg-red-100 text-red-800',
};

function formatSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function MeetingDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [notes, setNotes] = useState<MeetingNotes | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [activeTab, setActiveTab] = useState<'transcript' | 'notes' | 'screenshots'>('transcript');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch initial data
  useEffect(() => {
    void fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${id}`)
      .then((r) => r.json())
      .then((data: { meeting: Meeting; notes: MeetingNotes; transcript: TranscriptSegment[]; screenshots: Screenshot[] }) => {
        setMeeting(data.meeting);
        setNotes(data.notes);
        setSegments(data.transcript ?? []);
        setScreenshots(data.screenshots ?? []);
      });
  }, [id]);

  // Real-time transcript via Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`meeting:${id}:transcript`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcript_segments',
          filter: `meeting_id=eq.${id}`,
        },
        (payload) => {
          const seg = payload.new as TranscriptSegment;
          setSegments((prev) => {
            // Replace partial with final if same timeframe
            if (seg.is_final) {
              return [...prev.filter((s) => s.id !== seg.id), seg].sort(
                (a, b) => a.start_time - b.start_time,
              );
            }
            return [...prev, seg];
          });
          // Auto-scroll to bottom
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  if (!meeting) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Loading meeting…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{meeting.title ?? 'Meeting'}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                STATUS_COLORS[meeting.status] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {meeting.status.replace('_', ' ')}
            </span>
            {meeting.duration_secs && (
              <span className="text-sm text-gray-500">
                Duration: {formatSecs(meeting.duration_secs)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {(['transcript', 'notes', 'screenshots'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
            {tab === 'transcript' && segments.length > 0 && (
              <span className="ml-1 text-xs text-gray-400">({segments.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'transcript' && (
        <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
          {segments.length === 0 ? (
            <p className="text-gray-400 text-center py-10">
              {meeting.status === 'in_progress'
                ? 'Waiting for first transcript segments…'
                : 'No transcript available.'}
            </p>
          ) : (
            segments.map((s) => (
              <div
                key={s.id}
                className={`flex gap-3 py-1.5 ${!s.is_final ? 'opacity-60 italic' : ''}`}
              >
                <span className="text-xs text-gray-400 w-12 shrink-0 pt-0.5">
                  {formatSecs(s.start_time)}
                </span>
                <span className="text-xs font-semibold text-brand-600 w-24 shrink-0 truncate">
                  {s.speaker}
                </span>
                <span className="text-sm text-gray-800">{s.text}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="space-y-6">
          {!notes ? (
            <p className="text-gray-400 text-center py-10">
              Notes will be generated after the meeting ends.
            </p>
          ) : (
            <>
              {notes.summary && (
                <section>
                  <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{notes.summary}</p>
                </section>
              )}
              {[
                { key: 'action_items', label: '✅ Action Items' },
                { key: 'decisions', label: '🔒 Decisions' },
                { key: 'key_points', label: '💡 Key Points' },
                { key: 'questions', label: '❓ Open Questions' },
              ].map(({ key, label }) => {
                const items = notes[key as keyof MeetingNotes] as string[];
                if (!items?.length) return null;
                return (
                  <section key={key}>
                    <h3 className="font-semibold text-gray-900 mb-2">{label}</h3>
                    <ul className="space-y-1">
                      {items.map((item, i) => (
                        <li key={i} className="text-sm text-gray-700 flex gap-2">
                          <span className="text-gray-400 shrink-0">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </div>
      )}

      {activeTab === 'screenshots' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {screenshots.length === 0 ? (
            <p className="col-span-3 text-gray-400 text-center py-10">
              No screenshots captured yet.
            </p>
          ) : (
            screenshots.map((s) => (
              <div
                key={s.id}
                className="rounded-xl overflow-hidden border border-gray-200 shadow-sm"
              >
                <Image
                  src={s.url ?? s.public_url}
                  alt={`Screenshot at ${formatSecs(s.captured_at)}`}
                  width={400}
                  height={225}
                  className="w-full object-cover"
                />
                <p className="text-xs text-gray-500 p-2">{formatSecs(s.captured_at)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
