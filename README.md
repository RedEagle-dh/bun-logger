# bun-logger

A high-performance, Bun-native structured logger with OpenTelemetry support.

## Features

- **Pino-compatible API** - Familiar interface with `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- **Multiple output formats** - JSON (Pino-style or OTEL-style) and pretty-printed for development
- **OpenTelemetry integration** - Native support for traces, spans, and OTLP export
- **Worker thread support** - Seamless logging across worker threads with context propagation
- **High performance** - 1.7M+ logs/sec, 42M+ ops/sec for filtered logs
- **Customizable field names** - Use `dt`, `timestamp`, `message`, or any field names you need
- **TypeScript-first** - Full type definitions included

## Installation

Package coming soon

## Quick Start

```typescript
import bunLogger from 'bun-logger';

const logger = bunLogger({ name: 'my-app' });

// Simple logging
logger.info('Hello world');
logger.warn({ userId: 123 }, 'User action required');
logger.error(new Error('Something failed'), 'Operation failed');

// Child loggers for context
const requestLogger = logger.child({ requestId: 'abc-123' });
requestLogger.info('Processing request');
```

## Output Formats

### JSON Output (Production)

```typescript
const logger = bunLogger({ name: 'api', format: 'json' });
logger.info({ userId: 123 }, 'User logged in');
```

**Pino-style (default):**
```json
{"level":30,"time":1706123456789,"pid":123,"hostname":"server","name":"api","userId":123,"msg":"User logged in"}
```

**OTEL-style:**
```typescript
const logger = bunLogger({
  name: 'api',
  format: 'json',
  outputStyle: 'otel',
  otel: { serviceName: 'user-service' }
});
```
```json
{"timestamp":"2026-01-25T10:30:45.123Z","severityNumber":9,"severityText":"INFO","body":"User logged in","traceId":"abc...","spanId":"def...","attributes":{"userId":123}}
```

### Pretty Output (Development)

```typescript
const logger = bunLogger({ format: 'pretty' });
// Or use 'auto' to detect from NODE_ENV
```

```
2026-01-25 10:30:45.123 INFO  my-app User logged in
  userId: 123
```

### Custom Field Names

```typescript
const logger = bunLogger({
  format: 'json',
  fieldNames: {
    timestamp: 'dt',       // "time" -> "dt"
    message: 'message',    // "msg" -> "message"
    level: 'severity',     // "level" -> "severity"
  }
});
```

## Configuration

```typescript
interface LoggerOptions {
  // Logger name - added to every log line
  name?: string;

  // Minimum log level (default: 'info')
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

  // Output format (default: 'auto')
  format?: 'json' | 'pretty' | 'auto';

  // JSON output style (default: 'pino')
  outputStyle?: 'pino' | 'otel';

  // Custom field names
  fieldNames?: {
    timestamp?: string;  // default: 'time' (pino) or 'timestamp' (otel)
    level?: string;      // default: 'level' (pino) or 'severityNumber' (otel)
    message?: string;    // default: 'msg' (pino) or 'body' (otel)
  };

  // Base bindings added to every log
  base?: Record<string, unknown>;

  // Custom serializers
  serializers?: Record<string, (value: unknown) => unknown>;

  // Fields to redact
  redact?: string[];

  // Output destination
  destination?: 'stdout' | 'stderr' | { path: string };

  // OpenTelemetry configuration
  otel?: {
    serviceName: string;
    serviceVersion?: string;
    autoInjectContext?: boolean;
    exporter?: {
      endpoint: string;
      headers?: Record<string, string>;
    };
  };
}
```

## Log Levels

| Level | Number | OTEL Severity |
|-------|--------|---------------|
| trace | 10     | 1 (TRACE)     |
| debug | 20     | 5 (DEBUG)     |
| info  | 30     | 9 (INFO)      |
| warn  | 40     | 13 (WARN)     |
| error | 50     | 17 (ERROR)    |
| fatal | 60     | 21 (FATAL)    |

## OpenTelemetry Integration

### Automatic Trace Context

When running within a span, trace context is automatically injected:

```typescript
const logger = bunLogger({
  name: 'api',
  otel: { serviceName: 'user-service' }
});

logger.withSpan('handleRequest', (log) => {
  log.info('Processing'); // Includes traceId, spanId

  log.withSpan('fetchUser', (innerLog) => {
    innerLog.info('Fetching user'); // Same traceId, new spanId
  });
});
```

### Manual Span Management

```typescript
const spanned = logger.startSpan('processOrder', {
  attributes: { 'order.id': '123' }
});

spanned.info('Starting order processing');
spanned.span.setAttribute('order.total', 99.99);

