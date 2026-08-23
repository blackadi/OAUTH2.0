import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { describe, it, expect, afterEach } from 'vitest';
import { useUrlState } from '@/hooks/useUrlState';

/**
 * Section state that lives in the URL.
 *
 * Twenty-two routes and, before this, **zero** query state: a tab, a wizard step and an expanded trace
 * row were all invisible to the address bar. In a debugger the natural unit of conversation is *a
 * specific operation in a specific run*, and there was no way to name one — so *"look at what happened
 * on the introspection step"* could not be communicated, Back left the section instead of undoing the
 * tab, and a reload lost your place mid-protocol.
 */

const OPS = ['userinfo', 'introspect', 'revoke'] as const;
type Op = (typeof OPS)[number];

function Harness({ fallback = null }: { fallback?: Op | null }) {
  const [value, setValue] = useUrlState<Op>('op', OPS, fallback);
  const location = useLocation();
  const navType = useNavigationType();
  return (
    <>
      <span data-testid="value">{value ?? 'none'}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="nav-type">{navType}</span>
      {OPS.map((op) => (
        <button key={op} onClick={() => setValue(op)}>
          set {op}
        </button>
      ))}
      <button onClick={() => setValue(null)}>clear</button>
    </>
  );
}

function at(search: string, fallback?: Op | null) {
  return render(
    <MemoryRouter initialEntries={[`/token-ops${search}`]}>
      <Harness fallback={fallback} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('useUrlState', () => {
  it('reads the value out of the query string', () => {
    at('?op=introspect');
    expect(screen.getByTestId('value')).toHaveTextContent('introspect');
  });

  it('returns the fallback when the parameter is absent', () => {
    at('');
    expect(screen.getByTestId('value')).toHaveTextContent('none');

    cleanup();
    at('', 'userinfo');
    expect(screen.getByTestId('value')).toHaveTextContent('userinfo');
  });

  /**
   * The value arrives from the URL, so it is somebody else's input. Trusting it would render a section
   * whose tab bar has no selected tab and whose panel matches no branch — a blank screen from a typo.
   */
  it('rejects a value outside the allowed set rather than trusting the URL', () => {
    at('?op=nonsense');
    expect(screen.getByTestId('value')).toHaveTextContent('none');

    cleanup();
    at('?op=nonsense', 'userinfo');
    expect(screen.getByTestId('value')).toHaveTextContent('userinfo');
  });

  it('writes the value into the query string', () => {
    at('');
    fireEvent.click(screen.getByRole('button', { name: 'set revoke' }));
    expect(screen.getByTestId('value')).toHaveTextContent('revoke');
    expect(screen.getByTestId('search')).toHaveTextContent('op=revoke');
  });

  it('removes the parameter rather than writing an empty one', () => {
    at('?op=revoke');
    fireEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(screen.getByTestId('search')).not.toHaveTextContent('op=');
    expect(screen.getByTestId('value')).toHaveTextContent('none');
  });

  it('leaves other query parameters alone', () => {
    at('?keep=yes&op=userinfo');
    fireEvent.click(screen.getByRole('button', { name: 'set revoke' }));
    const search = screen.getByTestId('search').textContent ?? '';
    expect(search).toContain('keep=yes');
    expect(search).toContain('op=revoke');
  });

  /**
   * `replace`, not `push`. Selecting a tab refines where you already are; pushing would make Back walk
   * through every tab somebody clicked before it left the section, which is worse than the `useState`
   * behaviour it replaced.
   *
   * Asserted through `useNavigationType`, which reports how the current entry was reached — the one
   * thing about history depth that is actually observable from inside the router. Reaching for
   * `window.history` here would prove nothing, because `MemoryRouter` keeps its own stack.
   */
  it('replaces rather than pushing, so Back leaves the section rather than walking the tabs', () => {
    render(
      <MemoryRouter initialEntries={['/token-ops']}>
        <Harness />
      </MemoryRouter>,
    );

    // The initial render was not a navigation at all.
    expect(screen.getByTestId('nav-type')).toHaveTextContent('POP');

    fireEvent.click(screen.getByRole('button', { name: 'set userinfo' }));
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');

    fireEvent.click(screen.getByRole('button', { name: 'set revoke' }));
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    expect(screen.getByTestId('search')).toHaveTextContent('op=revoke');
  });
});
