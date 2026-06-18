import { Authlete } from "@authlete/typescript-sdk";
import { authleteConfig } from "../config/authlete.config";

export const authleteApi = new Authlete({
    bearer: authleteConfig.AccessToken,
    serverURL: authleteConfig.baseUrl
});

export const serviceId = authleteConfig.serviceId;
