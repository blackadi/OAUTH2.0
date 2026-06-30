import { NextFunction, Request, Response } from "express";
import { authleteApi, serviceId } from "../services/authlete.service";
import logger from "../utils/logger";

function computeFapiMode(
  fapiModes: Array<string> | undefined,
): "sp" | "ms" | "disabled" {
  if (!fapiModes || fapiModes.length === 0) return "disabled";

  const hasSecurityProfile = fapiModes.includes("FAPI2_SECURITY");
  const hasMessageSigning = fapiModes.some((m) =>
    m.startsWith("FAPI2_MESSAGE_SIGNING_"),
  );

  if (hasSecurityProfile && hasMessageSigning) return "ms";
  if (hasSecurityProfile) return "sp";
  if (hasMessageSigning) return "ms";

  return "disabled";
}

export const fapiController = {
  getConfig: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await authleteApi.service.get({
        serviceId,
      });

      const mode = computeFapiMode(service.fapiModes);
      const dpopEnabled = service.dpopNonceRequired ?? false;

      res.json({
        mode,
        dpopEnabled,
        requiredClientAuth: "PRIVATE_KEY_JWT",
        senderConstrainedTokens: dpopEnabled ? "DPoP" : "none",
        parRequired: true,
        pkceRequired: true,
        refreshTokenRotation: false,
        scopeRequired: true,
        specs: {
          securityProfile: "FAPI 2.0 Security Profile",
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
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = _req.logger || logger;
      log.error("FAPI status error", { message: error.message });
      return next(error);
    }
  },
};
