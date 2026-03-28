'use client';

import { use, useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Copy, Check, Download } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { formatSecs, formatDateTime, formatDuration } from '@/lib/utils';

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

type Tab = 'transcript' | 'notes' | 'screenshots';

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [notes, setNotes] = useState<MeetingNotes | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('transcript');
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch initial data
  useEffect(() => {
    void fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${id}`)
      .then((r) => r.json())
      .then(
        (data: {
          meeting: Meeting;
          notes: MeetingNotes;
          transcript: TranscriptSegment[];
          screenshots: Screenshot[];
        }) => {
          setMeeting(data.meeting);
          setNotes(data.notes);
          setSegments(data.transcript ?? []);
          setScreenshots(data.screenshots ?? []);
        },
      );
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
            if (seg.is_final) {
              return [...prev.filter((s) => s.id !== seg.id), seg].sort(
                (a, b) => a.start_time - b.start_time,
              );
            }
            return [...prev, seg];
          });
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  const copyTranscript = useCallback(async () => {
    const text = segments
      .filter((s) => s.is_final)
      .map((s) => `[${formatSecs(s.start_time)}] ${s.speaker}: ${s.text}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [segments]);

  const exportNotes = useCallback(() => {
    if (!notes || !meeting) return;
    const lines: string[] = [
      `# ${meeting.title}`,
      '',
      `**Status:** ${meeting.status}`,
      meeting.duration_secs
        ? `**Duration:** ${formatDuration(meeting.duration_secs)}`
        : '',
      meeting.started_at ? `**Date:** ${formatDateTime(meeting.started_at)}` : '',
      '',
      '## Summary',
      notes.summary ?? '',
      '',
      '## Action Items',
      ...(notes.action_items ?? []).map((i) => `- ${i}`),
      '',
      '## Decisions',
      ...(notes.decisions ?? []).map((i) => `- ${i}`),
      '',
      '## Key Points',
      ...(notes.key_points ?? []).map((i) => `- ${i}`),
      '',
      '## Open Questions',
      ...(notes.questions ?? []).map((i) => `- ${i}`),
    ].filter((l) => l !== null);

    const safeName = (meeting.title ?? 'meeting')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 80);
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}-notes.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [notes, meeting]);

  if (!meeting) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-400">
        Loading meeting…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Back + Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          Back to meetings
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <StatusBadge status={meeting.status} />
              {meeting.duration_secs !== null && meeting.duration_secs !== undefined && (
                <span className="text-sm text-gray-500">
                  {formatDuration(meeting.duration_secs)}
                </span>
              )}
              {meeting.started_at && (
                <span className="text-sm text-gray-500">
                  {formatDateTime(meeting.started_at)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200">
        {(['transcript', 'notes', 'screenshots'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab}
            {tab === 'transcript' && segments.length > 0 && (
              <span className="ml-1.5 text-xs text-gray-400">({segments.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'transcript' && (
        <div className="space-y-1">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => void copyTranscript()}
              disabled={segments.length === 0}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy transcript'}
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-1">
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
                  <span className="text-xs text-gray-400 w-12 shrink-0 pt-0.5 tabular-nums">
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
              <div className="flex justify-end">
                <button
                  onClick={exportNotes}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Download size={13} />
                  Export as Markdown
                </button>
              </div>
              {notes.summary && (
                <section>
                  <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{notes.summary}</p>
                </section>
              )}
              {(
                [
                  { key: 'action_items', label: '✅ Action Items' },
                  { key: 'decisions', label: '🔒 Decisions' },
                  { key: 'key_points', label: '💡 Key Points' },
                  { key: 'questions', label: '❓ Open Questions' },
                ] as const
              ).map(({ key, label }) => {
                const items = notes[key] as string[];
                if (!items?.length) return null;
                return (
                  <section key={key}>
                    <h3 className="font-semibold text-gray-900 mb-2">{label}</h3>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => (
                        <li key={i} className="text-sm text-gray-700 flex gap-2">
                          <span className="text-gray-300 shrink-0">•</span>
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
                className="rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <Image
                  src={s.url ?? s.public_url}
                  alt={`Screenshot at ${formatSecs(s.captured_at)}`}
                  width={400}
                  height={225}
                  className="w-full object-cover"
                />
                <p className="text-xs text-gray-500 px-3 py-2 tabular-nums">
                  {formatSecs(s.captured_at)}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
