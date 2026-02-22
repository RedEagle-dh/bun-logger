import type { OtelExporterConfig, TraceContext } from '../types';
import type { SpanData } from './span';
import { getSeverityNumber, getSeverityText } from './severity';

/**
 * OTEL log record for export
 */
export interface OtelLogRecord {
  timestamp: number;
  severityNumber: number;
  severityText: string;
  body: string;
  attributes: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
}

/**
 * OTLP payload types
 */
interface OtlpAttribute {
  key: string;
  value: OtlpValue;
}

type OtlpValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: OtlpValue[] } };

interface OtlpLogRecord {
  timeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: OtlpValue;
  attributes: OtlpAttribute[];
  traceId?: string;
  spanId?: string;
  flags?: number;
}

interface OtlpLogsPayload {
  resourceLogs: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeLogs: Array<{
      scope: { name: string; version?: string };
      logRecords: OtlpLogRecord[];
    }>;
  }>;
}

/**
 * Convert a value to OTLP format
 */
function valueToOtlp(value: unknown): OtlpValue {
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((v) => valueToOtlp(v)),
      },
    };
  }
  return { stringValue: String(value) };
}

/**
 * Convert attributes to OTLP format
 */
function attributesToOtlp(attrs: Record<string, unknown>): OtlpAttribute[] {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      key,
      value: valueToOtlp(value),
    }));
}

/**
 * OTLP HTTP/JSON Exporter for logs
 */
export class OtlpLogExporter {
  #config: Required<OtelExporterConfig>;
  #resource: Record<string, string | number | boolean>;
  #batch: OtelLogRecord[] = [];
  #batchTimer?: Timer;
  #flushing = false;

