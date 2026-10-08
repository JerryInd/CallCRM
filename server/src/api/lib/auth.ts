import { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { Bindings, Variables } from '../types';

const TOKEN_COOKIE = 'crm_token';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const REFRESH_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export interface TokenPayload {
  userId: string;
  name: string;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'AGENT';
  deviceId?: string;
  type?: 'access' | 'refresh';
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = { ...payload, iat: now, exp: now + Math.floor(TOKEN_EXPIRY_MS / 1000), type: payload.type || 'access' };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(tokenPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${signingInput}.${signatureB64}`;
}

export async function signRefreshToken(payload: TokenPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = { ...payload, iat: now, exp: now + Math.floor(REFRESH_EXPIRY_MS / 1000), type: 'refresh' };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(tokenPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${signingInput}.${signatureB64}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await getKey(secret);
    const signature = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(signingInput));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { userId: payload.userId, name: payload.name, email: payload.email, role: payload.role, deviceId: payload.deviceId, type: payload.type };
  } catch {
    return null;
  }
}

export function setTokenCookie(c: Context<any>, token: string) {
  setCookie(c, TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(TOKEN_EXPIRY_MS / 1000),
  });
}

export function clearTokenCookie(c: Context<any>) {
  setCookie(c, TOKEN_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 0 });
}

export async function requireAuth(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  let token = getCookie(c, TOKEN_COOKIE);

  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const payload = await verifyToken(token, c.env.JWT_SECRET || 'dev-secret');
  if (!payload) return c.json({ error: 'Invalid token' }, 401);
  if (payload.type === 'refresh') return c.json({ error: 'Invalid token type' }, 401);

  c.set('user', { userId: payload.userId, name: payload.name, email: payload.email, role: payload.role });
  await next();
}

export async function requireAdmin(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') return c.json({ error: 'Forbidden' }, 403);
  await next();
}

export async function requireAgent(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'AGENT') return c.json({ error: 'Forbidden' }, 403);
  await next();
}
