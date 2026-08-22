import { useState } from 'react';
import { toast } from 'sonner';
import { useToken } from '@/context/TokenContext';
import { tokenService } from '@/services';
import { AUTHORIZATION_ENDPOINT, CLIENT_ID, DEFAULT_SCOPES, getRedirectUri } from '@/config';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { ShieldAlert, ArrowUpCircle } from 'lucide-react';
import { getDoc } from '@/data/operationDocs';
import { parseJsonObject, stringMember } from '@/utils/parse-json';
import { useCredentials } from '@/context/CredentialContext';

interface StepUpChallenge {
  error: string;
  error_description?: string;
  acr_values?: string;
  max_age?: string;
  acr?: string;
  auth_time?: number;
}

const flowSteps = [
  { id: 'introspect', label: 'Introspect' },
  { id: 'challenge', label: 'Challenge' },
  { id: 'reauth', label: 'Re-Auth' },
  { id: 'newtoken', label: 'New Token' },
];

function StepUpSection() {
  // Was an inline literal, which kept it out of the one registry every other section reads from.
  const doc = getDoc('step-up', 'introspect');
  const { tokenSet } = useToken();
  const at = tokenSet?.access_token;
  const { loading, result, error, call } = useAsyncCall();

  const [requiredAcrs, setRequiredAcrs] = useState('urn:mace:incommon:iap:silver');
  const [maxAge, setMaxAge] = useState('');
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);

  // The introspection endpoint is protected (RFC 7662 §2.1) — this flow drives it, so it needs the
  // deployment's admin credentials.
  // The management credential is shared for the page rather than owned here: eight sections
  // held their own copy, and a route change unmounts a section, so it had to be retyped on
  // every navigation.
  const { clientId: adminId, clientSecret: adminSecret } = useCredentials();

  const handleIntrospect = async () => {
    setChallenge(null);
    const { data, error: err } = await call(async () => {
      const opts: { acrValues?: string; maxAge?: number } = {};
      if (requiredAcrs.trim()) opts.acrValues = requiredAcrs.trim();
      if (maxAge.trim()) opts.maxAge = Number(maxAge.trim());
      return tokenService.introspection(
        at!,
        adminId,
        adminSecret,
        Object.keys(opts).length ? opts : undefined,
      );
    });

    if (data) {
      toast.success('Token is sufficient — no step-up required');
      setChallenge(null);
    } else if (err) {
      // Try to parse the error for step-up challenge details
      try {
        /**
         * The RFC 9470 challenge, checked rather than assumed.
         *
         * This was `JSON.parse(err)` — `any` — with `parsed.error` read off it and the whole object then
         * handed to `setChallenge`, so `StepUpChallenge` described a shape nothing verified. The error
         * string here is whatever the server sent, and on this deployment that is sometimes an HTML page.
         */
        const parsed = parseJsonObject(err);
        if (stringMember(parsed, 'error') === 'insufficient_user_authentication') {
          setChallenge({
            error: 'insufficient_user_authentication',
            error_description: stringMember(parsed, 'error_description'),
            acr_values: stringMember(parsed, 'acr_values'),
            max_age: stringMember(parsed, 'max_age'),
            acr: stringMember(parsed, 'acr'),
          });
          toast.error('Step-up authentication required');
          return;
        }
      } catch {
        // Not JSON — generic error
      }
      toast.error(err);
    }
  };

  const reAuthUrl = (() => {
    if (!challenge) return '';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: getRedirectUri(),
      scope: DEFAULT_SCOPES,
      state: crypto.randomUUID(),
      nonce: crypto.randomUUID(),
    });
    if (challenge.acr_values) {
      // Build claims request with essential ACR
      const acrList = challenge.acr_values.split(' ');
      params.append(
        'claims',
        JSON.stringify({
          id_token: {
            acr: { essential: true, values: acrList },
          },
        }),
      );
    }
    if (challenge.max_age) {
      params.append('max_age', challenge.max_age);
    }
    params.append('prompt', 'login');
    return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
  })();

  return (
    <SectionPanel
      title="Step-Up Authentication"
      description="RFC 9470 — Test step-up authentication challenges via token introspection"
      icon={<ShieldAlert className="h-4 w-4" />}
    >
      <div className="space-y-4">
        {doc && <OperationDescription doc={doc} />}

        <FlowDiagram
          steps={flowSteps}
          currentStep={!challenge ? (loading ? 'introspect' : undefined) : 'challenge'}
          className="py-2"
        />

        {!at && (
          <div className="rounded-lg border border-edge-warning bg-tint-warning p-3 text-sm text-warning-text">
            <p className="font-medium">No access token available</p>
            <p className="mt-1 text-xs text-warning-text/80">
              Obtain a token first via Grant Flows, then return here to test step-up challenges.
            </p>
          </div>
        )}

        {at && (
          <>
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Introspection Credentials</p>
              <p className="text-xs text-muted-foreground">
                RFC 7662 §2.1 requires the introspection endpoint to be protected, so this flow
                needs the deployment&apos;s admin credentials. Without them the server answers{' '}
                <code>401</code>.
              </p>
              <AdminAuth />
              <p className="text-xs font-medium text-muted-foreground">
                Protected Resource Requirements
              </p>
              <Input
                label="Required ACR Values (space-separated)"
                value={requiredAcrs}
                onChange={(e) => setRequiredAcrs(e.target.value)}
                placeholder="e.g. urn:mace:incommon:iap:silver"
              />
              <Input
                label="Max Authentication Age (seconds)"
                type="number"
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                placeholder="e.g. 300"
              />
              {/* `disabled` reads `loading` directly. It used to be `loading !== null`, and
                  `useAsyncCall` reports `loading` as a *boolean* — so the comparison was always true
                  and this button, the only control in the section, was permanently disabled. The
                  `!== null` idiom belongs to `useDiscriminatedAsyncCall`, whose `loading` is
                  `T | null`; TypeScript permits a null comparison against any type, so nothing
                  flagged the copy. Locked by tests/sections.smoke.test.tsx. */}
              <Button
                onClick={handleIntrospect}
                loading={loading}
                disabled={!at || loading}
                className="w-full sm:w-auto"
              >
                <ShieldAlert className="h-4 w-4 mr-2" />
                Introspect with Requirements
              </Button>
            </div>

            {challenge && (
              <div className="space-y-3 rounded-lg border border-edge-danger bg-tint-danger p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-danger-text" />
                  <p className="text-sm font-medium text-danger-text">
                    Step-Up Authentication Required
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Error:</span>{' '}
                    <code className="text-danger-text">{challenge.error}</code>
                  </div>
                  {challenge.acr && (
                    <div>
                      <span className="text-muted-foreground">Current ACR:</span>{' '}
                      <code className="text-warning-text">{challenge.acr}</code>
                    </div>
                  )}
                  {challenge.auth_time && (
                    <div>
                      <span className="text-muted-foreground">Auth Time:</span>{' '}
                      <code className="text-warning-text">
                        {new Date(challenge.auth_time * 1000).toLocaleString()}
                      </code>
                    </div>
                  )}
                  {challenge.acr_values && (
                    <div>
                      <span className="text-muted-foreground">Required ACRs:</span>{' '}
                      <code className="text-success-text">{challenge.acr_values}</code>
                    </div>
                  )}
                  {challenge.max_age && (
                    <div>
                      <span className="text-muted-foreground">Max Age:</span>{' '}
                      <code className="text-success-text">{challenge.max_age}s</code>
                    </div>
                  )}
                </div>

                {challenge.error_description && (
                  <p className="text-xs text-danger-text/80">{challenge.error_description}</p>
                )}

                {reAuthUrl && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Re-authorize with stronger authentication requirements:
                    </p>
                    <a href={reAuthUrl}>
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">
                        <ArrowUpCircle className="h-4 w-4 mr-2" />
                        Re-Authenticate with Required ACR
                      </Button>
                    </a>
                    <p className="text-2xs text-muted-foreground">
                      This opens the authorization endpoint with <code>claims</code> requesting the
                      required ACR as essential, plus <code>prompt=login</code> to force
                      re-authentication.
                    </p>
                  </div>
                )}
              </div>
            )}

            {result && !challenge && <JsonBlock data={result} label="Introspection Result" />}
          </>
        )}

        {error && !challenge && (
          <div className="rounded-lg border border-edge-danger bg-tint-danger px-3 py-2">
            <ErrorExplainer error={error} />
          </div>
        )}
      </div>
    </SectionPanel>
  );
}

export { StepUpSection };
