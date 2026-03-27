'use client';

import { useState } from 'react';

interface Props {
  orgId: string;
  userId: string;
  onClose: () => void;
  onScheduled: () => void;
}

export function ScheduleMeetingModal({ orgId, userId, onClose, onScheduled }: Props) {
  const [title, setTitle] = useState('');
  const [zoomJoinUrl, setZoomJoinUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!zoomJoinUrl) { setError('Zoom join URL is required'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || undefined,
          zoomJoinUrl,
          scheduledAt: scheduledAt || undefined,
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
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 m-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">Schedule a Meeting</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Meeting title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q2 Planning Sync"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zoom join URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={zoomJoinUrl}
              onChange={(e) => setZoomJoinUrl(e.target.value)}
              placeholder="https://zoom.us/j/123456789"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scheduled time (leave blank to join immediately)
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

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
              className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Scheduling…' : scheduledAt ? 'Schedule' : 'Join Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
