import { useState } from 'react';
import { jwtDecode, type JwtPayload } from 'jwt-decode';
import { useToken } from '@/context/TokenContext';
import { Badge } from '@/components/ui/Badge';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Copy, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Key } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/utils/cn';

function TokenVault() {
  const { tokenSet, clearTokens } = useToken();
  const [expanded, setExpanded] = useState(false);
  const [decodedIdToken, setDecodedIdToken] = useState<JwtPayload | null>(null);
  const { copy } = useClipboard();

  const hasTokens = tokenSet && (tokenSet.access_token || tokenSet.refresh_token || tokenSet.id_token);

  const decodeIdToken = () => {
    if (!tokenSet?.id_token) return;
    try {
      setDecodedIdToken(jwtDecode(tokenSet.id_token));
    } catch { /* ignore */ }
  };

  const tokenEntries = [
    { label: 'Access Token', value: tokenSet?.access_token, badge: 'success' as const },
    { label: 'Refresh Token', value: tokenSet?.refresh_token, badge: 'info' as const },
    { label: 'ID Token', value: tokenSet?.id_token, badge: 'default' as const },
  ];

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-transparent border-none cursor-pointer hover:bg-muted/30 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/10 text-indigo-400">
            <Key className="h-3 w-3" />
          </div>
          <span className="text-xs font-semibold text-foreground">Token Vault</span>
          {hasTokens && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasTokens && (
            <button
              onClick={(e) => { e.stopPropagation(); clearTokens(); }}
              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer bg-transparent border-none"
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
                    <div className={cn(
                      'font-mono text-[0.65rem] leading-relaxed text-muted-foreground break-all',
                      'bg-slate-950/50 rounded-md p-2 border border-border/30',
                    )}>
                      {entry.value.length > 100
                        ? `${entry.value.slice(0, 100)}…`
                        : entry.value}
                    </div>
                    {entry.label === 'ID Token' && (
                      <div className="flex gap-1">
                        <button
                          onClick={decodeIdToken}
                          className="flex items-center gap-1 text-[0.6rem] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer bg-transparent border-none"
                        >
                          {decodedIdToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          {decodedIdToken ? 'Hide decoded' : 'Decode'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {decodedIdToken && (
                <div className="pt-1">
                  <JsonBlock data={decodedIdToken} className="[&_pre]:text-[0.6rem] [&_pre]:p-2" />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { TokenVault };
