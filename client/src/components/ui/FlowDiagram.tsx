import { cn } from '@/utils/cn';
import { Check, ArrowRight } from 'lucide-react';

export interface FlowStep {
  id: string;
  label: string;
  /**
   * One sentence on what happens at this step.
   *
   * **This field was declared and never rendered.** No call site passed one and the component body
   * ignored it, so the headline flow's diagram was five bare words — *Authorize · Login · Consent ·
   * Callback · Token* — in a product whose premise is that each step gets explained. It told a reader
   * *where they were* and never *what happens there*.
   */
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
    <div
      className={cn('flex items-center gap-0', className)}
      role="list"
      aria-label="Flow progress"
    >
      {steps.map((step, i) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = currentStep === step.id;
        const isPending = !isCompleted && !isCurrent;

        // Colour alone carried the state, which is invisible to anyone who cannot distinguish these
        // hues and to anyone using a screen reader. The icon already differs for "done"; this adds the
        // text equivalent.
        const state = isCompleted ? 'completed' : isCurrent ? 'current' : 'not started';

        return (
          <div
            key={step.id}
            className="flex items-center flex-1 min-w-0"
            aria-label={`Step ${i + 1}, ${step.label}: ${state}${step.description ? `. ${step.description}` : ''}`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all duration-300',
                  isCompleted &&
                    'bg-tint-success-strong text-success-text border-2 border-edge-success',
                  isCurrent &&
                    'bg-tint-accent-strong text-accent-text border-2 border-indigo-500 ring-2 ring-edge-accent',
                  isPending && 'bg-muted/30 text-muted-foreground border-2 border-border',
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
              </div>
              <span
                className={cn(
                  'text-2xs font-medium text-center leading-tight px-1',
                  isCompleted && 'text-success-text',
                  isCurrent && 'text-accent-text',
                  isPending && 'text-muted-foreground/60',
                )}
              >
                {step.label}
              </span>
              {step.description && (
                <span className="hidden sm:block text-2xs text-center leading-snug px-1 text-muted-foreground/70 max-w-[13ch]">
                  {step.description}
                </span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className="shrink-0 mx-1">
                <ArrowRight
                  className={cn('h-3 w-3', isCompleted ? 'text-success-text/50' : 'text-border')}
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
