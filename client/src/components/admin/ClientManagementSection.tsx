import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { useConfirmedAction } from '@/hooks/useConfirmedAction';
import { TabBar } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';
import { useCredentials } from '@/context/CredentialContext';
import {
  ALL_CLIENT_OPS,
  CLIENT_OPERATIONS,
  INITIAL_FIELD_VALUES,
  type ClientOp,
  type ClientOperation,
  type FieldValues,
  type OperationField,
} from './client-operations';

/**
 * Client Management — seventeen operations rendered from `client-operations.ts`.
 *
 * **What this replaces.** 635 lines and **33 `useState` calls**, the highest count in the app and the
 * first thing the 2026-08-22 audit named. Seventeen near-identical panels, each with its own state, six
 * of them tracking a separate *"Client ID"* — so typing an id and switching tabs lost it. The
 * operations are a table now and this file is the renderer: one piece of field state, one form, one
 * place where a call is made.
 *
 * Two things that did **not** move, on purpose. The credential lives in `CredentialContext` because it
 * is shared with seven other sections; and each operation's `run` lives in the table beside its fields,
 * because *what this sends and where* is what a reader comes looking for, and splitting it from its
 * inputs is how the two drift.
 */
function ClientManagementSection() {
  // The management credential is shared for the page rather than owned here: eight sections held their
  // own copy, and a route change unmounts a section, so it had to be retyped on every navigation.
  const { clientId: authId, clientSecret: authSecret } = useCredentials();
  /**
   * The selected operation lives in the URL, so a specific step can be shared and Back undoes it.
   * `useUrlState` validates the incoming value against the table's own list, so a hand-edited query
   * cannot select an operation that does not exist.
   */
  const [activeOp, setActiveOp] = useUrlState<ClientOp>('op', ALL_CLIENT_OPS);
  const { loading, result, error, call } = useAsyncCall();
  const { confirm, dialog } = useConfirmedAction();

  /**
   * Every field on screen, keyed by name and shared across operations.
   *
   * One hook where there were thirty-three. Sharing by name is the deliberate part: `clientId` typed on
   * Get is still there on Update, which is what the six separate copies prevented. Where the old code
   * already shared a value within a family — the granted-scopes pair, the three requestable-scopes
   * operations — this preserves it by construction rather than by remembering to reuse a variable.
   */
  const [values, setValues] = useState<FieldValues>(INITIAL_FIELD_VALUES);
  const setField = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('client', activeOp) : undefined;
  const operation = CLIENT_OPERATIONS.find((o) => o.value === activeOp);

  const handleCall = async (op: ClientOperation) => {
    const { data, error: err } = await call(() => op.run(values, auth));
    if (data) {
      toast.success(`${op.value} completed`);
    } else {
      toast.error(err);
    }
  };

  const runOperation = (op: ClientOperation) => {
    if (!op.confirm) {
      void handleCall(op);
      return;
    }
    // The table describes the question; this owns the answer, because `run` has to close over
    // `handleCall` and a data table has no business knowing about that.
    confirm({ ...op.confirm(values), run: () => handleCall(op) });
  };

  const tabsFor = (group: 'basic' | 'advanced') =>
    CLIENT_OPERATIONS.filter((o) => o.group === group).map(({ value, label }) => ({
      value,
      label,
    }));

  const missingRequired = (op: ClientOperation) =>
    (op.requires ?? []).some((name) => !values[name]?.trim());

  return (
    <SectionPanel title="Client Management" description="Register and manage OAuth clients">
      <AdminAuth />

      {error && <ErrorExplainer error={error} className="mb-3" />}

      <TabBar options={tabsFor('basic')} value={activeOp} onChange={setActiveOp} disabled={!auth} />

      <span className="text-xs text-muted-foreground">Advanced:</span>
      <TabBar
        options={tabsFor('advanced')}
        value={activeOp}
        onChange={setActiveOp}
        disabled={!auth}
      />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {operation && (
        <div className="space-y-3">
          {operation.fields.map((field) => (
            <OperationInput
              key={`${operation.value}:${field.name}`}
              field={field}
              value={values[field.name] ?? ''}
              onChange={(value) => setField(field.name, value)}
            />
          ))}
          <Button
            variant={operation.variant}
            disabled={missingRequired(operation) || loading}
            loading={loading}
            onClick={() => runOperation(operation)}
          >
            {operation.runLabel ?? 'Run'}
          </Button>
        </div>
      )}

      {dialog}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

/** One field, as its `kind` says. Kept here rather than exported: nothing else renders these. */
function OperationInput({
  field,
  value,
  onChange,
}: {
  field: OperationField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.kind === 'select') {
    return (
      <Select
        label={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={field.options ?? []}
      />
    );
  }
  return (
    <Input
      label={field.label}
      type={field.kind === 'password' ? 'password' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
    />
  );
}

export { ClientManagementSection };
