/**
 * Output styles example for bun-logger
 *
 * Demonstrates the different JSON output formats:
 * - Pino style (default): Pino-compatible JSON format
 * - OTEL style: OpenTelemetry-compliant JSON format
 * - Custom field names: Your own field naming conventions
 */
import bunLogger from '../src';

console.log('=== Pino Style (default) ===\n');
{
  const logger = bunLogger({
    name: 'pino-style',
    format: 'json',
  });

  logger.info({ userId: 123 }, 'User logged in');
}

console.log('\n=== OTEL Style ===\n');
{
  const logger = bunLogger({
    name: 'otel-style',
    format: 'json',
    outputStyle: 'otel',
    otel: { serviceName: 'my-service', serviceVersion: '1.0.0' },
  });

  logger.info({ userId: 123 }, 'User logged in');
}

console.log('\n=== Custom Field Names (dt for timestamp) ===\n');
{
  const logger = bunLogger({
    name: 'custom-fields',
    format: 'json',
    fieldNames: {
      timestamp: 'dt',
      message: 'message',
    },
  });

  logger.info({ userId: 123 }, 'User logged in');
}

console.log('\n=== OTEL Style with Custom Field Names ===\n');
{
  const logger = bunLogger({
    name: 'otel-custom',
    format: 'json',
    outputStyle: 'otel',
    fieldNames: {
      timestamp: 'dt',
      message: 'msg',
    },
    otel: { serviceName: 'my-service' },
  });

  logger.info({ userId: 123 }, 'User logged in');
}

console.log('\n=== With Trace Context (OTEL Style) ===\n');
{
  const logger = bunLogger({
    name: 'traced',
    format: 'json',
    outputStyle: 'otel',
    otel: { serviceName: 'traced-service' },
  });

  logger.withSpan('handleRequest', (log) => {
    log.info({ endpoint: '/api/users' }, 'Processing request');
  });
}

console.log('\n=== Field Comparison ===');
console.log(`
Pino Style Fields:
  - time: epoch milliseconds
  - level: numeric (10-60)
  - msg: message text
  - Additional fields at top level

OTEL Style Fields:
  - timestamp: ISO 8601 string
  - severityNumber: OTEL severity (1-24)
  - severityText: severity name (INFO, ERROR, etc)
  - body: message text
  - attributes: additional fields nested
  - traceId, spanId, traceFlags: trace context

Custom Field Names:
  - timestamp -> dt (or any name you choose)
  - msg -> message (or any name you choose)
  - level -> severity (or any name you choose)
`);
