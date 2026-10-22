import { describe, it, expect } from 'vitest';
import { validateCfProfileConfig, appendRunHistoryRow } from '@/cli/verify-cf-profile';
import { prepareCloudflareBuildOutput } from '@/cli/prepare-cf-output';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Multi-Account cf CLI Profile Guardrail & Run History', () => {
  it('rejects deployment if only the "default" cf profile exists and "allezwembaden" profile is missing', () => {
    const profiles = [{ name: 'default', boundDirectories: [] }];
    const result = validateCfProfileConfig(profiles, '/Users/sramzzs4d/Projects-sramzz/swimming');

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('cf auth create allezwembaden');
    expect(result.errorMessage).toContain('cf auth activate allezwembaden .');
  });

  it('approves when "allezwembaden" profile exists and is bound to the project directory', () => {
    const profiles = [
      { name: 'default', boundDirectories: [] },
      { name: 'allezwembaden', boundDirectories: ['/Users/sramzzs4d/Projects-sramzz/swimming'] },
    ];
    const result = validateCfProfileConfig(profiles, '/Users/sramzzs4d/Projects-sramzz/swimming');

    expect(result.ok).toBe(true);
    expect(result.profileName).toBe('allezwembaden');
  });

  it('appends a formatted markdown row to database-context/run-history.md idempotently', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'az-hist-'));
    const historyFile = path.join(tmpDir, 'run-history.md');
    fs.writeFileSync(
      historyFile,
      '| Run ID | Timestamp (UTC) | Runner | Job Type | Checked | Updated | Quarantined | Log File |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n',
      'utf-8'
    );

    appendRunHistoryRow(historyFile, {
      runId: '2026-10-22_seed',
      timestampUtc: '2026-10-22T02:00:00Z',
      runner: 'LOCAL_MAC',
      jobType: 'SEED',
      checked: 6,
      updated: 6,
      quarantined: 0,
      logFile: 'logs/runs/2026-10-22_seed.log',
    });

    const content = fs.readFileSync(historyFile, 'utf-8');
    expect(content).toContain('| `2026-10-22_seed` | 2026-10-22T02:00:00Z | `LOCAL_MAC` | `SEED` | 6 | 6 | 0 | `logs/runs/2026-10-22_seed.log` |');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates Cloudflare Build Output Specification v0 directory from dist/', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'az-cf-out-'));
    const distDir = path.join(tmpDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'index.html'), '<h1>Zwemkaart</h1>', 'utf-8');

    prepareCloudflareBuildOutput(tmpDir);

    const rootConfigPath = path.join(tmpDir, '.cloudflare', 'output', 'v0', 'config.json');
    const workerConfigPath = path.join(
      tmpDir,
      '.cloudflare',
      'output',
      'v0',
      'workers',
      'default',
      'worker.config.json'
    );
    const copiedIndex = path.join(
      tmpDir,
      '.cloudflare',
      'output',
      'v0',
      'workers',
      'default',
      'assets',
      'index.html'
    );

    expect(fs.existsSync(rootConfigPath)).toBe(true);
    expect(fs.existsSync(workerConfigPath)).toBe(true);
    expect(fs.readFileSync(copiedIndex, 'utf-8')).toContain('Zwemkaart');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
