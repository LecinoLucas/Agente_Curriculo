import { Info, AlertCircle, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { HRMessage } from '../../types/candidatePortal';
import { Button } from '../ui/Button';

interface StatusCardProps {
  message: HRMessage;
  actionLabel?: string;
  actionRoute?: string;
}

const typeConfig = {
  info: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    iconColor: 'text-blue-600',
    tag: 'Informação',
    tagColor: 'text-blue-600 bg-blue-100',
  },
  action: {
    icon: Bell,
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    iconColor: 'text-amber-600',
    tag: 'Ação necessária',
    tagColor: 'text-amber-700 bg-amber-100',
  },
  alert: {
    icon: AlertCircle,
    bg: 'bg-red-50',
    border: 'border-red-100',
    iconColor: 'text-red-600',
    tag: 'Alerta',
    tagColor: 'text-red-600 bg-red-100',
  },
};

export function StatusCard({ message, actionLabel, actionRoute }: StatusCardProps) {
  const navigate = useNavigate();
  const config = typeConfig[message.type];
  const Icon = config.icon;

  return (
    <div className={['rounded-xl border p-4', config.bg, config.border].join(' ')}>
      <div className="flex items-start gap-3">
        <div className={['mt-0.5 flex-shrink-0', config.iconColor].join(' ')}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={['text-xs font-semibold rounded-full px-2 py-0.5', config.tagColor].join(' ')}>
              {config.tag}
            </span>
            {!message.read && (
              <span className="inline-block h-2 w-2 rounded-full bg-primary-700" />
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900">{message.title}</p>
          <p className="mt-0.5 text-sm text-gray-600">{message.body}</p>
          <p className="mt-1.5 text-xs text-gray-400">{message.date}</p>
        </div>
      </div>
      {actionRoute && (
        <div className="mt-3">
          <Button size="sm" onClick={() => navigate(actionRoute)}>
            {actionLabel ?? 'Ver agora'}
          </Button>
        </div>
      )}
    </div>
  );
}
