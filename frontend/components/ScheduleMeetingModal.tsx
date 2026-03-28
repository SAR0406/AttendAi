'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  orgId: string;
  userId: string;
  onClose: () => void;
  onScheduled: () => void;
}

export function ScheduleMeetingModal({ orgId, userId, onClose, onScheduled }: Props) {
  const [title, setTitle] = useState('');
  const [zoomJoinUrl, setZoomJoinUrl] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [source, setSource] = useState<'zoom' | 'recording'>('zoom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (source === 'zoom' && !zoomJoinUrl) {
      setError('Zoom join URL is required');
      return;
    }
    if (source === 'recording' && !recordingUrl) {
      setError('Recording URL is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || undefined,
          zoomJoinUrl: source === 'zoom' ? zoomJoinUrl : undefined,
          recordingUrl: source === 'recording' ? recordingUrl : undefined,
          scheduledAt: source === 'zoom' ? scheduledAt || undefined : undefined,
          orgId,
          userId,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        setError(body.error ?? 'Something went wrong');
        return;
      }

      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 animate-fade-in">
        {/* Modal header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">New Meeting</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {/* Source toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Capture mode
            </label>
            <div className="flex gap-2">
              {(['zoom', 'recording'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    source === s
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === 'zoom' ? 'Join Zoom' : 'Recording URL'}
                </button>
              ))}
            </div>
            {source === 'recording' && (
              <p className="text-xs text-gray-500 mt-2">
                Recording imports use NVIDIA Riva + NIM and skip Recall.ai.
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Meeting title{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q2 Planning Sync"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* URL input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {source === 'zoom' ? 'Zoom join URL' : 'Recording URL'}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={source === 'zoom' ? zoomJoinUrl : recordingUrl}
              onChange={(e) =>
                source === 'zoom'
                  ? setZoomJoinUrl(e.target.value)
                  : setRecordingUrl(e.target.value)
              }
              placeholder={
                source === 'zoom'
                  ? 'https://zoom.us/j/123456789'
                  : 'https://storage.example.com/meeting.mp3'
              }
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* Scheduled time (Zoom only) */}
          {source === 'zoom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scheduled time{' '}
                <span className="text-gray-400 font-normal">(leave blank to join immediately)</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {loading
                ? 'Working…'
                : source === 'recording'
                  ? 'Process Recording'
                  : scheduledAt
                    ? 'Schedule'
                    : 'Join Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
