import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRunLogger } from '@/lib/logger';

describe('Dual-Format Run Logger', () => {
  let tempLogDir: string;

  beforeEach(() => {
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'az-logs-'));
  });

  afterEach(() => {
    fs.rmSync(tempLogDir, { recursive: true, force: true });
  });

  it('writes both human-readable .log and structured .jsonl entries', () => {
    const logger = createRunLogger({
      runId: '20261021-test-run',
      logDir: tempLogDir,
      clock: () => '2026-10-21T10:00:00.000Z',
    });

    logger.info('SEED_START', 'Starting venue seed for Amsterdam', { city: 'amsterdam', count: 4 });
    logger.warn('QUARANTINED', 'Price out of range for venue', {
      slug: 'de-mirandabad',
      fixCmd: 'pnpm sync:venue --slug=de-mirandabad --inspect',
    });

    const humanLog = fs.readFileSync(logger.humanLogPath, 'utf-8');
    const jsonlLog = fs.readFileSync(logger.jsonlLogPath, 'utf-8').trim().split('\n');

    expect(humanLog).toContain('[2026-10-21T10:00:00.000Z] [INFO] [RUN:20261021-test-run] [SEED_START] Starting venue seed for Amsterdam');
    expect(humanLog).toContain('city="amsterdam" count=4');
    expect(humanLog).toContain('[WARN] [RUN:20261021-test-run] [QUARANTINED]');

    expect(jsonlLog).toHaveLength(2);
    const parsedSecond = JSON.parse(jsonlLog[1]);
    expect(parsedSecond).toEqual({
      timestamp: '2026-10-21T10:00:00.000Z',
      level: 'WARN',
      runId: '20261021-test-run',
      event: 'QUARANTINED',
      message: 'Price out of range for venue',
      context: {
        slug: 'de-mirandabad',
        fixCmd: 'pnpm sync:venue --slug=de-mirandabad --inspect',
      },
    });
  });
});
