import {createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey} from 'jose';
export interface Principal {subject: string; tenantId: string; verifiedEmail?: string}
export type Authenticator = (authorization: string | undefined) => Promise<Principal>;
const safeID = /^[a-zA-Z0-9_-]{1,128}$/;
export function jwtAuthenticator(config: {issuer: string; audience: string; jwks: JWTVerifyGetKey}): Authenticator {
  return async header => {
    if (!header?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
    const {payload} = await jwtVerify(header.slice(7), config.jwks, {
      issuer: config.issuer, audience: config.audience, algorithms: ['RS256', 'ES256'], requiredClaims: ['exp', 'iat', 'sub', 'tenant_id'],
    });
    if (!payload.sub || typeof payload.tenant_id !== 'string' || !safeID.test(payload.tenant_id)) throw new Error('UNAUTHORIZED');
    const verifiedEmail = payload.email_verified === true && typeof payload.email === 'string' && payload.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
      ? payload.email.trim().toLowerCase() : undefined;
    return {subject: payload.sub, tenantId: payload.tenant_id, ...(verifiedEmail ? {verifiedEmail} : {})};
  };
}
export function configuredAuthenticator(env: NodeJS.ProcessEnv): Authenticator {
  const {OIDC_ISSUER, OIDC_AUDIENCE, OIDC_JWKS_URL} = env;
  if (!OIDC_ISSUER || !OIDC_AUDIENCE || !OIDC_JWKS_URL) return async () => {throw new Error('AUTH_NOT_CONFIGURED');};
  const url = new URL(OIDC_JWKS_URL);
  if (url.protocol !== 'https:' || !OIDC_ISSUER.startsWith('https://')) throw new Error('HTTPS_REQUIRED');
  return jwtAuthenticator({issuer: OIDC_ISSUER, audience: OIDC_AUDIENCE, jwks: createRemoteJWKSet(url)});
}
