// Supabase issues plain access tokens, not OIDC ID tokens. The default Convex
// OIDC provider rejects them ("Could not parse as OIDC ID token"), so we use
// the customJwt provider with explicit JWKS — Supabase's asymmetric signing
// keys live at /auth/v1/.well-known/jwks.json.
//
// Set AUTH_SUPABASE_URL in Convex env to your project's auth base URL
// including the /auth/v1 path, e.g. https://xyzcompany.supabase.co/auth/v1
export default {
  providers: [
    {
      type: "customJwt",
      issuer: process.env.AUTH_SUPABASE_URL,
      // Cache-bust query param forces Convex to re-fetch the JWKS instead of
      // serving an internally cached snapshot from before keys were rotated.
      jwks: `${process.env.AUTH_SUPABASE_URL}/.well-known/jwks.json?v=2`,
      algorithm: "ES256",
      applicationID: "authenticated",
    },
  ],
};
