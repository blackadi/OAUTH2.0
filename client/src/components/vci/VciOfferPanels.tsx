import { useState } from 'react';
import { vciService } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AdminAuth } from '@/components/layout/AdminAuth';

/**
 * The two offer operations, which are the only ones here behind **admin Basic auth**.
 *
 * VCI carries three authentication postures on one section — discovery is public, offers are
 * admin-gated, and the credential endpoints take an access token — and getting the category wrong is
 * how `POST /api/vci/deferred/issue` came to authenticate nobody. Splitting the groups into three files
 * makes the posture a property of the file rather than something to notice in a switch arm.
 */

/** The offer's two grant-inclusion flags and the txCode block use this; nothing else does. */
function renderCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-indigo-500 w-3.5 h-3.5 rounded border-border bg-muted/30"
      />
      {label}
    </label>
  );
}

function VciOfferPanels({
  op,
  auth,
  loading,
  onRun,
}: {
  op: string;
  auth: string;
  loading: boolean;
  onRun: (run: () => Promise<unknown>) => void;
}) {
  const [credConfigIds, setCredConfigIds] = useState('["VerifiedEmployee"]');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState('');
  const [preAuthGrant, setPreAuthGrant] = useState(true);
  const [authCodeGrant, setAuthCodeGrant] = useState(false);
  const [context, setContext] = useState('');
  const [txCodeVal, setTxCodeVal] = useState('');
  const [txCodeMode, setTxCodeMode] = useState('');
  const [txCodeDesc, setTxCodeDesc] = useState('');
  const [identifier, setIdentifier] = useState('');

  if (op === 'offer-create') {
    return (
      <div className="space-y-4">
        <AdminAuth label="Admin" />
        <Input
          label="Credential Configuration IDs (JSON array)"
          value={credConfigIds}
          onChange={(e) => setCredConfigIds(e.target.value)}
          placeholder='["VerifiedEmployee"]'
        />
        <Input
          label="Subject (optional)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="user123"
        />
        <Input
          label="Duration in seconds (optional)"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="3600"
        />
        <Input
          label="Context (optional)"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Free-form context string"
        />
        <div className="space-y-1">
          <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
            Grant Types
          </p>
          <div className="flex flex-wrap gap-4">
            {renderCheckbox('Pre-Authorized Code', preAuthGrant, setPreAuthGrant)}
            {renderCheckbox('Authorization Code', authCodeGrant, setAuthCodeGrant)}
          </div>
        </div>
        {preAuthGrant && (
          <div className="space-y-3 pl-3 border-l-2 border-edge-accent">
            <p className="text-xs text-accent-text">
              Transaction code (tx_code) settings for pre-authorized code flow
            </p>
            <Input
              label="Transaction Code (optional)"
              value={txCodeVal}
              onChange={(e) => setTxCodeVal(e.target.value)}
              placeholder="e.g. 123456"
            />
            <Select
              label="Input Mode"
              options={[
                { value: '', label: '(none)' },
                { value: 'numeric', label: 'Numeric' },
                { value: 'text', label: 'Text' },
              ]}
              value={txCodeMode}
              onChange={(e) => setTxCodeMode(e.target.value)}
            />
            <Input
              label="Description (optional)"
              value={txCodeDesc}
              onChange={(e) => setTxCodeDesc(e.target.value)}
              placeholder="e.g. Enter the code shown on screen"
            />
          </div>
        )}
        <Button
          onClick={() => {
            const body: Record<string, unknown> = {};
            try {
              body.credentialConfigurationIds = JSON.parse(credConfigIds);
            } catch {
              body.credentialConfigurationIds = [credConfigIds];
            }
            if (subject) body.subject = subject;
            if (duration) body.duration = Number(duration);
            if (context) body.context = context;
            body.preAuthorizedCodeGrantIncluded = preAuthGrant;
            body.authorizationCodeGrantIncluded = authCodeGrant;
            if (preAuthGrant && txCodeVal) {
              body.txCode = txCodeVal;
              if (txCodeMode) body.txCodeInputMode = txCodeMode;
              if (txCodeDesc) body.txCodeDescription = txCodeDesc;
            }
            onRun(() => vciService.createOffer(body, auth));
          }}
          loading={loading}
        >
          Create Offer
        </Button>
      </div>
    );
  }
  if (op === 'offer-info') {
    return (
      <div className="space-y-3">
        <AdminAuth label="Admin" />
        <Input
          label="Offer Identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="offer-id"
        />
        <Button
          onClick={() => onRun(() => vciService.getOfferInfo({ identifier: identifier }, auth))}
          loading={loading}
        >
          Get Offer Info
        </Button>
      </div>
    );
  }
  return null;
}

export { VciOfferPanels };
