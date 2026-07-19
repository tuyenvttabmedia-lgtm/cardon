import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import {
  AGENT_API_KEY_PREFIX,
  AGENT_SECRET_KEY_PREFIX,
} from '../entities/agent.constants';

export interface GeneratedAgentCredentials {
  apiKey: string;
  secretKey: string;
  apiKeyHash: string;
  apiKeyLookup: string;
  secretKeyEncrypted: string;
}

export function hashApiKeyForLookup(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

@Injectable()
export class AgentCredentialService {
  constructor(private readonly configService: ConfigService) {}

  generateCredentials(): GeneratedAgentCredentials {
    const apiKey = `${AGENT_API_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
    const secretKey = `${AGENT_SECRET_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
    const apiKeyHash = bcrypt.hashSync(apiKey, 12);

    return {
      apiKey,
      secretKey,
      apiKeyHash,
      apiKeyLookup: hashApiKeyForLookup(apiKey),
      secretKeyEncrypted: this.encrypt(secretKey),
    };
  }

  verifyApiKey(apiKey: string, apiKeyHash: string): boolean {
    return bcrypt.compareSync(apiKey, apiKeyHash);
  }

  decryptSecretKey(secretKeyEncrypted: string): string {
    return this.decrypt(secretKeyEncrypted);
  }

  private encrypt(plaintext: string): string {
    const key = this.deriveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    const key = this.deriveKey();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private deriveKey(): Buffer {
    const secret = this.configService.get<string>('encryption.key');
    if (!secret) {
      throw new Error('ENCRYPTION_KEY is not configured');
    }
    return createHash('sha256').update(secret).digest();
  }
}
