import { describe, it, expect, vi } from "vitest";
import { sendAuthorizationFailResponse } from "../../../src/controllers/authorization-fail-response.handler";

function mockResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

describe("sendAuthorizationFailResponse", () => {
  it("returns 500 with cache-control for INTERNAL_SERVER_ERROR", () => {
    const res = mockResponse();
    sendAuthorizationFailResponse(res, {
      action: "INTERNAL_SERVER_ERROR",
      responseContent: "error details",
    } as any);

    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(res.setHeader).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith("error details");
  });

  it("returns 400 with cache-control for BAD_REQUEST", () => {
    const res = mockResponse();
    sendAuthorizationFailResponse(res, {
      action: "BAD_REQUEST",
      responseContent: "bad request",
    } as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("bad request");
  });

  it("redirects for LOCATION", () => {
    const res = mockResponse();
    sendAuthorizationFailResponse(res, {
      action: "LOCATION",
      responseContent: "http://example.com/error",
    } as any);

    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(res.redirect).toHaveBeenCalledWith("http://example.com/error");
  });

  it("redirects to empty string for LOCATION with null content", () => {
    const res = mockResponse();
    sendAuthorizationFailResponse(res, { action: "LOCATION", responseContent: null } as any);

    expect(res.redirect).toHaveBeenCalledWith("");
  });

  it("returns 200 with HTML content-type for FORM", () => {
    const res = mockResponse();
    sendAuthorizationFailResponse(res, {
      action: "FORM",
      responseContent: "<html>form</html>",
    } as any);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html;charset=UTF-8");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("<html>form</html>");
  });

  it("returns 500 for unknown action", () => {
    const res = mockResponse();
    sendAuthorizationFailResponse(res, {
      action: "UNKNOWN",
      responseContent: "???",
    } as any);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith("Unknown authorization action");
  });
});
