import { useState } from 'react';
import { toast } from 'sonner';
import {
  AUTHORIZATION_ENDPOINT,
  CLIENT_ID,
  CLIENT_SECRET,
  DEFAULT_SCOPES,
  getRedirectUri,
} from '@/config';
import { generateKeyPair } from '@/services/dpop.service';
import { jwkThumbprint } from '@/services/crypto-utils';
import { SESSION_KEYS, readKey, writeKey, removeKey, clearDpopKeys } from '@/services/session-keys';
import { navigateTo } from '@/services/trace-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthorizeRequestBuilder } from './AuthorizeRequestBuilder';
import type { AuthorizeSendContext } from './use-authorize-params';
import { Checkbox } from '@/components/ui/Checkbox';

/**
 * The authorization-code grant: the only one of the five that leaves this tab.
 *
 * **Why the front channel gets its own file.** The other four grants are one `POST /api/token` with a
 * form body; this one generates a DPoP key, hands a thumbprint to the request builder, writes four
 * `sessionStorage` keys that `CallbackPage` will read, and then navigates the browser away. Nothing here
 * is shaped like the other four, and three of the defects this section has produced lived in exactly
 * these steps — a `kid` sent where RFC 9449 §10 requires a thumbprint, a secret that survived an
 * emptied field, and an invisible `private_key_jwt` mode set two sections away.
 *
 * **`active` renders nothing but keeps the state alive**, deliberately. The panel stays mounted while
 * another tab is showing, which is what the single 710-line component did implicitly: switching to
 * Client Credentials and back must not silently untick DPoP while the key it generated is still sitting
 * in session storage. An unmount-on-tab-change would recreate exactly the invisible-mode class of bug
 * the warning below exists to prevent.
 */
