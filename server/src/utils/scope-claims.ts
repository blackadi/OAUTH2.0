// OpenID Connect Core 1.0 scope-to-claims mapping
// https://openid.net/specs/openid-connect-core-1_0.html#ScopeClaims

const SCOPE_CLAIMS_MAP: Record<string, string[]> = {
  openid: [],
  profile: [
    "name",
    "family_name",
    "given_name",
    "middle_name",
    "nickname",
    "preferred_username",
    "profile",
    "picture",
    "website",
    "gender",
    "birthdate",
    "zoneinfo",
    "locale",
    "updated_at",
  ],
  email: ["email", "email_verified"],
  address: ["address"],
  phone: ["phone_number", "phone_number_verified"],
  offline_access: [],
};

/**
 * Derive claim names from OIDC scopes per OpenID Connect Core 1.0 §5.4.
 * Returns a deduplicated, sorted list of claim names.
 */
export function claimsFromScopes(scopes: string[]): string[] {
  const claims = new Set<string>();
  for (const scope of scopes) {
    const mapped = SCOPE_CLAIMS_MAP[scope];
    if (mapped) {
      for (const c of mapped) claims.add(c);
    }
  }
  return Array.from(claims).sort();
}

/**
 * Get a human-friendly label for a claim name.
 */
export function claimLabel(claim: string): string {
  const labels: Record<string, string> = {
    name: "Full Name",
    family_name: "Family Name",
    given_name: "Given Name",
    middle_name: "Middle Name",
    nickname: "Nickname",
    preferred_username: "Preferred Username",
    profile: "Profile URL",
    picture: "Profile Picture",
    website: "Website",
    gender: "Gender",
    birthdate: "Birthdate",
    zoneinfo: "Timezone",
    locale: "Locale",
    updated_at: "Last Updated",
    email: "Email Address",
    email_verified: "Email Verified",
    address: "Postal Address",
    phone_number: "Phone Number",
    phone_number_verified: "Phone Verified",
  };
  return labels[claim] || claim;
}
