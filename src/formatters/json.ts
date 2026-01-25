import type { Formatter, LogRecord, FieldNames } from '../types';

/**
 * JSON formatter options
 */
export interface JsonFormatterOptions {
  /** Custom field names */
  fieldNames?: FieldNames;
  /** Use ISO timestamp instead of epoch ms */
  isoTimestamp?: boolean;
}

/**
 * Safe JSON stringify that handles circular references
 */
function safeStringify(obj: unknown): string {
  const seen = new WeakSet();

  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    // Handle BigInt
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  });
}

/**
 * JSON formatter for production use
 * Outputs newline-delimited JSON (NDJSON)
 */
export class JsonFormatter implements Formatter {
  #fieldNames: FieldNames;
  #isoTimestamp: boolean;

  constructor(options: JsonFormatterOptions = {}) {
    this.#fieldNames = options.fieldNames ?? {};
    // Auto-enable ISO timestamp if custom timestamp field name is provided
    this.#isoTimestamp = options.isoTimestamp ??
      (this.#fieldNames.timestamp !== undefined && this.#fieldNames.timestamp !== 'time');
  }

  format(record: LogRecord): string {
    let output: Record<string, unknown> = { ...record };

    // Apply custom field names
    if (this.#fieldNames.timestamp && this.#fieldNames.timestamp !== 'time') {
      output[this.#fieldNames.timestamp] = this.#isoTimestamp
        ? new Date(record.time).toISOString()
        : record.time;
      delete output.time;
    } else if (this.#isoTimestamp) {
      output.time = new Date(record.time).toISOString();
    }

    if (this.#fieldNames.level && this.#fieldNames.level !== 'level') {
      output[this.#fieldNames.level] = record.level;
      delete output.level;
    }

    if (this.#fieldNames.message && this.#fieldNames.message !== 'msg') {
      output[this.#fieldNames.message] = record.msg;
      delete output.msg;
    }

    try {
      return JSON.stringify(output) + '\n';
    } catch {
      // Fall back to safe stringify for circular references
      return safeStringify(output) + '\n';
    }
  }
}
