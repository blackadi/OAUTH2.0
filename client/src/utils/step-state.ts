/**
 * How a wizard step that is not yet reachable should look — without dimming its text.
 *
 * **The defect this replaces.** Seven wizard steps across the FAPI and MCP sections used
 * `opacity-50 pointer-events-none`, and axe measured the prose inside them as a **serious** contrast
 * failure. It is the same root cause as the disabled parameter row in `AuthorizeRequestBuilder`: these
 * containers hold headings, labels and explanatory text, and no opacity value fixes it — the text
 * includes `text-muted-foreground`, a token already at its AA limit, so dimming it *at all* breaks it.
 * Measured worst case was 2.36:1 at 55% and still 3.88:1 at 80%.
 *
 * **Note what is *not* wrong.** `disabled:opacity-50` on `Button`, `Input`, `Select` and `Textarea` is
 * correct and stays: WCAG 2.1 SC 1.4.3 explicitly exempts inactive user-interface components from the
 * contrast requirement, and axe does not flag them. A disabled *control* may be dim; a region full of
 * prose may not.
 *
 * **What replaces it.** A recessed surface plus a dashed edge, which reads as "not yet" without
 * touching a single glyph's contrast — and `aria-disabled`, which says the same thing to assistive
 * technology, where an opacity never did. `pointer-events-none` stays, because that was the only part
 * of the original doing functional work — but note what it is *not*: it stops a mouse and leaves the
 * tab order alone, so a caller whose step contains focusable controls has to disable them as well.
 * `FapiTestFlow`'s steps do that by
 * disabling the one button each of them holds.
 *
 * **The caller has to supply the border *width*.** `border-dashed` is a style and nothing else, so on
 * an element with no width it resolves to `border-top-width: 0px` and half of the treatment above
 * silently does not exist. That is exactly what happened to the five gated MCP steps, which were
 * `<Card>`s on the shadow-bearing default variant: the dashed edge never rendered and the whole state
 * rested on `bg-muted/30`, about 2% luminance from a ready card on the light palette. `FapiTestFlow`'s
 * two steps were fine throughout, because they are plain `<div>`s that already carry `border-t`.
 *
 * The width is left to the caller rather than added here because the two callers need different
 * widths — a full box on a card, one top rule on a divider-separated block — and because a `Card`
 * must also drop its shadow to take a border at all (DESIGN.md: one or the other, never both), which
 * is a `variant` this helper cannot set without React warning about an unknown prop on the `<div>`
 * callers.
 *
 * **`FapiTestFlow` is now the only caller.** The MCP wizard's worked example is gone: its steps are
 * transcript turns, whose "not yet" state is `data-state="pending"` plus a disabled `fieldset` plus
 * an `aria-describedby` sentence — it calls nothing here. The history below is kept because it is the
 * argument for the remaining caller's treatment, not a description of MCP as it stands.
 */

export interface StepStateAttrs {
  className: string;
  'aria-disabled': boolean | undefined;
}

/**
 * @param ready whether the step's prerequisites are met.
 * @param base classes that apply either way.
 */
export function stepState(ready: boolean, base = ''): StepStateAttrs {
  return {
    className: [
      base,
      ready ? '' : 'pointer-events-none bg-muted/30 border-dashed [&_*]:cursor-default',
    ]
      .filter(Boolean)
      .join(' '),
    // `undefined` rather than `false`: an explicit `aria-disabled="false"` on every ready step is noise
    // in the accessibility tree, and absence already means "not disabled".
    'aria-disabled': ready ? undefined : true,
  };
}
