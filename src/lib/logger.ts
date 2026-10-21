import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface RunLoggerOptions {
  runId: string;
  logDir?: string;
  clock?: () => string;
}

export interface RunLogger {
  readonly runId: string;
  readonly humanLogPath: string;
  readonly jsonlLogPath: string;
  info(event: string, message: string, context?: Record<string, unknown>): void;
  warn(event: string, message: string, context?: Record<string, unknown>): void;
  error(event: string, message: string, context?: Record<string, unknown>): void;
}

function formatContextPairs(context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) return '';
  const pairs = Object.entries(context).map(([k, v]) =>
    typeof v === 'string' ? `${k}="${v}"` : `${k}=${JSON.stringify(v)}`
  );
  return ` | ${pairs.join(' ')}`;
}

export function createRunLogger(options: RunLoggerOptions): RunLogger {
  const logDir = options.logDir ?? path.resolve(process.cwd(), 'logs/runs');
  const clock = options.clock ?? (() => new Date().toISOString());

  fs.mkdirSync(logDir, { recursive: true });

  const humanLogPath = path.join(logDir, `${options.runId}.log`);
  const jsonlLogPath = path.join(logDir, `${options.runId}.jsonl`);

  function write(level: LogLevel, event: string, message: string, context?: Record<string, unknown>): void {
    const timestamp = clock();
    const humanLine = `[${timestamp}] [${level}] [RUN:${options.runId}] [${event}] ${message}${formatContextPairs(context)}\n`;
    const jsonLine = JSON.stringify({
      timestamp,
      level,
      runId: options.runId,
      event,
      message,
      context: context ?? {},
    }) + '\n';

    fs.appendFileSync(humanLogPath, humanLine, 'utf-8');
    fs.appendFileSync(jsonlLogPath, jsonLine, 'utf-8');
  }

  return {
    runId: options.runId,
    humanLogPath,
    jsonlLogPath,
    info: (event, message, context) => write('INFO', event, message, context),
    warn: (event, message, context) => write('WARN', event, message, context),
    error: (event, message, context) => write('ERROR', event, message, context),
  };
}
