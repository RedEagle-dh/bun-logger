import type { LogLevelName } from './levels';

/**
 * Serializer function type
 */
export type Serializer<T = unknown> = (value: T) => unknown;

/**
 * Redaction options
 */
export interface RedactOptions {
  paths: string[];
}

/**
 * Output destination types
 */
export type Destination =
  | 'stdout'
  | 'stderr'
  | { path: string }
  | { write: (data: string) => void | Promise<void> };

/**
 * Formatter interface
 */
export interface Formatter {
  format(record: LogRecord): string;
}

/**
 * OTEL exporter configuration
 */
export interface OtelExporterConfig {
  endpoint: string;
  headers?: Record<string, string>;
  timeout?: number;
  batchSize?: number;
  flushInterval?: number;
}

/**
 * OTEL configuration options
 */
export interface OtelOptions {
  /** Service name for resource attribution */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Auto-inject trace context into logs (default: true) */
  autoInjectContext?: boolean;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string | number | boolean>;
  /** OTLP exporter configuration */
  exporter?: OtelExporterConfig;
}

/**
 * Trace context for OTEL correlation
 */
export interface TraceContext {
  /** Trace ID (32 hex chars) */
  traceId: string;
  /** Span ID (16 hex chars) */
  spanId: string;
  /** Trace flags (typically 0x01 for sampled) */
  traceFlags: number;
  /** Optional trace state */
  traceState?: string;
}

/**
 * Span options for creating new spans
 */
export interface SpanOptions {
  /** Span name/operation */
  name: string;
  /** Span kind */
  kind?: 'internal' | 'server' | 'client' | 'producer' | 'consumer';
  /** Initial attributes */
  attributes?: Record<string, string | number | boolean | string[] | number[] | boolean[]>;
  /** Start time in milliseconds (default: now) */
  startTime?: number;
}

/**
 * Span interface for tracing operations
 */
export interface Span {
  /** The span's trace context */
  readonly context: TraceContext;
  /** Whether the span has ended */
  readonly ended: boolean;
  /** Span name */
  readonly name: string;

  /** Set a single attribute */
  setAttribute(key: string, value: string | number | boolean): this;
  /** Set multiple attributes */
  setAttributes(attributes: Record<string, string | number | boolean>): this;
  /** Add an event to the span */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): this;
  /** Set the span status */
  setStatus(status: 'ok' | 'error', message?: string): this;
  /** Record an exception */
  recordException(error: Error): this;
  /** End the span */
  end(endTime?: number): void;
}

/**
 * Field name customization options
 */
export interface FieldNames {
  /** Timestamp field name (default: 'time' for pino, 'timestamp' for otel) */
  timestamp?: string;
  /** Level field name (default: 'level' for pino, 'severityNumber' for otel) */
  level?: string;
  /** Message field name (default: 'msg' for pino, 'body' for otel) */
  message?: string;
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Logger name - added to every log line */
  name?: string;

  /** Minimum log level (default: 'info') */
  level?: LogLevelName;

  /** Base bindings added to every log line */
  base?: Record<string, unknown>;

  /** Custom timestamp function (default: Date.now) */
  timestamp?: boolean | (() => number | string);

  /** Output format: 'json' | 'pretty' | 'auto' (default: 'auto') */
  format?: 'json' | 'pretty' | 'auto';

  /** JSON output style: 'pino' (default) | 'otel' for OTEL-compliant format */
  outputStyle?: 'pino' | 'otel';

  /** Custom field names for JSON output */
  fieldNames?: FieldNames;

  /** Custom serializers for specific keys */
  serializers?: Record<string, Serializer>;

  /** Output destination */
  destination?: Destination;

  /** Redact sensitive fields */
  redact?: string[] | RedactOptions;

  /** OTEL configuration (false to disable, true for defaults) */
  otel?: OtelOptions | boolean;
}

/**
 * Child logger specific options
 */
export interface ChildLoggerOptions {
  level?: LogLevelName;
  serializers?: Record<string, Serializer>;
}

/**
 * Base log record structure (Pino-style)
 */
export interface LogRecord {
  level: number;
  time: number | string;
  pid: number;
  hostname: string;
  msg?: string;
  name?: string;
  // OTEL fields
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
  [key: string]: unknown;
}

/**
 * OTEL-style log record structure
 */
export interface OtelLogRecord {
  timestamp: string;
  severityNumber: number;
  severityText: string;
  body: string;
  resource?: Record<string, unknown>;
  attributes: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
}

/**
 * Logger method signature - supports Pino's flexible API
 */
export interface LogMethod {
  (msg: string, ...args: unknown[]): void;
  (obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  <T extends Error>(err: T, msg?: string, ...args: unknown[]): void;
}

/**
 * Spanned logger - a logger bound to a span
 */
export interface SpannedLogger extends Logger {
  /** The span associated with this logger */
  readonly span: Span;
  /** End the span */
  endSpan(endTime?: number): void;
}

/**
 * Core Logger interface
 */
export interface Logger {
  /** Log at trace level */
  trace: LogMethod;
  /** Log at debug level */
  debug: LogMethod;
  /** Log at info level */
  info: LogMethod;
  /** Log at warn level */
  warn: LogMethod;
  /** Log at error level */
  error: LogMethod;
  /** Log at fatal level */
  fatal: LogMethod;

  /** Current log level */
  level: LogLevelName;

  /** Create a child logger with additional bindings */
  child(bindings: Record<string, unknown>, options?: ChildLoggerOptions): Logger;

  /** Get current bindings */
  bindings(): Record<string, unknown>;

  /** Check if a level would be logged */
  isLevelEnabled(level: LogLevelName): boolean;

  /** Flush any buffered logs */
  flush(): Promise<void>;

  /** Gracefully shutdown the logger, flushing all buffers and stopping exporters */
  shutdown(): Promise<void>;

  /** Start a new span and return a spanned logger */
  startSpan(name: string, options?: Partial<SpanOptions>): SpannedLogger;

  /** Run a function within a span */
  withSpan<T>(name: string, fn: (logger: SpannedLogger) => T): T;
  withSpan<T>(name: string, options: Partial<SpanOptions>, fn: (logger: SpannedLogger) => T): T;
  withSpan<T>(name: string, fn: (logger: SpannedLogger) => Promise<T>): Promise<T>;
  withSpan<T>(name: string, options: Partial<SpanOptions>, fn: (logger: SpannedLogger) => Promise<T>): Promise<T>;

  /** Create a child logger with explicit trace context */
  withTraceContext(context: TraceContext): Logger;
}
