import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** AES-256-GCM for settings secrets (same key derivation as card encryption). */
@Injectable()
export class SettingsEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
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

  decrypt(payload: string): string {
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

  maskSecret(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (value.length <= 3) return '********';
    return `********${value.slice(-3)}`;
  }

  isMaskedInput(value: string | undefined): boolean {
    return !!value && /^\*{8}/.test(value);
  }

  private deriveKey(): Buffer {
    const secret = this.configService.get<string>('encryption.key');
    if (!secret) {
      throw new Error('ENCRYPTION_KEY is not configured');
    }
    return createHash('sha256').update(secret).digest();
  }
}
