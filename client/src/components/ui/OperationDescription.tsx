import { cn } from '@/utils/cn';
import { Info } from 'lucide-react';
import { HelpPopover } from './HelpPopover';
import type { OpDoc } from '@/data/operationDocs';

interface OperationDescriptionProps {
  doc: OpDoc;
  className?: string;
}

function OperationDescription({ doc, className }: OperationDescriptionProps) {
  return (
    <div
      className={cn(
        'flex gap-2 items-start bg-indigo-500/8 border-l-[3px] border-indigo-500 rounded-lg p-3 mb-3',
        className,
      )}
    >
      <Info className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
      <span className="text-xs text-indigo-200 leading-relaxed flex-1">{doc.description}</span>
      <HelpPopover
        title={doc.title}
        description={doc.description}
        params={doc.params}
        returns={doc.returns}
        tips={doc.tips}
      />
    </div>
  );
}

export { OperationDescription };
