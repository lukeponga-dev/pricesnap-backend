import { createPublicKey, createVerify } from "node:crypto";
import { ApiError } from "./errors";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID?.trim() || "snapvalue-4607a";
const PROJECT_NUMBER = process.env.FIREBASE_PROJECT_NUMBER?.trim() || "805381652466";
const APP_ID = process.env.FIREBASE_ANDROID_APP_ID?.trim() || "1:805381652466:android:305c2b849f6c6c60fa756b";
const AUTH_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const APP_CHECK_JWKS_URL = "https://firebaseappcheck.googleapis.com/v1/jwks";

type JwtHeader = { alg?: string; typ?: string; kid?: string };
type JwtPayload = Record<string, unknown> & { sub?: string; aud?: string | string[]; iss?: string; exp?: number; iat?: number; firebase?: { sign_in_provider?: string } };
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

let authKeys: { expiresAt: number; keys: Record<string, string> } | undefined;
let appCheckKeys: { expiresAt: number; keys: Jwk[] } | undefined;

function decodePart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}
function parseJwt(token: string): { header: JwtHeader; payload: JwtPayload; signed: string; signature: Buffer } {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new ApiError("UNAUTHORIZED");
  return { header: decodePart<JwtHeader>(parts[0]), payload: decodePart<JwtPayload>(parts[1]), signed: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], "base64url") };
}
function validTimes(payload: JwtPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  return typeof payload.exp === "number" && payload.exp > now && typeof payload.iat === "number" && payload.iat <= now + 60;
}
async function fetchAuthKeys(): Promise<Record<string, string>> {
  if (authKeys && authKeys.expiresAt > Date.now()) return authKeys.keys;
  const response = await fetch(AUTH_CERTS_URL, { cache: "no-store" });
  if (!response.ok) throw new ApiError("SERVICE_NOT_CONFIGURED");
  const keys = await response.json() as Record<string, string>;
  authKeys = { keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return keys;
}
async function fetchAppCheckKeys(): Promise<Jwk[]> {
  if (appCheckKeys && appCheckKeys.expiresAt > Date.now()) return appCheckKeys.keys;
  const response = await fetch(APP_CHECK_JWKS_URL, { cache: "no-store" });
  if (!response.ok) throw new ApiError("SERVICE_NOT_CONFIGURED");
  const body = await response.json() as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  appCheckKeys = { keys, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return keys;
}
function verifySignature(signed: string, signature: Buffer, key: string | Jwk): boolean {
  const publicKey = typeof key === "string" ? key : createPublicKey({ key, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signed); verifier.end();
  return verifier.verify(publicKey, signature);
}
export interface VerifiedCaller { uid: string; anonymous: boolean; appId: string }
export async function verifyFirebaseRequest(request: Request): Promise<VerifiedCaller> {
  const authorization = request.headers.get("authorization");
  const appCheckToken = request.headers.get("x-firebase-appcheck");
  if (!authorization?.startsWith("Bearer ") || !appCheckToken) throw new ApiError("UNAUTHORIZED");
  try {
    const authToken = parseJwt(authorization.slice(7).trim());
    if (authToken.header.alg !== "RS256" || !authToken.header.kid || !validTimes(authToken.payload)) throw new ApiError("UNAUTHORIZED");
    if (authToken.payload.iss !== `https://securetoken.google.com/${PROJECT_ID}` || authToken.payload.aud !== PROJECT_ID || !authToken.payload.sub) throw new ApiError("UNAUTHORIZED");
    const cert = (await fetchAuthKeys())[authToken.header.kid];
    if (!cert || !verifySignature(authToken.signed, authToken.signature, cert)) throw new ApiError("UNAUTHORIZED");

    const appToken = parseJwt(appCheckToken);
    if (appToken.header.alg !== "RS256" || appToken.header.typ !== "JWT" || !appToken.header.kid || !validTimes(appToken.payload)) throw new ApiError("UNAUTHORIZED");
    const audience = Array.isArray(appToken.payload.aud) ? appToken.payload.aud : [appToken.payload.aud];
    if (appToken.payload.iss !== `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}` || !audience.includes(`projects/${PROJECT_NUMBER}`) || appToken.payload.sub !== APP_ID) throw new ApiError("UNAUTHORIZED");
    const jwk = (await fetchAppCheckKeys()).find(key => key.kid === appToken.header.kid);
    if (!jwk || !verifySignature(appToken.signed, appToken.signature, jwk)) throw new ApiError("UNAUTHORIZED");
    return { uid: authToken.payload.sub, anonymous: authToken.payload.firebase?.sign_in_provider === "anonymous", appId: appToken.payload.sub };
  } catch (error) {
    if (error instanceof ApiError && error.code === "SERVICE_NOT_CONFIGURED") throw error;
    throw new ApiError("UNAUTHORIZED");
  }
}
