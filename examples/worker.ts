/**
 * Worker thread example for bun-logger
 */
import bunLogger, { getTraceContext, formatTraceparent } from '../src';
import { spawnLoggerAwareWorker, sendTraceContextToWorker } from '../src/worker';

// Create main thread logger
const logger = bunLogger({
  name: 'main',
  level: 'debug',
  format: 'pretty',
  otel: { serviceName: 'worker-example' },
});

logger.info('Starting worker example');

// Create a span for the main operation
logger.withSpan('processTask', async (mainLog) => {
  mainLog.info('Creating worker');

  // Spawn a worker with trace context propagation
  const worker = new Worker(new URL('./worker-thread.ts', import.meta.url).href);

  // Send trace context to worker
  const traceContext = mainLog.span.context;
  sendTraceContextToWorker(worker, traceContext);

  // Send task to worker
  worker.postMessage({
    type: 'task',
    payload: { taskId: 'task-001', data: 'Process this data' },
  });

  mainLog.info(`Sent task with trace: ${formatTraceparent(traceContext)}`);

  // Wait for result
  const result = await new Promise<string>((resolve) => {
    worker.onmessage = (event) => {
      if (event.data.type === 'result') {
        resolve(event.data.payload);
      }
    };
  });

  mainLog.info({ result }, 'Worker completed');
  worker.terminate();
});
