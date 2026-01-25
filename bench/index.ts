/**
 * Performance benchmark for bun-logger
 */
import bunLogger from '../src';

// Create a null destination for pure logging performance
const nullWriter = { write: () => {} };

const logger = bunLogger({
  name: 'bench',
  format: 'json',
  destination: nullWriter,
});

const iterations = 100_000;

console.log(`Running benchmark with ${iterations.toLocaleString()} iterations...\n`);

// Benchmark 1: Simple message
{
  const start = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) {
    logger.info('test message');
  }
  const elapsed = (Bun.nanoseconds() - start) / 1e6;
  const opsPerSec = Math.floor(iterations / (elapsed / 1000));
  console.log(`Simple message:     ${elapsed.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);
}

// Benchmark 2: Message with data
{
  const start = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) {
    logger.info({ userId: 123, action: 'test' }, 'user action');
  }
  const elapsed = (Bun.nanoseconds() - start) / 1e6;
  const opsPerSec = Math.floor(iterations / (elapsed / 1000));
  console.log(`With data:          ${elapsed.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);
}

// Benchmark 3: Child logger
{
  const child = logger.child({ requestId: 'abc-123' });
  const start = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) {
    child.info('child message');
  }
  const elapsed = (Bun.nanoseconds() - start) / 1e6;
  const opsPerSec = Math.floor(iterations / (elapsed / 1000));
  console.log(`Child logger:       ${elapsed.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);
}

// Benchmark 4: With string interpolation
{
  const start = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) {
    logger.info('User %s performed %d actions', 'alice', i);
  }
  const elapsed = (Bun.nanoseconds() - start) / 1e6;
  const opsPerSec = Math.floor(iterations / (elapsed / 1000));
  console.log(`Interpolation:      ${elapsed.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);
}

// Benchmark 5: Level filtering (disabled level)
{
  const start = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) {
    logger.trace('this should be skipped');
  }
  const elapsed = (Bun.nanoseconds() - start) / 1e6;
  const opsPerSec = Math.floor(iterations / (elapsed / 1000));
  console.log(`Filtered (noop):    ${elapsed.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);
}

// Benchmark 6: With OTEL tracing
{
  const otelLogger = bunLogger({
    name: 'bench-otel',
    format: 'json',
    destination: nullWriter,
    otel: { serviceName: 'bench-service' },
  });

  const start = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) {
    otelLogger.withSpan('operation', (log) => {
      log.info('traced message');
    });
  }
  const elapsed = (Bun.nanoseconds() - start) / 1e6;
  const opsPerSec = Math.floor(iterations / (elapsed / 1000));
  console.log(`With OTEL span:     ${elapsed.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);
}

console.log('\nBenchmark complete.');
