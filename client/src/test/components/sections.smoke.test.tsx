/**
 * Smoke coverage for every section, plus regression locks on the three dead controls found on
 * 2026-08-21.
 *
 * **Why this file exists.** Before it, 3 of 41 components had a test — `Badge`, `Button`, `JsonBlock` —
 * and nothing in CI ever rendered a screen. Typecheck, lint, 118 tests and the production build were
 * all green while three primary controls were permanently disabled and a fourth button silently did
 * nothing. Two of the three took a 25-line render test to find, which is the whole argument: the
 * defect class is invisible to every other gate this repo runs.
 *
 * The `renders + has an enabled control` sweep below is deliberately shallow. It is a smoke detector,
 * not a fire inspection — it cannot tell you a section *works*, only that it mounted and offers the
 * user something to click. Anything stronger belongs in a per-section test with its own mocks.
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenProvider } from '@/context/TokenContext';

import AuthFlowsSection from '@/components/auth/AuthFlowsSection';
import { TokenOpsSection } from '@/components/oidc/TokenOpsSection';
import { StepUpSection } from '@/components/oidc/StepUpSection';
import { LogoutSection } from '@/components/oidc/LogoutSection';
import { DcrSection } from '@/components/oidc/DcrSection';
import { CibaSection } from '@/components/oidc/CibaSection';
import { ParSection } from '@/components/oidc/ParSection';
import { RarSection } from '@/components/oidc/RarSection';
import { JarSection } from '@/components/oidc/JarSection';
import { DeviceSection } from '@/components/oidc/DeviceSection';
import { BackchannelLogoutSection } from '@/components/oidc/BackchannelLogoutSection';
import { DiscoverySection } from '@/components/oidc/DiscoverySection';
import { FederationSection } from '@/components/oidc/FederationSection';
import { FapiSection } from '@/components/fapi/FapiSection';
import { McpSection } from '@/components/mcp/McpSection';
import { VciSection } from '@/components/vci/VciSection';
import { AdminSection } from '@/components/admin/AdminSection';
import { ClientManagementSection } from '@/components/admin/ClientManagementSection';
import { GrantManagementSection } from '@/components/admin/GrantManagementSection';
import { HealthSection } from '@/components/admin/HealthSection';

import { rarService } from '@/services';

/** A section is only useful with a token in hand, so seed one for the whole file. */
const SEEDED_TOKEN = {
  access_token: 'at-smoke-0001',
  refresh_token: 'rt-smoke-0001',
  token_type: 'Bearer',
};

