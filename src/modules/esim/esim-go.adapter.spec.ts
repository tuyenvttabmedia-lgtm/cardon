import { ForbiddenException } from '@nestjs/common';
import { createHook } from 'async_hooks';
import * as net from 'net';
import { ESIM_LIVE_HTTP_DISABLED } from './esim.constants';
import { EsimGoAdapter, EsimGoRequestError, EsimHttpTransport, buildLpa, createEsimGoAdapter } from './esim-go.adapter';

function trackSockets(): { sockets: string[]; stop: () => void } {
  const sockets: string[] = [];
  const hook = createHook({
    init(_asyncId, type) {
      if (type === 'TCPWRAP' || type === 'TLSWRAP') sockets.push(type);
    },
  });
  hook.enable();
  return { sockets, stop: () => hook.disable() };
}

const API_KEY = 'test-key-not-a-secret';

function transport(impl?: EsimHttpTransport['send']): EsimHttpTransport & { send: jest.Mock } {
  const send = jest.fn(impl);
  return { send };
}

describe('EsimGoAdapter', () => {
  it('refuses every call before transport, fetch, or a socket when HTTP is not enabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const connectSpy = jest.spyOn(net.Socket.prototype, 'connect');
    const sockets = trackSockets();
    const client = transport();
    const adapter = new EsimGoAdapter(undefined, {
      apiKey: API_KEY,
      baseUrl: 'https://api.esim-go.com/v2.5',
      transport: client,
    });

    try {
      await expect(adapter.listBundles()).rejects.toBeInstanceOf(ForbiddenException);
      await expect(adapter.getBundle('esim_1GB_7D_VN_U')).rejects.toThrow(ESIM_LIVE_HTTP_DISABLED);
      await expect(adapter.listPrices()).rejects.toBeInstanceOf(ForbiddenException);
      await expect(adapter.validateOrder({ items: [{ bundleName: 'esim_1GB_7D_VN_U', quantity: 1 }] })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(adapter.createOrder({ items: [{ bundleName: 'esim_1GB_7D_VN_U', quantity: 1 }] })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(adapter.getOrder('ord-1')).rejects.toBeInstanceOf(ForbiddenException);

      expect(client.send).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(connectSpy).not.toHaveBeenCalled();
      expect(sockets.sockets).toEqual([]);
    } finally {
      sockets.stop();
      fetchSpy.mockRestore();
      connectSpy.mockRestore();
    }
  });

  it('still refuses when live arm would be set and no test transport is enabled', async () => {
    const client = transport();
    const adapter = new EsimGoAdapter(
      { get: (key: string) => (key === 'esim.liveArm' ? true : 'secret-value') } as never,
      { transport: client },
    );
    await expect(adapter.listBundles()).rejects.toThrow(ESIM_LIVE_HTTP_DISABLED);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('sends catalogue, bundle, and price reads with the API key header', async () => {
    const client = transport(async (request) => {
      if (request.url.endsWith('/catalogue')) {
        return { status: 200, body: JSON.stringify([{ name: 'esim_1GB_7D_VN_U', description: 'VN' }]) };
      }
      if (request.url.includes('/catalogue/bundle/')) {
        return { status: 200, body: JSON.stringify({ name: 'esim_1GB_7D_VN_U', description: 'VN detail' }) };
      }
      return {
        status: 200,
        body: JSON.stringify({
          prices: [{ country: { iso: 'VN' }, prices: [{ currency: 'USD', price: '1.50', profile: 'default' }] }],
        }),
      };
    });
    const adapter = new EsimGoAdapter(undefined, {
      httpEnabled: true,
      apiKey: API_KEY,
      transport: client,
    });

    await expect(adapter.listBundles()).resolves.toEqual([{ name: 'esim_1GB_7D_VN_U', description: 'VN' }]);
    await expect(adapter.getBundle('esim 1GB')).resolves.toMatchObject({ name: 'esim_1GB_7D_VN_U' });
    await expect(adapter.listPrices()).resolves.toEqual([
      { countryIso: 'VN', currency: 'USD', price: '1.50', profile: 'default' },
    ]);

    expect(client.send).toHaveBeenCalledTimes(3);
    expect(client.send.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      url: 'https://api.esim-go.com/v2.5/catalogue',
      headers: { 'X-API-Key': API_KEY },
    });
    expect(client.send.mock.calls[1][0].url).toBe(
      'https://api.esim-go.com/v2.5/catalogue/bundle/esim%201GB',
    );
    expect(client.send.mock.calls[2][0]).toMatchObject({
      method: 'GET',
      url: 'https://api.esim-go.com/v2.5/catalogue/prices',
    });
  });

  it('posts validate and transaction orders and reads an order without logging the key', async () => {
    const client = transport(async (request) => {
      if (request.method === 'GET') {
        return { status: 200, body: JSON.stringify({ orderReference: 'ord-1', status: 'completed', currency: 'USD', total: 9.99 }) };
      }
      return { status: 200, body: JSON.stringify({ orderReference: 'ord-1', status: 'completed' }) };
    });
    const adapter = new EsimGoAdapter(undefined, {
      httpEnabled: true,
      apiKey: API_KEY,
      transport: client,
    });

    await adapter.validateOrder({ items: [{ bundleName: 'esim_1GB_7D_VN_U', quantity: 1 }], assign: false });
    await adapter.createOrder({ items: [{ bundleName: 'esim_1GB_7D_VN_U', quantity: 1 }], assign: true });
    await expect(adapter.getOrder('ord/1')).resolves.toMatchObject({ orderReference: 'ord-1', status: 'completed' });

    const validate = client.send.mock.calls[0][0];
    const create = client.send.mock.calls[1][0];
    expect(validate).toMatchObject({ method: 'POST', url: 'https://api.esim-go.com/v2.5/orders' });
    expect(JSON.parse(validate.body)).toEqual({
      type: 'validate',
      assign: false,
      order: [{ type: 'bundle', quantity: 1, item: 'esim_1GB_7D_VN_U' }],
    });
    expect(JSON.parse(create.body).type).toBe('transaction');
    expect(JSON.parse(create.body).assign).toBe(true);
    expect(client.send.mock.calls[2][0].url).toBe('https://api.esim-go.com/v2.5/orders/ord%2F1');
    expect(JSON.stringify(client.send.mock.calls)).toContain(API_KEY);
    expect(JSON.stringify(client.send.mock.results)).not.toContain(API_KEY);
  });

  it('rejects HTTP failures and a missing key before the transport runs', async () => {
    const failing = transport(async () => ({ status: 403, body: `forbidden ${API_KEY}` }));
    const adapter = new EsimGoAdapter(undefined, {
      httpEnabled: true,
      apiKey: API_KEY,
      transport: failing,
    });
    await expect(adapter.listBundles()).rejects.toEqual(
      expect.objectContaining({ status: 403, message: 'eSIM Go request failed with status 403' }),
    );
    await expect(adapter.listBundles()).rejects.toBeInstanceOf(EsimGoRequestError);
    expect(String((await adapter.listBundles().catch((error: Error) => error.message)))).not.toContain(API_KEY);

    const blocked = transport();
    const missingKey = new EsimGoAdapter(undefined, { httpEnabled: true, apiKey: '   ', transport: blocked });
    await expect(missingKey.listBundles()).rejects.toThrow('eSIM Go API key is not configured');
    expect(blocked.send).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and a catalogue payload that is not a list', async () => {
    const connectSpy = jest.spyOn(net.Socket.prototype, 'connect');
    const client = transport(async (request) => {
      if (request.url.endsWith('/catalogue/prices')) return { status: 200, body: 'not-json' };
      return { status: 200, body: JSON.stringify({ name: 'not-a-list' }) };
    });
    const adapter = new EsimGoAdapter(undefined, {
      httpEnabled: true,
      apiKey: API_KEY,
      transport: client,
    });

    try {
      await expect(adapter.listBundles()).rejects.toThrow('eSIM Go catalogue response was not a list');
      const wrapped = transport(async () => ({
        status: 200,
        body: JSON.stringify({ bundles: [{ name: 'esim_1GB_7D_VN_U', description: 'VN' }] }),
      }));
      const wrappedAdapter = new EsimGoAdapter(undefined, {
        httpEnabled: true,
        apiKey: API_KEY,
        transport: wrapped,
      });
      await expect(wrappedAdapter.listBundles()).resolves.toEqual([
        { name: 'esim_1GB_7D_VN_U', description: 'VN' },
      ]);
      await expect(adapter.listPrices()).rejects.toThrow('eSIM Go response was not valid JSON');
      expect(connectSpy).not.toHaveBeenCalled();
    } finally {
      connectSpy.mockRestore();
    }
  });

  it('builds an LPA string from the assigned eSIM and ignores pin data', async () => {
    const client = transport(async () => ({
      status: 200,
      body: JSON.stringify({
        orderReference: 'ord-1',
        status: 'completed',
        order: [{
          esims: [{
            iccid: '8900000000000000001',
            matchingId: 'MATCH-001',
            smdpAddress: 'https://smdp.example.com',
            pin: '1234',
            puk: '12345678',
          }],
        }],
      }),
    }));
    const adapter = new EsimGoAdapter(undefined, { httpEnabled: true, apiKey: API_KEY, transport: client });
    const result = await adapter.getOrder('ord-1');
    expect(result.installSecret).toBe('LPA:1$smdp.example.com$MATCH-001');
    expect(JSON.stringify(result)).not.toContain('1234');
    expect(JSON.stringify(result)).not.toContain('8900000000000000001');
    expect(buildLpa('not a host', 'MATCH-001')).toBeUndefined();
  });

  it('reads install details by reference and drops pin and puk', async () => {
    const client = transport(async (request) => {
      expect(request.url).toBe('https://api.esim-go.com/v2.5/esims/assignments?reference=ord-1');
      expect(request.headers.Accept).toBe('application/json');
      return {
        status: 200,
        body: JSON.stringify({
          iccid: '8900000000000000001',
          matchingId: 'MATCH-001',
          smdpAddress: 'smdp.example.com',
          pin: '1234',
          puk: '12345678',
        }),
      };
    });
    const adapter = new EsimGoAdapter(undefined, { httpEnabled: true, apiKey: API_KEY, transport: client });
    const result = await adapter.getInstallDetails('ord-1');
    expect(result.installSecret).toBe('LPA:1$smdp.example.com$MATCH-001');
    expect(JSON.stringify(result)).not.toContain('1234');
    expect(JSON.stringify(result)).not.toContain('12345678');
  });

  it('reads the catalogue for admin without the live arm and without placing an order', async () => {
    const client = transport(async (request) => {
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.esim-go.com/v2.5/catalogue');
      return { status: 200, body: JSON.stringify([{ name: 'esim_1GB_7D_VN_U' }, { name: 'esim_3GB_15D_JP_U' }]) };
    });
    const adapter = new EsimGoAdapter(undefined, { apiKey: API_KEY, transport: client });
    await expect(adapter.listBundles()).rejects.toThrow(ESIM_LIVE_HTTP_DISABLED);
    await expect(adapter.previewCatalogue()).resolves.toEqual({
      count: 2,
      names: ['esim_1GB_7D_VN_U', 'esim_3GB_15D_JP_U'],
    });
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('calls catalogue only when the live arm and API key are both set', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify([{ name: 'bundle-a' }]),
    } as Response);
    try {
      const armed = createEsimGoAdapter({
        get: (key: string) => {
          if (key === 'esim.liveArm') return true;
          if (key === 'esimGo.apiKey') return API_KEY;
          if (key === 'esimGo.baseUrl') return 'https://api.esim-go.com/v2.5';
          return undefined;
        },
      } as never);
      await expect(armed.listBundles()).resolves.toEqual([{ name: 'bundle-a' }]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.esim-go.com/v2.5/catalogue');
      expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: 'GET' });

      fetchSpy.mockClear();
      const closed = createEsimGoAdapter({
        get: (key: string) => (key === 'esimGo.apiKey' ? API_KEY : false),
      } as never);
      await expect(closed.listBundles()).rejects.toThrow(ESIM_LIVE_HTTP_DISABLED);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
