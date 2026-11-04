import { Injectable } from '@nestjs/common';
import { ESIM_TEST_LPA_PREFIX, ESIM_TEST_MARKER } from './esim.constants';

export class EsimOutcomeUnconfirmedError extends Error {
  constructor() {
    super('eSIM mock outcome is unconfirmed');
    this.name = 'EsimOutcomeUnconfirmedError';
  }
}

export interface EsimMockCreateResult {
  testData: true;
  installSecret: string;
}

@Injectable()
export class EsimMockAdapter {
  createCount = 0;

  async create(input: {
    requestId: string;
    simulateTimeout?: boolean;
  }): Promise<EsimMockCreateResult> {
    this.createCount += 1;
    if (input.simulateTimeout) {
      throw new EsimOutcomeUnconfirmedError();
    }
    return {
      testData: true,
      installSecret: `${ESIM_TEST_MARKER}:${input.requestId}:${ESIM_TEST_LPA_PREFIX}MOCK`,
    };
  }
}

export const ESIM_MOCK_OFFERS = [
  {
    id: 'mock-esim-test-sea-1d',
    title: 'Gói thử nghiệm Đông Nam Á 1 ngày',
    notice: 'Dữ liệu mô phỏng. Không phải eSIM thật và không cài được lên máy.',
    testData: true as const,
  },
];
