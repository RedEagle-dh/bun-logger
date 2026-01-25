/**
 * Basic usage examples for bun-logger
 */
import bunLogger, { getTraceContext, formatTraceparent } from '../src';

// Create a basic logger
const logger = bunLogger({
  name: 'example-app',
  level: 'debug',
  // Use 'auto' to detect format from environment (pretty in dev, json in prod)
  format: 'auto',
});

console.log('=== Basic Logging ===\n');

// Simple messages
logger.trace('This is a trace message (hidden by default)');
logger.debug('This is a debug message');
logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message');

console.log('\n=== Logging with Data ===\n');

// Logging with additional data
logger.info({ userId: 123, action: 'login' }, 'User logged in');
logger.debug({ query: 'SELECT * FROM users', duration: 45 }, 'Database query executed');

console.log('\n=== String Interpolation ===\n');

// Printf-style formatting
logger.info('User %s performed %d actions', 'alice', 5);
logger.debug('Processing item %j', { id: 1, name: 'test' });

console.log('\n=== Error Logging ===\n');

// Error logging
const err = new Error('Something went wrong');
(err as Error & { code: string }).code = 'ERR_EXAMPLE';
logger.error(err);
logger.error(err, 'Failed to process request');

console.log('\n=== Child Loggers ===\n');

// Child loggers with context
const requestLogger = logger.child({ requestId: 'req-abc-123' });
requestLogger.info('Processing request');
requestLogger.debug({ step: 1 }, 'Validating input');
requestLogger.debug({ step: 2 }, 'Fetching data');
requestLogger.info('Request completed');

// Nested children
const dbLogger = requestLogger.child({ module: 'database' });
dbLogger.debug('Connecting to database');
dbLogger.info({ rows: 10 }, 'Query returned results');

console.log('\n=== Spans and Tracing ===\n');

// Create a span
const spanned = logger.startSpan('processOrder');
spanned.info('Starting order processing');
spanned.span.setAttribute('order.id', 'ord-123');
spanned.debug('Validating order');
spanned.debug('Charging payment');
spanned.info('Order completed successfully');
spanned.endSpan();

// Using withSpan helper
logger.withSpan('fetchUserData', (log) => {
  log.info('Fetching user from database');
  log.debug({ userId: 456 }, 'User found');
  return { id: 456, name: 'Bob' };
});

// Async withSpan
await logger.withSpan('asyncOperation', async (log) => {
  log.info('Starting async operation');
  await new Promise((resolve) => setTimeout(resolve, 10));
  log.info('Async operation completed');
});

console.log('\n=== Trace Context ===\n');

// Manual trace context
logger.withSpan('parentOperation', (parentLog) => {
  const ctx = parentLog.span.context;
  parentLog.info(`Trace ID: ${ctx.traceId}`);
  parentLog.info(`Span ID: ${ctx.spanId}`);
  parentLog.info(`Traceparent: ${formatTraceparent(ctx)}`);

  // Child span inherits trace ID
  parentLog.withSpan('childOperation', (childLog) => {
    const childCtx = childLog.span.context;
    childLog.info(`Child Span ID: ${childCtx.spanId}`);
    childLog.info(`Same Trace ID: ${childCtx.traceId === ctx.traceId}`);
  });
});

console.log('\n=== Level Checking ===\n');

// Check if levels are enabled
console.log('trace enabled:', logger.isLevelEnabled('trace'));
console.log('debug enabled:', logger.isLevelEnabled('debug'));
console.log('info enabled:', logger.isLevelEnabled('info'));

// Dynamic level change
logger.level = 'warn';
console.log('\nAfter setting level to warn:');
console.log('debug enabled:', logger.isLevelEnabled('debug'));
console.log('warn enabled:', logger.isLevelEnabled('warn'));

console.log('\n=== Done ===\n');
