import { useMemo, useState } from 'react';
import { useToken } from '@/context/TokenContext';
import { JwtInspector } from '@/components/ui/JwtInspector';
import { Button } from '@/components/ui/Button';

/**
 * Decode and verify any JWS, including one this app never issued.
 *
 * **Why this exists at all.** Every inspector in the app was bound to a token the app happened to be
 * holding — the vault's three, the callback's ID token, a DPoP proof mid-flow. So the commonest thing a
 * person actually does with an OAuth debugger, *paste the token that is failing and find out why*, was
 * the one thing this one could not do. `JwtInspector` was already general (it decodes ID tokens, JWT
 * access tokens, DPoP proofs, request objects, logout tokens and client assertions, and verifies against
 * the live JWKS); it just had no surface where you could hand it something.
 *
 * The two buttons are not a shortcut for the impatient. Pasting from the vault means copying a value out
 * of one pane and into another with no guarantee you copied all of it, and a truncated JWS reports as
 * *undecodable*, which reads as a defect in the token rather than in the paste.
 */
function JwsScratchpad() {
  const { tokenSet } = useToken();
  const [raw, setRaw] = useState('');

  /**
   * Normalised before it reaches the decoder, because of where these strings come from.
   *
   * A JWS copied out of a log, a header or a terminal arrives wrapped in newlines, sometimes with the
   * `Authorization` scheme still attached and sometimes in quotes. All three decode as "not a JWS", and
   * a tool that says *"expected 3 dot-separated parts, got 1"* about `Bearer eyJ…` has technically told
   * the truth and taught nothing.
   */
  const token = useMemo(
    () =>
      raw
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/^(Bearer|DPoP)\s+/i, '')
        .replace(/\s+/g, ''),
    [raw],
  );

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 space-y-2 p-3 border-b border-border">
        <label htmlFor="jws-scratchpad" className="block text-2xs text-muted-foreground">
          Paste any JWS — an ID token, a JWT access token, a DPoP proof, a request object, a client
          assertion. Nothing is sent anywhere; the decode is local and the signature check fetches
          only this server&rsquo;s JWK Set.
        </label>
        <textarea
          id="jws-scratchpad"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder="eyJhbGciOiJFUzI1NiIsImtpZCI6IjEifQ.eyJpc3MiOi…"
          className="w-full resize-y rounded-md border border-border bg-input px-2 py-1.5 font-mono text-2xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap gap-1.5">
          {/*
            Only offered when there is something to offer. A button that fills a textarea with
            `undefined` is worse than an absent one, and a refresh token is opaque by design — there is
            no header, no claims and nothing to verify, which is a fact worth not implying otherwise.
          */}
          {tokenSet?.id_token && (
            <Button size="sm" variant="outline" onClick={() => setRaw(tokenSet.id_token ?? '')}>
              Use ID token
            </Button>
          )}
          {tokenSet?.access_token && (
            <Button size="sm" variant="outline" onClick={() => setRaw(tokenSet.access_token ?? '')}>
              Use access token
            </Button>
          )}
          {raw && (
            <Button size="sm" variant="ghost" onClick={() => setRaw('')}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {token ? (
          <JwtInspector token={token} defaultOpen />
        ) : (
          <p className="text-2xs text-muted-foreground leading-relaxed">
            An opaque access token has no header and no claims — this deployment issues those unless
            the service is configured for JWT access tokens, and &ldquo;not a decodable JWT&rdquo;
            is the correct answer for one rather than a failure.
          </p>
        )}
      </div>
    </div>
  );
}

export { JwsScratchpad };
