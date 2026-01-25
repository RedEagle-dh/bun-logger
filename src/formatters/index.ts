import type { Formatter, FieldNames } from '../types';
import { JsonFormatter, type JsonFormatterOptions } from './json';
import { PrettyFormatter } from './pretty';
import { OtelJsonFormatter, type OtelJsonFormatterOptions } from './otel-json';

export { JsonFormatter, PrettyFormatter, OtelJsonFormatter };
export type { JsonFormatterOptions, OtelJsonFormatterOptions };

export type FormatType = 'json' | 'pretty' | 'auto';
export type OutputStyle = 'pino' | 'otel';

/**
 * Formatter creation options
 */
export interface FormatterOptions {
  /** Output format */
  format?: FormatType;
  /** JSON output style */
  outputStyle?: OutputStyle;
  /** Custom field names */
  fieldNames?: FieldNames;
  /** Resource attributes for OTEL style */
  resource?: Record<string, unknown>;
}

/**
 * Resolve format type based on environment
 */
export function resolveFormat(format: FormatType): 'json' | 'pretty' {
  if (format !== 'auto') {
    return format;
  }

  // Check NODE_ENV
  const env = Bun.env.NODE_ENV ?? process.env.NODE_ENV;
  if (env === 'development') {
    return 'pretty';
  }

  // Check if stdout is a TTY
  if (process.stdout.isTTY) {
    return 'pretty';
  }

  // Default to JSON for production/CI/piped output
  return 'json';
}

/**
 * Create a formatter based on options
 */
export function createFormatter(options: FormatterOptions = {}): Formatter {
  const { format = 'auto', outputStyle = 'pino', fieldNames, resource } = options;
  const resolved = resolveFormat(format);

  if (resolved === 'pretty') {
    // Only use colors if stdout is a TTY
    const useColors = process.stdout.isTTY ?? false;
    return new PrettyFormatter(useColors);
  }

  // JSON format - choose style
  if (outputStyle === 'otel') {
    return new OtelJsonFormatter({
      fieldNames,
      resource,
      includeResource: !!resource,
    });
  }

  // Pino-style JSON (default)
  return new JsonFormatter({
    fieldNames,
    isoTimestamp: fieldNames?.timestamp !== undefined && fieldNames.timestamp !== 'time',
  });
}
