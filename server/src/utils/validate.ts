export function validateRequired(
  params: Record<string, unknown>,
  requiredFields: string[]
): string | null {
  for (const field of requiredFields) {
    const val = params[field];
    if (val === undefined || val === null || val === "") {
      return `Missing required parameter: ${field}`;
    }
  }
  return null;
}

export function validateAuthorizationParams(
  query: Record<string, unknown>
): string | null {
  if (query.request_uri) {
    return validateRequired(query, ["client_id", "request_uri"]);
  }
  return validateRequired(query, ["response_type", "client_id", "redirect_uri"]);
}

export function validateTokenParams(
  body: Record<string, unknown>
): string | null {
  return validateRequired(body, ["grant_type"]);
}

export function validateIntrospectionParams(
  body: Record<string, unknown>
): string | null {
  return validateRequired(body, ["token"]);
}
