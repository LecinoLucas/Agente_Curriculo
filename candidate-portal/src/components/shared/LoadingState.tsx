import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  variant?: 'spinner' | 'skeleton';
  lines?: number;
  className?: string;
}

export function LoadingState({ variant = 'spinner', lines = 3, className = '' }: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div className={['space-y-3 animate-pulse', className].join(' ')}>
        <div className="h-6 bg-gray-200 rounded-lg w-3/4" />
        {Array.from({ length: lines - 1 }).map((_, i) => (
          <div
            key={i}
            className={['h-4 bg-gray-100 rounded-lg', i % 2 === 0 ? 'w-full' : 'w-5/6'].join(' ')}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={['flex items-center justify-center py-12', className].join(' ')}>
      <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
    </div>
  );
}
