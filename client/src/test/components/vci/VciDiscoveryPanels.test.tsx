import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { VciDiscoveryPanel, isDiscoveryOp } from '@/components/vci/VciDiscoveryPanels';
import { vciService } from '@/services';

/**
 * The four discovery lookups, as data — and `isDiscoveryOp`, the one export `VciSection` uses to decide
 * whether an operation belongs to this file at all. `VciSection.driven.test.tsx` drives one of the four
 * (`metadata`) through the full section; this covers the other three and the discriminator itself,
 * neither of which that suite has reason to touch.
 */

afterEach(cleanup);

describe('isDiscoveryOp', () => {
  it('recognises all four discovery operations', () => {
    for (const op of ['metadata', 'jwtissuer', 'jwks', 'wellknown']) {
      expect(isDiscoveryOp(op)).toBe(true);
    }
  });

  it('rejects an operation from another VCI category', () => {
    expect(isDiscoveryOp('offer-create')).toBe(false);
    expect(isDiscoveryOp('cred-issue')).toBe(false);
    expect(isDiscoveryOp('')).toBe(false);
  });
});

describe('VciDiscoveryPanel', () => {
  it('renders nothing for an operation it does not own', () => {
    const { container } = render(
      <VciDiscoveryPanel op="offer-create" loading={false} onRun={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['jwtissuer', /Fetch JWT Issuer/i, 'getJwtIssuer'],
    ['jwks', /Fetch JWKS/i, 'getJwks'],
    ['wellknown', /Fetch Well-Known/i, 'getWellKnown'],
  ] as const)(
    'wires %s to vciService.%s, with no credential involved',
    (op, buttonName, method) => {
      const spy = vi.spyOn(vciService, method).mockResolvedValue({});
      const onRun = vi.fn((run: () => Promise<unknown>) => run());
      render(<VciDiscoveryPanel op={op} loading={false} onRun={onRun} />);

      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      expect(onRun).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith();
    },
  );

  it('disables the button while loading', () => {
    render(<VciDiscoveryPanel op="metadata" loading={true} onRun={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Fetch Metadata/i })).toBeDisabled();
  });
});
