import { NextFunction, Request, Response } from "express";
import { authleteApi, serviceId } from "../services/authlete.service";
import logger from "../utils/logger";

export type FapiModeSummary =
  | "sp"
  | "ms"
  | "fapi1-advanced"
  | "fapi1-baseline"
  | "unknown"
  | "disabled";

// FAPI1-W2. Authlete's `fapiModes` is a six-member closed enum (SDK 1.0.0 `FapiMode`) spanning BOTH
// FAPI generations: FAPI1_BASELINE, FAPI1_ADVANCED, FAPI2_SECURITY and three FAPI2_MESSAGE_SIGNING_*
// members. This mapper recognised only the FAPI 2.0 half, so a service configured for FAPI 1.0 was
// reported as having FAPI switched **off** — the repo's own posture instrument could not see half of
// what `SPEC-INVENTORY.md` lists and Module 10 teaches (`FAPI-1.0-PART-1-BASELINE.md` F-2).
//
// Two return values that are easy to conflate, and conflating them was the defect:
//   * `"disabled"` — the service set no mode at all. A statement about configuration.
//   * `"unknown"` — the service set a mode this mapper does not recognise. Reporting *that* as
//     `"disabled"` asserts a posture nobody checked, which is FAPI2-W1's hardcoded-literal defect one
//     layer down. A seventh enum member added by Authlete lands here rather than silently off.
//
// Precedence within a generation, because `fapiModes` is a list and may carry several:
//   * message signing outranks the security profile — FAPI 2.0 Message Signing sits on top of the
//     Security Profile's requirements, so reporting "sp" for a service that has both under-reports it.
//     (Behaviour unchanged: the previous three-branch form was equivalent.)
//   * Advanced outranks Baseline for the same reason — Part 2 is Part 1 plus further requirements.
function computeFapiMode(
  fapiModes: Array<string> | undefined,
): FapiModeSummary {
  if (!fapiModes || fapiModes.length === 0) return "disabled";

  if (fapiModes.some((m) => m.startsWith("FAPI2_MESSAGE_SIGNING_"))) return "ms";
  if (fapiModes.includes("FAPI2_SECURITY")) return "sp";

  if (fapiModes.includes("FAPI1_ADVANCED")) return "fapi1-advanced";
  if (fapiModes.includes("FAPI1_BASELINE")) return "fapi1-baseline";

  return "unknown";
}

// The profile the mode names. This was the literal string "FAPI 2.0 Security Profile" regardless of
// mode, which is wrong the moment `mode` can be a FAPI 1.0 value — the same reason the six posture
// fields stopped being constants in FAPI2-W1.
const SPEC_TITLES: Record<FapiModeSummary, string> = {
  sp: "FAPI 2.0 Security Profile",
  ms: "FAPI 2.0 Message Signing",
  "fapi1-advanced": "FAPI 1.0 Part 2: Advanced",
  "fapi1-baseline": "FAPI 1.0 Part 1: Baseline",
  unknown: "Unrecognised FAPI mode",
  disabled: "None",
};

