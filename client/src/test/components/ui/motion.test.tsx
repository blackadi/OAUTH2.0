import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { TokenOutcome } from '@/components/ui/TokenOutcome';

/**
 * Motion that does work (P3-3).
 *
 * The audit's D8 finding was not that there is too little motion — it is that **none of it did any
 * work**. `FlowDiagram`'s circle already carried `transition-all duration-300` while *"a new response
 * appears instantly with no cue drawing the eye"*. Two events in a debugger deserve a cue: a response
 * arrived, and the flow advanced a step.
 *
 * **jsdom runs no animations**, so none of this measures pixels. What it measures is the two things that
 * are actually easy to get wrong and invisible without a test:
 *
 * 1. **The remount.** A CSS animation fires on mount, so an in-place text update animates *nothing* —
 *    which is exactly the "second run of the same operation" case. The keys are what make a changed
 *    response a new node, and a key that never changes is a reveal that only ever plays once.
 * 2. **The reduced-motion contract**, read from the stylesheet rather than assumed. A new `@keyframes`
 *    added later with no coverage in that media query is the regression this guards, and no other gate
 *    in the repo can see it: `check-contrast.mjs` scores colour, `check-theme-tokens.mjs` maps tokens.
 */

afterEach(cleanup);

const CSS = readFileSync(resolve(__dirname, '../../../styles/globals.css'), 'utf8');

describe('the reveal is a remount, not a repaint', () => {
  it('animates the response body when the payload changes', () => {
    const { rerender } = render(<JsonBlock data={{ access_token: 'first' }} />);
    const first = document.querySelector('pre');
    expect(first).toHaveClass('animate-reveal');

    rerender(<JsonBlock data={{ access_token: 'second' }} />);
    const second = document.querySelector('pre');
    // A different node, so the animation plays again. Same node would mean the text changed underneath
    // an element that had already finished animating — the defect this exists to prevent.
    expect(second).not.toBe(first);
  });

  /**
   * The other half, and the reason the key is the payload rather than a counter: an identical response
   * is not news. Re-animating it would point at something that did not change.
   */
  it('leaves the node alone when the payload is unchanged', () => {
    const { rerender } = render(<JsonBlock data={{ access_token: 'same' }} label="Response" />);
    const first = document.querySelector('pre');

    rerender(<JsonBlock data={{ access_token: 'same' }} label="Response" />);
    expect(document.querySelector('pre')).toBe(first);
  });

  it('animates the token summary on a new token, not on a re-render', () => {
    const tokens = { access_token: 'at-1', token_type: 'Bearer' };
    // `TokenOutcome` links to the sections a token can be spent in, so it needs a router.
    const outcome = (t: typeof tokens) => (
      <MemoryRouter>
        <TokenOutcome tokens={t} />
      </MemoryRouter>
    );
    const { rerender } = render(outcome(tokens));
    const card = screen.getByText(/You now hold:/i).parentElement;
    expect(card).toHaveClass('animate-reveal');

    rerender(outcome({ ...tokens }));
    expect(screen.getByText(/You now hold:/i).parentElement).toBe(card);

    rerender(outcome({ ...tokens, access_token: 'at-2' }));
    expect(screen.getByText(/You now hold:/i).parentElement).not.toBe(card);
  });
});

describe('the step advance points at the step that moved', () => {
  const STEPS = [
    { id: 'a', label: 'One' },
    { id: 'b', label: 'Two' },
    { id: 'c', label: 'Three' },
  ];

  function circles(): Element[] {
    return Array.from(document.querySelectorAll('[role="listitem"] .rounded-full'));
  }

  it('animates only the completed and current steps, never the pending ones', () => {
    render(<FlowDiagram steps={STEPS} currentStep="b" completedSteps={['a']} />);
    const [a, b, c] = circles();

    expect(a, 'completed').toHaveClass('animate-step-in');
    expect(b, 'current').toHaveClass('animate-step-in');
    // Animating all three would be decoration: it would say nothing about which one just changed.
    expect(c, 'pending').not.toHaveClass('animate-step-in');
  });

  it('remounts the circle whose state changed, and only that one', () => {
    const { rerender } = render(<FlowDiagram steps={STEPS} currentStep="a" completedSteps={[]} />);
    const [beforeA, beforeB, beforeC] = circles();

    rerender(<FlowDiagram steps={STEPS} currentStep="b" completedSteps={['a']} />);
    const [afterA, afterB, afterC] = circles();

    expect(afterA, 'current → completed').not.toBe(beforeA);
    expect(afterB, 'pending → current').not.toBe(beforeB);
    expect(afterC, 'still pending, so nothing to announce').toBe(beforeC);
  });
});

describe('every animation this stylesheet defines is answered by the reduced-motion block', () => {
  const reducedBlock = (() => {
    const at = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at, 'the media query itself is the whole guarantee').toBeGreaterThan(-1);
    // Walk to the matching close brace rather than regexing nested blocks.
    let depth = 0;
    let i = CSS.indexOf('{', at);
    const start = i;
    for (; i < CSS.length; i++) {
      if (CSS[i] === '{') depth++;
      else if (CSS[i] === '}' && --depth === 0) break;
    }
    return CSS.slice(start, i);
  })();

  it('collapses every animation with one blanket rule, so a new keyframe is covered on arrival', () => {
    // The blanket `*` selector is the point: an author adding `@keyframes` next month gets reduced
    // motion for free, which is the opposite of a per-animation list that silently goes stale.
    expect(reducedBlock).toMatch(/\*[\s,]*\*::before[\s,]*\*::after/);
    expect(reducedBlock).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reducedBlock).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  /**
   * `both` is what makes the blanket rule land on the *finished* state. Without it a 0.01ms single
   * iteration leaves the element at its pre-animation values — a permanently 4px-low, transparent
   * response body for anyone who asked for less motion.
   */
  it('gives both new animations a fill mode, so collapsing them lands on the end state', () => {
    for (const name of ['reveal', 'step-in']) {
      expect(CSS, `@keyframes ${name}`).toMatch(new RegExp(`@keyframes\\s+${name}\\s*\\{`));
    }
    expect(CSS).toMatch(/\.animate-reveal\s*\{\s*animation:\s*reveal[^;]*\bboth\b/);
    expect(CSS).toMatch(/\.animate-step-in\s*\{\s*animation:\s*step-in[^;]*\bboth\b/);
  });

  /**
   * A spinner that stops reads as a hung request, which is worse than the motion it removed. This is the
   * one exemption, and it is slowed rather than stopped.
   */
  it('keeps the spinner turning, slowly, rather than stopping it', () => {
    expect(reducedBlock).toMatch(/\.animate-spin\s*\{[^}]*animation-iteration-count:\s*infinite/);
  });

  /**
   * Amplitude is the argument for why this is safe to add at all: below the threshold where motion
   * becomes a vestibular risk. A later edit that raises `translateY` to 40px or the scale to 1.6 should
   * have to change this test and say why.
   */
  it('keeps both amplitudes small enough that the reduced-motion block is a courtesy, not a rescue', () => {
    const reveal = /@keyframes reveal\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';
    const px = [...reveal.matchAll(/translateY\((-?[\d.]+)px\)/g)].map((m) => Math.abs(+m[1]));
    expect(px.length).toBeGreaterThan(0);
    expect(Math.max(...px)).toBeLessThanOrEqual(8);

    const stepIn = /@keyframes step-in\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';
    const scales = [...stepIn.matchAll(/scale\(([\d.]+)\)/g)].map((m) => +m[1]);
    expect(scales.length).toBeGreaterThan(0);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.15);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.75);
  });
});
