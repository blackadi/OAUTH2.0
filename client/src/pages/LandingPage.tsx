import { Link } from 'react-router-dom';
import { useState } from 'react';
import { KeyRound, BookOpen, Activity, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  API_BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  DEFAULT_SCOPES,
  PLACEHOLDER_CLIENT_SECRET,
  getRedirectUri,
} from '@/config';
import { useServerStatus } from '@/hooks/useServerStatus';
import { shouldSkipLanding, setSkipLanding } from '@/services/preferences';
import { buttonVariants } from '@/components/ui/Button';
import { Prose } from '@/components/ui/Prose';
import { cn } from '@/utils/cn';
import { Checkbox } from '@/components/ui/Checkbox';

/**
 * The on-ramp, which was the widest competitive gap in the audit.
 *
 * **What this replaces.** `/` was `<Navigate to="/auth-flows" replace />` — so first paint was a
 * twenty-item sidebar and a form, with nothing saying what the tool is, what needs configuring, or which
 * of the twenty-two things to click. The audit's own summary was blunt about it: *"this product is
 * already the best of the five at explaining a parameter and at explaining an error, and the worst of the
 * five at getting someone started"*, on-ramp scored 1/5. Q1 offered three shapes; this is (b), a genuine
 * landing route, with (a)'s `client_id` hint folded in and (c) — the `/reference` reading surface —
 * already shipped and linked from here.
 *
 * **It is a reading surface, so it is held to that standard**, the same as `ReferencePage`: single
 * column, prose measured, every claim on it true of *this* deployment rather than of the README's.
 *
 * ## The one thing that makes it more than a welcome mat
 *
 * The configuration block reads the **live** values and says which ones are still placeholders. A
 * getting-started page that recites what `.env` *should* contain is documentation; one that shows what it
 * *does* contain is a debugger, and it answers the first question a stuck person actually has. The
 * placeholder rules are not restated here either — `config.ts` owns them (`PLACEHOLDER_CLIENT_SECRET`,
 * `secretOrEmpty`) and this page consumes that judgement, because a second copy would be the one that
 * goes stale.
 *
 * `client_id`'s placeholder is reported as a **problem** and `client_secret`'s absence as **correct**,
 * which looks asymmetric and is not: the SPA's own client is public with `tokenAuthMethod: NONE`, and
 * Authlete refuses any client-authentication data for such a client with `[A157303]`. An empty secret is
 * the configured state, not an unfinished one.
 */

interface StatusLine {
  label: string;
  value: string;
  /** `ok` renders a tick, `warn` a triangle. `null` is informational — neither right nor wrong. */
  tone: 'ok' | 'warn' | null;
  note: string;
}