export const fapiController = {
  getConfig: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await authleteApi.service.get({
        serviceId,
      });

      const mode = computeFapiMode(service.fapiModes);
      // `dpopEnabled` is `dpopNonceRequired`, NOT "is DPoP available". DPoP works without nonces, so
      // `dpopEnabled: false` does not mean DPoP is off. Whether DPoP is *required* is per-client
      // (`dpopRequired`) and is out of this endpoint's reach — see FAPI2-W4.
      const dpopEnabled = service.dpopNonceRequired ?? false;
      // Typed access, not a cast: SDK 1.0.0 models `clientIdMetadataDocumentSupported` in both the
      // `Service` type and `Service$inboundSchema`. CIMD-W3 assumed an SDK gap and there is none.
      const cimdSupported = service.clientIdMetadataDocumentSupported === true;

      // Every field below is read from the live service. This endpoint reports the deployment's own
      // security posture, so it must never assert a control it has not checked — six of these values
      // used to be hardcoded, and all six were the opposite of the live configuration.
      //
      // Two are not straight passthroughs:
      //   * `supportedTokenAuthMethods` replaces a hardcoded `requiredClientAuth: "PRIVATE_KEY_JWT"`.
      //     Client authentication is pinned per client (`tokenAuthMethod`), so a scalar "required
      //     method" cannot be read from the service at all — which is why it was a constant. FAPI 2.0
      //     §5.3.2.1 permits mTLS *or* private_key_jwt, so asserting one would misreport the other.
      //   * `refreshTokenRotation` inverts `refreshTokenKept`: per the SDK, `refreshTokenKept: true`
      //     means the refresh token survives use, i.e. it is NOT rotated. The console label ("Enable
      //     Token Rotation") is the trap. `=== false` rather than `!` so an absent field reports
      //     `false` instead of inventing rotation.
      res.json({
        mode,
        dpopEnabled,
        supportedTokenAuthMethods: service.supportedTokenAuthMethods ?? [],
        certificateBoundAccessTokens:
          service.tlsClientCertificateBoundAccessTokens ?? false,
        parRequired: service.parRequired ?? false,
        pkceRequired: service.pkceRequired ?? false,
        refreshTokenRotation: service.refreshTokenKept === false,
        scopeRequired: service.scopeRequired ?? false,
        cimdSupported,
        specs: {
          securityProfile: SPEC_TITLES[mode],
          messageSigning: mode === "ms",
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = _req.logger || logger;
      log.error("FAPI config error", { message: error.message });
      return next(error);
    }
  },

  getStatus: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await authleteApi.service.get({
        serviceId,
      });

      const mode = computeFapiMode(service.fapiModes);
      const dpopEnabled = service.dpopNonceRequired ?? false;

      res.json({
        mode,
        dpopEnabled,
        issuer: service.issuer,
        fapiModes: service.fapiModes,
        dpopNonceRequired: service.dpopNonceRequired,
        dpopNonceDuration: service.dpopNonceDuration,
        scopeRequired: service.scopeRequired,
        refreshTokenKept: service.refreshTokenKept,
        refreshTokenIdempotent: service.refreshTokenIdempotent,
        pkceRequired: service.pkceRequired,
        parRequired: service.parRequired,
        clientIdMetadataDocumentSupported:
          service.clientIdMetadataDocumentSupported ?? false,

        // FAPI2-W4 — the four fields that let this endpoint fail honestly on ALL EIGHT of FAPI 2.0's
        // requirements instead of six. FAPI2-W1 stopped the endpoint asserting hardcoded constants; this
        // finishes the job by reporting the controls it was silent about.
        //
        // `pkceS256Required` is separate from `pkceRequired` and both matter: §5.3.2.1 requires PKCE *with*
        // S256, and a deployment can require PKCE while still permitting `plain`.
        pkceS256Required: service.pkceS256Required ?? false,
        // The mTLS branch of sender-constrained tokens. `false` here with DPoP available is a legitimate
        // FAPI 2.0 posture — the profile permits either — so this is reported, not judged.
        tlsClientCertificateBoundAccessTokens:
          service.tlsClientCertificateBoundAccessTokens ?? false,
        // No service-level "required client auth method" exists — it is pinned per client via
        // `tokenAuthMethod` — so the honest report is the list of methods the service will accept at all.
        supportedTokenAuthMethods: service.supportedTokenAuthMethods ?? [],

        // NOT REPORTED, and the reason is worth stating rather than leaving as an absence: FAPI 2.0
        // §5.3.2.2 permits PS256, ES256 and EdDSA only, and **no `Service` property carries the signing
        // algorithms.** They are derived from the service JWK Set and surface only in the discovery
        // document's `id_token_signing_alg_values_supported`, which this endpoint does not fetch. That is
        // the same shape as T1-13, where no service field controls the userinfo/introspection lists.
        //
        // So this endpoint reports **seven** of FAPI 2.0's eight requirements, not eight. Adding a field
        // that does not exist would have been the eighth in name only — `supportedSignatureAlgorithms` was
        // tried and rejected by the compiler, which is the cheapest possible version of "probe first".
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = _req.logger || logger;
      log.error("FAPI status error", { message: error.message });
      return next(error);
    }
  },
};
