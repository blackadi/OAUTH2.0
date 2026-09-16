import { describe, it, expect } from "vitest"
import { renderFile } from "ejs"
import path from "node:path"

/**
 * `otp.ejs` renders whether or not `error` is supplied, mirroring `login.test.ts`'s check on `login.ejs`
 * for the same reason: a render site that omits an optional local must not throw.
 */
const OTP_VIEW = path.join(__dirname, "../../../src/views/otp.ejs")

const BASE_LOCALS = {
  csrfToken: "csrf-token-value",
  error: "",
  secret: "IF2XI2DMMV2GKICEMVWW6ICPKRICCII",
  otpauthUri: "otpauth://totp/Authlete%20Node%20Authz%20Server:demo?secret=IF2XI2DMMV2GKICEMVWW6ICPKRICCII",
}

describe("otp.ejs", () => {
  it("renders the code form with the CSRF token and demo secret", async () => {
    const html = await renderFile(OTP_VIEW, BASE_LOCALS)

    expect(html).toContain('value="csrf-token-value"')
    expect(html).toContain('id="code" name="code"')
    expect(html).toContain(BASE_LOCALS.secret)
    expect(html).toContain(BASE_LOCALS.otpauthUri)
  })

  it("shows the error message when one is supplied", async () => {
    const html = await renderFile(OTP_VIEW, { ...BASE_LOCALS, error: "Invalid code" })

    expect(html).toContain("Invalid code")
  })

  it("does not show an error block when error is empty", async () => {
    const html = await renderFile(OTP_VIEW, BASE_LOCALS)

    expect(html).not.toContain("error-message")
  })

  it("exempts Cancel from the form's own validation, same as login.ejs", async () => {
    const html = await renderFile(OTP_VIEW, BASE_LOCALS)

    const cancel = html.match(/<button[^>]*value="cancel"[^>]*>/)?.[0]
    expect(cancel, "the Cancel button should be rendered").toBeDefined()
    expect(cancel).toContain("formnovalidate")

    const submit = html.match(/<button[^>]*value="submit"[^>]*>/)?.[0]
    expect(submit).toBeDefined()
    expect(submit).not.toContain("formnovalidate")
  })

  /**
   * Regression coverage for a real UX bug found testing the live deployment: the secret and the
   * otpauth:// URI were both dumped as raw, unbroken `<code>` text inside `.foot`, which has no
   * `word-break` rule of its own — the long URI overflowed the card on narrow viewports, and the link
   * text (the entire query string) looked broken and did nothing when clicked on desktop, with no
   * explanation why. Fixed by reusing the same `.code-value-row` + `.copy-btn` pattern `index.ejs`
   * already uses for the authorization-code display (which does have `word-break: break-all`,
   * `public/css/style.css:326`), and by making the otpauth link's visible text short and explicitly
   * labeled as mobile-only rather than the raw URI.
   */
  it("shows the secret in a copyable code-value-row rather than dumping the raw otpauth URI as link text", async () => {
    const html = await renderFile(OTP_VIEW, BASE_LOCALS)

    expect(html).toContain("code-value-row")
    expect(html).toContain(`data-copy="${BASE_LOCALS.secret}"`)
    expect(html).toContain(`href="${BASE_LOCALS.otpauthUri}"`)
    // The link's visible text must NOT be the raw URI — that's the bug being pinned.
    const linkMatch = html.match(/<a href="otpauth:\/\/[^"]*">([^<]*)<\/a>/)
    expect(linkMatch, "the otpauth link should be present").toBeTruthy()
    expect(linkMatch![1]).not.toContain("otpauth://")
    expect(linkMatch![1].length).toBeLessThan(60)
  })
})
