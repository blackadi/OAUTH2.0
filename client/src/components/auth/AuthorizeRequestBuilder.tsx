import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  Send,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { AUTH_PARAMS, PARAM_GROUPS, type AuthParamSpec, type ParamGroup } from '@/data/authParams';
import { createPkcePair, generateCodeChallenge } from '@/pkce';
import { HelpPopover } from '@/components/ui/HelpPopover';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { Prose } from '@/components/ui/Prose';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';

/**
 * Build an authorization request parameter by parameter, see the exact URL, then send it.
 *
 * **Two defects this replaces.** The panel exposed three fields, so most of the request was not
 * editable at all — `scope` came from a build-time constant, `state` and `nonce` were generated
 * invisibly, and a dozen parameters had no input. And the URL preview above the button was assembled
 * separately from the redirect, omitting `state`, `nonce` and `code_challenge`: it showed an
 * approximation of the request, never the request. Here the URL is derived from the parameter table and
 * the Send button navigates to **that same string**, so the two cannot drift.
 *
 * The raw editor is deliberate rather than a convenience. Some things are only learnable by sending a
 * request no builder would construct — a duplicated parameter, a `code_challenge_method` the client
 * does not permit, a `redirect_uri` off by a trailing slash — and the fastest way to see what an
 * authorization server does with those is to type one.
 */

export interface ParamState {
  enabled: boolean;
  /**
   * The user's edit, or `null` for "use the derived value".
   *
   * Deliberately not a mirror of the props. Copying `seed.clientId` into state through an effect is the
   * anti-pattern this file originally had — two renders for a value that was derivable in the first,
   * and a stale copy the moment the prop changed. `ParSection` already carries a note about the same
   * mistake. Here a derived default is computed at read time and an edit shadows it, so there is
   * nothing to keep in step.
   */
  value: string | null;
}

export interface CustomParam {
  id: string;
  name: string;
  value: string;
}

interface AuthorizeRequestBuilderProps {
  endpoint: string;
  /** Seeds `client_id`, `redirect_uri` and `scope` from the section's own inputs. */
  seed: { clientId: string; redirectUri: string; scope: string };
  /** The DPoP thumbprint to offer for `dpop_jkt`, when a key has been generated. */
  dpopThumbprint?: string;
  /**
   * Called with the final URL and the PKCE verifier that matches the challenge in it, so the caller
   * can persist what the callback will need before navigating.
   */
  onSend: (url: string, context: { codeVerifier: string | null; state: string | null }) => void;
}

