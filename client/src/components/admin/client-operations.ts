import { clientService } from '@/services';
import type { ConfirmableAction } from '@/hooks/useConfirmedAction';

/**
 * The seventeen client-management operations, as data.
 *
 * **Why this is a table and not seventeen branches.** `ClientManagementSection` carried **33
 * `useState` calls** — the highest count in the app and the first thing the 2026-08-22 audit named —
 * and 635 lines that were the same six lines seventeen times: some labelled fields, a Run button, one
 * `clientService` call. Six of those `useState` pairs were separately-tracked *"Client ID"* fields, one
 * per operation, so typing an id and switching tabs lost it.
 *
 * Expressed this way, adding an operation is a row rather than a branch, and the thing a reader wants
 * to know — *what does this send, and to where* — is on one line instead of spread across a panel.
 * `data/authParams.ts` already established the pattern for the authorization request.
 *
 * **Field values are keyed by field name and shared across operations, deliberately.** `clientId`
 * typed on Get is still there on Update. That is a behaviour change from the six separate states, and
 * it is the same reasoning that moved the management credential into `CredentialContext`: a value the
 * user has already typed should survive a tab change, because a route change unmounting a section is
 * exactly what made people retype things. Where the old code *did* share — `gsClientId` across the two
 * granted-scopes operations, `rsClientId` across all three requestable-scopes ones — this preserves it
 * by construction rather than by remembering to reuse the variable.
 */

export type ClientOp =
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'delete'
  | 'lock'
  | 'unlock'
  | 'refresh-secret'
  | 'update-secret'
  | 'list-auth'
  | 'update-auth'
  | 'delete-auth'
  | 'get-granted-scopes'
  | 'delete-granted-scopes'
  | 'get-requestable-scopes'
  | 'update-requestable-scopes'
  | 'delete-requestable-scopes';

/** The values of every field on screen, keyed by `OperationField.name`. */
export type FieldValues = Record<string, string>;

export interface OperationField {
  /** Shared across operations — see the note above. */
  name: string;
  label: string;
  placeholder?: string;
  kind?: 'text' | 'password' | 'select';
  options?: { value: string; label: string }[];
  /** Seeds the field the first time it is rendered. */
  initial?: string;
}

export interface ClientOperation {
  value: ClientOp;
  label: string;
  group: 'basic' | 'advanced';
  fields: OperationField[];
  /** The Run button's text, where "Run" would be wrong — a destructive verb, mostly. */
  runLabel?: string;
  variant?: 'default' | 'danger';
  /** Names that must be non-empty before the button is enabled. */
  requires?: string[];
  /**
   * Ask before doing it. Returns everything but `run`, which the section supplies — the hook needs the
   * action's `run` to close over `handleCall`, and a table has no business knowing about that.
   */
  confirm?: (v: FieldValues) => Omit<ConfirmableAction, 'run'>;
  run: (v: FieldValues, auth: string) => Promise<unknown>;
}

