import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { storage } from './storage';

export async function generateDeviceId(): Promise<string> {
  const uuid = Crypto.randomUUID();
  return uuid;
}

export async function generateDeviceKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const privateKey = Crypto.randomUUID();
  const publicKey = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    privateKey + Date.now().toString()
  );
  
  await storage.setPrivateKey(privateKey);
  
  return { publicKey, privateKey };
}

export async function signData(data: string): Promise<string> {
  const privateKey = await storage.getPrivateKey();
  if (!privateKey) throw new Error('No private key found');
  
  const signature = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    privateKey + data
  );
  
  return signature;
}

export async function verifySignature(data: string, signature: string): Promise<boolean> {
  const privateKey = await storage.getPrivateKey();
  if (!privateKey) return false;
  
  const expectedSignature = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    privateKey + data
  );
  
  return signature === expectedSignature;
}