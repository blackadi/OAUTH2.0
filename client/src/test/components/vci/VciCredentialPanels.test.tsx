import { screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VciCredentialPanels } from '@/components/vci/VciCredentialPanels';
import { vciService } from '@/services';
import { mountSection, seedTokens, resetSectionState } from '@/test/helpers/drive-section';

/**
 * The three credential endpoints, kept together deliberately (see the file's own doc comment) because
 * an asymmetry between them — one collecting no access token while its siblings both require one — is
 * the exact defect `check-route-coverage.mjs` once found server-side. `VciSection.driven.test.tsx`
 * already asserts that posture at the service boundary for all three; the gaps here are each op's own
 * JSON-parsing fallback and the vault auto-fill's "do not overwrite what was typed" rule.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

describe('VciCredentialPanels — unrecognised op', () => {
  it('renders nothing for an operation it does not own', () => {
    const { container } = mountSection(
      <VciCredentialPanels op="offer-create" loading={false} onRun={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('VciCredentialPanels — the access-token field auto-fills from the vault, without overwriting a typed value', () => {
  it('fills the field from the vault on first focus when it starts empty', () => {
    seedTokens({ access_token: 'at-from-vault' });
    mountSection(<VciCredentialPanels op="cred-issue" loading={false} onRun={vi.fn()} />);
    const field = screen.getByLabelText(/Access Token/i) as HTMLInputElement;
    expect(field.value).toBe('at-from-vault');
  });

  it('does not clobber a value the user already typed over it', () => {
    seedTokens({ access_token: 'at-from-vault' });
    mountSection(<VciCredentialPanels op="cred-issue" loading={false} onRun={vi.fn()} />);
    const field = screen.getByLabelText(/Access Token/i) as HTMLInputElement;

    fireEvent.change(field, { target: { value: 'hand-typed-token' } });
    fireEvent.focus(field);

    expect(field.value).toBe('hand-typed-token');
  });
});

describe('VciCredentialPanels — cred-issue', () => {
  it('parses a valid JSON order and sends it with the access token', () => {
    const spy = vi.spyOn(vciService, 'issueCredential').mockResolvedValue({});
    mountSection(<VciCredentialPanels op="cred-issue" loading={false} onRun={(r) => r()} />);
    fireEvent.change(screen.getByLabelText(/Access Token/i), { target: { value: 'at-1' } });
    fireEvent.change(screen.getByLabelText(/^Order \(JSON\)$/i), {
      target: { value: '{"requestIdentifier":"cred-42"}' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Issue Credential/i }));

    expect(spy).toHaveBeenCalledWith({
      accessToken: 'at-1',
      order: { requestIdentifier: 'cred-42' },
    });
  });

  /** Malformed JSON must not crash the handler — it wraps the raw text as `requestIdentifier` instead. */
  it('falls back to treating the raw text as the request identifier when the JSON is invalid', () => {
    const spy = vi.spyOn(vciService, 'issueCredential').mockResolvedValue({});
    mountSection(<VciCredentialPanels op="cred-issue" loading={false} onRun={(r) => r()} />);
    fireEvent.change(screen.getByLabelText(/^Order \(JSON\)$/i), { target: { value: 'not-json' } });

    fireEvent.click(screen.getByRole('button', { name: /Issue Credential/i }));

    expect(spy.mock.calls[0][0].order).toEqual({ requestIdentifier: 'not-json' });
  });
});

describe('VciCredentialPanels — cred-batch', () => {
  it('parses the batch request array and sends credential_requests, not "order"', () => {
    const spy = vi.spyOn(vciService, 'batchCredential').mockResolvedValue({});
    mountSection(<VciCredentialPanels op="cred-batch" loading={false} onRun={(r) => r()} />);
    fireEvent.change(screen.getByLabelText(/Access Token/i), { target: { value: 'at-1' } });
    fireEvent.change(screen.getByLabelText(/Requests \(JSON array\)/i), {
      target: { value: '[{"format":"vc+sd-jwt"}]' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Batch Issue/i }));

    expect(spy).toHaveBeenCalledWith({
      accessToken: 'at-1',
      credential_requests: [{ format: 'vc+sd-jwt' }],
    });
  });

  /** Malformed JSON falls back to an empty array rather than crashing or sending garbage. */
  it('falls back to an empty request list when the JSON is invalid', () => {
    const spy = vi.spyOn(vciService, 'batchCredential').mockResolvedValue({});
    mountSection(<VciCredentialPanels op="cred-batch" loading={false} onRun={(r) => r()} />);
    fireEvent.change(screen.getByLabelText(/Requests \(JSON array\)/i), {
      target: { value: '{{{not json' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Batch Issue/i }));

    expect(spy.mock.calls[0][0].credential_requests).toEqual([]);
  });
});

describe('VciCredentialPanels — deferred-issue', () => {
  it('sends the transaction order alongside the access token', () => {
    const spy = vi.spyOn(vciService, 'issueDeferred').mockResolvedValue({});
    mountSection(<VciCredentialPanels op="deferred-issue" loading={false} onRun={(r) => r()} />);
    fireEvent.change(screen.getByLabelText(/Access Token/i), { target: { value: 'at-1' } });
    fireEvent.change(screen.getByLabelText(/^Order \(JSON\)$/i), {
      target: { value: '{"transactionId":"txn-9"}' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Issue Deferred/i }));

    expect(spy).toHaveBeenCalledWith({ accessToken: 'at-1', order: { transactionId: 'txn-9' } });
  });

  /**
   * Malformed JSON falls back to the raw text as `transactionId` — a plain deferred code pasted without
   * the surrounding JSON object still reaches the server as a usable order.
   */
  it('falls back to treating the raw text as the transaction id when the JSON is invalid', () => {
    const spy = vi.spyOn(vciService, 'issueDeferred').mockResolvedValue({});
    mountSection(<VciCredentialPanels op="deferred-issue" loading={false} onRun={(r) => r()} />);
    fireEvent.change(screen.getByLabelText(/^Order \(JSON\)$/i), { target: { value: 'txn-bare' } });

    fireEvent.click(screen.getByRole('button', { name: /Issue Deferred/i }));

    expect(spy.mock.calls[0][0].order).toEqual({ transactionId: 'txn-bare' });
  });
});
