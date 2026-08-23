import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { ClientManagementSection } from '@/components/admin/ClientManagementSection';
import { clientService } from '@/services';
import {
  CLIENT_OPERATIONS,
  type ClientOp,
  type OperationField,
} from '@/components/admin/client-operations';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  selectOp,
  confirmDialog,
  callCarries,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Every one of the seventeen client operations, driven once.
 *
 * **Why a table test rather than eleven more hand-written ones.** Turning `ClientManagementSection`
 * from seventeen panels into a data table collapsed 635 lines and 33 `useState` calls into a renderer,
 * and it moved the risk: a typo in a row — `v.clientID` where the field is named `clientId` — sends an
 * empty string and nothing complains. The hand-written driven test covers six operations, so eleven
 * rows had no assertion of any kind.
 *
 * This drives all seventeen from the table itself, which means **a row added without a test is not
 * possible**: the new row is a new case here the moment it exists. Four things are asserted per
 * operation, chosen to be exactly the mistakes a table makes:
 *
 * 1. **Exactly one service method fires.** Not zero (a dead row) and not two.
 * 2. **It is the expected method.** The map below is a deliberate restatement — it is the test's job to
 *    say that Get calls `getClient`, because otherwise a row pointing at the wrong service function
 *    would satisfy every other assertion here.
 * 3. **The credential travels.** All seventeen routes are behind `requireBasicAuth`.
 * 4. **Every value the user typed travels.** This is the typo class, and it is why each field is filled
 *    with a marker naming itself.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');

/**
 * Which `clientService` function each operation must reach.
 *
 * A restatement of the table, on purpose — see point 2 above. `lock` and `unlock` share `lockFlag` and
 * are distinguished by their boolean, which the hand-written driven test pins separately.
 */
const EXPECTED_METHOD: Record<ClientOp, keyof typeof clientService> = {
  list: 'listClients',
  get: 'getClient',
  create: 'createClient',
  update: 'updateClient',
  delete: 'deleteClient',
  lock: 'lockFlag',
  unlock: 'lockFlag',
  'refresh-secret': 'refreshSecret',
  'update-secret': 'updateSecret',
  'list-auth': 'listAuth',
  'update-auth': 'updateAuth',
  'delete-auth': 'deleteAuth',
  'get-granted-scopes': 'getGrantedScopes',
  'delete-granted-scopes': 'deleteGrantedScopes',
  'get-requestable-scopes': 'getRequestableScopes',
  'update-requestable-scopes': 'updateRequestableScopes',
  'delete-requestable-scopes': 'deleteRequestableScopes',
};

/**
 * What to type into a field so that finding it in the outgoing call proves something.
 *
 * A marker naming the field, except where the operation does arithmetic on it — `Number(v.listStart)`
 * turns a marker into `NaN`, which would be a false failure about the wrong thing — and except for a
 * `select`, where the value has to be one the control offers. The **second** option is chosen
 * deliberately: the first is usually the initial value, so picking it would pass even if the selection
 * never reached the request.
 */
/** Labels contain `(` and `)` — "Start (inclusive)" is a regex group unless escaped. */
function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

function valueFor(field: OperationField): string {
  if (field.kind === 'select') {
    const options = field.options ?? [];
    return (options[1] ?? options[0]).value;
  }
  if (field.name === 'listStart') return '5';
  if (field.name === 'listEnd') return '25';
  return `v-${field.name}`;
}

/**
 * Spy on all seventeen at once, so "exactly one fired" is answerable.
 *
 * The cast is contained here rather than spread over the assertions: `vi.spyOn` on a *union* of keys
 * resolves its return type to `any`, which takes the type-aware lint rules down with it wherever
 * `.mock` is then read. Naming the shape once keeps the rest of the file checked.
 */
type ServiceSpy = MockInstance<(...args: never[]) => unknown>;

function spyOnEveryMethod(): Map<string, ServiceSpy> {
  const spies = new Map<string, ServiceSpy>();
  for (const name of Object.keys(clientService) as (keyof typeof clientService)[]) {
    const spy = vi.spyOn(clientService, name).mockResolvedValue({ ok: true } as never);
    spies.set(name, spy as unknown as ServiceSpy);
  }
  return spies;
}

describe('every client operation reaches its service', () => {
  it('has a test for every row in the table, by construction', () => {
    // If a row is added, `it.each` below gains a case for it. This asserts the two lists agree, so a
    // row cannot be added while quietly leaving `EXPECTED_METHOD` behind.
    expect(CLIENT_OPERATIONS.map((o) => o.value).sort()).toEqual(
      (Object.keys(EXPECTED_METHOD) as ClientOp[]).sort(),
    );
  });

  it.each(CLIENT_OPERATIONS.map((op) => [op.value, op] as const))(
    '%s sends what was typed, on the credential, to exactly one method',
    async (_name, op) => {
      const spies = spyOnEveryMethod();
      mountSection(<ClientManagementSection />);
      fillAdminCredentials();
      await selectOp(exactly(op.label));

      const typed = op.fields.map((f) => [f, valueFor(f)] as const);
      for (const [field, value] of typed) fill(exactly(field.label), value);

      press(exactly(op.runLabel ?? 'Run'));
      if (op.confirm) {
        // The typed confirmation demands the client id back, which is the value just filled in.
        await confirmDialog(typed.find(([f]) => f.name === 'clientId')?.[1]);
      }

      const expected = EXPECTED_METHOD[op.value];
      const spy = spies.get(expected)!;
      await waitFor(() =>
        expect(spy, `${op.value} did not reach clientService.${expected}`).toHaveBeenCalled(),
      );

      const fired = [...spies.entries()].filter(([, s]) => s.mock.calls.length > 0).map(([n]) => n);
      expect(fired, `${op.value} fired more than one service call`).toEqual([expected]);

      const args = spy.mock.calls[0] as unknown[];
      expect(callCarries(args, CREDENTIAL), `${op.value} sent no credential`).toBe(true);

      for (const [field, value] of typed) {
        expect(
          callCarries(args, value),
          `${op.value}: "${field.label}" (field \`${field.name}\`) was typed but did not reach the request`,
        ).toBe(true);
      }
    },
  );
});

describe('the field values are shared across operations, deliberately', () => {
  /**
   * The six separate `useState` copies of *"Client ID"* are the reason this is worth pinning: typing an
   * id and switching tabs used to lose it. Sharing by field name is the same reasoning that moved the
   * management credential into `CredentialContext`.
   */
  it('keeps a client id typed on Get when the tab changes to Update', async () => {
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();

    await selectOp(/^Get$/i);
    fill(exactly('Client ID'), '1523514379');

    await selectOp(/^Update$/i);
    expect((screen.getByLabelText(exactly('Client ID')) as HTMLInputElement).value).toBe(
      '1523514379',
    );
  });

  it('does not share two fields that merely share a label', async () => {
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();

    // Both are labelled "Scopes (space-separated)" but they are different parameters of different
    // requests — `authScopes` and `requestableScopes` — so they were separate states before and are
    // separate names now. A shared name here would silently send one operation's value in the other.
    await selectOp(/^Update Auth$/i);
    fill(exactly('Scopes (space-separated)'), 'openid profile');

    await selectOp(/^Update Requestable Scopes$/i);
    expect(
      (screen.getByLabelText(exactly('Scopes (space-separated)')) as HTMLInputElement).value,
    ).toBe('');
  });
});
