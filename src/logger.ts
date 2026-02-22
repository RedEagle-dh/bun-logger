import { LogLevels, type LogLevelName } from './levels';
import type {
  LoggerOptions,
  LogRecord,
  LogMethod,
  ChildLoggerOptions,
  Logger as ILogger,
  Serializer,
  TraceContext,
  SpannedLogger as ISpannedLogger,
  Span,
  SpanOptions,
  OtelOptions,
  FieldNames,
} from './types';
import { createFormatter, type FormatType, type OutputStyle } from './formatters';
import { createDestination, type Writer } from './output';
import { defaultSerializers } from './serializers';
import { resolveTraceContext, runWithTraceContext } from './otel/context';
import { LoggerSpan } from './otel/span';
import { OtlpLogExporter, OtlpSpanExporter } from './otel/exporter';

/**
 * Resolved logger options with defaults applied
 */
interface ResolvedOptions {
  name?: string;
  level: LogLevelName;
  base: Record<string, unknown>;
  timestamp: boolean | (() => number | string);
  format: FormatType;
  outputStyle: OutputStyle;
  fieldNames?: FieldNames;
  serializers: Record<string, Serializer>;
  redact: string[];
  otel: OtelOptions | false;
}

/**
 * Core Logger implementation
 */
export class Logger implements ILogger {
  #options: ResolvedOptions;
  #levelValue: number;
  #bindings: Record<string, unknown>;
  #formatter: ReturnType<typeof createFormatter>;
  #write: Writer;
  #hostname: string;
  #pid: number;
  #traceContext?: TraceContext;
  #logExporter?: OtlpLogExporter;
  #spanExporter?: OtlpSpanExporter;

  // Log methods (assigned in constructor)
  trace!: LogMethod;
  debug!: LogMethod;
  info!: LogMethod;
  warn!: LogMethod;
  error!: LogMethod;
  fatal!: LogMethod;

