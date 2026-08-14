import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

/**
 * `docs/curriculum/scripts/sd-jwt.mjs` — the repo's only SD-JWT implementation, and the entirety of Module
 * 09b's core exercise (CUR-3c-W5).
 *
 * **It had no test, and `scripts/` sits outside both Vitest configs, so it could not have had one without
 * this file.** `AUDIT-PASS-A.md` recorded it as *"CLEAN, 0 defects"*. It had three, one with a security
 * consequence — a malformed credential ACCEPTED with a claim silently discarded (3c-F1). All three were found
 * by *running* it, and the last of them was a regression **I introduced in the fix for the one before**:
 * making `--iss` required broke a lab command I had added minutes earlier, and only executing it showed that.
 *
 * Tested through the **CLI**, deliberately, because the CLI is what a learner runs and what the lab's
 * transcripts assert. Exercising the internals would test a different artifact from the one under
 * instruction. `execFileSync` inherits no shell, so nothing here depends on a shell being present.
 */

const SCRIPT = resolve(__dirname, "../../../../docs/curriculum/scripts/sd-jwt.mjs")

let dir: string

/**
 * Run the script and return its output **whatever the exit code**.
 *
 * `verify` exits non-zero on `RESULT: REJECTED`, which is correct for a CLI and is the behaviour half these
 * tests are asserting — so a helper that throws on non-zero cannot test a rejection at all. Returning the
 * output either way keeps the assertion on the *trace*, which is what the lab's transcripts show and what a
 * learner reads. `exitCode` is returned too, since "did it exit non-zero" is itself part of the contract.
 */
function sdjwt(...args: string[]): { out: string; exitCode: number } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    })
    return { out, exitCode: 0 }
  } catch (e: any) {
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, exitCode: e.status ?? 1 }
  }
}

/** For the commands that must succeed — fails loudly rather than returning a silent empty string. */
function run(...args: string[]): string {
  const { out, exitCode } = sdjwt(...args)
  if (exitCode !== 0) throw new Error(`sd-jwt.mjs ${args.join(" ")} exited ${exitCode}:\n${out}`)
  return out
}

const CLAIMS = {
  vct: "https://credentials.example/identity_card",
  given_name: "Alice",
  family_name: "Almasi",
  birthdate: "1987-03-14",
  email: "alice@example.com",
  nationality: "HU",
}
const SD = "given_name,family_name,email,nationality"
const ISS = "https://issuer.example"

