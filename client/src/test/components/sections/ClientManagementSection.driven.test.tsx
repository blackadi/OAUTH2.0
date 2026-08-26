import { screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClientManagementSection } from '@/components/admin/ClientManagementSection';
import { clientService } from '@/services';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  selectOp,
  confirmDialog,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Client Management — 17 operations behind one credential, and two irreversible ones.
 *
 * Every route here is `requireBasicAuth`-gated, so the JAR class applies to all 17 at once: a call that
 * forgets the credential is a 401 with an enabled button, which is exactly what nothing could see.
 *
 * The `create` case carries a second requirement that is not obvious from the UI. **CU-W1 was proven
 * live**: Authlete *replaces* a client rather than merging, and of 15 fields set on create, 0 survived
 * an update that omitted them — two resetting not to empty but to Authlete's own defaults, one of them
 * `tokenAuthMethod: CLIENT_SECRET_BASIC → NONE`. So a `tokenAuthMethod` that fails to travel does not
 * leave the field unset; it makes a confidential client **public**. That is why the Select's value is
 * asserted rather than assumed.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');

const CLIENT = {
  clientId: 1523514379,
  clientName: 'Curriculum client',
  tokenAuthMethod: 'CLIENT_SECRET_BASIC',
  redirectUris: ['http://localhost:3001/callback'],
};