function LandingPage() {
  const { status, uptime } = useServerStatus();
  const [skip, setSkip] = useState(() => shouldSkipLanding());

  const clientIdIsPlaceholder = CLIENT_ID === 'your_client_id';

  const lines: StatusLine[] = [
    {
      label: 'Authorization server',
      value: API_BASE_URL,
      tone: status === 'connected' ? 'ok' : status === 'checking' ? null : 'warn',
      note:
        status === 'connected'
          ? `Reachable${uptime ? `, up ${uptime}` : ''}. Every request this page makes goes here.`
          : status === 'checking'
            ? 'Checking…'
            : 'Not answering. Start it with `npm --prefix server run dev`, then reload.',
    },
    {
      label: 'client_id',
      value: CLIENT_ID,
      tone: clientIdIsPlaceholder ? 'warn' : 'ok',
      note: clientIdIsPlaceholder
        ? 'Still the placeholder. Set `VITE_CLIENT_ID` in `client/.env` to a client registered on your Authlete service — the Client Management section can list them, or create one.'
        : 'Read from `VITE_CLIENT_ID`. This is the client every flow below authenticates as.',
    },
    {
      label: 'client_secret',
      value: CLIENT_SECRET === '' ? '(none — public client)' : '(set)',
      /**
       * Empty is **correct**, not unfinished, and saying so here saves the afternoon that finding out the
       * hard way costs. `config.ts` recognises the literal placeholder and treats it as absent; the check
       * here is against that same constant rather than a second copy of the string.
       */
      tone: 'ok',
      note:
        CLIENT_SECRET === ''
          ? `Correct for this SPA: its own client is public, so it authenticates with nothing. Leave \`VITE_CLIENT_SECRET\` empty — the literal \`${PLACEHOLDER_CLIENT_SECRET}\` is recognised and treated as absent.`
          : 'Set, so the token endpoint will receive HTTP Basic credentials. Only correct for a confidential client.',
    },
    {
      label: 'redirect_uri',
      value: getRedirectUri(),
      tone: null,
      note: 'Must match a redirect URI registered on the client, exactly — a trailing slash is a different URI.',
    },
    {
      label: 'scope',
      value: DEFAULT_SCOPES,
      tone: null,
      note: 'The default request. Editable on every flow, and `openid` is what makes a request OpenID Connect rather than plain OAuth.',
    },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-accent-text shrink-0" />
          {/* The only `h1` on the route, per the heading-tree rule the routes test enforces. */}
          <h1 className="text-base font-semibold text-foreground tracking-tight m-0">
            An OAuth 2.x and OpenID Connect server you can see inside
          </h1>
        </div>
        <Prose as="p" className="text-sm text-foreground-muted leading-relaxed max-w-prose m-0">
          This is a real authorization server — Authlete behind an Express deployment — paired with
          a debugger for it. Every request the tool sends is captured with its status, its headers
          and its timing, including the two front-channel hops most tools cannot see. Twenty-two
          sections cover the grant flows and the extensions around them: PAR, RAR, JAR, DPoP, CIBA,
          the device flow, dynamic registration, token exchange, verifiable credentials.
        </Prose>
        <Prose as="p" className="text-sm text-muted-foreground leading-relaxed max-w-prose m-0">
          Nothing here is a mock. If a request is refused you will see the authorization
          server&apos;s own refusal, and the error explainer will tell you what the code means —
          including the vendor codes, which are reproduced against this deployment rather than
          copied from a document.
        </Prose>
      </header>

      {/* ── what to configure ───────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground m-0">What is configured right now</h2>
        <Prose as="p" className="text-xs text-muted-foreground max-w-prose m-0">
          Read from this build, not from the README. Anything marked with a triangle will make a
          flow fail, and says how to fix it.
        </Prose>
        <dl className="m-0 rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
          {lines.map((line) => (
            <div key={line.label} className="px-3 py-2.5 flex flex-col sm:flex-row sm:gap-4">
              <dt className="text-xs font-mono text-foreground shrink-0 sm:w-40 flex items-center gap-1.5">
                {/*
                  The icons carry state, so they carry a name. A tick and a triangle differing only in
                  shape and hue say nothing to a screen reader and little to anyone who cannot separate
                  green from amber — the same finding `FlowDiagram` records about its step circles, where
                  colour alone had been the whole signal. `role="img"` plus `aria-label` is what puts the
                  distinction in the accessibility tree; the note beside it says what to do about it.
                */}
                {line.tone === 'ok' && (
                  <Check
                    role="img"
                    aria-label="configured correctly"
                    className="h-3 w-3 text-success-text shrink-0"
                  />
                )}
                {line.tone === 'warn' && (
                  <AlertTriangle
                    role="img"
                    aria-label="needs attention"
                    className="h-3 w-3 text-warning-text shrink-0"
                  />
                )}
                {line.label}
              </dt>
              <dd className="m-0 min-w-0 space-y-0.5">
                <span className="block text-xs font-mono text-accent-text break-all">
                  {line.value}
                </span>
                <Prose
                  as="p"
                  className={cn(
                    'text-2xs leading-relaxed m-0',
                    line.tone === 'warn' ? 'text-warning-text' : 'text-muted-foreground',
                  )}
                >
                  {line.note}
                </Prose>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── run your first flow ─────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground m-0">Run your first flow</h2>
        <Prose as="p" className="text-sm text-muted-foreground max-w-prose m-0">
          One path, not a tour. The authorization-code flow with PKCE — the one almost every
          application should use, and the one the other twenty-one sections are variations on.
        </Prose>
        <ol className="m-0 p-0 list-none space-y-2.5 max-w-prose">
          {[
            {
              title: 'Open Grant Flows and read the request before sending it',
              body: 'Twenty-four parameters, each with its conformance word and a verified specification reference. The URL shown above the button is the exact string the browser will be sent to — not an approximation of it.',
            },
            {
              title: 'Send it, then sign in as the demo user',
              body: 'The browser leaves for the authorization endpoint, which is the front channel. Default credentials are admin / password unless AUTH_USERS was set on the server.',
            },
            {
              title: 'Come back and watch the code become a token',
              body: 'The callback checks state, then exchanges the code together with the PKCE verifier. Open the request trace at the bottom of the window to see all five requests, and the sequence view to see them as a conversation.',
            },
          ].map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-tint-accent-strong text-accent-text text-2xs font-semibold tabular-nums mt-0.5">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-foreground m-0">{step.title}</p>
                <Prose as="p" className="text-xs text-muted-foreground leading-relaxed m-0 mt-0.5">
                  {step.body}
                </Prose>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/*
            `?op=authorization_code` rather than a bare `/auth-flows`, which is the payoff from putting
            the tab in the URL: the link lands on the flow this page just described instead of on
            whichever tab happens to be the default.
          */}
          {/*
            A `Link` wearing the button's classes rather than a `Button` wrapping a `Link`. This is
            navigation, so it must be an anchor — middle-click, copy-link and "open in new tab" all
            depend on it, and a `<button>` that navigates has none of them. `buttonVariants` is exported
            from `Button` for exactly this.
          */}
          <Link to="/auth-flows?op=authorization_code" className={buttonVariants()}>
            Start the authorization-code flow
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
          <Link
            to="/reference"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Or read the reference first
          </Link>
          <Link
            to="/health"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Activity className="h-3.5 w-3.5" />
            Check the server
          </Link>
        </div>
      </section>

      {/* ── the preference ──────────────────────────────────────────────────────────────────────── */}
      <section className="pt-2 border-t border-border">
        <label className="flex items-start gap-2 cursor-pointer max-w-prose">
          <Checkbox
            checked={skip}
            onChange={(e) => {
              setSkip(e.target.checked);
              setSkipLanding(e.target.checked);
            }}
            className="w-3.5 h-3.5 mt-0.5"
          />
          <span className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground">Go straight to Grant Flows next time.</span> This page
            stays at <code className="text-accent-text">/start</code> either way — the preference
            only changes what <code className="text-accent-text">/</code> does, and unticking the
            box brings it back.
          </span>
        </label>
      </section>
    </div>
  );
}

export default LandingPage;