  constructor(
    config: OtelExporterConfig,
    resource: Record<string, string | number | boolean> = {}
  ) {
    this.#config = {
      endpoint: config.endpoint,
      headers: config.headers ?? {},
      timeout: config.timeout ?? 10000,
      batchSize: config.batchSize ?? 512,
      flushInterval: config.flushInterval ?? 5000,
    };
    this.#resource = {
      'telemetry.sdk.name': 'bun-logger',
      'telemetry.sdk.language': 'typescript',
      'telemetry.sdk.version': '0.1.0',
      ...resource,
    };

    // Warn if sending auth headers over non-HTTPS
    if (config.headers && Object.keys(config.headers).length > 0 && !config.endpoint.startsWith('https://')) {
      console.warn('[bun-logger] OTLP log exporter: sending headers over non-HTTPS endpoint is insecure');
    }

    // Start periodic flush
    this.#startFlushTimer();
  }

  #startFlushTimer(): void {
    this.#batchTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.#config.flushInterval);

    // Don't keep process alive just for flushing
    if (typeof this.#batchTimer.unref === 'function') {
      this.#batchTimer.unref();
    }
  }

  /**
   * Add a log record to the batch
   */
  export(record: OtelLogRecord): void {
    this.#batch.push(record);

    if (this.#batch.length >= this.#config.batchSize) {
      this.flush().catch(console.error);
    }
  }

  /**
   * Create log record from log data
   */
  createLogRecord(
    level: number,
    message: string,
    attributes: Record<string, unknown>,
    traceContext?: TraceContext
  ): OtelLogRecord {
    const record: OtelLogRecord = {
      timestamp: Date.now(),
      severityNumber: getSeverityNumber(level),
      severityText: getSeverityText(level),
      body: message,
      attributes,
    };

    if (traceContext) {
      record.traceId = traceContext.traceId;
      record.spanId = traceContext.spanId;
      record.traceFlags = traceContext.traceFlags;
    }

    return record;
  }

  /**
   * Flush all buffered logs
   */
  async flush(): Promise<void> {
    if (this.#batch.length === 0 || this.#flushing) return;

    this.#flushing = true;
    const records = this.#batch;
    this.#batch = [];

    try {
      const payload = this.#buildPayload(records);
      const endpoint = this.#config.endpoint.replace(/\/$/, '') + '/v1/logs';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.#config.headers,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.#config.timeout),
      });

      if (!response.ok) {
        console.error(`[bun-logger] OTLP export failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('[bun-logger] OTLP export error:', error);
      // Re-add failed records to batch for retry (with limit)
      if (this.#batch.length < this.#config.batchSize * 2) {
        this.#batch.unshift(...records);
      }
    } finally {
      this.#flushing = false;
    }
  }

  #buildPayload(records: OtelLogRecord[]): OtlpLogsPayload {
    return {
      resourceLogs: [
        {
          resource: {
            attributes: attributesToOtlp(this.#resource),
          },
          scopeLogs: [
            {
              scope: {
                name: 'bun-logger',
                version: '0.1.0',
              },
              logRecords: records.map((r) => this.#recordToOtlp(r)),
            },
          ],
        },
      ],
    };
  }

  #recordToOtlp(record: OtelLogRecord): OtlpLogRecord {
    const result: OtlpLogRecord = {
      timeUnixNano: String(record.timestamp * 1_000_000),
      severityNumber: record.severityNumber,
      severityText: record.severityText,
      body: { stringValue: record.body },
      attributes: attributesToOtlp(record.attributes),
    };

    if (record.traceId) {
      result.traceId = record.traceId;
    }
    if (record.spanId) {
      result.spanId = record.spanId;
    }
    if (record.traceFlags !== undefined) {
      result.flags = record.traceFlags;
    }

    return result;
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    if (this.#batchTimer) {
      clearInterval(this.#batchTimer);
      this.#batchTimer = undefined;
    }
    await this.flush();
  }
}

/**
 * OTLP HTTP/JSON Exporter for spans
 */
export class OtlpSpanExporter {
  #config: Required<OtelExporterConfig>;
  #resource: Record<string, string | number | boolean>;
  #batch: SpanData[] = [];
  #batchTimer?: Timer;
  #flushing = false;

  constructor(
    config: OtelExporterConfig,
    resource: Record<string, string | number | boolean> = {}
  ) {
    this.#config = {
      endpoint: config.endpoint,
      headers: config.headers ?? {},
      timeout: config.timeout ?? 10000,
      batchSize: config.batchSize ?? 512,
      flushInterval: config.flushInterval ?? 5000,
    };
    this.#resource = {
      'telemetry.sdk.name': 'bun-logger',
      'telemetry.sdk.language': 'typescript',
      'telemetry.sdk.version': '0.1.0',
      ...resource,
    };

    // Warn if sending auth headers over non-HTTPS
    if (config.headers && Object.keys(config.headers).length > 0 && !config.endpoint.startsWith('https://')) {
      console.warn('[bun-logger] OTLP span exporter: sending headers over non-HTTPS endpoint is insecure');
    }

    this.#startFlushTimer();
  }

  #startFlushTimer(): void {
    this.#batchTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.#config.flushInterval);

    if (typeof this.#batchTimer.unref === 'function') {
      this.#batchTimer.unref();
    }
  }

  export(span: SpanData): void {
    this.#batch.push(span);

    if (this.#batch.length >= this.#config.batchSize) {
      this.flush().catch(console.error);
    }
  }

  async flush(): Promise<void> {
    if (this.#batch.length === 0 || this.#flushing) return;

    this.#flushing = true;
    const spans = this.#batch;
    this.#batch = [];

    try {
      const endpoint = this.#config.endpoint.replace(/\/$/, '') + '/v1/traces';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.#config.headers,
        },
        body: JSON.stringify(this.#buildPayload(spans)),
        signal: AbortSignal.timeout(this.#config.timeout),
      });

      if (!response.ok) {
        console.error(`[bun-logger] OTLP span export failed: ${response.status}`);
      }
    } catch (error) {
      console.error('[bun-logger] OTLP span export error:', error);
    } finally {
      this.#flushing = false;
    }
  }

  #buildPayload(spans: SpanData[]) {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: attributesToOtlp(this.#resource),
          },
          scopeSpans: [
            {
              scope: {
                name: 'bun-logger',
                version: '0.1.0',
              },
              spans: spans.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                parentSpanId: s.parentSpanId,
                name: s.name,
                kind: this.#kindToNumber(s.kind),
                startTimeUnixNano: String(s.startTime * 1_000_000),
                endTimeUnixNano: s.endTime ? String(s.endTime * 1_000_000) : undefined,
                attributes: attributesToOtlp(s.attributes),
                events: s.events.map((e) => ({
                  name: e.name,
                  timeUnixNano: String(e.timestamp * 1_000_000),
                  attributes: e.attributes ? attributesToOtlp(e.attributes) : [],
                })),
                status: {
                  code: s.status.code === 'error' ? 2 : s.status.code === 'ok' ? 1 : 0,
                  message: s.status.message,
                },
              })),
            },
          ],
        },
      ],
    };
  }

  #kindToNumber(kind: string): number {
    switch (kind) {
      case 'internal':
        return 1;
      case 'server':
        return 2;
      case 'client':
        return 3;
      case 'producer':
        return 4;
      case 'consumer':
        return 5;
      default:
        return 0;
    }
  }

  async shutdown(): Promise<void> {
    if (this.#batchTimer) {
      clearInterval(this.#batchTimer);
      this.#batchTimer = undefined;
    }
    await this.flush();
  }
}