describe('ClientManagementSection — the credential on all 17 routes', () => {
  it('offers no operation, basic or advanced, until the credential is entered', () => {
    mountSection(<ClientManagementSection />);

    const tabs = screen.getAllByRole('tab');
    // 9 basic plus 8 advanced. The count is asserted so that a new operation added without a
    // credential gate cannot slip in beside the gated ones.
    expect(tabs).toHaveLength(17);
    for (const tab of tabs) {
      expect(tab, `"${tab.textContent}" is selectable with no credential entered`).toBeDisabled();
    }
  });

  it('carries the credential and the range on List', async () => {
    const spy = vi.spyOn(clientService, 'listClients').mockResolvedValue({ clients: [CLIENT] });
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();
    await selectOp(/^List$/i);

    fill(/Start \(inclusive\)/i, '5');
    fill(/End \(exclusive\)/i, '25');
    press(/^Run$/i);

    const args = await expectCall(spy, 'the List Run button');
    expectSends(args, CREDENTIAL, 'GET /api/client/list is behind requireBasicAuth');
    // Numbers, not the strings the inputs hold — `Number(listStart)` is the conversion under test.
    expect(args).toEqual([CREDENTIAL, 5, 25]);
  });

  it('carries the client id the user typed on Get', async () => {
    const spy = vi.spyOn(clientService, 'getClient').mockResolvedValue(CLIENT);
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();
    await selectOp(/^Get$/i);

    fill(/^Client ID$/i, '1523514379');
    press(/^Run$/i);

    const args = await expectCall(spy, 'the Get Run button');
    expectSends(args, '1523514379', 'the id the user typed is the client to fetch');
    expectSends(args, CREDENTIAL, 'GET /api/client/get is behind requireBasicAuth');
  });

  /**
   * The security-relevant one. `tokenAuthMethod` decides whether the client authenticates at all, and
   * Authlete's default for it is `NONE` — the weakest value available.
   */
  it('sends the token auth method the user chose, not the default', async () => {
    const spy = vi.spyOn(clientService, 'createClient').mockResolvedValue(CLIENT);
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();
    await selectOp(/^Create$/i);

    fill(/Client Name/i, 'Driven test client');
    fill(/Token Auth Method/i, 'PRIVATE_KEY_JWT');
    fill(/Redirect URIs/i, 'https://app.example.com/cb https://app.example.com/cb2');
    press(/^Run$/i);

    const args = await expectCall(spy, 'the Create Run button');
    expectSends(args, CREDENTIAL, 'POST /api/client/create is behind requireBasicAuth');
    expectSends(
      args,
      'PRIVATE_KEY_JWT',
      "a tokenAuthMethod that does not travel does not leave the field unset — Authlete's default is NONE",
    );
    // The space-separated field has to become a list, or Authlete stores one URI containing a space.
    const [body] = args as [{ client: { redirectUris: string[] } }];
    expect(body.client.redirectUris).toEqual([
      'https://app.example.com/cb',
      'https://app.example.com/cb2',
    ]);
  });

  /**
   * Update sends only the fields that were filled in, and that is safe **only** because the server does
   * read-modify-write — `buildClientInput` names ~40 of the `Client` schema's 108 properties and
   * Authlete replaces rather than merges. An `undefined` here means "leave it alone", so a blank field
   * turning into an empty string would be a field-clearing bug with a 200 response.
   */
  it('omits the fields left blank on Update rather than sending empty ones', async () => {
    const spy = vi.spyOn(clientService, 'updateClient').mockResolvedValue(CLIENT);
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();
    await selectOp(/^Update$/i);

    fill(/^Client ID$/i, '1523514379');
    fill(/Client Name/i, 'Renamed');
    press(/^Run$/i);

    const args = await expectCall(spy, 'the Update Run button');
    expectSends(args, '1523514379', 'the client to update');
    expectSends(args, CREDENTIAL, 'PUT /api/client/update is behind requireBasicAuth');
    const [, body] = args as [string, { client: Record<string, unknown> }];
    expect(body.client.clientName).toBe('Renamed');
    expect(body.client.description, 'a blank field must not clear the stored one').toBeUndefined();
    expect(body.client.redirectUris).toBeUndefined();
  });

  /**
   * Deleting reaches the live Authlete service and nothing here can restore it — and two of the live
   * clients are curriculum infrastructure (`1523514379` for Module 02's plain code flow, `1678274156`
   * for Module 03's). The typed confirmation is the finding, so it is driven rather than bypassed.
   */
  it('makes a delete pass through a typed confirmation before it reaches Authlete', async () => {
    const spy = vi.spyOn(clientService, 'deleteClient').mockResolvedValue(undefined);
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();
    await selectOp(/^Delete$/i);

    fill(/^Client ID$/i, '1523514379');
    press(/^Delete$/i);

    expect(spy, 'the dialog must open before anything is deleted').not.toHaveBeenCalled();
    await confirmDialog('1523514379');

    const args = await expectCall(spy, 'the confirmed delete');
    expectSends(args, '1523514379', 'the client the user typed back is the one deleted');
    expectSends(args, CREDENTIAL, 'DELETE /api/client/delete is behind requireBasicAuth');
  });

  it('will not delete with the id left blank', async () => {
    const spy = vi.spyOn(clientService, 'deleteClient');
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();
    await selectOp(/^Delete$/i);

    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * Lock and Unlock share one handler and differ only by a boolean derived from the selected tab — the
   * shape where a wrong operand silently inverts a security control.
   */
  it('derives the lock flag from the tab, so Unlock does not lock', async () => {
    const spy = vi.spyOn(clientService, 'lockFlag').mockResolvedValue({ ok: true });
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();

    await selectOp(/^Lock$/i);
    fill(/Client ID \/ Alias/i, '1523514379');
    press(/^Lock$/i);
    expect((await expectCall(spy, 'the Lock button'))[1]).toBe(true);

    spy.mockClear();
    await selectOp(/^Unlock$/i);
    fill(/Client ID \/ Alias/i, '1523514379');
    press(/^Unlock$/i);
    expect((await expectCall(spy, 'the Unlock button'))[1]).toBe(false);
  });

  it('renders the client the server returned', async () => {
    vi.spyOn(clientService, 'getClient').mockResolvedValue(CLIENT);
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();
    await selectOp(/^Get$/i);
    fill(/^Client ID$/i, '1523514379');
    press(/^Run$/i);

    await expectReadsBack(/Curriculum client/, 'the client name in the response');
    await expectReadsBack(/CLIENT_SECRET_BASIC/, 'the registered token auth method');
  });

  it('explains a refusal instead of printing it raw', async () => {
    vi.spyOn(clientService, 'getClient').mockRejectedValue(
      new Error(
        '{"error":"invalid_client","error_description":"Basic authentication is required."}',
      ),
    );
    mountSection(<ClientManagementSection />);
    fillAdminCredentials();
    await selectOp(/^Get$/i);
    fill(/^Client ID$/i, '1523514379');
    press(/^Run$/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
  });
});
