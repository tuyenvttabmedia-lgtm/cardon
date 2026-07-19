import { Agent, FinancialTransaction, Order } from '@prisma/client';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import {
  AGENT_PARTNER_ERROR_MESSAGES,
  AgentPartnerTransactionStatus,
} from './agent-api.constants';

export type AgentOrderWithDetails = Order & {
  financialTransaction: FinancialTransaction | null;
  orderItems: Array<{
    id: string;
    quantity: number;
    unitPrice: { toString(): string };
    variant: { sku: string };
    cardRecords: Array<{
      encryptedSerial: string;
      encryptedPin: string;
    }>;
  }>;
};

export interface PartnerBalanceResponse {
  available_balance: string;
  held_balance: string;
  currency: 'VND';
}

export interface PartnerCardItem {
  card_serial: string;
  card_pin: string;
}

export interface PartnerBuyCardResponse {
  request_id: string;
  status: AgentPartnerTransactionStatus;
  product_code?: string;
  quantity?: number;
  amount?: string;
  cards?: PartnerCardItem[];
  error?: { code: string; message: string };
}

export type PartnerTransactionResponse = PartnerBuyCardResponse;

export function mapPartnerBalance(snapshot: {
  availableBalance: string;
  heldBalance: string;
}): PartnerBalanceResponse {
  return {
    available_balance: snapshot.availableBalance,
    held_balance: snapshot.heldBalance,
    currency: 'VND',
  };
}

export function mapPartnerOrderResponse(
  order: AgentOrderWithDetails,
  cardEncryption: CardEncryptionService,
  failureCode?: string,
): PartnerBuyCardResponse {
  const item = order.orderItems[0];
  const status = resolvePartnerStatus(order, failureCode);
  const base = {
    request_id: order.agentRequestId ?? '',
    status,
    product_code: item?.variant.sku,
    quantity: item?.quantity,
    amount: order.totalAmount.toFixed(2),
  };

  if (status === 'SUCCESS' && item) {
    return {
      ...base,
      cards: item.cardRecords.map((card) => ({
        card_serial: cardEncryption.decrypt(card.encryptedSerial),
        card_pin: cardEncryption.decrypt(card.encryptedPin),
      })),
    };
  }

  if (status === 'FAILED') {
    const code = sanitizeFailureCode(failureCode);
    return {
      ...base,
      error: {
        code,
        message: AGENT_PARTNER_ERROR_MESSAGES[code] ?? AGENT_PARTNER_ERROR_MESSAGES.UNKNOWN,
      },
    };
  }

  return base;
}

function resolvePartnerStatus(
  order: AgentOrderWithDetails,
  failureCode?: string,
): AgentPartnerTransactionStatus {
  if (order.fulfillmentStatus === 'COMPLETED') {
    return 'SUCCESS';
  }

  if (
    order.fulfillmentStatus === 'FAILED' ||
    failureCode === 'OUT_OF_STOCK' ||
    failureCode === 'LOW_BALANCE' ||
    failureCode === 'INVALID_SKU'
  ) {
    return 'FAILED';
  }

  return 'PROCESSING';
}

function sanitizeFailureCode(code?: string): string {
  if (!code || code === 'UNKNOWN') {
    return 'PROVIDER_ERROR';
  }
  if (code in AGENT_PARTNER_ERROR_MESSAGES) {
    return code;
  }
  return 'PROVIDER_ERROR';
}

export interface AgentApiContext {
  agent: Agent;
  requestId: string;
  secretKey: string;
}
