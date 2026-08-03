import { describe, it, expect } from 'vitest';
import { formatDuration, groupTimings } from '@/lib/timings';

const job = (status: string, dispatched: string | null, completed: string | null) => ({
  status, dispatched_at: dispatched, completed_at: completed,
});

describe('formatDuration', () => {
  it('formata segundos, minutos e horas; nunca negativo', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(60_000)).toBe('1min');
    expect(formatDuration(200_000)).toBe('3min 20s');
    expect(formatDuration(3_660_000)).toBe('1h 1min');
    expect(formatDuration(-70_000)).toBe('0s');
  });
});

describe('groupTimings', () => {
  it('média da animação e janela do grupo sobre os prontos', () => {
    const t = groupTimings([
      job('completed', '2026-08-01T10:00:00Z', '2026-08-01T10:02:00Z'), // 2min
      job('completed', '2026-08-01T10:01:00Z', '2026-08-01T10:05:00Z'), // 4min
      job('generating', '2026-08-01T10:03:00Z', null), // ignorado
    ]);
    expect(t).not.toBeNull();
    expect(t!.sample).toBe(2);
    expect(t!.avgMs).toBe(3 * 60_000);
    // janela: 10:00 (1ª animação) → 10:05 (última entrega)
    expect(t!.totalMs).toBe(5 * 60_000);
  });
  it('null sem vídeos prontos; timestamps invertidos não geram negativo', () => {
    expect(groupTimings([job('generating', '2026-08-01T10:00:00Z', null)])).toBeNull();
    const t = groupTimings([job('completed', '2026-08-01T10:05:00Z', '2026-08-01T10:00:00Z')]);
    expect(t!.avgMs).toBe(0);
    expect(t!.totalMs).toBe(0);
  });
});
