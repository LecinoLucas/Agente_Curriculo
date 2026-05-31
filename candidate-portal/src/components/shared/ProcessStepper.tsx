import { Check, Clock } from 'lucide-react';
import { PROCESS_STEPS } from '../../types/candidatePortal';
import type { ProcessStep } from '../../types/candidatePortal';

interface ProcessStepperProps {
  currentStep: ProcessStep;
  completedSteps: ProcessStep[];
  variant?: 'full' | 'compact';
}

export function ProcessStepper({
  currentStep,
  completedSteps,
  variant = 'full',
}: ProcessStepperProps) {
  return (
    <div className="w-full overflow-x-auto">
      <div className={['flex items-start', variant === 'compact' ? 'gap-0' : 'gap-0'].join(' ')}>
        {PROCESS_STEPS.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          const isPending = !isCompleted && !isCurrent;

          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 w-full">
                <div className="flex items-center w-full">
                  {index > 0 && (
                    <div
                      className={[
                        'flex-1 h-0.5',
                        isCompleted || isCurrent ? 'bg-primary-700' : 'bg-gray-200',
                      ].join(' ')}
                    />
                  )}
                  <div
                    className={[
                      'flex items-center justify-center rounded-full flex-shrink-0 transition-colors',
                      variant === 'full' ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-xs',
                      isCompleted
                        ? 'bg-primary-700 text-white'
                        : isCurrent
                          ? 'border-2 border-primary-700 bg-white text-primary-700 font-bold'
                          : 'border-2 border-gray-200 bg-white text-gray-400',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {isCompleted ? (
                      <Check className={variant === 'full' ? 'h-4 w-4' : 'h-3 w-3'} />
                    ) : isCurrent ? (
                      <Clock className={variant === 'full' ? 'h-4 w-4' : 'h-3 w-3'} />
                    ) : (
                      <span className="font-medium">{index + 1}</span>
                    )}
                  </div>
                  {index < PROCESS_STEPS.length - 1 && (
                    <div
                      className={[
                        'flex-1 h-0.5',
                        isCompleted ? 'bg-primary-700' : 'bg-gray-200',
                      ].join(' ')}
                    />
                  )}
                </div>
                <span
                  className={[
                    'text-center leading-tight px-0.5',
                    variant === 'full' ? 'text-xs' : 'text-[10px]',
                    isCurrent
                      ? 'font-semibold text-primary-700'
                      : isCompleted
                        ? 'text-gray-600 font-medium'
                        : isPending
                          ? 'text-gray-400'
                          : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
