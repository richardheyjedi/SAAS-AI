import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('vitest funciona com alias @', async () => {
    const mod = await import('@/types');
    expect(mod).toBeDefined();
  });
});
