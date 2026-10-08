import { hash, compare } from 'bcryptjs';

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function parseTimestamp(ts: string): number {
  return new Date(ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z").getTime();
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(password: string, hashStr: string): Promise<boolean> {
  return compare(password, hashStr);
}
