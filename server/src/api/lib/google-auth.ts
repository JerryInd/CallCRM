interface ServiceAccount {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_LIFETIME_MS = 50 * 60 * 1000; // 50 minutes (tokens expire at 60)

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textToBase64Url(text: string): string {
  return toBase64Url(btoa(text));
}

function binaryToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return toBase64Url(btoa(binary));
}

function pemToBinary(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signJwt(header: object, payload: object, privateKeyPem: string): Promise<string> {
  const encoder = new TextEncoder();

  const headerB64 = textToBase64Url(JSON.stringify(header));
  const payloadB64 = textToBase64Url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyBuffer = pemToBinary(privateKeyPem);

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput)
  );

  const signatureB64 = binaryToBase64Url(signature);
  return `${signingInput}.${signatureB64}`;
}

async function exchangeJwtForToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const jwt = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: SCOPES,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    },
    sa.private_key
  );

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getAccessToken(saJsonString: string): Promise<string> {
  const sa: ServiceAccount = JSON.parse(saJsonString);
  const cacheKey = sa.client_email;

  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const token = await exchangeJwtForToken(sa);

  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS,
  });

  return token;
}

export function getServiceAccountEmail(saJsonString: string): string {
  const sa: ServiceAccount = JSON.parse(saJsonString);
  return sa.client_email;
}