  constructor(options: LoggerOptions = {}, _skipInit = false) {
    // Resolve options with defaults
    this.#options = this.#resolveOptions(options);
    this.#levelValue = LogLevels[this.#options.level];
    this.#bindings = this.#buildBaseBindings();

    // Cache system info for performance
    this.#hostname = typeof Bun !== 'undefined' && 'hostname' in Bun ? (Bun as unknown as { hostname(): string }).hostname() : require('os').hostname();
    this.#pid = process.pid;

    if (_skipInit) {
      // Child loggers inherit formatter, writer, and exporters from parent
      this.#formatter = undefined!;
      this.#write = undefined!;
    } else {
      this.#formatter = createFormatter({
        format: this.#options.format,
        outputStyle: this.#options.outputStyle,
        fieldNames: this.#options.fieldNames,
        resource: this.#options.otel ? {
          'service.name': this.#options.otel.serviceName,
          ...this.#options.otel.resourceAttributes,
        } : undefined,
      });
      this.#write = createDestination(options.destination ?? 'stdout');

      // Initialize OTEL exporters if configured
      if (this.#options.otel && this.#options.otel.exporter) {
        const resource: Record<string, string | number | boolean> = {
          'service.name': this.#options.otel.serviceName,
          ...(this.#options.otel.serviceVersion && { 'service.version': this.#options.otel.serviceVersion }),
          ...this.#options.otel.resourceAttributes,
        };

        this.#logExporter = new OtlpLogExporter(this.#options.otel.exporter, resource);
        this.#spanExporter = new OtlpSpanExporter(this.#options.otel.exporter, resource);
      }
    }

    // Bind log methods
    this.trace = this.#createLogMethod('trace', LogLevels.trace);
    this.debug = this.#createLogMethod('debug', LogLevels.debug);
    this.info = this.#createLogMethod('info', LogLevels.info);
    this.warn = this.#createLogMethod('warn', LogLevels.warn);
    this.error = this.#createLogMethod('error', LogLevels.error);
    this.fatal = this.#createLogMethod('fatal', LogLevels.fatal);
  }

  /**
   * Get current log level
   */
  get level(): LogLevelName {
    return this.#options.level;
  }

  /**
   * Set log level dynamically
   */
  set level(newLevel: LogLevelName) {
    this.#options.level = newLevel;
    this.#levelValue = LogLevels[newLevel];
  }

  /**
   * Create a child logger with additional bindings
   */
  child(bindings: Record<string, unknown>, options?: ChildLoggerOptions): Logger {
    const childLogger = new Logger({
      ...this.#optionsToLoggerOptions(),
      level: options?.level ?? this.#options.level,
      serializers: { ...this.#options.serializers, ...options?.serializers },
      base: { ...this.#bindings, ...bindings },
    }, true);

    // Inherit trace context
    childLogger.#traceContext = this.#traceContext;

    // Share writer (destination)
    childLogger.#write = this.#write;

    // Share formatter
    childLogger.#formatter = this.#formatter;

    // Share exporters
    childLogger.#logExporter = this.#logExporter;
    childLogger.#spanExporter = this.#spanExporter;

    return childLogger;
  }

  /**
   * Get current bindings
   */
  bindings(): Record<string, unknown> {
    return { ...this.#bindings };
  }

  /**
   * Check if a level would be logged
   */
  isLevelEnabled(level: LogLevelName): boolean {
    return LogLevels[level] >= this.#levelValue;
  }

  /**
   * Flush any buffered logs
   */
  async flush(): Promise<void> {
    if (this.#logExporter) {
      await this.#logExporter.flush();
    }
    if (this.#spanExporter) {
      await this.#spanExporter.flush();
    }
  }

  /**
   * Gracefully shutdown the logger
   */
  async shutdown(): Promise<void> {
    if (this.#logExporter) {
      await this.#logExporter.shutdown();
    }
    if (this.#spanExporter) {
      await this.#spanExporter.shutdown();
    }
  }

  /**
   * Start a new span and return a spanned logger
   */
  startSpan(name: string, options?: Partial<SpanOptions>): ISpannedLogger {
    const parentContext = this.#traceContext ?? resolveTraceContext();
    const span = new LoggerSpan(
      { name, ...options },
      parentContext,
      this.#spanExporter ? (data) => this.#spanExporter!.export(data) : undefined
    );

    return new SpannedLogger(this, span);
  }

  /**
   * Run a function within a span
   */
  withSpan<T>(name: string, fn: (logger: ISpannedLogger) => T): T;
  withSpan<T>(name: string, options: Partial<SpanOptions>, fn: (logger: ISpannedLogger) => T): T;
  withSpan<T>(
    name: string,
    optionsOrFn: Partial<SpanOptions> | ((logger: ISpannedLogger) => T),
    maybeFn?: (logger: ISpannedLogger) => T
  ): T {
    let options: Partial<SpanOptions> = {};
    let fn: (logger: ISpannedLogger) => T;

    if (typeof optionsOrFn === 'function') {
      fn = optionsOrFn;
    } else {
      options = optionsOrFn;
      fn = maybeFn!;
    }

    const spannedLogger = this.startSpan(name, options);

    try {
      const result = runWithTraceContext(spannedLogger.span.context, () => fn(spannedLogger));

      // Handle async functions
      if (result instanceof Promise) {
        return result
          .then((value) => {
            if (!spannedLogger.span.ended) {
              spannedLogger.span.setStatus('ok');
              spannedLogger.endSpan();
            }
            return value;
          })
          .catch((error) => {
            spannedLogger.span.recordException(error);
            spannedLogger.endSpan();
            throw error;
          }) as T;
      }

      if (!spannedLogger.span.ended) {
        spannedLogger.span.setStatus('ok');
        spannedLogger.endSpan();
      }
      return result;
    } catch (error) {
      spannedLogger.span.recordException(error as Error);
      spannedLogger.endSpan();
      throw error;
    }
  }

  /**
   * Create a child logger with explicit trace context
   */
  withTraceContext(context: TraceContext): Logger {
    const childLogger = this.child({});
    childLogger.#traceContext = context;
    return childLogger;
  }

  // === Private Methods ===

  #resolveOptions(options: LoggerOptions): ResolvedOptions {
    let otel: OtelOptions | false = false;

    if (options.otel === true) {
      otel = { serviceName: options.name ?? 'unknown-service' };
    } else if (options.otel && typeof options.otel === 'object') {
      otel = options.otel;
    }

    return {
      name: options.name,
      level: options.level ?? 'info',
      base: options.base ?? {},
      timestamp: options.timestamp ?? true,
      format: options.format ?? 'auto',
      outputStyle: options.outputStyle ?? 'pino',
      fieldNames: options.fieldNames,
      serializers: { ...defaultSerializers, ...options.serializers },
      redact: Array.isArray(options.redact)
        ? options.redact
        : options.redact?.paths ?? [],
      otel,
    };
  }

  #optionsToLoggerOptions(): LoggerOptions {
    return {
      name: this.#options.name,
      level: this.#options.level,
      base: this.#options.base,
      timestamp: this.#options.timestamp,
      format: this.#options.format,
      outputStyle: this.#options.outputStyle,
      fieldNames: this.#options.fieldNames,
      serializers: this.#options.serializers,
      redact: this.#options.redact,
      otel: this.#options.otel || undefined,
    };
  }

  #buildBaseBindings(): Record<string, unknown> {
    const bindings: Record<string, unknown> = {};

    if (this.#options.name) {
      bindings.name = this.#options.name;
    }

    return { ...bindings, ...this.#options.base };
  }

  #createLogMethod(levelName: LogLevelName, levelValue: number): LogMethod {
    return (...args: unknown[]) => {
      // Fast path: skip if level not enabled
      if (levelValue < this.#levelValue) return;

      const record = this.#buildRecord(levelValue, args);
      const output = this.#formatter.format(record);
      this.#write(output);

      // Export to OTEL if configured
      if (this.#logExporter && this.#options.otel) {
        const traceContext = this.#traceContext ?? (this.#options.otel.autoInjectContext !== false ? resolveTraceContext() : undefined);
        const { level, time, pid, hostname, msg, ...attrs } = record;
        this.#logExporter.export(
          this.#logExporter.createLogRecord(levelValue, msg ?? '', attrs, traceContext)
        );
      }

      // Flush for fatal (best-effort, don't block)
      if (levelName === 'fatal') {
        this.flush().catch(console.error);
      }
    };
  }

  #buildRecord(level: number, args: unknown[]): LogRecord {
    const record: LogRecord = {
      level,
      time: this.#getTimestamp(),
      pid: this.#pid,
      hostname: this.#hostname,
    };

    // Apply bindings
    Object.assign(record, this.#bindings);

    // Parse arguments (Pino-style flexible API)
    const { obj, msg } = this.#parseArgs(args);

    if (obj) {
      // Apply serializers
      const serialized = this.#applySerializers(obj);
      Object.assign(record, serialized);
    }

    if (msg !== undefined) {
      record.msg = msg;
    }

    // Inject trace context
    const traceContext = this.#traceContext ?? (this.#options.otel && this.#options.otel.autoInjectContext !== false ? resolveTraceContext() : undefined);
    if (traceContext) {
      record.traceId = traceContext.traceId;
      record.spanId = traceContext.spanId;
      record.traceFlags = traceContext.traceFlags;
    }

    // Apply redaction
    if (this.#options.redact.length > 0) {
      this.#applyRedaction(record);
    }

    return record;
  }

  #getTimestamp(): number | string {
    if (this.#options.timestamp === false) return 0;
    if (typeof this.#options.timestamp === 'function') {
      return this.#options.timestamp();
    }
    return Date.now();
  }

  #parseArgs(args: unknown[]): { obj?: Record<string, unknown>; msg?: string } {
    if (args.length === 0) {
      return {};
    }

    const first = args[0];

    // logger.info('message')
    if (typeof first === 'string') {
      return { msg: this.#formatMessage(first, args.slice(1)) };
    }

    // logger.info(error) or logger.info(error, 'message')
    if (first instanceof Error) {
      // Pass the error object directly - serialization happens in applySerializers
      return {
        obj: { err: first },
        msg:
          typeof args[1] === 'string'
            ? this.#formatMessage(args[1] as string, args.slice(2))
            : first.message,
      };
    }

    // logger.info({ key: 'value' }) or logger.info({ key: 'value' }, 'message')
    if (typeof first === 'object' && first !== null) {
      return {
        obj: first as Record<string, unknown>,
        msg:
          typeof args[1] === 'string'
            ? this.#formatMessage(args[1] as string, args.slice(2))
            : undefined,
      };
    }

    return { msg: String(first) };
  }

  #formatMessage(template: string, values: unknown[]): string {
    if (values.length === 0) return template;

    // Simple printf-style formatting for %s, %d, %j, %o
    let i = 0;
    return template.replace(/%[sdjo]/g, (match) => {
      if (i >= values.length) return match;
      const val = values[i++];
      switch (match) {
        case '%s':
          return String(val);
        case '%d':
          return Number(val).toString();
        case '%j':
          return JSON.stringify(val);
        case '%o':
          return typeof Bun !== 'undefined' && Bun.inspect ? Bun.inspect(val) : JSON.stringify(val);
        default:
          return match;
      }
    });
  }

  #applySerializers(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const serializer = this.#options.serializers[key];
      result[key] = serializer ? serializer(value) : value;
    }

    return result;
  }

  #applyRedaction(record: LogRecord): void {
    for (const path of this.#options.redact) {
      this.#redactPath(record, path.split('.'));
    }
  }

  #redactPath(obj: Record<string, unknown>, parts: string[]): void {
    if (parts.length === 0) return;

    const [head, ...tail] = parts;
    if (!head) return;

    if (tail.length === 0) {
      if (head in obj) {
        obj[head] = '[REDACTED]';
      }
    } else if (typeof obj[head] === 'object' && obj[head] !== null) {
      this.#redactPath(obj[head] as Record<string, unknown>, tail);
    }
  }
}

