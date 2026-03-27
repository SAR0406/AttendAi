'use client';

import { use, useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import { Copy, Check, Download } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MeetingDetailSkeleton } from '@/components/ui/Skeleton';
import { formatTimestamp, formatDuration } from '@/lib/status';

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

const NOTE_SECTIONS: { key: keyof MeetingNotes; label: string; icon: string }[] = [
  { key: 'action_items', label: 'Action Items', icon: '✅' },
  { key: 'decisions',    label: 'Decisions',    icon: '🔒' },
  { key: 'key_points',   label: 'Key Points',   icon: '💡' },
  { key: 'questions',    label: 'Open Questions', icon: '❓' },
];

function buildMarkdown(meeting: Meeting, notes: MeetingNotes, segments: TranscriptSegment[]): string {
  const lines: string[] = [];
  lines.push(`# ${meeting.title ?? 'Meeting'}`);
  lines.push('');
  if (meeting.started_at) lines.push(`**Date:** ${new Date(meeting.started_at).toLocaleString()}`);
  if (meeting.duration_secs) lines.push(`**Duration:** ${formatDuration(meeting.duration_secs)}`);
  lines.push(`**Status:** ${meeting.status.replace(/_/g, ' ')}`);
  lines.push('');

  if (notes.summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(notes.summary);
    lines.push('');
  }
  for (const { key, label, icon } of NOTE_SECTIONS) {
    const items = notes[key] as string[];
    if (items?.length) {
      lines.push(`## ${icon} ${label}`);
      lines.push('');
      items.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }
  }
  if (segments.length > 0) {
    lines.push('## Transcript');
    lines.push('');
    segments.forEach((s) => {
      lines.push(`**[${formatTimestamp(s.start_time)}] ${s.speaker}:** ${s.text}`);
    });
  }
  return lines.join('\n');
}

function useCopyToClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), timeout);
  }, [timeout]);
  return { copied, copy };
}

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [notes, setNotes] = useState<MeetingNotes | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [activeTab, setActiveTab] = useState<'transcript' | 'notes' | 'screenshots'>('transcript');
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { copied: transcriptCopied, copy: copyTranscript } = useCopyToClipboard();
  const { copied: notesCopied, copy: copyNotes } = useCopyToClipboard();

  // Fetch initial data
  useEffect(() => {
    setLoadError(null);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json();
      })
      .then((data: { meeting: Meeting; notes: MeetingNotes; transcript: TranscriptSegment[]; screenshots: Screenshot[] }) => {
        setMeeting(data.meeting);
        setNotes(data.notes);
        setSegments(data.transcript ?? []);
        setScreenshots(data.screenshots ?? []);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load meeting');
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

    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  const handleExportNotes = useCallback(() => {
    if (!meeting || !notes) return;
    const md = buildMarkdown(meeting, notes, segments);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(meeting.title ?? 'meeting').replace(/\s+/g, '-').toLowerCase()}-notes.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [meeting, notes, segments]);

  const handleCopyTranscript = useCallback(() => {
    const text = segments
      .filter((s) => s.is_final)
      .map((s) => `[${formatTimestamp(s.start_time)}] ${s.speaker}: ${s.text}`)
      .join('\n');
    void copyTranscript(text);
  }, [segments, copyTranscript]);

  const handleCopyNotes = useCallback(() => {
    if (!meeting || !notes) return;
    void copyNotes(buildMarkdown(meeting, notes, segments));
  }, [meeting, notes, segments, copyNotes]);

  if (loadError) {
    return (
      <>
        <Navbar backHref="/dashboard" backLabel="Dashboard" />
        <div className="max-w-5xl mx-auto px-4 py-20 text-center">
          <p className="text-red-500 font-medium mb-2">Failed to load meeting</p>
          <p className="text-sm text-gray-500">{loadError}</p>
        </div>
      </>
    );
  }

  if (!meeting) {
    return (
      <>
        <Navbar backHref="/dashboard" backLabel="Dashboard" />
        <MeetingDetailSkeleton />
      </>
    );
  }

  const TABS = [
    { key: 'transcript' as const, label: 'Transcript', count: segments.filter((s) => s.is_final).length },
    { key: 'notes' as const,      label: 'Notes',      count: null },
    { key: 'screenshots' as const,label: 'Screenshots', count: screenshots.length || null },
  ];

  return (
    <>
      <Navbar backHref="/dashboard" backLabel="Dashboard" />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{meeting.title ?? 'Meeting'}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <StatusBadge status={meeting.status} />
              {meeting.duration_secs != null && (
                <span className="text-sm text-gray-500">
                  Duration: {formatDuration(meeting.duration_secs)}
                </span>
              )}
              {meeting.started_at && (
                <span className="text-sm text-gray-500">
                  {new Date(meeting.started_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {notes && (
              <>
                <button
                  onClick={handleCopyNotes}
                  title="Copy notes as Markdown"
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors hover:bg-gray-50"
                >
                  {notesCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {notesCopied ? 'Copied!' : 'Copy notes'}
                </button>
                <button
                  onClick={handleExportNotes}
                  title="Download notes as Markdown file"
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors hover:bg-gray-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export .md
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 border-b border-gray-200">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              {count != null && count > 0 && (
                <span className="ml-1.5 text-xs text-gray-400">({count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'transcript' && (
          <div>
            {segments.filter((s) => s.is_final).length > 0 && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={handleCopyTranscript}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {transcriptCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {transcriptCopied ? 'Copied!' : 'Copy transcript'}
                </button>
              </div>
            )}
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
                    <span className="text-xs text-gray-400 w-12 shrink-0 pt-0.5 tabular-nums">
                      {formatTimestamp(s.start_time)}
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
                {notes.summary && (
                  <section>
                    <h2 className="font-semibold text-gray-900 mb-2">Summary</h2>
                    <p className="text-sm text-gray-700 leading-relaxed">{notes.summary}</p>
                  </section>
                )}
                {NOTE_SECTIONS.map(({ key, label, icon }) => {
                  const items = notes[key] as string[];
                  if (!items?.length) return null;
                  return (
                    <section key={key}>
                      <h2 className="font-semibold text-gray-900 mb-2">
                        {icon} {label}
                      </h2>
                      <ul className="space-y-1">
                        {items.map((item, i) => (
                          <li key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-gray-400 shrink-0" aria-hidden="true">•</span>
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
                    alt={`Screenshot at ${formatTimestamp(s.captured_at)}`}
                    width={400}
                    height={225}
                    className="w-full object-cover"
                  />
                  <p className="text-xs text-gray-500 p-2 tabular-nums">
                    {formatTimestamp(s.captured_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
