import { useState, useMemo, useCallback, useEffect } from 'react';
import { AUTH_PARAMS, type ParamGroup } from '@/data/authParams';
import { createPkcePair, generateCodeChallenge } from '@/pkce';

/**
 * The authorization request as a parameter table, and the one URL derived from it.
 *
 * **Why this is separated from the rendering.** `AuthorizeRequestBuilder` was 705 lines holding two
 * unrelated things: a 24-row parameter table with a genuine state machine behind it, and ~350 lines of
 * accordion, custom-parameter and request-panel markup. Only the first has invariants, and every one of
 * them is a *derivation rule* rather than a stored value:
 *
 * - `effective` reads the user's edit if there is one and falls back to the seed. Copying the props into
 *   state through an effect is the anti-pattern this file originally had.
 * - `enabledOf` derives `dpop_jkt` from whether a thumbprint exists, and `groupOpen` derives the
 *   Extensions group from the same fact — with `touched` letting the user overrule both.
 * - `changeMethod` keeps the PKCE pair coherent across a `plain`/`S256` switch (RFC 7636 §4.2).
 * - `builtUrl` is the single source of truth, so the preview and the redirect cannot drift.
 *
 * Those four are what a reviewer of an authorization request needs to check, and they were previously
 * interleaved with markup. `AuthorizeRequestPanel` owns raw-URL mode and the send; this hook owns
 * nothing that renders.
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

/**
 * What the caller needs before the browser leaves: the PKCE verifier that matches the challenge in the
 * URL, and the `state` that was actually sent.
 *
 * One exported type rather than three inline shapes. `client-spa.md` records why: a local `as { … }`
 * restatement is what let `FapiSection` read `requestUri` from a body that had said `request_uri` since
 * T1-11. A rename here should be a compile error at every consumer.
 */
export interface AuthorizeSendContext {
  codeVerifier: string | null;
  state: string | null;
}

export interface CustomParam {
  id: string;
  name: string;
  value: string;
}

function isJsonish(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export function jsonError(value: string): string | null {
  if (!value.trim() || !isJsonish(value)) return null;
  try {
    JSON.parse(value);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid JSON';
  }
}

interface UseAuthorizeParamsOptions {
  endpoint: string;
  /** Seeds `client_id`, `redirect_uri` and `scope` from the section's own inputs. */
  seed: { clientId: string; redirectUri: string; scope: string };
  /** The DPoP thumbprint to offer for `dpop_jkt`, when a key has been generated. */
  dpopThumbprint?: string;
}

export function useAuthorizeParams({ endpoint, seed, dpopThumbprint }: UseAuthorizeParamsOptions) {
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

  const jsonProblems = AUTH_PARAMS.filter((p) => enabledOf(p.name) && jsonError(effective(p.name)));

  const enabledCount =
    AUTH_PARAMS.filter((p) => enabledOf(p.name) && effective(p.name) !== '').length +
    customs.filter((c) => c.name).length;

  /**
   * The three edits a row can make, named here rather than written inline in the accordion.
   *
   * `touched` is the reason these belong to the hook: a toggle is not "set a boolean", it is "record
   * that the user has taken this row off the derived path and then set the boolean". Splitting those two
   * statements across a file boundary is how the second one gets forgotten.
   */
  const toggleParam = useCallback(
    (name: string, enabled: boolean) => {
      setTouched((prev) => ({ ...prev, [`param:${name}`]: true }));
      setParam(name, { enabled });
    },
    [setParam],
  );

  const editParam = useCallback(
    (name: string, value: string) => {
      if (name === 'code_challenge') setChallengeEdited(true);
      if (name === 'code_challenge_method') {
        void changeMethod(value);
        return;
      }
      setParam(name, { value });
    },
    [changeMethod, setParam],
  );

  const toggleGroup = useCallback(
    (id: ParamGroup) => {
      setTouched((prev) => ({ ...prev, [`group:${id}`]: true }));
      setOpenGroups((prev) => ({ ...prev, [id]: !groupOpen(id) }));
    },
    [groupOpen],
  );

  const addCustom = useCallback(() => {
    setCustoms((prev) => [...prev, { id: crypto.randomUUID(), name: '', value: '' }]);
  }, []);

  const editCustom = useCallback((id: string, patch: Partial<Omit<CustomParam, 'id'>>) => {
    setCustoms((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeCustom = useCallback((id: string) => {
    setCustoms((prev) => prev.filter((c) => c.id !== id));
  }, []);

  /**
   * What the caller must persist before the browser leaves, computed at the moment of the send.
   *
   * **The verifier is only meaningful if the challenge in the URL actually derives from it.** A
   * hand-edited `code_challenge` therefore yields `null` rather than a verifier that will not match —
   * the redirect works and the *token exchange* fails, which is what PKCE is for, and storing a stale
   * verifier would turn that lesson into a confusing one.
   */
  const sendContext = useCallback(
    (): AuthorizeSendContext => ({
      codeVerifier: challengeEdited ? null : codeVerifier,
      state: enabledOf('state') ? effective('state') : null,
    }),
    [challengeEdited, codeVerifier, enabledOf, effective],
  );

  return {
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
  };
}
