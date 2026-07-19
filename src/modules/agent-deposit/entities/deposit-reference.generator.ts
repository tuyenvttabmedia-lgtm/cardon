import { randomUUID } from 'crypto';

export function generateDepositReference(): string {
  return `DEP-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
}

export function isAgentDepositReference(reference: string): boolean {
  return reference.startsWith('DEP-');
}
