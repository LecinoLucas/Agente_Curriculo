import { Check } from 'lucide-react';

export interface Step {
  id: string;
  label: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: string;
  completedSteps?: string[];
  orientation?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md';
}

export function Stepper({
  steps,
  currentStep,
  completedSteps = [],
  orientation = 'horizontal',
  size = 'md',
}: StepperProps) {
  if (orientation === 'horizontal') {
    return (
      <div className="flex items-center w-full overflow-x-auto">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          const isPending = !isCompleted && !isCurrent;

          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className={[
                    'flex items-center justify-center rounded-full font-semibold transition-colors',
                    size === 'md' ? 'h-8 w-8 text-sm' : 'h-6 w-6 text-xs',
                    isCompleted
                      ? 'bg-primary-700 text-white'
                      : isCurrent
                        ? 'border-2 border-primary-700 bg-white text-primary-700'
                        : 'border-2 border-gray-200 bg-white text-gray-400',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {isCompleted ? (
                    <Check className={size === 'md' ? 'h-4 w-4' : 'h-3 w-3'} />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={[
                    'text-center leading-tight',
                    size === 'md' ? 'text-xs' : 'text-[10px]',
                    isCurrent ? 'font-semibold text-primary-700' : isPending ? 'text-gray-400' : 'text-gray-600',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ maxWidth: size === 'md' ? '72px' : '56px' }}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={[
                    'flex-1 h-0.5 mx-2 mt-[-20px]',
                    isCompleted ? 'bg-primary-700' : 'bg-gray-200',
                  ].join(' ')}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;

        return (
          <div key={step.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={[
                  'flex items-center justify-center rounded-full font-semibold flex-shrink-0',
                  'h-7 w-7 text-xs',
                  isCompleted
                    ? 'bg-primary-700 text-white'
                    : isCurrent
                      ? 'border-2 border-primary-700 bg-white text-primary-700'
                      : 'border-2 border-gray-200 bg-white text-gray-400',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : <span>{index + 1}</span>}
              </div>
              {index < steps.length - 1 && (
                <div className={['w-0.5 h-6 my-1', isCompleted ? 'bg-primary-700' : 'bg-gray-200'].join(' ')} />
              )}
            </div>
            <div className="pt-0.5 pb-4">
              <p
                className={[
                  'text-sm font-medium',
                  isCurrent ? 'text-primary-700' : isCompleted ? 'text-gray-700' : 'text-gray-400',
                ].join(' ')}
              >
                {step.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
