import { useState } from 'react';
import { toast } from 'sonner';
import { dcrService } from '@/services';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';
import { useTraces } from '@/hooks/useTraces';
import { sequenceProgress, type SequenceStepSpec } from '@/utils/sequence-progress';
import { useConfirmedAction } from '@/hooks/useConfirmedAction';
import { useCredentials } from '@/context/CredentialContext';

type DcrOp = 'register' | 'get' | 'update' | 'delete';

/** Every value `DcrOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = ['register', 'get', 'update', 'delete'] as const satisfies readonly DcrOp[];

const DEFAULT_METADATA = JSON.stringify(
  {
    client_name: 'My DCR Client',
    redirect_uris: ['http://localhost:3001/callback'],
    grant_types: ['AUTHORIZATION_CODE', 'REFRESH_TOKEN'],
    token_endpoint_auth_method: 'CLIENT_SECRET_BASIC',
  },
  null,
  2,
);

const DCR_OPS: { value: DcrOp; label: string }[] = [
  { value: 'register', label: 'Register' },
  { value: 'get', label: 'Get' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
];

/**
 * `register` is not one option of four — it is the one that makes the other three possible.
 *
 * RFC 7591 §3 registers the client and returns a **registration access token**; RFC 7592 §2.1–2.3 then
 * require that token for read, update and delete. So the three management operations are strictly
 * downstream of registration, and a row of peer tabs implied they were alternatives you could pick in
 * any order.
 */
const DCR_STEPS: SequenceStepSpec[] = [
  {
    id: 'register',
    label: 'Register',
    description: 'RFC 7591 §3: creates the client and mints its registration access token.',
    endpoint: '/api/client/dcr/register',
  },
  {
    id: 'get',
    label: 'Read',
    description: 'RFC 7592 §2.1: read it back with that token.',
    endpoint: '/api/client/dcr/get',
  },
  {
    id: 'update',
    label: 'Update',
    description: 'RFC 7592 §2.2: the metadata document must carry client_id.',
    endpoint: '/api/client/dcr/update',
  },
  {
    id: 'delete',
    label: 'Deregister',
    description: 'RFC 7592 §2.3: permanent, and the token dies with the client.',
    endpoint: '/api/client/dcr/delete',
  },
];

