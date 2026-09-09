import { screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HskSection } from '@/components/admin/HskSection';
import { hskService } from '@/services';
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
 * Hardware Security Keys — a vendor feature with no OAuth/OIDC spec behind it, admin-gated like DCR and
 * Federation registration. Delete is the one operation here with no client-side undo at all: it removes
 * the key handle at the Authlete service, not merely local state, so it goes through the same typed
 * confirmation `ClientManagementSection` and `DcrSection` use for their own irreversible deletes.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');

describe('HskSection — Create', () => {
  it('sends the admin credential and the required fields', async () => {
    const spy = vi
      .spyOn(hskService, 'hskCreate')
      .mockResolvedValue({ action: 'SUCCESS', hsk: { handle: 'h-1' } });
    mountSection(<HskSection />);
    await selectOp(/^Create$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    fill(/^hsmName \(REQUIRED\)$/i, 'google');

    press(/^Create$/i);

    const args = await expectCall(spy, 'the Create button');
    expectSends(args, CREDENTIAL, 'HSK create reaches the live service, so it is admin-gated');
    expectSends(args, 'google', 'hsmName is required and was filled in');
  });

  it('refuses to fire without hsmName', async () => {
    const spy = vi.spyOn(hskService, 'hskCreate');
    mountSection(<HskSection />);
    await selectOp(/^Create$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('explains a refusal instead of printing it raw', async () => {
    vi.spyOn(hskService, 'hskCreate').mockRejectedValue(
      new Error('{"error":"invalid_request","error_description":"unsupported algorithm"}'),
    );
    mountSection(<HskSection />);
    await selectOp(/^Create$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    fill(/^hsmName \(REQUIRED\)$/i, 'google');
    press(/^Create$/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
  });
});

describe('HskSection — List', () => {
  it('fetches the list with the admin credential and reads the response back', async () => {
    const spy = vi
      .spyOn(hskService, 'hskList')
      .mockResolvedValue({ action: 'SUCCESS', hsks: [{ handle: 'h-listed-1' }] });
    mountSection(<HskSection />);
    await selectOp(/^List$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    press(/^List Keys$/i);

    const args = await expectCall(spy, 'the List Keys button');
    expectSends(args, CREDENTIAL, 'listing keys is admin-gated');
    await expectReadsBack(/h-listed-1/, 'the listed handle');
  });
});

describe('HskSection — Get', () => {
  it('sends the handle with the admin credential', async () => {
    const spy = vi
      .spyOn(hskService, 'hskGet')
      .mockResolvedValue({ action: 'SUCCESS', hsk: { handle: 'h-1' } });
    mountSection(<HskSection />);
    await selectOp(/^Get$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    fill(/^handle \(REQUIRED\)$/i, 'h-1');

    press(/^Get$/i);

    const args = await expectCall(spy, 'the Get button');
    expectSends(args, 'h-1', 'the handle identifies which key to read');
    expectSends(args, CREDENTIAL, 'reading a key handle is admin-gated');
  });

  it('refuses to fire with no handle', async () => {
    const spy = vi.spyOn(hskService, 'hskGet');
    mountSection(<HskSection />);
    await selectOp(/^Get$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    expect(screen.getByRole('button', { name: /^Get$/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('HskSection — Delete', () => {
  it('requires a typed confirmation before calling the service', async () => {
    const spy = vi.spyOn(hskService, 'hskDelete').mockResolvedValue({});
    mountSection(<HskSection />);
    await selectOp(/^Delete$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    fill(/^handle \(REQUIRED\)$/i, 'h-doomed');

    press(/^Delete$/i);
    expect(spy, 'the confirm dialog must gate the call').not.toHaveBeenCalled();

    await confirmDialog('h-doomed');

    const args = await expectCall(spy, 'the confirmed Delete action');
    expectSends(args, 'h-doomed', 'the confirmed handle is what gets deleted');
    expectSends(args, CREDENTIAL, 'deleting a key handle is admin-gated');
  });

  it('refuses to fire with no handle', async () => {
    mountSection(<HskSection />);
    await selectOp(/^Delete$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeDisabled();
  });
});
