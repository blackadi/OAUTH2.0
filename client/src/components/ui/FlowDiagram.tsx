import { cn } from '@/utils/cn';
import { Check, ArrowRight } from 'lucide-react';

export interface FlowStep {
  id: string;
  label: string;
  description?: string;
}

interface FlowDiagramProps {
  steps: FlowStep[];
  currentStep?: string;
  completedSteps?: string[];
  className?: string;
}

function FlowDiagram({ steps, currentStep, completedSteps = [], className }: FlowDiagramProps) {
  return (
    <div className={cn('flex items-center gap-0', className)}>
      {steps.map((step, i) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = currentStep === step.id;
        const isPending = !isCompleted && !isCurrent;

        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all duration-300',
                  isCompleted && 'bg-green-500/20 text-green-400 border-2 border-green-500/50',
                  isCurrent && 'bg-indigo-500/20 text-indigo-300 border-2 border-indigo-500 ring-2 ring-indigo-500/20',
                  isPending && 'bg-muted/30 text-muted-foreground border-2 border-border',
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'text-[0.6rem] font-medium text-center leading-tight px-1',
                  isCompleted && 'text-green-400',
                  isCurrent && 'text-indigo-300',
                  isPending && 'text-muted-foreground/60',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="shrink-0 mx-1">
                <ArrowRight
                  className={cn(
                    'h-3 w-3',
                    isCompleted ? 'text-green-500/50' : 'text-border',
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { FlowDiagram };
