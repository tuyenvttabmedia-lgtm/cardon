import { EsimController } from './esim.controller';

describe('GET /esim/offers response contract', () => {
  it('returns salesOpen plus the offer array so the interceptor wraps it once', async () => {
    const controller = new EsimController(
      {} as never,
      {
        listStorefront: async () => ({ salesOpen: false, offers: [] }),
      } as never,
      {} as never,
    );
    const body = await controller.offers();

    expect(body).toEqual({ salesOpen: false, offers: [] });
    expect(body).not.toEqual({ data: { salesOpen: false, offers: [] } });
  });
});
