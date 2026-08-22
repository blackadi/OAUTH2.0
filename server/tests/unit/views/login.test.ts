import { describe, it, expect } from "vitest"
import { renderFile } from "ejs"
import path from "node:path"

/**
 * `login.ejs` renders whether or not the presentational locals were supplied.
 *
 * Why this exists. Line 7 used to open `<% if (clientName) { %>` — a bare reference, which EJS turns into a
 * `ReferenceError` when the local is absent. `showLogin` passed `clientName`; the credentials-rejected branch
 * of `handleLogin` did not, so a wrong password rendered nothing and the sign-in page answered **500** with an
 * EJS stack trace. The controller now builds both render sites' locals from one function, and this pins the
 * other half: the template degrades to the generic copy rather than throwing, so the next omitted local is a
 * missing sentence and not a broken login page.
 *
 * `csrfToken` is deliberately NOT guarded and is therefore required here. It comes from `csrfProtection` via
 * `res.locals` and must be present — a form quietly rendered without it would 403 on submit, which is a worse
 * failure than a loud one because nothing on the page explains it.
 *
 * Rendering the real file is the point. Asserting against a hand-built HTML string would pass forever.
 */
const LOGIN_VIEW = path.join(__dirname, "../../../src/views/login.ejs")

describe("login.ejs", () => {
  it("renders with csrfToken alone, falling back to the generic prompt", async () => {
    const html = await renderFile(LOGIN_VIEW, { csrfToken: "csrf-token-value" })

    expect(html).toContain("Enter your credentials")
    expect(html).toContain('value="csrf-token-value"')
    // Empty rather than the string "undefined", which is what a bare `<%= username %>` would have written.
    expect(html).toContain('id="username" name="username" type="text" placeholder="jane@example.com" value=""')
  })

  it("names the client and shows the error when both are supplied", async () => {
    const html = await renderFile(LOGIN_VIEW, {
      csrfToken: "csrf-token-value",
      clientName: "Test App",
      clientId: 123,
      username: "admin",
      password: "",
      error: "Invalid username or password",
    })

    expect(html).toContain("Test App")
    expect(html).toContain("Invalid username or password")
    expect(html).toContain('value="admin"')
    expect(html).not.toContain("Enter your credentials")
  })
})
