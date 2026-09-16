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
})
