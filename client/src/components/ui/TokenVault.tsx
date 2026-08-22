import { useState } from 'react';
import { useToken } from '@/context/TokenContext';
import { Badge } from '@/components/ui/Badge';
import { JwtInspector } from '@/components/ui/JwtInspector';
import { Copy, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Key } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/utils/cn';

function TokenVault() {
  const { tokenSet, clearTokens } = useToken();
  const [expanded, setExpanded] = useState(false);
  /**
   * Which token is open in the inspector. It used to be an ID-token-only payload decode via
   * `jwt-decode` — no header, no signature check, and no way to look at an access token at all, though
   * this server can issue JWT access tokens and `createLocalToken` exists to hand you one.
   */
  const [inspecting, setInspecting] = useState<string | null>(null);
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
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-transparent border-none cursor-pointer hover:bg-muted/30 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/10 text-accent-text">
            <Key className="h-3 w-3" />
          </div>
          <span className="text-xs font-semibold text-foreground">Token Vault</span>
          {hasTokens && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
        </div>
        <div className="flex items-center gap-1">
          {hasTokens && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearTokens();
              }}
              className="p-1 rounded text-muted-foreground hover:text-danger-text hover:bg-red-500/10 transition-colors cursor-pointer bg-transparent border-none"
              aria-label="Clear tokens"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {!hasTokens ? (
            <p className="text-[0.65rem] text-muted-foreground text-center py-3">
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
                        className="flex items-center gap-1 text-[0.6rem] text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                    <div
                      className={cn(
                        'font-mono text-[0.65rem] leading-relaxed text-muted-foreground break-all',
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
                          className="flex items-center gap-1 text-[0.6rem] text-accent-text hover:text-accent-text transition-colors cursor-pointer bg-transparent border-none"
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
