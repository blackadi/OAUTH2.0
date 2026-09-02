import { useState } from 'react';
import { useToken } from '@/context/TokenContext';
import { Badge } from '@/components/ui/Badge';
import { JwtInspector } from '@/components/ui/JwtInspector';
import { Copy, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Key } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/utils/cn';

interface TokenVaultProps {
  /**
   * Start with the token list showing.
   *
   * Collapsed is right in the sidebar footer and in the mobile drawer, where the vault is one item among
   * others competing for a small space. It is wrong in the evidence rail's Tokens tab, where the tab
   * *is* the request to see the tokens — asking for them twice is a click that carries no information.
   */
  defaultExpanded?: boolean;
}

function TokenVault({ defaultExpanded = false }: TokenVaultProps) {
  const { tokenSet, clearTokens } = useToken();
  const [expanded, setExpanded] = useState(defaultExpanded);
  /**
   * Which token is open in the inspector. It used to be an ID-token-only payload decode via
   * `jwt-decode` — no header, no signature check, and no way to look at an access token at all, though
   * this server can issue JWT access tokens and `createLocalToken` exists to hand you one.
   */
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const { copy } = useClipboard();

  const hasTokens =
    tokenSet && (tokenSet.access_token || tokenSet.refresh_token || tokenSet.id_token);

  const tokenEntries = [
    // A refresh token is opaque by design, so it gets no inspector.
    {
      label: 'Access Token',
      value: tokenSet?.access_token,
      badge: 'success' as const,
      inspectable: true,
    },
    {
      label: 'Refresh Token',
      value: tokenSet?.refresh_token,
      badge: 'info' as const,
      inspectable: false,
    },
    { label: 'ID Token', value: tokenSet?.id_token, badge: 'default' as const, inspectable: true },
  ];

  return (
    /*
      A flex column whose *body* scrolls, not the card.

      The sidebar bounds this at half the rail (see `Sidebar`), and the obvious way to honour that — let
      the container scroll — pushed the "Token Vault" title and the Clear control out of view the moment
      the JWT inspector opened, because clicking Inspect scrolls the inspector into the container. The
      header is what tells you which surface you are looking at, so it is `shrink-0` and the list below
      it takes the overflow. In the mobile drawer there is no bounding height, so nothing here scrolls
      and the drawer scrolls as before.
    */
    <div className="flex flex-col min-h-0 rounded-lg border border-border/60 bg-card overflow-hidden">
      {/*
        Two sibling buttons in a row, not one nested inside the other.

        The Clear control used to sit *inside* the expand `<button>`, which is invalid HTML: the parser
        hoists the inner button out of the outer one, so the rendered DOM is not the authored tree and
        keyboard and assistive-technology behaviour is undefined. `e.stopPropagation()` patched the mouse
        click and nothing else. This is the sidebar header, so it was on every one of the 20 routes.
      */}
      <div className="flex items-stretch shrink-0">
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-2.5 bg-transparent border-none cursor-pointer hover:bg-muted/30 transition-colors text-left"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-tint-accent text-accent-text shrink-0">
              <Key className="h-3 w-3" />
            </span>
            <span className="text-xs font-semibold text-foreground truncate">Token Vault</span>
            {hasTokens && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-success-text shrink-0"
                title="Tokens held in this session"
              />
            )}
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </button>
        {hasTokens && (
          <button
            onClick={() => setConfirmingClear(true)}
            className="px-2 shrink-0 rounded text-muted-foreground hover:text-danger-text hover:bg-tint-danger transition-colors cursor-pointer bg-transparent border-none"
            aria-label="Clear tokens"
            title="Clear every token and key in this session"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/*
        The vault clear is local-only, so it gets a plain confirm rather than the typed confirmation the
        live-Authlete deletions use — but it does clear *more* than the three tokens on screen
        (`resetSession` enumerates all 13 session keys, DPoP and signing keys included), which is worth
        stating before it happens.
      */}
      <ConfirmDialog
        open={confirmingClear}
        title="Clear the token vault?"
        body="This removes every token in this session and also the DPoP key pair, the cached DPoP nonce and any stored private_key_jwt signing key. Nothing is revoked at the authorization server — the tokens stay valid until they expire."
        confirmLabel="Clear session"
        onConfirm={() => {
          clearTokens();
          setConfirmingClear(false);
        }}
        onCancel={() => setConfirmingClear(false)}
      />

      {expanded && (
        <div className="px-3 pb-3 space-y-2 min-h-0 overflow-y-auto">
          {!hasTokens ? (
            <p className="text-2xs text-muted-foreground text-center py-3">
              No tokens yet. Run an authorization flow to get started.
            </p>
          ) : (
            <>
              {tokenEntries.map((entry) => {
                if (!entry.value) return null;

                return (
                  <div key={entry.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant={entry.badge}>{entry.label}</Badge>
                      <button
                        onClick={() => copy(entry.value!)}
                        className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                    <div
                      className={cn(
                        'font-mono text-2xs leading-relaxed text-muted-foreground break-all',
                        'bg-code/50 rounded-md p-2 border border-border/30',
                      )}
                    >
                      {entry.value.length > 100 ? `${entry.value.slice(0, 100)}…` : entry.value}
                    </div>
                    {entry.inspectable && (
                      <div className="flex gap-1">
                        <button
                          onClick={() =>
                            setInspecting((current) =>
                              current === entry.label ? null : entry.label,
                            )
                          }
                          className="flex items-center gap-1 text-2xs text-accent-text hover:text-accent-text transition-colors cursor-pointer bg-transparent border-none"
                        >
                          {inspecting === entry.label ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          {inspecting === entry.label ? 'Hide' : 'Inspect'}
                        </button>
                      </div>
                    )}
                    {inspecting === entry.label && (
                      <JwtInspector token={entry.value!} defaultOpen className="mt-1" />
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { TokenVault };
