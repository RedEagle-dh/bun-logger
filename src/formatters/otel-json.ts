import type { Formatter, LogRecord, FieldNames } from '../types';
import { getSeverityNumber, getSeverityText } from '../otel/severity';

/**
 * OTEL JSON formatter options
 */
export interface OtelJsonFormatterOptions {
  /** Custom field names */
  fieldNames?: FieldNames;
  /** Include resource in every log */
  includeResource?: boolean;
  /** Resource attributes */
  resource?: Record<string, unknown>;
  /** Use ISO timestamp (default: true) */
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
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  });
}

/**
 * OTEL-compliant JSON formatter
 * Outputs logs in OpenTelemetry log data model format
 */
export class OtelJsonFormatter implements Formatter {
  #fieldNames: Required<FieldNames>;
  #includeResource: boolean;
  #resource?: Record<string, unknown>;
  #isoTimestamp: boolean;

  constructor(options: OtelJsonFormatterOptions = {}) {
    this.#fieldNames = {
      timestamp: options.fieldNames?.timestamp ?? 'timestamp',
      level: options.fieldNames?.level ?? 'severityNumber',
      message: options.fieldNames?.message ?? 'body',
    };
    this.#includeResource = options.includeResource ?? false;
    this.#resource = options.resource;
    this.#isoTimestamp = options.isoTimestamp ?? true;
  }

  format(record: LogRecord): string {
    const { level, time, pid, hostname, msg, name, traceId, spanId, traceFlags, ...rest } = record;

    // Build OTEL-compliant output
    const output: Record<string, unknown> = {};

    // Timestamp
    output[this.#fieldNames.timestamp] = this.#isoTimestamp
      ? new Date(time).toISOString()
      : time;

    // Severity
    output[this.#fieldNames.level] = getSeverityNumber(level);
    output.severityText = getSeverityText(level);

    // Body (message)
    output[this.#fieldNames.message] = msg ?? '';

    // Trace context
    if (traceId) {
      output.traceId = traceId;
    }
    if (spanId) {
      output.spanId = spanId;
    }
    if (traceFlags !== undefined) {
      output.traceFlags = traceFlags;
    }

    // Attributes (everything else)
    const attributes: Record<string, unknown> = {
      ...rest,
      'process.pid': pid,
      'host.name': hostname,
    };
    if (name) {
      attributes['service.name'] = name;
    }

    output.attributes = attributes;

    // Resource (optional)
    if (this.#includeResource && this.#resource) {
      output.resource = this.#resource;
    }

    try {
      return JSON.stringify(output) + '\n';
    } catch {
      return safeStringify(output) + '\n';
    }
  }
}
