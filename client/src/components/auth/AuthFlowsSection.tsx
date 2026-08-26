import { useMemo } from 'react';
import { toast } from 'sonner';
import { useToken } from '@/context/TokenContext';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { useTraces } from '@/hooks/useTraces';
import { authorizationCodeProgress, twoStepProgress } from '@/utils/flow-progress';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { TokenOutcome } from '@/components/ui/TokenOutcome';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { SplitPane } from '@/components/ui/SplitPane';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { AuthorizationCodePanel } from './AuthorizationCodePanel';
import { BackChannelGrantPanels } from './BackChannelGrantPanels';
import { GRANTS, GRANT_VALUES, flowSteps, type GrantType } from './grant-flows';
import { getDoc } from '@/data/operationDocs';
import { KeyRound, ArrowRightLeft, LogIn, RefreshCw, FileText } from 'lucide-react';
import type { TokenResponse } from '@/types';
import { SESSION_KEYS, readKey, writeKey, removeKey } from '@/services/session-keys';
import { useUrlState } from '@/hooks/useUrlState';

/**
 * Five grant types, one result pane, and the progress read out of the request trace.
 *
 * **What is left here after the split is what is genuinely this section's**: the tab, the flow diagram,
 * the shared `useAsyncCall`, and the one place that records which client a token belongs to. The two
 * panels below it divide on the line the diagram is trying to teach — `AuthorizationCodePanel` is the
 * front channel, `BackChannelGrantPanels` is the four that stay in the tab. Both are rendered
 * unconditionally and each returns nothing when it is not the selected grant, so switching tabs does not
 * discard what was typed on the other one.
 */

const grantIcons: Record<GrantType, React.ReactNode> = {
  authorization_code: <KeyRound className="h-4 w-4" />,
  client_credentials: <ArrowRightLeft className="h-4 w-4" />,
  password: <LogIn className="h-4 w-4" />,
  refresh_token: <RefreshCw className="h-4 w-4" />,
  jwt_bearer: <FileText className="h-4 w-4" />,
};

const AuthFlowsSection: React.FC = () => {
  const { tokenSet, setTokenSet } = useToken();
  /**
   * The selected grant lives in the URL, so *"look at the refresh-token flow"* is a link.
   *
   * This was the last `TabBar` in the app still holding its selection in `useState` — nine other
   * sections moved to `?op=` and the headline one was missed, which is the one people actually send each
   * other. `useUrlState` validates the incoming value against `GRANT_VALUES`, so a hand-edited
   * `?op=nonsense` falls back to the authorization-code tab rather than indexing `flowSteps` with a key
   * that does not exist.
   */
  const [grantType, setGrantType] = useUrlState<GrantType>(
    'op',
    GRANT_VALUES,
    'authorization_code',
  );
  const { loading, result, error, call } = useAsyncCall<TokenResponse>();
  const displayResult = result || tokenSet;
  const doc = getDoc('auth-flows', grantType);

  /**
   * Progress read out of the request trace rather than tracked in state.
   *
   * `FlowDiagram` has always supported `completedSteps` and no call site ever passed one, so every step
   * was drawn pending and the diagram jumped straight to the last once a token existed. Deriving it from
   * the traffic means the diagram cannot claim a step that produced no request, and it survives the
   * authorization redirect — which takes the user out of this page entirely and brings them back.
   */
  const traces = useTraces();
  const progress = useMemo(() => {
    const hasToken = Boolean(displayResult);
    if (grantType === 'authorization_code') {
      return authorizationCodeProgress({
        traces,
        hasToken,
        codeReceived: Boolean(readKey(SESSION_KEYS.pkceVerifier)) && hasToken,
        authorizeSent: Boolean(readKey(SESSION_KEYS.oauthState)),
      });
    }
    return twoStepProgress({ traces, hasToken }, flowSteps[grantType][0].id);
  }, [traces, displayResult, grantType]);

  /**
   * Record which client the current token belongs to — and **clear the secret when there isn't one**.
   *
   * This was `if (clientSecret) writeKey(...)` with no else branch, so emptying the field left the
   * previous run's secret in session storage. Sections that pre-fill from `activeClientSecret` then
   * offered a credential the user had deliberately removed. Same shape, same cause and same fix as
   * `sendAuthorizeRequest` below; a write with no else branch is exactly the invisible mode that
   * `session-keys.ts` was created to end.
   */
  const saveClientCredentials = (clientId: string, clientSecret: string) => {
    writeKey(SESSION_KEYS.activeClientId, clientId);
    if (clientSecret) writeKey(SESSION_KEYS.activeClientSecret, clientSecret);
    else removeKey(SESSION_KEYS.activeClientSecret);
  };

  const handleCall = async (
    clientId: string,
    clientSecret: string,
    fn: () => Promise<TokenResponse>,
  ) => {
    const { data, error: err } = await call(fn);
    if (data) {
      setTokenSet(data);
      saveClientCredentials(clientId, clientSecret);
      toast.success('Token obtained successfully');
    } else {
      toast.error(err);
    }
  };
  return (
    <SectionPanel
      title="Authorization Flows"
      description="Test OAuth 2.0 grant types against the Authlete authorization server"
      icon={grantIcons[grantType]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabBar options={GRANTS} value={grantType} onChange={setGrantType} />
        </div>

        <FlowDiagram
          steps={flowSteps[grantType]}
          currentStep={progress.currentStep}
          completedSteps={progress.completedSteps}
          className="py-2"
        />

        {error && <ErrorExplainer error={error} />}

        {doc && <OperationDescription doc={doc} />}

        <SplitPane
          leftLabel="Configuration"
          rightLabel={displayResult ? 'Response' : ''}
          left={
            <div className="space-y-4">
              <AuthorizationCodePanel active={grantType === 'authorization_code'} />
              <BackChannelGrantPanels
                grantType={grantType}
                loading={loading}
                initialRefreshToken={tokenSet?.refresh_token || ''}
                onSubmit={handleCall}
              />
            </div>
          }
          right={
            displayResult ? (
              /* Was a bare `JsonBlock`. The flow completed and the tool went quiet — no statement of
                 what was now held, no inspector for the ID token it had just obtained, and nothing
                 saying where to spend it. See `TokenOutcome`. */
              <TokenOutcome tokens={displayResult} />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[120px] rounded-lg border border-dashed border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">Run a flow to see the response here</p>
              </div>
            )
          }
        />
      </div>
    </SectionPanel>
  );
};

export default AuthFlowsSection;
