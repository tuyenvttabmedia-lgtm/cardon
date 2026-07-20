import { Injectable, Logger, Optional } from '@nestjs/common';
import { MegapayConfigService } from './megapay.config';
import { encrypt3desHex } from './depositcode.crypto';
import {
  DEPOSITCODE_PCODE,
  DepositCodeApiEnvelope,
  DepositCodeRegisterData,
  DepositCodeRegisterResponse,
} from './depositcode.types';

export type DepositCodeFetchFn = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatYmdHis(d: Date): string {
  return (
    d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds())
  );
}

function formatYmdEndOfDay(d: Date): string {
  return (
    d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    '235959'
  );
}

@Injectable()
export class DepositCodeHttpClient {
  private readonly logger = new Logger(DepositCodeHttpClient.name);
  private readonly fetchFn: DepositCodeFetchFn;

  constructor(
    private readonly configService: MegapayConfigService,
    @Optional() fetchFn?: DepositCodeFetchFn,
  ) {
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async registerVirtualAccount(params: {
    mapId: string;
    amount: number;
    customerName: string;
    expiresAt?: Date;
    email?: string | null;
  }): Promise<DepositCodeRegisterResponse> {
    const config = this.configService.getConfig();
    const now = new Date();
    const end = params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60_000);
    const requestId = `${config.merchantId}_${formatYmdHis(now)}_${Math.floor(
      100 + Math.random() * 900,
    )}`;

    const dataObj: DepositCodeRegisterData = {
      map_id: params.mapId.slice(0, 50),
      amount: params.amount,
      start_date: formatYmdHis(now),
      end_date: formatYmdEndOfDay(end),
      condition: '03', // exact amount
      customer_name: params.customerName.slice(0, 100),
      request_id: requestId.slice(0, 50),
      bank_code: config.bankCode,
      extend: {
        email: params.email ?? undefined,
      },
    };

    return this.postEncrypted(
      DEPOSITCODE_PCODE.REGISTER,
      dataObj as unknown as Record<string, unknown>,
      requestId,
    );
  }

  async checkStatusByMapId(
    mapId: string,
  ): Promise<DepositCodeRegisterResponse> {
    return this.postEncrypted(DEPOSITCODE_PCODE.CHECK_BY_MAP, {
      map_id: mapId.slice(0, 50),
    });
  }

  private async postEncrypted(
    pcode: string,
    dataObj: Record<string, unknown>,
    logRef?: string,
  ): Promise<DepositCodeRegisterResponse> {
    const config = this.configService.getConfig();
    const dataJson = JSON.stringify(dataObj);
    const dataEnc = encrypt3desHex(dataJson, config.secretKey);

    const envelope: DepositCodeApiEnvelope = {
      pcode,
      merchant_code: config.merchantId,
      data: dataEnc,
    };

    const url = config.endpoint;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const text = await response.text();
    if (!response.ok) {
      this.logger.error(
        `DepositCode HTTP ${response.status} pcode=${pcode} ref=${logRef ?? 'n/a'}`,
      );
      throw new Error(`DepositCode request failed with HTTP ${response.status}`);
    }

    let parsed: DepositCodeRegisterResponse;
    try {
      parsed = JSON.parse(text) as DepositCodeRegisterResponse;
    } catch {
      throw new Error('DepositCode returned non-JSON response');
    }

    this.logger.log(
      `DepositCode pcode=${pcode} response_code=${parsed.response_code} map_id=${parsed.map_id ?? (dataObj.map_id as string) ?? 'n/a'} account=${parsed.account_no ?? 'n/a'}`,
    );

    return parsed;
  }
}