/**
 * Spanned Logger - a logger bound to a span
 */
class SpannedLogger implements ISpannedLogger {
  #span: LoggerSpan;
  #childLogger: Logger;

  // Forward log methods
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;

  constructor(parent: Logger, span: LoggerSpan) {
    this.#span = span;
    this.#childLogger = parent.withTraceContext(span.context);

    // Forward log methods to child logger
    this.trace = this.#childLogger.trace.bind(this.#childLogger);
    this.debug = this.#childLogger.debug.bind(this.#childLogger);
    this.info = this.#childLogger.info.bind(this.#childLogger);
    this.warn = this.#childLogger.warn.bind(this.#childLogger);
    this.error = this.#childLogger.error.bind(this.#childLogger);
    this.fatal = this.#childLogger.fatal.bind(this.#childLogger);
  }

  get span(): Span {
    return this.#span;
  }

  get level(): LogLevelName {
    return this.#childLogger.level;
  }

  set level(newLevel: LogLevelName) {
    this.#childLogger.level = newLevel;
  }

  endSpan(endTime?: number): void {
    this.#span.end(endTime);
  }

  child(bindings: Record<string, unknown>, options?: ChildLoggerOptions): Logger {
    return this.#childLogger.child(bindings, options);
  }

  bindings(): Record<string, unknown> {
    return this.#childLogger.bindings();
  }

  isLevelEnabled(level: LogLevelName): boolean {
    return this.#childLogger.isLevelEnabled(level);
  }

  flush(): Promise<void> {
    return this.#childLogger.flush();
  }

  shutdown(): Promise<void> {
    return this.#childLogger.shutdown();
  }

  startSpan(name: string, options?: Partial<SpanOptions>): ISpannedLogger {
    return this.#childLogger.startSpan(name, options);
  }

  withSpan<T>(name: string, fn: (logger: ISpannedLogger) => T): T;
  withSpan<T>(name: string, options: Partial<SpanOptions>, fn: (logger: ISpannedLogger) => T): T;
  withSpan<T>(
    name: string,
    optionsOrFn: Partial<SpanOptions> | ((logger: ISpannedLogger) => T),
    maybeFn?: (logger: ISpannedLogger) => T
  ): T {
    if (typeof optionsOrFn === 'function') {
      return this.#childLogger.withSpan(name, optionsOrFn);
    }
    return this.#childLogger.withSpan(name, optionsOrFn, maybeFn!);
  }

  withTraceContext(context: TraceContext): Logger {
    return this.#childLogger.withTraceContext(context);
  }
}
