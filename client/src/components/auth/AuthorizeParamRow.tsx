import { useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { type AuthParamSpec } from '@/data/authParams';
import { HelpPopover } from '@/components/ui/HelpPopover';
import { Prose } from '@/components/ui/Prose';
import { cn } from '@/utils/cn';
import { jsonError } from './use-authorize-params';

/**
 * One row of the authorization-request table: the toggle, the conformance word, the threat, the input.
 *
 * Presentational, and named for its parameter set on purpose — `TokenRequestPanel` has its own local
 * `ParamRow` over `TokenParamSpec`, and two components with one name in one directory is a trap.
 */

interface AuthorizeParamRowProps {
  spec: AuthParamSpec;
  enabled: boolean;
  value: string;
  onToggle: (enabled: boolean) => void;
  onChange: (value: string) => void;
  onRegenerate?: () => void;
}

function AuthorizeParamRow({
  spec,
  enabled,
  value,
  onToggle,
  onChange,
  onRegenerate,
}: AuthorizeParamRowProps) {
  const error = enabled ? jsonError(value) : null;
  /**
   * The error has to be *pointed at*, not merely rendered.
   *
   * It was a bare `<p>` with no id, and the input carried no `aria-describedby` and no `aria-invalid` —
   * so the red text reached sighted users and a screen-reader user focusing the field was told nothing at
   * all. `ui/Input.tsx` has always done this correctly; this row hand-rolls its own controls and did not,
   * which is the whole hazard of a bespoke input. Found by writing the assertion for check D6 in
   * `docs/SCREEN-READER-CHECKLIST.md` rather than by reading.
   */
  const errorId = error ? `param-${spec.name}-error` : undefined;
  const invalid = error ? true : undefined;
  const [threatOpen, setThreatOpen] = useState(false);

  return (
    /**
     * A disabled row is marked by its **surface**, not by dimming its text.
     *
     * This was `opacity-55`, which axe flagged as a serious contrast failure — and no opacity value
     * works, because the row also contains `text-muted-foreground`, a token already at its AA limit:
     * dimming it *at all* breaks it. Measured worst-case in this row was 2.36:1 at 55% and still 3.88:1
     * at 80%.
     *
     * A faint tint keeps every glyph at its full token colour (4.5:1+ in both palettes) while preserving
     * the visual distinction across a 24-row table — and the *semantic* signal was never the opacity
     * anyway, it is the unchecked checkbox.
     */
    <div className={cn('px-3 py-2', !enabled && 'bg-muted/30')}>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          id={`param-${spec.name}`}
          className="w-3.5 h-3.5 accent-indigo-500 shrink-0 cursor-pointer"
        />
        <label
          htmlFor={`param-${spec.name}`}
          className="text-xs font-mono text-foreground cursor-pointer"
        >
          {spec.label}
        </label>
        {spec.requirement && (
          <span
            className={cn(
              'text-2xs font-mono uppercase tracking-wider px-1 py-0.5 rounded',
              spec.requirement === 'REQUIRED'
                ? 'bg-tint-danger-strong text-danger-text'
                : spec.requirement === 'RECOMMENDED'
                  ? 'bg-tint-warning-strong text-warning-text'
                  : 'bg-muted/60 text-muted-foreground',
            )}
          >
            {spec.requirement}
          </span>
        )}
        <span className="text-2xs font-mono text-muted-foreground truncate">{spec.spec}</span>
        {spec.threat && (
          /* The attack this parameter prevents, one click away. It is a toggle rather than always-on
             prose because the row is dense and a novice meets 24 of them — but it is *present* on every
             parameter that carries a promise, which is the half that was missing: `attack` and
             `attacker` appeared zero times in the whole teaching layer. */
          <button
            onClick={() => setThreatOpen((o) => !o)}
            aria-expanded={threatOpen}
            title="What attack this parameter prevents"
            className={cn(
              'flex items-center gap-1 text-2xs px-1 py-0.5 rounded border cursor-pointer transition-colors shrink-0',
              threatOpen
                ? 'bg-tint-warning-strong text-warning-text border-edge-warning'
                : 'bg-transparent text-muted-foreground border-border hover:text-warning-text',
            )}
          >
            <ShieldAlert className="h-2.5 w-2.5" />
            why
          </button>
        )}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              aria-label={`Regenerate ${spec.name}`}
              title={`Regenerate ${spec.name}`}
              className="p-1 rounded text-muted-foreground hover:text-accent-text bg-transparent border-none cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
          <HelpPopover title={spec.label} description={spec.note} tips={spec.spec} />
        </div>
      </div>

      {spec.threat && threatOpen && (
        <div className="flex gap-2 items-start mt-1.5 mb-0.5 rounded-md border-l-2 border-edge-warning bg-tint-warning pl-2 py-1.5 pr-2">
          <ShieldAlert className="h-3 w-3 text-warning-text mt-0.5 shrink-0" />
          <Prose as="p" className="text-xs text-foreground-muted leading-relaxed m-0">
            {spec.threat}
          </Prose>
        </div>
      )}

      {enabled && (
        <div className="mt-1.5 pl-5">
          {spec.kind === 'select' ? (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`${spec.name} value`}
              className="w-full h-8 rounded-md border border-border bg-input px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">(not set)</option>
              {spec.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : spec.kind === 'textarea' ? (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={spec.placeholder}
              aria-label={`${spec.name} value`}
              aria-describedby={errorId}
              aria-invalid={invalid}
              rows={3}
              className={cn(
                'w-full rounded-md border bg-input px-2 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y',
                error ? 'border-edge-danger' : 'border-border',
              )}
            />
          ) : (
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={spec.placeholder}
              aria-label={`${spec.name} value`}
              aria-describedby={errorId}
              aria-invalid={invalid}
              className="w-full h-8 rounded-md border border-border bg-input px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          {error && (
            <p id={errorId} role="alert" className="text-2xs text-danger-text mt-1">
              Invalid JSON: {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { AuthorizeParamRow };
