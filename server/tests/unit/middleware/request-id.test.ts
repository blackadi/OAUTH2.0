import { describe, it, expect } from "vitest"
import express from "express"
import request from "supertest"
import { requestId } from "../../../src/middleware/request-id"

// `req.id` is written to `logs/audit-*.log` (90-day retention) and onto every line of `logs/app-*.log`.
// Until this file existed, nothing in the suite asserted anything about it — and the `express-request-id`
// package it replaces adopted whatever `X-Request-Id` a caller sent, verbatim, at any length.

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HEADER = "X-Request-Id"

const app = express()
app.use(requestId())
app.get("/probe", (req, res) => {
  res.json({ id: req.id })
})

describe("requestId middleware", () => {
  it("mints a v4 UUID when no header is supplied", async () => {
    const res = await request(app).get("/probe")

    expect(res.body.id).toMatch(UUID_V4)
    // Version nibble is literally `4` — three docs claimed this was UUID v1 until 2026-08-20.
    expect(res.body.id[14]).toBe("4")
  })

  it("echoes the id on the response header, matching req.id", async () => {
    const res = await request(app).get("/probe")

    expect(res.headers["x-request-id"]).toBe(res.body.id)
  })

  it("mints a different id per request", async () => {
    const a = await request(app).get("/probe")
    const b = await request(app).get("/probe")

    expect(a.body.id).not.toBe(b.body.id)
  })

  it("adopts an inbound header when it is a well-formed UUID", async () => {
    // The property worth keeping: a gateway that sets a real UUID keeps trace correlation across services.
    const supplied = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    const res = await request(app).get("/probe").set(HEADER, supplied)

    expect(res.body.id).toBe(supplied)
    expect(res.headers["x-request-id"]).toBe(supplied)
  })

  it("replaces an inbound value that is not a UUID", async () => {
    const res = await request(app).get("/probe").set(HEADER, "ATTACKER-SUPPLIED-VALUE")

    expect(res.body.id).not.toBe("ATTACKER-SUPPLIED-VALUE")
    expect(res.body.id).toMatch(UUID_V4)
  })

  it("caps what a caller can write into the audit log", async () => {
    // Verified live against the old package: an 8,000-character header reached `req.id` intact and was
    // written to a 90-day-retained log on every request. Node's ~16 KB header limit was the only bound.
    const huge = "A".repeat(8000)
    const res = await request(app).get("/probe").set(HEADER, huge)

    expect(res.body.id).toHaveLength(36)
    expect(res.body.id).toMatch(UUID_V4)
  })

  it.each([
    ["wrong version nibble (v1)", "3f2504e0-4f89-11d3-9a0c-0305e82c3301"],
    ["wrong variant nibble", "3f2504e0-4f89-41d3-1a0c-0305e82c3301"],
    ["not hex", "zzzzzzzz-4f89-41d3-9a0c-0305e82c3301"],
    ["no dashes", "3f2504e04f8941d39a0c0305e82c3301"],
    ["empty", ""],
    ["uuid with trailing junk", "3f2504e0-4f89-41d3-9a0c-0305e82c3301; DROP"],
  ])("rejects %s and mints its own", async (_label, supplied) => {
    const res = await request(app).get("/probe").set(HEADER, supplied)

    expect(res.body.id).not.toBe(supplied)
    expect(res.body.id).toMatch(UUID_V4)
  })

  it("accepts an uppercase UUID, since hex casing is not significant", async () => {
    const supplied = "3F2504E0-4F89-41D3-9A0C-0305E82C3301"
    const res = await request(app).get("/probe").set(HEADER, supplied)

    expect(res.body.id).toBe(supplied)
  })
})
