import { useState, useId } from 'react';
import { toast } from 'sonner';
import {
  HSK_CREATE_ENDPOINT,
  HSK_LIST_ENDPOINT,
  HSK_GET_ENDPOINT,
  HSK_DELETE_ENDPOINT,
} from '@/config';
import { useCredentials } from '@/context/CredentialContext';
import { hskService, type HskCreateBody } from '@/services';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { useConfirmedAction } from '@/hooks/useConfirmedAction';
import { TabBar } from '@/components/ui/TabBar';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import '@/styles/transcript.css';

/**
 * Hardware Security Keys — a vendor feature, not a specification. No OAuth or OIDC document defines an
 * HSK API; these four endpoints wrap `authleteApi.hardwareSecurityKeys.*`, and the concept — a key
 * *handle* held in an HSM, referenced rather than exported — is the same one Modules 00 and 05 teach
 * about signing keys and `kid`. Nothing else in this repo consumes them; they exist so the surface is
 * reachable and inspectable, which is the reason this section exists: the client had no caller for any
 * of the four routes at all.
 *
 * **Admin-gated**, the same posture as DCR, Federation registration and Native SSO.
 *
 * **Delete is genuinely destructive**, and not only in the usual "this app forgets it" sense every other
 * confirmed action here has: it removes the key handle **at the Authlete service**, not merely from this
 * server. Anything configured to sign with that handle stops being able to. `docs/API.md` states this
 * plainly, and the confirmation dialog quotes it rather than softening it.
 */

type HskOp = 'create' | 'list' | 'get' | 'delete';
const ALL_OPS = ['create', 'list', 'get', 'delete'] as const satisfies readonly HskOp[];
const OPS: { value: HskOp; label: string }[] = [
  { value: 'create', label: 'Create' },
  { value: 'list', label: 'List' },
  { value: 'get', label: 'Get' },
  { value: 'delete', label: 'Delete' },
];

const OP_ENDPOINT: Record<HskOp, string> = {
  create: HSK_CREATE_ENDPOINT,
  list: HSK_LIST_ENDPOINT,
  get: `${HSK_GET_ENDPOINT}/:handle`,
  delete: `${HSK_DELETE_ENDPOINT}/:handle`,
};

const OP_METHOD: Record<HskOp, string> = {
  create: 'POST',
  list: 'GET',
  get: 'GET',
  delete: 'DELETE',
};

