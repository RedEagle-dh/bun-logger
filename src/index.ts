import { Logger } from './logger';
import type { LoggerOptions } from './types';

/**
 * Create a new logger instance
 *
 * @example
 * ```typescript
 * import bunLogger from 'bun-logger';
 *
 * // Basic usage
 * const logger = bunLogger({ name: 'my-app' });
 * logger.info('Hello world');
 *
 * // With OTEL tracing
 * const logger = bunLogger({
 *   name: 'api',
 *   otel: { serviceName: 'user-service' }
 * });
 *
 * // Development mode with pretty output
 * const logger = bunLogger({
 *   name: 'dev',
 *   format: 'pretty',
 *   level: 'debug'
 * });
 * ```
 */
export function bunLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}

// Default export
export default bunLogger;

// Named exports
export { Logger };
export { LogLevels, levelToName, isLevelEnabled } from './levels';
export type { LogLevelName, LogLevelNumber } from './levels';

// Types
export type {
  LoggerOptions,
  ChildLoggerOptions,
  LogRecord,
  LogMethod,
  Serializer,
  Destination,
  Formatter,
  RedactOptions,
  TraceContext,
  Span,
  SpanOptions,
  SpannedLogger,
  OtelOptions,
  OtelExporterConfig,
  FieldNames,
  Logger as ILogger,
} from './types';

// Formatters
export { JsonFormatter, PrettyFormatter, OtelJsonFormatter, createFormatter, resolveFormat } from './formatters';
export type { JsonFormatterOptions, OtelJsonFormatterOptions, FormatterOptions, OutputStyle } from './formatters';

// Output
export { createDestination, createFileDestination, createRotatingFileDestination } from './output';
export type { Writer, FileDestinationOptions, RotatingFileOptions } from './output';

// Serializers
export { defaultSerializers, errorSerializer, requestSerializer, responseSerializer } from './serializers';

// OTEL exports
export {
  // Context
  getTraceContext,
  runWithTraceContext,
  generateTraceId,
  generateSpanId,
  createTraceContext,
  createChildContext,
  parseTraceparent,
  formatTraceparent,
  resolveTraceContext,
  isValidTraceId,
  isValidSpanId,
  // Severity
  SeverityNumber,
  getSeverityNumber,
  getSeverityText,
  // Spans
  createSpan,
  withSpan,
  // Exporters
  OtlpLogExporter,
  OtlpSpanExporter,
} from './otel';
export type { SpanData, OtelLogRecord } from './otel';

/**
 * Standard timestamp functions (like Pino)
 */
export const stdTimeFunctions = {
  /** Unix timestamp in milliseconds */
  epochTime: () => Date.now(),
  /** ISO 8601 timestamp string */
  isoTime: () => new Date().toISOString(),
  /** Unix timestamp in seconds */
  unixTime: () => Math.floor(Date.now() / 1000),
  /** No timestamp */
  nullTime: () => '',
};