function DcrSection() {
  // The management credential is shared for the page rather than owned here: eight sections
  // held their own copy, and a route change unmounts a section, so it had to be retyped on
  // every navigation.
  const { clientId: authId, clientSecret: authSecret } = useCredentials();
  /**
   * The selected operation lives in the URL, so a specific step can be shared and Back undoes it.
   *
   * Was `useState`, which made a tab invisible to the address bar: *"look at what happened on the
   * introspection step"* could not be communicated, Back left the section rather than undoing the tab,
   * and a reload lost your place mid-protocol. `useUrlState` validates the incoming value against
   * `ALL_OPS`, so a hand-edited query cannot select a tab that does not exist.
   */
  const [activeOp, setActiveOp] = useUrlState<DcrOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();

  const [regJson, setRegJson] = useState(DEFAULT_METADATA);
  const [getClientId, setGetClientId] = useState('');
  const [getToken, setGetToken] = useState('');
  const [updateClientId, setUpdateClientId] = useState('');
  const [updateToken, setUpdateToken] = useState('');
  const [updateJson, setUpdateJson] = useState('');
  const [deleteClientId, setDeleteClientId] = useState('');
  const [deleteToken, setDeleteToken] = useState('');

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('dcr', activeOp) : undefined;
  const traces = useTraces();
  const progress = sequenceProgress(DCR_STEPS, traces);
  const { confirm, dialog } = useConfirmedAction();

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      if (activeOp === 'register') {
        // T1-11: the server now returns RFC 7591 §3.2.1's registration response as the body, so there is no
        // vendor envelope to unwrap. The `responseContent` branch this replaced existed only because the body
        // used to be Authlete's envelope with the real response nested inside it — and the camelCase
        // fallbacks existed because it was ambiguous which you would get.
        const parsed = data as Record<string, unknown>;
        const clientId = (parsed.client_id || '') as string;
        const regAccessToken = (parsed.registration_access_token || '') as string;
        if (clientId) {
          setGetClientId(clientId);
          setUpdateClientId(clientId);
          setDeleteClientId(clientId);
        }
        if (regAccessToken) {
          setGetToken(regAccessToken);
          setUpdateToken(regAccessToken);
          setDeleteToken(regAccessToken);
        }
      }
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel
      title="Dynamic Client Registration (RFC 7591)"
      description="Register and manage clients dynamically"
    >
      <AdminAuth label="Admin" />

      {error && <ErrorExplainer error={error} className="mb-3" />}

      {/* The sequence, above the tabs that select a step in it. `FlowDiagram` and the progress


          derivation both already existed and were applied to 3 of 20 sections; this is one of the


          eight that rendered an ordered protocol as a row of peers. */}

      <FlowDiagram
        steps={DCR_STEPS}

        currentStep={progress.currentStep}

        completedSteps={progress.completedSteps}

        className="mb-3"
      />

      <TabBar options={DCR_OPS} value={activeOp} onChange={setActiveOp} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'register' && (
        <div className="space-y-3">
          <Textarea
            label="Client Metadata (JSON)"
            rows={10}
            value={regJson}
            onChange={(e) => setRegJson(e.target.value)}
            placeholder='{"client_name":"My App","redirect_uris":["http://localhost:3001/callback"],"grant_types":["AUTHORIZATION_CODE"]}'
          />
          <Button
            onClick={() => handleCall(() => dcrService.dcrRegister({ json: regJson }, auth))}
            loading={loading}
          >
            Run
          </Button>
        </div>
      )}

      {activeOp === 'get' && (
        <div className="space-y-3">
          <Input
            label="Client ID"
            value={getClientId}
            onChange={(e) => setGetClientId(e.target.value)}
            placeholder="client_id from registration"
          />
          <Input
            label="Registration Access Token"
            value={getToken}
            onChange={(e) => setGetToken(e.target.value)}
            placeholder="registration_access_token from registration"
          />
          <Button
            onClick={() => handleCall(() => dcrService.dcrGet(getToken, getClientId))}
            loading={loading}
          >
            Run
          </Button>
        </div>
      )}

      {activeOp === 'update' && (
        <div className="space-y-3">
          <Input
            label="Client ID"
            value={updateClientId}
            onChange={(e) => setUpdateClientId(e.target.value)}
            placeholder="client_id from registration"
          />
          <Input
            label="Registration Access Token"
            value={updateToken}
            onChange={(e) => setUpdateToken(e.target.value)}
            placeholder="registration_access_token from registration"
          />
          <Textarea
            label="Updated Client Metadata (JSON)"
            rows={10}
            value={updateJson}
            onChange={(e) => setUpdateJson(e.target.value)}
            placeholder='{"client_name":"Updated Name","redirect_uris":["http://localhost:3001/callback"]}'
          />
          <Button
            onClick={() =>
              handleCall(() => dcrService.dcrUpdate(updateJson, updateToken, updateClientId))
            }
            loading={loading}
          >
            Run
          </Button>
        </div>
      )}

      {activeOp === 'delete' && (
        <div className="space-y-3">
          <Input
            label="Client ID"
            value={deleteClientId}
            onChange={(e) => setDeleteClientId(e.target.value)}
            placeholder="client_id from registration"
          />
          <Input
            label="Registration Access Token"
            value={deleteToken}
            onChange={(e) => setDeleteToken(e.target.value)}
            placeholder="registration_access_token from registration"
          />
          {/* RFC 7592 §2.3 deregistration is permanent at the authorization server. Same reasoning as
              Client Management: the identifier has to be typed back before the button will fire. */}
          <Button
            variant="danger"
            disabled={!deleteClientId.trim() || !deleteToken.trim()}
            onClick={() =>
              confirm({
                title: 'Deregister this client permanently?',
                body: `Client ${deleteClientId} will be deleted at the authorization server (RFC 7592 §2.3). Its registration access token dies with it, so this cannot be undone from here.`,
                confirmLabel: 'Deregister client',
                requireTyped: deleteClientId.trim(),
                run: () => handleCall(() => dcrService.dcrDelete(deleteToken, deleteClientId)),
              })
            }
            loading={loading}
          >
            Delete
          </Button>
        </div>
      )}

      {dialog}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { DcrSection };
