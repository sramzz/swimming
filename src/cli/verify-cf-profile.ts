import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const REQUIRED_CF_PROFILE = 'allezwembaden';

export interface CfAuthProfileEntry {
  name: string;
  boundDirectories: string[];
}

export interface CfProfileValidationResult {
  ok: boolean;
  profileName: string;
  errorMessage: string | null;
}

export function validateCfProfileConfig(
  profiles: CfAuthProfileEntry[],
  projectDir: string
): CfProfileValidationResult {
  const normalizedDir = path.resolve(projectDir);
  const target = profiles.find((p) => p.name === REQUIRED_CF_PROFILE);

  if (!target) {
    return {
      ok: false,
      profileName: REQUIRED_CF_PROFILE,
      errorMessage: [
        `❌ [CF MULTI-ACCOUNT GUARD] Profile "${REQUIRED_CF_PROFILE}" was not found!`,
        `This PC uses the "default" profile for another Cloudflare account.`,
        `To authenticate the correct Cloudflare account for AlleZwembaden.nl, run:`,
        `  1. npx cf auth create ${REQUIRED_CF_PROFILE}`,
        `  2. npx cf auth activate ${REQUIRED_CF_PROFILE} .`,
        `  3. npx cf auth whoami --profile ${REQUIRED_CF_PROFILE}`,
      ].join('\n'),
    };
  }

  const isBound = target.boundDirectories.some((d) => path.resolve(d) === normalizedDir);
  if (!isBound) {
    return {
      ok: false,
      profileName: REQUIRED_CF_PROFILE,
      errorMessage: [
        `❌ [CF MULTI-ACCOUNT GUARD] Profile "${REQUIRED_CF_PROFILE}" exists but is not bound to ${normalizedDir}.`,
        `Bind it to this project directory so commands never hit the "default" account:`,
        `  npx cf auth activate ${REQUIRED_CF_PROFILE} .`,
      ].join('\n'),
    };
  }

  return {
    ok: true,
    profileName: REQUIRED_CF_PROFILE,
    errorMessage: null,
  };
}

export interface RunHistoryRowInput {
  runId: string;
  timestampUtc: string;
  runner: string;
  jobType: string;
  checked: number;
  updated: number;
  quarantined: number;
  logFile: string;
}

export function appendRunHistoryRow(
  historyFilePath: string,
  row: RunHistoryRowInput
): void {
  if (!fs.existsSync(historyFilePath)) return;
  const existing = fs.readFileSync(historyFilePath, 'utf-8');
  const line = `| \`${row.runId}\` | ${row.timestampUtc} | \`${row.runner}\` | \`${row.jobType}\` | ${row.checked} | ${row.updated} | ${row.quarantined} | \`${row.logFile}\` |\n`;
  if (!existing.includes(`| \`${row.runId}\` |`)) {
    fs.appendFileSync(historyFilePath, line, 'utf-8');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = execSync('npx cf auth list', { encoding: 'utf-8' });
  const jsonStart = raw.indexOf('[');
  const profiles = (jsonStart >= 0 ? JSON.parse(raw.slice(jsonStart)) : []) as CfAuthProfileEntry[];
  const res = validateCfProfileConfig(profiles, process.cwd());
  if (!res.ok) {
    console.error(res.errorMessage);
    process.exit(1);
  }
  console.log(`✅ Cloudflare profile "${res.profileName}" verified and bound to ${process.cwd()}`);
}