function HskSection() {
  const { basicAuth: auth, isComplete } = useCredentials();
  const [activeOp, setActiveOp] = useUrlState<HskOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();
  const { confirm, dialog } = useConfirmedAction();
  const uid = useId();

  const [kty, setKty] = useState('EC');
  const [hsmName, setHsmName] = useState('');
  const [use, setUse] = useState('');
  const [kid, setKid] = useState('');
  const [alg, setAlg] = useState('');

  const [getHandle, setGetHandle] = useState('');
  const [deleteHandle, setDeleteHandle] = useState('');

  const doc = activeOp ? getDoc('hsk', activeOp) : undefined;

  const createBody: HskCreateBody = {
    kty,
    hsmName,
    ...(use ? { use } : {}),
    ...(kid ? { kid } : {}),
    ...(alg ? { alg } : {}),
  };

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) toast.success(`${activeOp} completed`);
    else toast.error(err);
  };

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Hardware Security Keys</h1>
        <span className="tx-ref">Authlete vendor extension — no OAuth/OIDC spec</span>
      </header>

      <p className="tx-standfirst">
        A key held in an HSM (Hardware Security Module) is referenced by an opaque{' '}
        <code>handle</code> rather than exported — Authlete signs or decrypts with it on your
        behalf, and the private key material never leaves the module.
      </p>

      <TabBar options={OPS} value={activeOp} onChange={setActiveOp} />

      <div className="tx-body">
        {error && <ErrorExplainer error={error} className="mb-3" />}
        {activeOp && doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div className="tx-turn" data-dir="out">
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">1 · Client → Server</span>
              <span className="tx-turn-note">
                {OP_METHOD[activeOp]} {OP_ENDPOINT[activeOp]}
              </span>
            </div>

            <AdminAuth label="Admin" />

            {activeOp === 'create' && (
              <>
                <div className="tx-row">
                  <label className="tx-field" htmlFor={`${uid}-kty`}>
                    <span className="tx-label">kty (REQUIRED)</span>
                    <select
                      id={`${uid}-kty`}
                      className="tx-select"
                      value={kty}
                      onChange={(e) => setKty(e.target.value)}
                    >
                      <option value="EC">EC</option>
                      <option value="RSA">RSA</option>
                    </select>
                  </label>
                  <label className="tx-field" htmlFor={`${uid}-hsmname`}>
                    <span className="tx-label">hsmName (REQUIRED)</span>
                    <input
                      id={`${uid}-hsmname`}
                      className="tx-input"
                      value={hsmName}
                      onChange={(e) => setHsmName(e.target.value)}
                      placeholder="google"
                    />
                  </label>
                </div>
                <div className="tx-row">
                  <label className="tx-field" htmlFor={`${uid}-use`}>
                    <span className="tx-label">use (optional)</span>
                    <select
                      id={`${uid}-use`}
                      className="tx-select"
                      value={use}
                      onChange={(e) => setUse(e.target.value)}
                    >
                      <option value="">(unset)</option>
                      <option value="sig">sig — sign / verify</option>
                      <option value="enc">enc — encrypt / decrypt</option>
                    </select>
                  </label>
                  <label className="tx-field" htmlFor={`${uid}-kid`}>
                    <span className="tx-label">kid (optional)</span>
                    <input
                      id={`${uid}-kid`}
                      className="tx-input"
                      value={kid}
                      onChange={(e) => setKid(e.target.value)}
                      placeholder="hsm-signer-1"
                    />
                  </label>
                </div>
                <label className="tx-field" htmlFor={`${uid}-alg`}>
                  <span className="tx-label">alg (optional)</span>
                  <input
                    id={`${uid}-alg`}
                    className="tx-input"
                    value={alg}
                    onChange={(e) => setAlg(e.target.value)}
                    placeholder="ES256, RS256, PS256, RSA-OAEP-256..."
                  />
                </label>
                <p className="tx-hint">
                  This deployment has no real HSM behind it, so a genuine create call is expected to
                  fail — what it fails <em>with</em> is the interesting part: Authlete&apos;s own
                  validation of <code>kty</code>/<code>use</code>/<code>alg</code> compatibility
                  runs before it ever reaches a module that isn&apos;t there.
                </p>

                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => hskService.hskCreate(createBody, auth))}
                    disabled={loading || !isComplete || !kty.trim() || !hsmName.trim()}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Create
                  </button>
                </div>
              </>
            )}

            {activeOp === 'list' && (
              <div className="tx-actions">
                <button
                  type="button"
                  className="tx-btn tx-btn-primary"
                  onClick={() => handleCall(() => hskService.hskList(auth))}
                  disabled={loading || !isComplete}
                >
                  {loading && <span className="tx-spin" aria-hidden="true" />}
                  List Keys
                </button>
              </div>
            )}

            {activeOp === 'get' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-get-handle`}>
                  <span className="tx-label">handle (REQUIRED)</span>
                  <input
                    id={`${uid}-get-handle`}
                    className="tx-input"
                    value={getHandle}
                    onChange={(e) => setGetHandle(e.target.value)}
                    placeholder="From a Create or List response"
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => hskService.hskGet(getHandle.trim(), auth))}
                    disabled={loading || !isComplete || !getHandle.trim()}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Get
                  </button>
                </div>
              </>
            )}

            {activeOp === 'delete' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-del-handle`}>
                  <span className="tx-label">handle (REQUIRED)</span>
                  <input
                    id={`${uid}-del-handle`}
                    className="tx-input"
                    value={deleteHandle}
                    onChange={(e) => setDeleteHandle(e.target.value)}
                    placeholder="From a Create or List response"
                  />
                </label>
                <div className="rounded-lg border border-edge-danger bg-tint-danger p-2 text-xs text-danger-text">
                  Removes the key handle at the Authlete service, not just from this server.
                  Anything configured to sign or decrypt with it stops being able to — there is no
                  undo.
                </div>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn"
                    disabled={loading || !isComplete || !deleteHandle.trim()}
                    onClick={() =>
                      confirm({
                        title: 'Delete this key handle permanently?',
                        body: `Handle ${deleteHandle.trim()} will be removed at the Authlete service. If anything was configured to sign or decrypt with it, that stops working. This cannot be undone from here.`,
                        confirmLabel: 'Delete handle',
                        requireTyped: deleteHandle.trim(),
                        run: () =>
                          handleCall(() => hskService.hskDelete(deleteHandle.trim(), auth)),
                      })
                    }
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {dialog}

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div
            className="tx-turn"
            data-dir={result ? 'in' : undefined}
            data-state={result ? 'landed' : 'pending'}
          >
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">2 · Server → Client</span>
            </div>
            {result ? (
              <JsonBlock data={result} label="Response" />
            ) : (
              <div className="tx-waiting">
                {activeOp === 'delete' ? 'Nothing deleted yet.' : 'Nothing sent yet.'}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export { HskSection };
