import { Plus, Trash2 } from 'lucide-react';
import { AUTH_PARAMS, PARAM_GROUPS } from '@/data/authParams';
import { AuthorizeParamRow } from './AuthorizeParamRow';
import { AuthorizeRequestPanel } from './AuthorizeRequestPanel';
import { useAuthorizeParams, type AuthorizeSendContext } from './use-authorize-params';

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
  onSend: (url: string, context: AuthorizeSendContext) => void;
}

function AuthorizeRequestBuilder({
  endpoint,
  seed,
  dpopThumbprint,
  onSend,
}: AuthorizeRequestBuilderProps) {
  const {
    customs,
    builtUrl,
    challengeEdited,
    enabledCount,
    jsonProblems,
    enabledOf,
    groupOpen,
    effective,
    toggleParam,
    editParam,
    toggleGroup,
    regenerate,
    addCustom,
    editCustom,
    removeCustom,
    sendContext,
  } = useAuthorizeParams({ endpoint, seed, dpopThumbprint });

  return (
    <div className="space-y-4">
      {PARAM_GROUPS.map((group) => {
        const specs = AUTH_PARAMS.filter((p) => p.group === group.id);
        const activeCount = specs.filter((p) => enabledOf(p.name)).length;
        const open = groupOpen(group.id);
        return (
          <div key={group.id} className="rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleGroup(group.id)}
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
                  <AuthorizeParamRow
                    key={spec.name}
                    spec={spec}
                    enabled={enabledOf(spec.name)}
                    value={effective(spec.name)}
                    onToggle={(enabled) => toggleParam(spec.name, enabled)}
                    onChange={(value) => editParam(spec.name, value)}
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
            onClick={addCustom}
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
                  onChange={(e) => editCustom(custom.id, { name: e.target.value })}
                  placeholder="name"
                  aria-label="Custom parameter name"
                  className="w-1/3 h-8 rounded-md border border-border bg-input px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  value={custom.value}
                  onChange={(e) => editCustom(custom.id, { value: e.target.value })}
                  placeholder="value"
                  aria-label="Custom parameter value"
                  className="flex-1 h-8 rounded-md border border-border bg-input px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => removeCustom(custom.id)}
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

      <AuthorizeRequestPanel
        builtUrl={builtUrl}
        enabledCount={enabledCount}
        jsonProblems={jsonProblems}
        challengeEdited={challengeEdited}
        requestUriActive={enabledOf('request_uri') && Boolean(effective('request_uri'))}
        sendContext={sendContext}
        onSend={onSend}
      />
    </div>
  );
}

export { AuthorizeRequestBuilder };
