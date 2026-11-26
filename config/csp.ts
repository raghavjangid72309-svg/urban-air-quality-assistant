/**
 * Content Security Policy shared by the production build (injected as a
 * <meta> tag) and the hosting config (`vercel.json`, sent as a header).
 *
 * The app has no inline scripts or styles, no third-party scripts, and only
 * talks to the two Open-Meteo endpoints, so the policy can be very strict.
 * Trusted Types are enforced because the code never writes HTML strings
 * into the DOM.
 */
export const API_ORIGINS = [
  'https://air-quality-api.open-meteo.com',
  'https://geocoding-api.open-meteo.com',
] as const;

const directives: Record<string, string> = {
  'default-src': "'none'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self' data:",
  'font-src': "'self'",
  'manifest-src': "'self'",
  'connect-src': API_ORIGINS.join(' '),
  'base-uri': "'none'",
  'form-action': "'none'",
  'object-src': "'none'",
  'require-trusted-types-for': "'script'",
  'trusted-types': "'none'",
};

/** Policy that can be delivered in a <meta> tag. */
export const CONTENT_SECURITY_POLICY = Object.entries(directives)
  .map(([name, value]) => `${name} ${value}`)
  .join('; ');

/** `frame-ancestors` is ignored in <meta>, so it is only sent as a header. */
export const CONTENT_SECURITY_POLICY_HEADER = `${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`;
