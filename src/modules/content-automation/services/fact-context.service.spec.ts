import { FactContextService } from './fact-context.service';

describe('FactContextService', () => {
  const variantRepository = { findById: jest.fn() };
  let service: FactContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FactContextService(variantRepository as never);
  });

  it('builds fact refs from backend variant data only', async () => {
    variantRepository.findById.mockResolvedValue({
      id: 'var-1',
      name: '50K',
      sku: 'VT-50K',
      faceValue: { toString: () => '50000' },
      sellPrice: { toString: () => '49000' },
      status: 'ACTIVE',
      product: { name: 'Viettel' },
    });

    const ctx = await service.buildFactContext(['var-1']);
    expect(ctx.source).toBe('BACKEND');
    expect(ctx.refs).toHaveLength(1);
    expect(ctx.refs[0]?.snapshot.sku).toBe('VT-50K');
    expect(ctx.refs[0]?.snapshot.productName).toBe('Viettel');
  });

  it('skips missing variants', async () => {
    variantRepository.findById.mockResolvedValue(null);
    const ctx = await service.buildFactContext(['missing']);
    expect(ctx.refs).toHaveLength(0);
  });
});
