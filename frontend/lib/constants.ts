export const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-yellow-100 text-yellow-800',
  joining: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-green-100 text-green-800',
  processing: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-700',
  failed: 'bg-red-100 text-red-800',
};

export const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  joining: 'Joining',
  in_progress: 'Live',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

export const MEETING_STATUSES = [
  'scheduled',
  'joining',
  'in_progress',
  'processing',
  'completed',
  'failed',
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];
