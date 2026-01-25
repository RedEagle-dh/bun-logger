// Context management
export {
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
} from './context';

// Severity mapping
export { SeverityNumber, getSeverityNumber, getSeverityText, levelToSeverity, severityToText } from './severity';

// Span management
export { LoggerSpan, createSpan, withSpan } from './span';
export type { SpanData } from './span';

// Exporters
export { OtlpLogExporter, OtlpSpanExporter } from './exporter';
export type { OtelLogRecord } from './exporter';