try {
  await processOrder();
  spanned.span.setStatus('ok');
} catch (err) {
  spanned.span.recordException(err);
} finally {
  spanned.endSpan();
}
```

### OTLP Export

Send logs directly to an OTEL collector:

```typescript
const logger = bunLogger({
  name: 'api',
  otel: {
    serviceName: 'user-service',
    serviceVersion: '1.0.0',
    exporter: {
      endpoint: 'http://otel-collector:4318',
      headers: { 'Authorization': 'Bearer token' }
    }
  }
});
```

### Integration with @opentelemetry/api

If you're using `@opentelemetry/api`, trace context is automatically detected:

```typescript
import { trace } from '@opentelemetry/api';
import bunLogger from 'bun-logger';

const logger = bunLogger({ otel: { serviceName: 'my-service' } });
const tracer = trace.getTracer('my-service');

tracer.startActiveSpan('operation', (span) => {
  logger.info('This log includes trace context automatically');
  span.end();
});
```

## Worker Thread Support

### Main Thread

```typescript
import bunLogger from 'bun-logger';
import { sendTraceContextToWorker } from 'bun-logger/worker';

const logger = bunLogger({ name: 'main' });

logger.withSpan('processTask', (log) => {
  const worker = new Worker('./worker.ts');

  // Propagate trace context
  sendTraceContextToWorker(worker, log.span.context);

  worker.postMessage({ task: 'process' });
});
```

### Worker Thread

```typescript
import { createWorkerLogger, initWorkerContextListener } from 'bun-logger/worker';

// Initialize context listener
initWorkerContextListener();

// Create logger (inherits config from main thread)
const logger = createWorkerLogger();

self.onmessage = (event) => {
  logger.info('Processing task'); // Includes trace context
};
```

## Child Loggers

Child loggers inherit configuration and add contextual bindings:

```typescript
const logger = bunLogger({ name: 'api' });

// Add request context
const reqLogger = logger.child({
  requestId: 'abc-123',
  userId: 456
});

reqLogger.info('Processing');
// {"name":"api","requestId":"abc-123","userId":456,"msg":"Processing"}

// Nest further
const dbLogger = reqLogger.child({ module: 'database' });
dbLogger.debug('Query executed');
// {"name":"api","requestId":"abc-123","userId":456,"module":"database","msg":"Query executed"}
```

## Error Logging

Errors are automatically serialized:

```typescript
const err = new Error('Connection failed');
err.code = 'ECONNREFUSED';

logger.error(err);
// {"err":{"type":"Error","message":"Connection failed","code":"ECONNREFUSED","stack":"..."},"msg":"Connection failed"}

logger.error(err, 'Database connection failed');
// {"err":{...},"msg":"Database connection failed"}
```

## Redaction

Hide sensitive fields:

```typescript
const logger = bunLogger({
  redact: ['password', 'creditCard', 'user.ssn']
});

logger.info({
  username: 'alice',
  password: 'secret123'
});
// {"username":"alice","password":"[REDACTED]"}
```

## Performance

Benchmark results (100K iterations):

| Operation | Speed |
|-----------|-------|
| Simple message | 1.77M ops/sec |
| With data object | 1.32M ops/sec |
| Child logger | 2.13M ops/sec |
| String interpolation | 1.23M ops/sec |
| Filtered (noop) | 41.8M ops/sec |
| With OTEL span | 108K ops/sec |

Run the benchmark:
```bash
bun run bench/index.ts
```

## API Reference

### Logger Methods

```typescript
// Logging methods
logger.trace(msg: string, ...args): void
logger.trace(obj: object, msg?: string, ...args): void
logger.debug(...)
logger.info(...)
logger.warn(...)
logger.error(...)
logger.fatal(...)

// Child loggers
logger.child(bindings: object, options?): Logger

// Level management
logger.level: string           // Get/set current level
logger.isLevelEnabled(level): boolean

// Tracing
logger.startSpan(name, options?): SpannedLogger
logger.withSpan(name, fn): T
logger.withSpan(name, options, fn): T
logger.withTraceContext(context): Logger

// Utilities
logger.bindings(): object      // Get current bindings
logger.flush(): Promise<void>  // Flush buffered logs
```

### Exports

```typescript
import bunLogger, {
  // Main
  Logger,
  LogLevels,

  // Formatters
  JsonFormatter,
  PrettyFormatter,
  OtelJsonFormatter,

  // OTEL
  getTraceContext,
  runWithTraceContext,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  formatTraceparent,
  SeverityNumber,

  // Types
  type LoggerOptions,
  type LogRecord,
  type TraceContext,
  type Span,
  type FieldNames,
} from 'bun-logger';

// Worker utilities
import {
  createWorkerLogger,
  initWorkerContextListener,
  sendTraceContextToWorker,
} from 'bun-logger/worker';
```

## Examples

See the `examples/` directory:

- `basic.ts` - Basic logging features
- `output-styles.ts` - Different JSON output formats
- `worker.ts` - Worker thread integration

```bash
bun run examples/basic.ts
bun run examples/output-styles.ts
NODE_ENV=development bun run examples/basic.ts  # Pretty output
```

## License

MIT
