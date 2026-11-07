import { HomeServiceType } from '@prisma/client';
import { AgentMarginConfigService } from './agent-margin-config.service';

describe('AgentMarginConfigService defaults', () => {
  function serviceWithStoredServices(services: Record<string, unknown>) {
    const settingsRepository = {
      findByKey: jest.fn().mockResolvedValue({
        value: {
          roundTo: 100,
          applyScope: 'ALL_AGENTS',
          services,
        },
      }),
    };
    return new AgentMarginConfigService(settingsRepository as never, { create: jest.fn() } as never);
  }

  it('keeps the current default margin for each legacy service and a separate zero eSIM rule', async () => {
    const service = new AgentMarginConfigService(
      { findByKey: jest.fn().mockResolvedValue(null) } as never,
      { create: jest.fn() } as never,
    );
    const config = await service.getConfig();

    expect(config.services.GAME_CARD).toEqual({ marginType: 'PERCENT', value: 0.5 });
    expect(config.services.PHONE_CARD).toEqual({ marginType: 'PERCENT', value: 0.5 });
    expect(config.services.TOPUP).toEqual({ marginType: 'PERCENT', value: 0.3 });
    expect(config.services.DATA).toEqual({ marginType: 'PERCENT', value: 0.3 });
    expect(config.services.ESIM).toEqual({ marginType: 'PERCENT', value: 0 });
    expect(service.getRuleForService(config, HomeServiceType.ESIM)).toEqual({
      marginType: 'PERCENT',
      value: 0,
    });
  });

  it('fills a missing stored ESIM key from the zero default instead of GAME_CARD', async () => {
    const service = serviceWithStoredServices({
      GAME_CARD: { marginType: 'PERCENT', value: 0.5 },
      PHONE_CARD: { marginType: 'PERCENT', value: 0.5 },
      TOPUP: { marginType: 'PERCENT', value: 0.3 },
      DATA: { marginType: 'PERCENT', value: 0.3 },
    });
    const config = await service.getConfig();

    expect(config.services.GAME_CARD.value).toBe(0.5);
    expect(config.services.ESIM).toEqual({ marginType: 'PERCENT', value: 0 });
    expect(service.getRuleForService(config, HomeServiceType.ESIM).value).not.toBe(
      config.services.GAME_CARD.value,
    );
  });
});
