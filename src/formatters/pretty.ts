import type { Formatter, LogRecord } from '../types';
import { levelToName } from '../levels';

/**
 * ANSI color codes
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
} as const;

/**
 * Level colors mapping
 */
const levelColors: Record<number, string> = {
  10: colors.gray, // trace
  20: colors.blue, // debug
  30: colors.green, // info
  40: colors.yellow, // warn
  50: colors.red, // error
  60: colors.bold + colors.red, // fatal
};

/**
 * Level display names (uppercase, padded)
 */
const levelDisplay: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO ',
  40: 'WARN ',
  50: 'ERROR',
  60: 'FATAL',
};

/**
 * Format a timestamp for display
 */
function formatTime(time: number | string): string {
  if (typeof time === 'string') return time;
  const date = new Date(time);
  // Format: YYYY-MM-DD HH:mm:ss.SSS
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Format an object for display
 */
function formatObject(obj: Record<string, unknown>, indent = 2): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return '';

  const lines = entries.map(([key, value]) => {
    const formatted =
      typeof value === 'object' && value !== null
        ? JSON.stringify(value, null, 2).split('\n').join('\n' + ' '.repeat(indent + key.length + 2))
        : JSON.stringify(value);
    return `${' '.repeat(indent)}${colors.cyan}${key}${colors.reset}: ${formatted}`;
  });

  return '\n' + lines.join('\n');
}

/**
 * Pretty formatter for development use
 * Outputs colorized, human-readable logs
 */
export class PrettyFormatter implements Formatter {
  private useColors: boolean;

  constructor(useColors = true) {
    this.useColors = useColors;
  }

  format(record: LogRecord): string {
    const { level, time, msg, name, pid, hostname, traceId, spanId, ...rest } = record;

    const c = this.useColors ? colors : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', blue: '', magenta: '', cyan: '', white: '', gray: '' };
    const levelColor = this.useColors ? levelColors[level] ?? c.gray : '';
    const levelName = levelDisplay[level] ?? 'UNKN ';

    // Build the log line
    let line = '';

    // Timestamp
    line += `${c.gray}${formatTime(time)}${c.reset} `;

    // Level
    line += `${levelColor}${levelName}${c.reset} `;

    // Name (if present)
    if (name) {
      line += `${c.cyan}${name}${c.reset} `;
    }

    // Trace context (if present)
    if (traceId) {
      const shortTrace = traceId.slice(0, 8);
      const shortSpan = spanId?.slice(0, 8) ?? '';
      line += `${c.dim}[${shortTrace}:${shortSpan}]${c.reset} `;
    }

    // Message
    if (msg) {
      line += msg;
    }

    // Additional fields
    const extraFields = { ...rest };
    // Remove standard fields that are already displayed
    delete extraFields.err;

    if (Object.keys(extraFields).length > 0) {
      line += formatObject(extraFields);
    }

    // Error (special formatting)
    if (rest.err && typeof rest.err === 'object') {
      const err = rest.err as { type?: string; message?: string; stack?: string };
      line += `\n${c.red}${err.type ?? 'Error'}: ${err.message}${c.reset}`;
      if (err.stack) {
        const stackLines = err.stack.split('\n').slice(1); // Skip first line (already have message)
        line += `\n${c.gray}${stackLines.join('\n')}${c.reset}`;
      }
    }

    return line + '\n';
  }
}