function isJsonish(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function jsonError(value: string): string | null {
  if (!value.trim() || !isJsonish(value)) return null;
  try {
    JSON.parse(value);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid JSON';
  }
}

function AuthorizeRequestBuilder({
  endpoint,
  seed,
  dpopThumbprint,
  onSend,
}: AuthorizeRequestBuilderProps) {
  const [params, setParams] = useState<Record<string, ParamState>>(() =>
    Object.fromEntries(AUTH_PARAMS.map((p) => [p.name, { enabled: p.defaultOn, value: null }])),
  );
  const [customs, setCustoms] = useState<CustomParam[]>([]);
  /** Values this component mints: shown, regenerable, and overridable by an edit like any other. */
  const [generated, setGenerated] = useState<{
    state: string;
    nonce: string;
    codeChallenge: string;
  }>({ state: '', nonce: '', codeChallenge: '' });
  const [codeVerifier, setCodeVerifier] = useState<string | null>(null);
  /** Set when the challenge no longer derives from the verifier we hold — see `regeneratePkce`. */
  const [challengeEdited, setChallengeEdited] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [rawUrl, setRawUrl] = useState('');
  const { copied, setCopied, resetLater } = useCopyFeedback();
  const [openGroups, setOpenGroups] = useState<Record<ParamGroup, boolean>>({
    core: true,
    oidc: true,
    pkce: true,
    extensions: false,
  });

  /**
   * Rows and groups the user has toggled by hand. Their choice outranks anything derived below.
   *
   * Keyed `param:<name>` / `group:<id>` so one record serves both without two pieces of state that
   * could disagree.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const setParam = useCallback((name: string, patch: Partial<ParamState>) => {
    setParams((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }, []);

  /**
   * Whether a parameter is on — **derived for `dpop_jkt`, stored for everything else.**
   *
   * The Grant Flows checkbox says it *"generates a key, sends its thumbprint as `dpop_jkt`"* and it did
   * not: `dpop_jkt` is `defaultOn: false` and lives in the `extensions` group, which renders collapsed,
   * so the parameter was neither sent nor findable. The copy described the intent and the mechanism did
   * not follow.
   *
   * A static `defaultOn: true` is the wrong repair — the eight parameters that carry it are the
   * unconditional baseline of a plain authorization-code request, and an always-ticked row holding an
   * empty value is noise. **Having a thumbprint is the condition under which this parameter means
   * anything**, so that is what it follows.
   *
   * Derived rather than written from an effect, deliberately: `react-hooks/set-state-in-effect` is
   * right that syncing one piece of state into another is how the two drift. `touched` keeps the user
   * in charge — this is a debugger, and sending the request with the key generated but the binding
   * withheld, to watch what the token endpoint does with it, is a thing worth being able to do.
   */
  const enabledOf = useCallback(
    (name: string): boolean =>
      name === 'dpop_jkt' && !touched['param:dpop_jkt']
        ? Boolean(dpopThumbprint)
        : (params[name]?.enabled ?? false),
    [params, touched, dpopThumbprint],
  );

  /** Same arrangement for the collapsed group: a thumbprint opens Extensions until the user says otherwise. */
  const groupOpen = useCallback(
    (id: ParamGroup): boolean =>
      id === 'extensions' && !touched['group:extensions']
        ? openGroups.extensions || Boolean(dpopThumbprint)
        : openGroups[id],
    [openGroups, touched, dpopThumbprint],
  );

  // Mint `state`, `nonce` and a PKCE pair on mount. They are shown rather than hidden, because a value
  // you cannot see is a value you cannot check when it comes back.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pair = await createPkcePair();
      if (cancelled) return;
      setCodeVerifier(pair.codeVerifier);
      setGenerated({
        state: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
        codeChallenge: pair.codeChallenge,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const regenerate = useCallback(
    async (name: 'state' | 'nonce' | 'pkce') => {
      if (name === 'pkce') {
        const pair = await createPkcePair();
        setCodeVerifier(pair.codeVerifier);
        setChallengeEdited(false);
        setGenerated((prev) => ({ ...prev, codeChallenge: pair.codeChallenge }));
        // Clear the overrides so the fresh pair is what shows.
        setParams((prev) => ({
          ...prev,
          code_challenge: { ...prev.code_challenge, value: null },
          code_challenge_method: { ...prev.code_challenge_method, value: 'S256' },
        }));
        return;
      }
      setGenerated((prev) => ({ ...prev, [name]: crypto.randomUUID() }));
      setParam(name, { value: null });
    },
    [setParam],
  );

  /**
   * What a parameter is actually set to: the user's edit if there is one, else the value derived from
   * the props and the generated values. Read at render time, so nothing needs synchronising.
   */
  const effective = useCallback(
    (name: string): string => {
      const override = params[name]?.value;
      if (override !== null && override !== undefined) return override;
      switch (name) {
        case 'response_type':
          return 'code';
        case 'client_id':
          return seed.clientId;
        case 'redirect_uri':
          return seed.redirectUri;
        case 'scope':
          return seed.scope;
        case 'state':
          return generated.state;
        case 'nonce':
          return generated.nonce;
        case 'code_challenge':
          return generated.codeChallenge;
        case 'code_challenge_method':
          return 'S256';
        case 'dpop_jkt':
          return dpopThumbprint ?? '';
        default:
          return '';
      }
    },
    [params, seed, generated, dpopThumbprint],
  );

  /**
   * RFC 7636 §4.2: under `plain` the challenge *is* the verifier; under `S256` it is the base64url
   * SHA-256 of it. Switching the method rewrites the challenge so the pair stays coherent — otherwise
   * flipping to `plain` would send an S256 digest and fail for a reason that has nothing to teach.
   */
  const changeMethod = useCallback(
    async (method: string) => {
      setParam('code_challenge_method', { value: method });
      if (!codeVerifier || challengeEdited) return;
      setParam('code_challenge', {
        value: method === 'plain' ? codeVerifier : await generateCodeChallenge(codeVerifier),
      });
    },
    [codeVerifier, challengeEdited, setParam],
  );

  /** The single source of truth. The preview and the redirect are the same string, by construction. */
  const builtUrl = useMemo(() => {
    const search = new URLSearchParams();
    for (const spec of AUTH_PARAMS) {
      if (!enabledOf(spec.name)) continue;
      const value = effective(spec.name);
      if (value === '') continue;
      search.append(spec.name, value);
    }
    for (const custom of customs) {
      if (!custom.name) continue;
      search.append(custom.name, custom.value);
    }
    const query = search.toString();
    return query ? `${endpoint}?${query}` : endpoint;
  }, [customs, endpoint, effective, enabledOf]);

  const effectiveUrl = rawMode ? rawUrl : builtUrl;

  // Entering raw mode seeds the box from the built URL, so it is an edit of the real request rather
  // than a blank page.
  const toggleRaw = useCallback(() => {
    setRawMode((was) => {
      if (!was) setRawUrl(builtUrl);
      return !was;
    });
  }, [builtUrl]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopied(true);
      resetLater();
    } catch {
      /* clipboard unavailable */
    }
  }, [effectiveUrl, setCopied, resetLater]);

  const send = useCallback(() => {
    // The verifier is only meaningful if the challenge in the URL actually derives from it.
    onSend(effectiveUrl, {
      codeVerifier: challengeEdited ? null : codeVerifier,
      state: enabledOf('state') ? effective('state') : null,
    });
  }, [effectiveUrl, challengeEdited, codeVerifier, enabledOf, effective, onSend]);

  const jsonProblems = AUTH_PARAMS.filter((p) => enabledOf(p.name) && jsonError(effective(p.name)));

  const enabledCount =
    AUTH_PARAMS.filter((p) => enabledOf(p.name) && effective(p.name) !== '').length +
    customs.filter((c) => c.name).length;

  return (
    <div className="space-y-4">
      {PARAM_GROUPS.map((group) => {
        const specs = AUTH_PARAMS.filter((p) => p.group === group.id);
        const activeCount = specs.filter((p) => enabledOf(p.name)).length;
        const open = groupOpen(group.id);
        return (
          <div key={group.id} className="rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => {
                setTouched((prev) => ({ ...prev, [`group:${group.id}`]: true }));
                setOpenGroups((prev) => ({ ...prev, [group.id]: !open }));
              }}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-none cursor-pointer hover:bg-muted/50 transition-colors text-left"
            >
              <div className="min-w-0">
                <span className="text-xs font-semibold text-foreground">{group.label}</span>
                <p className="text-2xs text-muted-foreground mt-0.5">{group.blurb}</p>
              </div>
              <span className="text-2xs font-mono text-muted-foreground shrink-0 tabular-nums">
                {activeCount}/{specs.length}
              </span>
            </button>

            {open && (
              <div className="divide-y divide-border/50">
                {specs.map((spec) => (
                  <ParamRow
                    key={spec.name}
                    spec={spec}
                    enabled={enabledOf(spec.name)}
                    value={effective(spec.name)}
                    onToggle={(enabled) => {
                      setTouched((prev) => ({ ...prev, [`param:${spec.name}`]: true }));
                      setParam(spec.name, { enabled });
                    }}
                    onChange={(value) => {
                      if (spec.name === 'code_challenge') setChallengeEdited(true);
                      if (spec.name === 'code_challenge_method') {
                        void changeMethod(value);
                        return;
                      }
                      setParam(spec.name, { value });
                    }}
                    onRegenerate={
                      spec.name === 'state' || spec.name === 'nonce'
                        ? () => regenerate(spec.name as 'state' | 'nonce')
                        : spec.name === 'code_challenge'
                          ? () => regenerate('pkce')
                          : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Anything the builder does not model. An authorization server's behaviour on an unknown
          parameter is itself worth seeing, and so is a deliberately duplicated one. */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30">
          <div>
            <span className="text-xs font-semibold text-foreground">Custom parameters</span>
            <p className="text-2xs text-muted-foreground mt-0.5">
              Anything else — including a name already above, to send it twice.
            </p>
          </div>
          <button
            onClick={() =>
              setCustoms((prev) => [...prev, { id: crypto.randomUUID(), name: '', value: '' }])
            }
            className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/50 text-muted-foreground hover:text-foreground border-none cursor-pointer shrink-0"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        {customs.length > 0 && (
          <div className="p-2 space-y-2">
            {customs.map((custom) => (
              <div key={custom.id} className="flex gap-2 items-center">
                <input
                  value={custom.name}
                  onChange={(e) =>
                    setCustoms((prev) =>
                      prev.map((c) => (c.id === custom.id ? { ...c, name: e.target.value } : c)),
                    )
                  }
                  placeholder="name"
                  aria-label="Custom parameter name"
                  className="w-1/3 h-8 rounded-md border border-border bg-input px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  value={custom.value}
                  onChange={(e) =>
                    setCustoms((prev) =>
                      prev.map((c) => (c.id === custom.id ? { ...c, value: e.target.value } : c)),
                    )
                  }
                  placeholder="value"
                  aria-label="Custom parameter value"
                  className="flex-1 h-8 rounded-md border border-border bg-input px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => setCustoms((prev) => prev.filter((c) => c.id !== custom.id))}
                  aria-label={`Remove ${custom.name || 'parameter'}`}
                  className="p-1 rounded text-muted-foreground hover:text-danger-text bg-transparent border-none cursor-pointer shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── the request ─────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-edge-accent bg-tint-accent overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-edge-accent flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-success-text">
              GET
            </span>
            <span className="text-xs font-semibold text-foreground">Authorization request</span>
            <span className="text-2xs font-mono text-muted-foreground tabular-nums">
              {enabledCount} param{enabledCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleRaw}
              className={cn(
                'text-2xs px-2 py-1 rounded border cursor-pointer transition-colors',
                rawMode
                  ? 'bg-tint-warning-strong text-warning-text border-edge-warning'
                  : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground',
              )}
            >
              {rawMode ? 'Editing raw URL' : 'Edit raw'}
            </button>
            <button
              onClick={copyUrl}
              className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-foreground border-none cursor-pointer"
            >
              {copied ? (
                <Check className="h-3 w-3 text-success-text" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? 'Copied' : 'Copy URL'}
            </button>
          </div>
        </div>

        {rawMode ? (
          <textarea
            value={rawUrl}
            onChange={(e) => setRawUrl(e.target.value)}
            aria-label="Raw authorization URL"
            rows={5}
            className="w-full bg-code/60 px-3 py-2 text-xs font-mono text-foreground border-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring resize-y"
          />
        ) : (
          // `tabIndex={0}` and a name, because this block scrolls. A scrollable region that cannot
          // receive focus cannot be scrolled by keyboard at all — content below the fold is simply
          // unreachable without a pointer. Found by axe (`scrollable-region-focusable`); the
          // `role="region"` plus `aria-label` is what keeps it from being an unnamed focus stop.
          <pre
            tabIndex={0}
            role="region"
            aria-label="Authorization request URL"
            className="px-3 py-2 text-xs font-mono text-accent-text whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-code/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
          >
            {builtUrl}
          </pre>
        )}

        <div className="px-3 py-2 space-y-2 border-t border-edge-accent">
          {challengeEdited && (
            <Warning>
              <code>code_challenge</code> was edited by hand, so it no longer matches the verifier
              this page holds. The redirect will work and the <em>token exchange</em> will fail —
              which is exactly what PKCE is for. Regenerate to pair them again.
            </Warning>
          )}
          {jsonProblems.length > 0 && (
            <Warning>
              {jsonProblems.map((p) => p.name).join(', ')} is not valid JSON. Sending it anyway is
              fine — the server&apos;s complaint is worth reading — but it will not be accepted.
            </Warning>
          )}
          {enabledOf('request_uri') && effective('request_uri') && (
            <Warning tone="info">
              With <code>request_uri</code> the other parameters travel inside the pushed request.
              RFC 9126 expects <code>client_id</code> alongside it and little else — turn the rest
              off to see the canonical shape.
            </Warning>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={send} className="w-full sm:w-auto">
              <Send className="h-4 w-4 mr-2" />
              Send authorization request
            </Button>
            <a
              href={effectiveUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open in a new tab
            </a>
          </div>
          <p className="text-2xs text-muted-foreground">
            Sending navigates this tab to the URL above. The PKCE verifier and <code>state</code>{' '}
            are stored first, so the callback can complete the exchange and check the response.
          </p>
        </div>
      </div>
    </div>
  );
}

function Warning({
  children,
  tone = 'warn',
}: {
  children: React.ReactNode;
  tone?: 'warn' | 'info';
}) {
  return (
    <div
      className={cn(
        'flex gap-2 items-start rounded px-2 py-1.5 border',
        tone === 'warn' ? 'bg-tint-warning border-edge-warning' : 'bg-tint-info border-edge-info',
      )}
    >
      <AlertTriangle
        className={cn(
          'h-3.5 w-3.5 mt-0.5 shrink-0',
          tone === 'warn' ? 'text-warning-text' : 'text-info-text',
        )}
      />
      <p
        className={cn(
          'text-xs leading-relaxed',
          tone === 'warn' ? 'text-warning-text' : 'text-info-text',
        )}
      >
        {children}
      </p>
    </div>
  );
}

interface ParamRowProps {
  spec: AuthParamSpec;
  enabled: boolean;
  value: string;
  onToggle: (enabled: boolean) => void;
  onChange: (value: string) => void;
  onRegenerate?: () => void;
}

function ParamRow({ spec, enabled, value, onToggle, onChange, onRegenerate }: ParamRowProps) {
  const error = enabled ? jsonError(value) : null;
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
              className="w-full h-8 rounded-md border border-border bg-input px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          {error && <p className="text-2xs text-danger-text mt-1">Invalid JSON: {error}</p>}
        </div>
      )}
    </div>
  );
}

export { AuthorizeRequestBuilder };