function mount(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <TokenProvider>{ui}</TokenProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('token_response', JSON.stringify(SEEDED_TOKEN));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── the sweep ────────────────────────────────────────────────────────────────────────────────────

/**
 * `gate` records *why* a section may open with nothing pressable, which is the only way this sweep can
 * tell a deliberate precondition from a dead control:
 *
 * - `open` — usable straight away, so at least one button must be enabled on first paint. A section
 *   here with everything disabled is the StepUpSection defect, which shipped and stayed shipped.
 * - `credentials` — fails closed until this deployment's management credentials are entered, which is
 *   the correct posture for the admin surfaces (`requireBasicAuth` refuses them anyway). Asserting the
 *   credential field exists is what separates "waiting for input" from "broken".
 */
type Gate = 'open' | 'credentials';

const SECTIONS: [name: string, node: React.ReactElement, gate: Gate][] = [
  ['Grant Flows', <AuthFlowsSection />, 'open'],
  ['Token Operations', <TokenOpsSection />, 'open'],
  ['Step-Up Auth', <StepUpSection />, 'open'],
  ['Logout', <LogoutSection />, 'open'],
  ['DCR', <DcrSection />, 'open'],
  ['CIBA', <CibaSection />, 'open'],
  ['PAR', <ParSection />, 'open'],
  ['RAR', <RarSection />, 'open'],
  ['JAR', <JarSection />, 'open'],
  ['Device Flow', <DeviceSection />, 'open'],
  ['Backchannel Logout', <BackchannelLogoutSection />, 'credentials'],
  ['Discovery', <DiscoverySection />, 'open'],
  ['Federation', <FederationSection />, 'open'],
  ['FAPI', <FapiSection />, 'open'],
  ['MCP', <McpSection />, 'open'],
  ['VCI', <VciSection />, 'open'],
  ['Token Management', <AdminSection />, 'credentials'],
  ['Client Management', <ClientManagementSection />, 'credentials'],
  // Not admin credentials: this section takes a bearer token and a grant id as free text, and both
  // buttons gate on having them. Same shape, same justification.
  ['Grant Management', <GrantManagementSection />, 'credentials'],
  ['Health Check', <HealthSection />, 'open'],
];

describe('every section mounts and offers a control', () => {
  it.each(SECTIONS)('%s', (_name, node, gate) => {
    mount(node);
    // Tabs count. `role="tab"` replaces the implicit button role, so several sections whose only
    // first-paint controls are tabs would otherwise look like they offer nothing — which is how this
    // assertion started failing the moment TabBar gained proper tab-list semantics.
    const controls = [...screen.queryAllByRole('button'), ...screen.queryAllByRole('tab')];
    expect(controls.length).toBeGreaterThan(0);

    if (gate === 'open') {
      expect(controls.some((c) => !(c as HTMLButtonElement).disabled)).toBe(true);
      return;
    }

    // Credential-gated: prove the gate is an input it is waiting on, not a dead control.
    const inputs = screen.getAllByRole('textbox', { hidden: true });
    const passwords = document.querySelectorAll('input[type="password"]');
    expect(inputs.length + passwords.length).toBeGreaterThan(0);
  });
});

// ── regression locks ─────────────────────────────────────────────────────────────────────────────

describe('Step-Up: the primary control is reachable (F-02)', () => {
  it('is enabled when an access token is present', () => {
    mount(<StepUpSection />);
    expect(screen.getByRole('button', { name: /Introspect with Requirements/i })).toBeEnabled();
  });

  it('hides the control entirely with no access token, and says why', () => {
    sessionStorage.removeItem('token_response');
    mount(<StepUpSection />);
    // The section swaps the whole control block for a notice rather than rendering a disabled button.
    expect(screen.queryByRole('button', { name: /Introspect with Requirements/i })).toBeNull();
    expect(screen.getByText(/No access token available/i)).toBeInTheDocument();
  });
});

describe('Grant Flows: the JWT Bearer grant is submittable (F-03)', () => {
  it('enables once an assertion is supplied, and gates on it being present', async () => {
    mount(<AuthFlowsSection />);
    fireEvent.click(screen.getByRole('tab', { name: /JWT Bearer/i }));

    const submit = await screen.findByRole('button', { name: /Exchange JWT for Token/i });
    expect(submit).toBeDisabled(); // no assertion yet — the real precondition

    fireEvent.change(screen.getByPlaceholderText(/Paste a signed JWT/i), {
      target: { value: 'aaa.bbb.ccc' },
    });
    expect(submit).toBeEnabled();
  });
});

describe('RAR: the PAR response is read by its RFC 9126 §2.2 names (F-04)', () => {
  it('surfaces request_uri from a snake_case response', async () => {
    vi.spyOn(rarService, 'pushAuthorization').mockResolvedValue({
      request_uri: 'urn:ietf:params:oauth:request_uri:smoke-1',
      expires_in: 600,
    });

    mount(<RarSection />);
    // "Push PAR Only" only exists once PAR is enabled.
    fireEvent.click(screen.getByRole('checkbox', { name: /PAR/i }));
    fireEvent.click(screen.getByRole('button', { name: /Push PAR Only/i }));

    // `Reset` is gated on `parResult?.request_uri`. Reading Authlete's camelCase `requestUri` left it
    // `undefined`, so this button never appeared and the section offered no way forward after a
    // successful push. Asserting on it rather than on the JSON dump is deliberate: the raw response
    // renders either way, so it cannot distinguish the defect from the fix.
    expect(await screen.findByRole('button', { name: /^Reset$/i })).toBeInTheDocument();
    // Shown in the callout and in the raw response dump, hence getAllByText.
    await waitFor(() =>
      expect(
        screen.getAllByText(/urn:ietf:params:oauth:request_uri:smoke-1/).length,
      ).toBeGreaterThan(0),
    );
  });
});