const CLIENT_TYPE_OPTIONS = [
  { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
  { value: 'PUBLIC', label: 'PUBLIC' },
];

const APP_TYPE_OPTIONS = [
  { value: 'web', label: 'web' },
  { value: 'native', label: 'native' },
];

const AUTH_METHOD_OPTIONS = [
  { value: 'NONE', label: 'NONE' },
  { value: 'CLIENT_SECRET_BASIC', label: 'CLIENT_SECRET_BASIC' },
  { value: 'CLIENT_SECRET_POST', label: 'CLIENT_SECRET_POST' },
  { value: 'CLIENT_SECRET_JWT', label: 'CLIENT_SECRET_JWT' },
  { value: 'PRIVATE_KEY_JWT', label: 'PRIVATE_KEY_JWT' },
  { value: 'SELF_SIGNED_TLS_CLIENT_AUTH', label: 'SELF_SIGNED_TLS_CLIENT_AUTH' },
];

/** `Client ID`, which nine of the seventeen operations need and which used to be six separate states. */
const clientId: OperationField = {
  name: 'clientId',
  label: 'Client ID',
  placeholder: 'Numeric client ID from Authlete',
};

/** The lock/secret operations label the same value differently, because an alias is accepted there. */
const clientIdOrAlias = (placeholder: string): OperationField => ({
  name: 'clientId',
  label: 'Client ID / Alias',
  placeholder,
});

const subject: OperationField = {
  name: 'subject',
  label: 'Subject (user ID)',
  placeholder: 'End-user identifier',
};

const list = (v: string): string[] => v.split(/[\s,]+/).filter(Boolean);

export const CLIENT_OPERATIONS: ClientOperation[] = [
  {
    value: 'list',
    label: 'List',
    group: 'basic',
    fields: [
      { name: 'listStart', label: 'Start (inclusive)', placeholder: '0', initial: '0' },
      { name: 'listEnd', label: 'End (exclusive)', placeholder: '20', initial: '20' },
    ],
    run: (v, auth) => clientService.listClients(auth, Number(v.listStart), Number(v.listEnd)),
  },
  {
    value: 'get',
    label: 'Get',
    group: 'basic',
    fields: [clientId],
    run: (v, auth) => clientService.getClient(v.clientId, auth),
  },
  {
    value: 'create',
    label: 'Create',
    group: 'basic',
    fields: [
      { name: 'createName', label: 'Client Name', placeholder: 'e.g. My App' },
      {
        name: 'createType',
        label: 'Client Type',
        kind: 'select',
        options: CLIENT_TYPE_OPTIONS,
        initial: 'CONFIDENTIAL',
      },
      {
        name: 'createAppType',
        label: 'Application Type',
        kind: 'select',
        options: APP_TYPE_OPTIONS,
        initial: 'web',
      },
      {
        name: 'createGrantTypes',
        label: 'Grant Types (comma-separated)',
        placeholder: 'e.g. AUTHORIZATION_CODE,REFRESH_TOKEN',
        initial: 'AUTHORIZATION_CODE',
      },
      {
        name: 'createResponseTypes',
        label: 'Response Types (space-separated)',
        placeholder: 'e.g. code',
        initial: 'code',
      },
      {
        name: 'createRedirectUris',
        label: 'Redirect URIs (space-separated)',
        placeholder: 'https://your-app.com/callback',
      },
      {
        name: 'createAuthMethod',
        label: 'Token Auth Method',
        kind: 'select',
        options: AUTH_METHOD_OPTIONS,
        initial: 'CLIENT_SECRET_BASIC',
      },
      { name: 'createDescription', label: 'Description', placeholder: 'Optional description' },
      {
        name: 'createDeveloper',
        label: 'Developer',
        placeholder: 'Optional developer identifier',
      },
    ],
    run: (v, auth) =>
      clientService.createClient(
        {
          client: {
            clientName: v.createName,
            clientType: v.createType,
            applicationType: v.createAppType,
            grantTypes: list(v.createGrantTypes),
            responseTypes: list(v.createResponseTypes),
            redirectUris: list(v.createRedirectUris),
            // Not cosmetic: CU-W1 proved live that Authlete *replaces* rather than merges, and its
            // default for this field is `NONE` — the weakest value available. A `tokenAuthMethod` that
            // fails to travel does not leave the field unset, it makes a confidential client public.
            tokenAuthMethod: v.createAuthMethod,
            description: v.createDescription,
            developer: v.createDeveloper,
          },
        },
        auth,
      ),
  },
  {
    value: 'update',
    label: 'Update',
    group: 'basic',
    fields: [
      { ...clientId, placeholder: 'Numeric client ID to update' },
      {
        name: 'updateName',
        label: 'Client Name',
        placeholder: 'New name (leave empty to keep)',
      },
      {
        name: 'updateDesc',
        label: 'Description',
        placeholder: 'New description (leave empty to keep)',
      },
      {
        name: 'updateUris',
        label: 'Redirect URIs (space-separated)',
        placeholder: 'https://your-app.com/callback',
      },
    ],
    run: (v, auth) =>
      clientService.updateClient(
        v.clientId,
        {
          // `undefined` means "leave it alone", and it is safe only because the server does
          // read-modify-write: `buildClientInput` names ~40 of the `Client` schema's 108 properties and
          // Authlete replaces rather than merges. A blank field becoming `''` would be a field-clearing
          // bug that answers 200.
          client: {
            clientName: v.updateName || undefined,
            description: v.updateDesc || undefined,
            redirectUris: v.updateUris ? list(v.updateUris) : undefined,
          },
        },
        auth,
      ),
  },
  {
    value: 'delete',
    label: 'Delete',
    group: 'basic',
    fields: [{ ...clientId, placeholder: 'Numeric client ID to permanently delete' }],
    runLabel: 'Delete',
    variant: 'danger',
    requires: ['clientId'],
    /**
     * Deleting a client at Authlete is permanent and nothing here can restore it — and two of the live
     * clients are curriculum infrastructure (`1523514379` for Module 02's plain code flow,
     * `1678274156` for Module 03's). A free-text id beside an unguarded Run button was one misclick
     * away from breaking a lab, so the id has to be typed back.
     */
    confirm: (v) => ({
      title: 'Delete this client permanently?',
      body: `Client ${v.clientId} will be deleted at Authlete. This cannot be undone from here, and any flow, lab or tutorial that names this client will stop working.`,
      confirmLabel: 'Delete client',
      requireTyped: v.clientId.trim(),
    }),
    run: (v, auth) => clientService.deleteClient(v.clientId, auth),
  },
  {
    value: 'lock',
    label: 'Lock',
    group: 'basic',
    fields: [clientIdOrAlias('Client ID to suspend/restore')],
    runLabel: 'Lock',
    run: (v, auth) => clientService.lockFlag(v.clientId, true, auth),
  },
  {
    value: 'unlock',
    label: 'Unlock',
    group: 'basic',
    fields: [clientIdOrAlias('Client ID to suspend/restore')],
    runLabel: 'Unlock',
    // Two rows rather than one panel with `activeOp === 'lock'` inside the call: a boolean derived from
    // the selected tab is the shape where a wrong operand silently inverts a security control.
    run: (v, auth) => clientService.lockFlag(v.clientId, false, auth),
  },
  {
    value: 'refresh-secret',
    label: 'Refresh Secret',
    group: 'basic',
    fields: [clientIdOrAlias('Client ID to rotate secret for')],
    run: (v, auth) => clientService.refreshSecret(v.clientId, auth),
  },
  {
    value: 'update-secret',
    label: 'Update Secret',
    group: 'basic',
    fields: [
      clientIdOrAlias('Client ID to set secret for'),
      {
        name: 'newSecret',
        label: 'New Client Secret',
        kind: 'password',
        placeholder: 'A-Z, a-z, 0-9, -, _ (max 86 chars)',
      },
    ],
    run: (v, auth) => clientService.updateSecret(v.clientId, v.newSecret, auth),
  },
  {
    value: 'list-auth',
    label: 'List Auth',
    group: 'advanced',
    fields: [subject],
    run: (v, auth) => clientService.listAuth(v.subject, auth),
  },
  {
    value: 'update-auth',
    label: 'Update Auth',
    group: 'advanced',
    fields: [
      { ...clientId, placeholder: 'Client to update authorizations for' },
      subject,
      {
        name: 'authScopes',
        label: 'Scopes (space-separated)',
        placeholder: 'New scopes for existing tokens',
      },
    ],
    run: (v, auth) =>
      clientService.updateAuth(v.clientId, { subject: v.subject, scopes: v.authScopes }, auth),
  },
  {
    value: 'delete-auth',
    label: 'Delete Auth',
    group: 'advanced',
    fields: [{ ...clientId, placeholder: 'Client to revoke authorizations for' }, subject],
    run: (v, auth) => clientService.deleteAuth(v.clientId, v.subject, auth),
  },
  {
    value: 'get-granted-scopes',
    label: 'Get Granted Scopes',
    group: 'advanced',
    fields: [{ ...clientId, placeholder: 'Client to inspect/clear scopes for' }, subject],
    run: (v, auth) => clientService.getGrantedScopes(v.clientId, v.subject, auth),
  },
  {
    value: 'delete-granted-scopes',
    label: 'Delete Granted Scopes',
    group: 'advanced',
    fields: [{ ...clientId, placeholder: 'Client to inspect/clear scopes for' }, subject],
    run: (v, auth) => clientService.deleteGrantedScopes(v.clientId, v.subject, auth),
  },
  {
    value: 'get-requestable-scopes',
    label: 'Get Requestable Scopes',
    group: 'advanced',
    fields: [{ ...clientId, placeholder: 'Client to check scope restrictions for' }],
    run: (v, auth) => clientService.getRequestableScopes(v.clientId, auth),
  },
  {
    value: 'update-requestable-scopes',
    label: 'Update Requestable Scopes',
    group: 'advanced',
    fields: [
      { ...clientId, placeholder: 'Client to restrict scopes for' },
      {
        name: 'requestableScopes',
        label: 'Scopes (space-separated)',
        placeholder: 'Allowed scopes (empty = unrestricted)',
      },
    ],
    run: (v, auth) =>
      clientService.updateRequestableScopes(
        v.clientId,
        { requestableScopes: list(v.requestableScopes) },
        auth,
      ),
  },
  {
    value: 'delete-requestable-scopes',
    label: 'Delete Requestable Scopes',
    group: 'advanced',
    fields: [{ ...clientId, placeholder: 'Client to remove scope restrictions from' }],
    run: (v, auth) => clientService.deleteRequestableScopes(v.clientId, auth),
  },
];

/** Every value `ClientOp` can take, as a runtime list — the allowed set for the URL parameter. */
export const ALL_CLIENT_OPS = CLIENT_OPERATIONS.map((o) => o.value) as [ClientOp, ...ClientOp[]];

/** The initial value of every field named anywhere in the table. */
export const INITIAL_FIELD_VALUES: FieldValues = Object.fromEntries(
  CLIENT_OPERATIONS.flatMap((op) => op.fields).map((f) => [f.name, f.initial ?? '']),
);