describe("sd-jwt.mjs (docs/curriculum/scripts)", () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "sdjwt-"))
    writeFileSync(join(dir, "claims.json"), JSON.stringify(CLAIMS))
    run("keygen", "i")
    run("keygen", "h")
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  // RFC 9901 §4.2.3's published worked example. If this breaks, the digest is being computed over something
  // other than the US-ASCII bytes of the Disclosure as received — the defect the whole script is built to
  // avoid, and the one most implementations get wrong.
  it("reproduces RFC 9901 §4.2.3's test vector exactly", () => {
    const out = run("digest", "WyIyR0xDNDJzS1F2ZUNmR2ZyeU5STjl3IiwgImdpdmVuX25hbWUiLCAiSm9obiJd")
    expect(out).toContain("jsu9yVulwQQlhFlM_3JlzMaSFzglhQG0DpfayQwLUK4")
  })

  describe("issue", () => {
    it("emits a credential whose final element is empty, per §4", () => {
      const credential = run("issue", "--claims", "claims.json", "--sd", SD, "--issuer-key", "i-priv.json", "--iss", ISS)
      expect(credential.trim().endsWith("~")).toBe(true)
      expect(credential.trim().split("~")).toHaveLength(6) // JWT + 4 Disclosures + the empty tail
    })

    // 3c-F3. `--iss` was optional here and is required by `verify` at §7.1 step 2c, so omitting it produced a
    // credential this same script always rejects.
    it("requires --iss rather than producing a credential verify will reject", () => {
      writeFileSync(join(dir, "no-iss.json"), JSON.stringify({ given_name: "Alice" }))
      const { out, exitCode } = sdjwt("issue", "--claims", "no-iss.json", "--sd", "given_name", "--issuer-key", "i-priv.json")
      expect(exitCode).not.toBe(0)
      expect(out).toMatch(/--iss .* is required/)
    })

    it("accepts iss supplied through the claims file instead of the flag", () => {
      writeFileSync(join(dir, "with-iss.json"), JSON.stringify({ iss: ISS, given_name: "Alice" }))
      const credential = run("issue", "--claims", "with-iss.json", "--sd", "given_name", "--issuer-key", "i-priv.json")
      expect(credential.trim().endsWith("~")).toBe(true)
    })
  })

  describe("verify", () => {
    beforeAll(() => {
      run("issue", "--claims", "claims.json", "--sd", SD, "--issuer-key", "i-priv.json", "--iss", ISS, "--out", "ok.txt")
    })

    it("accepts a well-formed credential and reports every Disclosure", () => {
      const out = run("verify", "ok.txt", "--issuer-key", "i-pub.json")
      expect(out).toContain("RESULT: ACCEPTED")
      expect(out).toMatch(/PASS\s+7\.1\/1\s+split into 1 Issuer-signed JWT \+ 4 Disclosure\(s\)/)
    })

    // 3c-F1, the defect with a security consequence. Before the fix this printed RESULT: ACCEPTED with
    // `nationality` silently absent: the last Disclosure was reclassified as a KB-JWT and dropped, and
    // 7.1/5 passed honestly because the three SURVIVORS were all referenced by a digest.
    it("REJECTS a credential whose trailing tilde was omitted, at step 7.1/1", () => {
      const ok = readFileSync(join(dir, "ok.txt"), "utf8").trim()
      writeFileSync(join(dir, "notilde.txt"), ok.replace(/~$/, ""))

      const { out, exitCode } = sdjwt("verify", "notilde.txt", "--issuer-key", "i-pub.json")
      expect(exitCode).not.toBe(0)
      expect(out).toContain("RESULT: REJECTED")
      expect(out).toMatch(/FAIL\s+7\.1\/1/)
      expect(out).toContain("MALFORMED")
      // The claim must not have vanished quietly — that was the whole finding.
      expect(out).not.toContain("RESULT: ACCEPTED")
    })

    it("rejects a bare JWT with no tilde at all", () => {
      const ok = readFileSync(join(dir, "ok.txt"), "utf8").trim()
      writeFileSync(join(dir, "bare.txt"), ok.split("~")[0])

      const { out } = sdjwt("verify", "bare.txt", "--issuer-key", "i-pub.json")
      expect(out).toContain("RESULT: REJECTED")
      expect(out).toMatch(/not an SD-JWT/)
    })

    it("rejects a tampered Disclosure at §7.1 step 5, not at the signature check", () => {
      const parts = readFileSync(join(dir, "ok.txt"), "utf8").trim().split("~")
      const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString())
      decoded[2] = "Tampered"
      parts[1] = Buffer.from(JSON.stringify(decoded)).toString("base64url")
      writeFileSync(join(dir, "tampered.txt"), parts.join("~"))

      const { out } = sdjwt("verify", "tampered.txt", "--issuer-key", "i-pub.json")
      expect(out).toContain("RESULT: REJECTED")
      expect(out).toMatch(/PASS\s+7\.1\/2b/) // the issuer signature is still valid — that is the point
      expect(out).toMatch(/FAIL\s+7\.1\/5/)
    })
  })

  describe("present", () => {
    beforeAll(() => {
      run("issue", "--claims", "claims.json", "--sd", SD, "--issuer-key", "i-priv.json",
          "--iss", ISS, "--holder-key", "h-pub.json", "--out", "kb.txt")
    })

    // 3c-F2. The no-Key-Binding path returned early, before --out was read, so the flag was silently ignored
    // and the presentation went to stdout instead of the file the caller named.
    it("honours --out on the no-Key-Binding path", () => {
      run("present", "kb.txt", "--disclose", "given_name,email", "--out", "fewer.txt")

      expect(existsSync(join(dir, "fewer.txt"))).toBe(true)
      expect(readFileSync(join(dir, "fewer.txt"), "utf8").length).toBeGreaterThan(0)
    })

    it("forwards only the selected Disclosures", () => {
      run("present", "kb.txt", "--disclose", "given_name,email", "--out", "two.txt")
      const out = run("verify", "two.txt", "--issuer-key", "i-pub.json")

      expect(out).toContain("RESULT: ACCEPTED")
      expect(out).toMatch(/2 Disclosure\(s\)/)
      expect(out).toContain("given_name")
      // Withheld claims must not appear in the processed payload at all.
      expect(out).not.toContain("Almasi")
      expect(out).not.toContain("nationality")
    })

    // The case the trailing-tilde discriminator has to keep working: a genuine KB-JWT is a JWS with dots, so
    // it must still be recognised as a KB-JWT and not as a Disclosure.
    it("still produces a recognisable KB-JWT when --kb-key is given", () => {
      run("present", "kb.txt", "--disclose", "given_name", "--kb-key", "h-priv.json",
          "--aud", "https://verifier.example", "--nonce", "n1", "--out", "pres.txt")

      const out = run("verify", "pres.txt", "--issuer-key", "i-pub.json", "--require-kb",
                      "--aud", "https://verifier.example", "--nonce", "n1")
      expect(out).toMatch(/1 Disclosure\(s\) \+ KB-JWT/)
      expect(out).toContain("RESULT: ACCEPTED")
    })

    it("rejects a KB presentation replayed at a different audience", () => {
      run("present", "kb.txt", "--disclose", "given_name", "--kb-key", "h-priv.json",
          "--aud", "https://verifier.example", "--nonce", "n1", "--out", "replay.txt")

      const { out } = sdjwt("verify", "replay.txt", "--issuer-key", "i-pub.json", "--require-kb",
                            "--aud", "https://other.example", "--nonce", "n1")
      expect(out).toContain("RESULT: REJECTED")
    })
  })
})
