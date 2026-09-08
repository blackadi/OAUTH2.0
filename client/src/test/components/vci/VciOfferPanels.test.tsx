import { screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { VciOfferPanels } from '@/components/vci/VciOfferPanels';
import { vciService } from '@/services';
import { mountSection } from '@/test/helpers/drive-section';

/**
 * The two admin-gated offer operations. `VciSection.driven.test.tsx` covers the admin-auth channel
 * (this file's whole reason for existing, per its own doc comment) and a bare "Create Offer" click; the
 * gaps are the body this component actually constructs — the tx_code sub-fields that only apply to the
 * pre-authorized flow, the grant-type checkboxes, and the malformed-JSON fallback for the credential
 * configuration IDs field.
 */

afterEach(cleanup);

describe('VciOfferPanels — unrecognised op', () => {
  it('renders nothing for an operation it does not own', () => {
    const { container } = mountSection(
      <VciOfferPanels op="cred-issue" auth="x" loading={false} onRun={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('VciOfferPanels — offer-create body construction', () => {
  it('parses the credential configuration IDs as JSON when it is valid JSON', () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue({});
    mountSection(
      <VciOfferPanels op="offer-create" auth="admin-auth" loading={false} onRun={(r) => r()} />,
    );
    fireEvent.change(screen.getByLabelText(/Credential Configuration IDs/i), {
      target: { value: '["A", "B"]' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Offer/i }));

    const [body] = spy.mock.calls[0];
    expect(body.credentialConfigurationIds).toEqual(['A', 'B']);
  });

  /**
   * Malformed JSON must not crash the click handler — it falls back to wrapping the raw text as a
   * single-element array, so a learner who typed a bare string still gets a request rather than an
   * unhandled exception.
   */
  it('falls back to a single-element array when the field is not valid JSON', () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue({});
    mountSection(
      <VciOfferPanels op="offer-create" auth="admin-auth" loading={false} onRun={(r) => r()} />,
    );
    fireEvent.change(screen.getByLabelText(/Credential Configuration IDs/i), {
      target: { value: 'NotJson' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Offer/i }));

    const [body] = spy.mock.calls[0];
    expect(body.credentialConfigurationIds).toEqual(['NotJson']);
  });

  it('omits subject, duration and context when left blank, rather than sending them empty', () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue({});
    mountSection(
      <VciOfferPanels op="offer-create" auth="admin-auth" loading={false} onRun={(r) => r()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Create Offer/i }));

    const [body] = spy.mock.calls[0];
    expect(body).not.toHaveProperty('subject');
    expect(body).not.toHaveProperty('duration');
    expect(body).not.toHaveProperty('context');
  });

  it('sends the duration as a number, not the typed string', () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue({});
    mountSection(
      <VciOfferPanels op="offer-create" auth="admin-auth" loading={false} onRun={(r) => r()} />,
    );
    fireEvent.change(screen.getByLabelText(/Duration in seconds/i), { target: { value: '3600' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Offer/i }));

    expect(spy.mock.calls[0][0].duration).toBe(3600);
  });

  /**
   * The tx_code block is scoped to `preAuthGrant` in the UI (a `pl-3 border-l-2` sub-section) and in the
   * body: even a filled-in transaction code must not travel when the pre-authorized grant itself is
   * unchecked, because §5.1.1 defines `tx_code` as a property of that grant's `transaction_code`.
   */
  it('shows and sends tx_code fields only while the pre-authorized grant is checked', () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue({});
    mountSection(
      <VciOfferPanels op="offer-create" auth="admin-auth" loading={false} onRun={(r) => r()} />,
    );

    // Checked by default — the tx_code fields are visible from the start.
    expect(screen.getByLabelText(/Transaction Code/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Transaction Code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Input Mode/i), { target: { value: 'numeric' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Offer/i }));
    expect(spy.mock.calls[0][0]).toMatchObject({ txCode: '123456', txCodeInputMode: 'numeric' });

    spy.mockClear();
    fireEvent.click(screen.getByLabelText(/Pre-Authorized Code/i));
    expect(screen.queryByLabelText(/Transaction Code/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create Offer/i }));
    const body = spy.mock.calls[0][0];
    expect(body.preAuthorizedCodeGrantIncluded).toBe(false);
    expect(body).not.toHaveProperty('txCode');
  });

  it('reports both grant-inclusion flags explicitly, not only when true', () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue({});
    mountSection(
      <VciOfferPanels op="offer-create" auth="admin-auth" loading={false} onRun={(r) => r()} />,
    );
    fireEvent.click(screen.getByLabelText(/Authorization Code/i));
    fireEvent.click(screen.getByRole('button', { name: /Create Offer/i }));

    const [body] = spy.mock.calls[0];
    expect(body.preAuthorizedCodeGrantIncluded).toBe(true);
    expect(body.authorizationCodeGrantIncluded).toBe(true);
  });

  it('passes the caller-supplied auth string straight through to the service', () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue({});
    mountSection(
      <VciOfferPanels
        op="offer-create"
        auth="pre-encoded-auth"
        loading={false}
        onRun={(r) => r()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Create Offer/i }));
    expect(spy.mock.calls[0][1]).toBe('pre-encoded-auth');
  });
});

describe('VciOfferPanels — offer-info', () => {
  it('sends the typed identifier and the caller-supplied auth', () => {
    const spy = vi.spyOn(vciService, 'getOfferInfo').mockResolvedValue({});
    mountSection(
      <VciOfferPanels op="offer-info" auth="admin-auth" loading={false} onRun={(r) => r()} />,
    );
    fireEvent.change(screen.getByLabelText(/Offer Identifier/i), {
      target: { value: 'offer-123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Get Offer Info/i }));

    expect(spy).toHaveBeenCalledWith({ identifier: 'offer-123' }, 'admin-auth');
  });
});
