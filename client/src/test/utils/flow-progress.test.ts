import { describe, it, expect } from 'vitest';
import { authorizationCodeProgress, twoStepProgress } from '@/utils/flow-progress';
import type { TraceEntry } from '@/services/trace-store';

function trace(url: string, ok = true, method = 'POST'): TraceEntry {
  return {
    id: url,
    startedAt: 0,
    durationMs: 1,
    method,
    url: `http://localhost:3000${url}`,
    requestHeaders: {},
    status: ok ? 200 : 400,
    statusText: '',
    responseHeaders: {},
    responseBody: {},
    ok,
  };
}

const NOTHING = { traces: [], hasToken: false, codeReceived: false, authorizeSent: false };

describe('authorization code progress', () => {
  it('starts with nothing complete and the first step current', () => {
    const p = authorizationCodeProgress(NOTHING);
    expect(p.completedSteps).toEqual([]);
    expect(p.currentStep).toBe('authz');
  });

  it('marks authorize complete once the request was actually sent', () => {
    const p = authorizationCodeProgress({
      ...NOTHING,
      traces: [trace('/api/authorization', true, 'GET')],
    });
    expect(p.completedSteps).toContain('authz');
    expect(p.currentStep).toBe('login');
  });

  it('back-fills login and consent when a code comes back, because a code proves both', () => {
    // Neither login nor consent produces a request this app makes — they happen in server-rendered
    // pages. Inferring them from the code is sound; claiming them without one would not be.
    const p = authorizationCodeProgress({ ...NOTHING, codeReceived: true, hasToken: true });
    expect(p.completedSteps).toEqual(expect.arrayContaining(['login', 'consent', 'callback']));
  });

  it('completes the token step only with a token in hand', () => {
    const withCode = authorizationCodeProgress({
      ...NOTHING,
      authorizeSent: true,
      codeReceived: false,
    });
    expect(withCode.completedSteps).not.toContain('token');

    const done = authorizationCodeProgress({
      ...NOTHING,
      hasToken: true,
      codeReceived: true,
      traces: [trace('/api/token')],
    });
    expect(done.completedSteps).toContain('token');
    expect(done.currentStep).toBeUndefined();
  });

  it('does not claim a step that produced no request and no token', () => {
    // The defect this replaces jumped straight to the last step the moment any result existed.
    const p = authorizationCodeProgress({
      ...NOTHING,
      traces: [trace('/api/discovery', true, 'GET')],
    });
    expect(p.completedSteps).toEqual([]);
  });

  it('recognises a token held from before this trace was captured', () => {
    // A page reload clears the trace; the token survives in session storage. Reporting the flow as
    // unstarted then would be wrong.
    const p = authorizationCodeProgress({ ...NOTHING, hasToken: true, codeReceived: true });
    expect(p.completedSteps).toContain('token');
  });
});

describe('two-step progress', () => {
  it('is empty before anything is attempted', () => {
    expect(twoStepProgress({ traces: [], hasToken: false }, 'auth')).toEqual({
      completedSteps: [],
      currentStep: 'auth',
    });
  });

  it('completes the first step on a failed attempt too — the credentials were assembled', () => {
    const p = twoStepProgress({ traces: [trace('/api/token', false)], hasToken: false }, 'auth');
    expect(p.completedSteps).toEqual(['auth']);
    expect(p.currentStep).toBe('token');
  });

  it('completes both once a token is obtained', () => {
    const p = twoStepProgress({ traces: [trace('/api/token')], hasToken: true }, 'auth');
    expect(p.completedSteps).toEqual(['auth', 'token']);
    expect(p.currentStep).toBeUndefined();
  });

  it('ignores management calls to /api/token/list, which are not token requests', () => {
    const p = twoStepProgress(
      { traces: [trace('/api/token/list', true, 'GET')], hasToken: false },
      'auth',
    );
    expect(p.completedSteps).toEqual([]);
  });
});
