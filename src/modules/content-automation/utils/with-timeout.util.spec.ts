import { withTimeout } from './with-timeout.util';

describe('withTimeout', () => {
  it('resolves when promise settles before timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, () => new Error('timeout'))).resolves.toBe(
      'ok',
    );
  });

  it('rejects with onTimeout error when promise is slow', async () => {
    await expect(
      withTimeout(
        new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
        10,
        () => new Error('timed out'),
      ),
    ).rejects.toThrow('timed out');
  });
});
