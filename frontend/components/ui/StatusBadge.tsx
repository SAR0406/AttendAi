import { cn } from '@/lib/utils';
import { STATUS_COLORS, formatStatus } from '@/lib/status';

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
      {formatStatus(status)}
    </span>
  );
}
