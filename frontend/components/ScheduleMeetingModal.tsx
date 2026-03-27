'use client';

import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

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
    if (source === 'zoom' && !zoomJoinUrl) { setError('Zoom join URL is required'); return; }
    if (source === 'recording' && !recordingUrl) { setError('Recording URL is required'); return; }

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
          scheduledAt: source === 'zoom' ? (scheduledAt || undefined) : undefined,
          orgId,
          userId,
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error: string };
        setError(body.error ?? 'Something went wrong');
        return;
      }

      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 m-4">
        <div className="flex items-center justify-between mb-5">
          <h2 id="schedule-modal-title" className="text-lg font-bold">
            Schedule a Meeting
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">
              Capture mode
            </legend>
            <div className="flex gap-2" role="group">
              <button
                type="button"
                onClick={() => setSource('zoom')}
                aria-pressed={source === 'zoom'}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  source === 'zoom'
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Join Zoom
              </button>
              <button
                type="button"
                onClick={() => setSource('recording')}
                aria-pressed={source === 'recording'}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  source === 'recording'
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Recording URL
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Recording URL skips Recall.ai and uses NVIDIA Riva + NIM only.
            </p>
          </fieldset>

          <div>
            <label htmlFor="meeting-title" className="block text-sm font-medium text-gray-700 mb-1">
              Meeting title <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="meeting-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q2 Planning Sync"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="meeting-url" className="block text-sm font-medium text-gray-700 mb-1">
              {source === 'zoom' ? 'Zoom join URL' : 'Recording URL'}{' '}
              <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="meeting-url"
              type="url"
              value={source === 'zoom' ? zoomJoinUrl : recordingUrl}
              onChange={(e) => (
                source === 'zoom'
                  ? setZoomJoinUrl(e.target.value)
                  : setRecordingUrl(e.target.value)
              )}
              placeholder={
                source === 'zoom'
                  ? 'https://zoom.us/j/123456789'
                  : 'https://storage.example.com/meeting.mp3'
              }
              required
              aria-required="true"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {source === 'zoom' && (
            <div>
              <label htmlFor="scheduled-at" className="block text-sm font-medium text-gray-700 mb-1">
                Scheduled time <span className="text-gray-400">(leave blank to join immediately)</span>
              </label>
              <input
                id="scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? 'Please wait…'
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