function AuthorizationCodePanel({ active }: { active: boolean }) {
  /**
   * Whether a FAPI signing key is sitting in this session — because if one is, the code exchange in
   * `CallbackPage` takes its `private_key_jwt` branch and sends `client_assertion` instead of whatever
   * is configured here. For a public client that is client-authentication data, refused with
   * `[A157303]`, and *nothing on this screen used to say so*: the key is written by the FAPI section
   * and read only by the callback. `clearTokens()` clears it, which made the mode resettable but not
   * visible — and a mode you cannot see is the thing that costs an afternoon.
   */
  const [signingKeyPresent, setSigningKeyPresent] = useState(() =>
    Boolean(readKey(SESSION_KEYS.fapiSigningKey)),
  );
  const forgetSigningKey = () => {
    removeKey(SESSION_KEYS.fapiSigningKey);
    removeKey(SESSION_KEYS.fapiSigningPublicKey);
    setSigningKeyPresent(false);
    toast.success('Signing key forgotten — the exchange will use this section\u2019s settings');
  };

  const [acId, setAcId] = useState(CLIENT_ID);
  const [acSecret, setAcSecret] = useState(CLIENT_SECRET);
  const [acRedirectUri, setAcRedirectUri] = useState(getRedirectUri());
  // `scope` used to come straight from the build-time constant with no input at all, which made the
  // single most-edited parameter in OAuth the one parameter this panel could not change.
  const [acScope, setAcScope] = useState(DEFAULT_SCOPES);
  /**
   * DPoP is now a choice. It used to be unconditional: `startAuthCode` always minted a key and the
   * callback always sent a proof, so every token from this panel came back sender-constrained
   * (`token_type: DPoP`) with nothing saying so — and the UserInfo and Grant Management sections then
   * presented it as `Bearer`, which RFC 9449 §7.2 requires the resource server to refuse. The default
   * flow produced a token half the app could not use.
   */
  const [acUseDpop, setAcUseDpop] = useState(false);
  const [acDpopThumbprint, setAcDpopThumbprint] = useState<string | undefined>(undefined);
  /**
   * Generate the DPoP key when the box is ticked, so `dpop_jkt` can be offered to the builder.
   *
   * RFC 9449 §10 binds the *authorization code* to the key, which closes the window in which a stolen
   * code could be redeemed by somebody else — so the thumbprint belongs in the authorization request,
   * not just at the token endpoint.
   */
  const toggleDpop = async (enabled: boolean) => {
    setAcUseDpop(enabled);
    if (!enabled) {
      setAcDpopThumbprint(undefined);
      // Also drops the cached `DPoP-Nonce`: a nonce is bound to the key that was proving possession,
      // so keeping it past the key it belonged to can only mislead the next request.
      clearDpopKeys();
      return;
    }
    try {
      const pair = await generateKeyPair();
      writeKey(SESSION_KEYS.dpopPrivateKey, JSON.stringify(pair.privateKey));
      writeKey(SESSION_KEYS.dpopPublicKey, JSON.stringify(pair.publicKey));
      /**
       * **Two different values, and this line is where they used to be one.**
       *
       * `kid` identifies the key and is what `generateP256KeyPair` derives — the digest of the exported
       * JWK, `key_ops` and `ext` and all. `dpop_jkt` is the **RFC 7638 thumbprint**, computed over
       * `crv`/`kty`/`x`/`y` alone in lexicographic order, and RFC 9449 §10 makes a mismatch a MUST
       * reject: *"the authorization server computes the JWK Thumbprint of the proof-of-possession
       * public key in the DPoP proof and verifies that it matches the `dpop_jkt` parameter value in the
       * authorization request. If they do not match, it MUST reject the request."*
       *
       * `setAcDpopThumbprint(pair.kid)` was here, which is a plausible-looking wrong answer: both are
       * base64url SHA-256 digests of "the key". It never broke anything only because `dpop_jkt` was
       * never actually reaching the request. Do not collapse these two lines back together.
       */
      writeKey(SESSION_KEYS.dpopKid, pair.kid);
      setAcDpopThumbprint(await jwkThumbprint(pair.publicKey));
    } catch (e: unknown) {
      setAcUseDpop(false);
      toast.error(e instanceof Error ? e.message : 'Failed to generate a DPoP key');
    }
  };

  /**
   * Persist what the callback will need, then navigate to the URL the builder actually shows.
   *
   * The verifier arrives from the builder rather than being generated here, because the challenge in
   * the URL is the builder's — regenerating one here would guarantee a mismatch. A `null` verifier
   * means the user edited the challenge by hand, so there is no matching verifier to store and the
   * exchange is *meant* to fail.
   */
  const sendAuthorizeRequest = (url: string, ctx: AuthorizeSendContext) => {
    if (ctx.codeVerifier) writeKey(SESSION_KEYS.pkceVerifier, ctx.codeVerifier);
    else removeKey(SESSION_KEYS.pkceVerifier);

    if (ctx.state) writeKey(SESSION_KEYS.oauthState, ctx.state);
    else removeKey(SESSION_KEYS.oauthState);

    writeKey(SESSION_KEYS.authzClientId, acId);
    /**
     * An emptied secret field must *remove* the stored secret, not leave the last one behind.
     *
     * With the old `if (acSecret) writeKey(...)` and no else branch, running the flow once with a
     * confidential client and then clearing the field meant `CallbackPage` still read a secret —
     * `readKey(authzClientSecret) || CLIENT_SECRET` — and sent `client_secret` for a client whose
     * method is `none`. Authlete refuses that with `[A157303]`, and the field the user was looking at
     * was empty. Absence has to be written down to be absent.
     */
    if (acSecret) writeKey(SESSION_KEYS.authzClientSecret, acSecret);
    else removeKey(SESSION_KEYS.authzClientSecret);

    navigateTo(url, 'authorize — front channel, browser leaves for the authorization endpoint');
  };

  if (!active) return null;

  return (
    <div className="space-y-3">
      {signingKeyPresent && (
        <div className="rounded-lg border border-edge-warning bg-tint-warning p-3 space-y-2">
          <p className="text-xs text-warning-text">
            A <strong>FAPI signing key</strong> is stored in this session, so the token exchange
            will authenticate with <code>private_key_jwt</code> — <code>client_assertion</code>{' '}
            instead of the credentials below. For a public client that is refused with{' '}
            <code>[A157303]</code>.
          </p>
          <Button size="sm" variant="secondary" onClick={forgetSigningKey}>
            Forget the signing key
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Client ID"
          value={acId}
          onChange={(e) => setAcId(e.target.value)}
          placeholder="Client identifier registered in Authlete"
          /*
            Q1(a), folded into Q1(b). The placeholder already said the value is "registered in Authlete"
            and vanished the moment anyone typed — which is precisely when they needed to know where a
            real one comes from. A hint persists, and is announced.

            **On this panel only, and that is a choice rather than an omission.** The same hint on all
            five grant forms is two wrapped lines of identical prose repeated five times, above the
            controls, on the screen the audit already called the worst on-ramp of the five. This is the
            default tab, so it is the one a first visit lands on — and the landing page at `/` now carries
            the same information in full, with the live value beside it.
          */
          hint="From your Authlete service, not chosen here. `VITE_CLIENT_ID` sets the default; Client Management lists the real ones."
        />
        <Input
          label="Client Secret"
          type="password"
          value={acSecret}
          onChange={(e) => setAcSecret(e.target.value)}
          placeholder="Used at the token endpoint, not here"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Redirect URI"
          value={acRedirectUri}
          onChange={(e) => setAcRedirectUri(e.target.value)}
          placeholder="Must match a registered redirect URI"
        />
        <Input
          label="Scope"
          value={acScope}
          onChange={(e) => setAcScope(e.target.value)}
          placeholder="openid profile email"
        />
      </div>

      <label className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 cursor-pointer">
        <Checkbox
          checked={acUseDpop}
          onChange={(e) => void toggleDpop(e.target.checked)}
          className="w-3.5 h-3.5 mt-0.5"
        />
        <span className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">Sender-constrain with DPoP</span> (RFC 9449)
          — generates a key, sends its thumbprint as{' '}
          <code className="text-accent-text">dpop_jkt</code>, and proves possession at the token
          endpoint. The token comes back as{' '}
          <code className="text-accent-text">token_type: DPoP</code> and must then be presented with
          the <code className="text-accent-text">DPoP</code> scheme, never{' '}
          <code className="text-accent-text">Bearer</code>.
        </span>
      </label>

      <AuthorizeRequestBuilder
        endpoint={AUTHORIZATION_ENDPOINT}
        seed={{ clientId: acId, redirectUri: acRedirectUri, scope: acScope }}
        dpopThumbprint={acUseDpop ? acDpopThumbprint : undefined}
        onSend={sendAuthorizeRequest}
      />
    </div>
  );
}

export { AuthorizationCodePanel };
