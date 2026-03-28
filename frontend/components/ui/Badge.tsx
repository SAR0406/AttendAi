import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'text-xs font-medium px-2.5 py-0.5 rounded-full',
        STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700',
        className,
      )}
    >
      {STATUS_LABELS[status] ?? (typeof status === 'string' ? status.replace('_', ' ') : status)}
    </span>
  );
}
