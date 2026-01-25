/**
 * OTEL Severity Numbers
 * https://opentelemetry.io/docs/specs/otel/logs/data-model/#severity-fields
 */
export const SeverityNumber = {
  UNSPECIFIED: 0,
  TRACE: 1,
  TRACE2: 2,
  TRACE3: 3,
  TRACE4: 4,
  DEBUG: 5,
  DEBUG2: 6,
  DEBUG3: 7,
  DEBUG4: 8,
  INFO: 9,
  INFO2: 10,
  INFO3: 11,
  INFO4: 12,
  WARN: 13,
  WARN2: 14,
  WARN3: 15,
  WARN4: 16,
  ERROR: 17,
  ERROR2: 18,
  ERROR3: 19,
  ERROR4: 20,
  FATAL: 21,
  FATAL2: 22,
  FATAL3: 23,
  FATAL4: 24,
} as const;

export type SeverityNumberValue = (typeof SeverityNumber)[keyof typeof SeverityNumber];

/**
 * Map Pino-style log levels to OTEL severity numbers
 */
export const levelToSeverity: Record<number, SeverityNumberValue> = {
  10: SeverityNumber.TRACE, // trace
  20: SeverityNumber.DEBUG, // debug
  30: SeverityNumber.INFO, // info
  40: SeverityNumber.WARN, // warn
  50: SeverityNumber.ERROR, // error
  60: SeverityNumber.FATAL, // fatal
};

/**
 * Map OTEL severity numbers to severity text
 */
export const severityToText: Record<SeverityNumberValue, string> = {
  [SeverityNumber.UNSPECIFIED]: 'UNSPECIFIED',
  [SeverityNumber.TRACE]: 'TRACE',
  [SeverityNumber.TRACE2]: 'TRACE2',
  [SeverityNumber.TRACE3]: 'TRACE3',
  [SeverityNumber.TRACE4]: 'TRACE4',
  [SeverityNumber.DEBUG]: 'DEBUG',
  [SeverityNumber.DEBUG2]: 'DEBUG2',
  [SeverityNumber.DEBUG3]: 'DEBUG3',
  [SeverityNumber.DEBUG4]: 'DEBUG4',
  [SeverityNumber.INFO]: 'INFO',
  [SeverityNumber.INFO2]: 'INFO2',
  [SeverityNumber.INFO3]: 'INFO3',
  [SeverityNumber.INFO4]: 'INFO4',
  [SeverityNumber.WARN]: 'WARN',
  [SeverityNumber.WARN2]: 'WARN2',
  [SeverityNumber.WARN3]: 'WARN3',
  [SeverityNumber.WARN4]: 'WARN4',
  [SeverityNumber.ERROR]: 'ERROR',
  [SeverityNumber.ERROR2]: 'ERROR2',
  [SeverityNumber.ERROR3]: 'ERROR3',
  [SeverityNumber.ERROR4]: 'ERROR4',
  [SeverityNumber.FATAL]: 'FATAL',
  [SeverityNumber.FATAL2]: 'FATAL2',
  [SeverityNumber.FATAL3]: 'FATAL3',
  [SeverityNumber.FATAL4]: 'FATAL4',
};

/**
 * Get OTEL severity number from Pino level
 */
export function getSeverityNumber(level: number): SeverityNumberValue {
  return levelToSeverity[level] ?? SeverityNumber.UNSPECIFIED;
}

/**
 * Get OTEL severity text from Pino level
 */
export function getSeverityText(level: number): string {
  const severity = getSeverityNumber(level);
  return severityToText[severity];
}
