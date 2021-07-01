import { verifyProfileToken, getPublicKeyFromPrivate } from 'blockstack';
import { TokenSigner, TokenVerifier, decodeToken } from 'jsontokens';
import { randomBytes } from '@/crypto';

export const VALID_AUTH_SCOPES = {
  store_write: true,
  email: true,
  publish_data: true
};

export function validateAuthScopes(scopes: Array<string>): boolean {
  if (!scopes) return false;
  if (scopes.length === 0) return true;
  for (const scope of scopes)
    if(VALID_AUTH_SCOPES[scope] !== true) return false;
  return true;
}

export function verifyToken(token: string) {
  const decodedToken = decodeToken(token) as any;
  const tokenVerifier = new TokenVerifier(decodedToken.header.alg, decodedToken.payload.issuer.publicKey);
  return (tokenVerifier && tokenVerifier.verify(token)) ? true : false;
}

export function verifyProfileTokenRecord(tokenRecord: any, publicKeyOrAddress: string) {
  if(publicKeyOrAddress == null) throw new Error('A public key or keychain is required!');
  if(typeof publicKeyOrAddress !== 'string') throw new Error('An address or public key must be a string to be valid!');
  return verifyProfileToken(tokenRecord.token, publicKeyOrAddress);
}

export interface AuthTokenHeader {
  typ: string;
  alg: string;
}

export interface AuthTokenPayload {
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  public_keys: string[];
  domain_name: string;
  manifest_uri: string;
  redirect_uri: string;
  version: string;
  do_not_include_profile: boolean;
  supports_hub_url: boolean;
  scopes: string[];
  hubUrl?: string;
  associationToken?: string;
}


/**
 * from blockstack.js
 */
export function makeV1GaiaAuthToken(hubInfo: any,
  privateKey: string,
  hubUrl: string,
  associationToken?: string): string {
  const challengeText = hubInfo.challenge_text;
  const iss = getPublicKeyFromPrivate(privateKey);

  const salt = randomBytes(16).toString('hex');
  const payload = {
    gaiaChallenge: challengeText,
    hubUrl,
    iss,
    salt,
    associationToken
  };
  const token = new TokenSigner('ES256K', privateKey).sign(payload);
  return `v1:${token}`;
}
