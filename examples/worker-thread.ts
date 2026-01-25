/**
 * Worker thread script
 */
import { createWorkerLogger, initWorkerContextListener, getWorkerTraceContext } from '../src/worker';

// Initialize context listener first
initWorkerContextListener();

// Create worker logger
const logger = createWorkerLogger({
  name: 'worker',
  level: 'debug',
  format: 'pretty',
});

logger.info('Worker thread started');

// Handle messages from main thread
self.onmessage = (event) => {
  const { type, payload } = event.data;

  if (type === 'bunlogger:context') {
    // Context update is handled by initWorkerContextListener
    return;
  }

  if (type === 'task') {
    const traceContext = getWorkerTraceContext();

    // Create a child logger with trace context
    const taskLogger = traceContext ? logger.withTraceContext(traceContext) : logger;

    taskLogger.info({ taskId: payload.taskId }, 'Processing task');
    taskLogger.debug({ data: payload.data }, 'Task data received');

    // Simulate some work
    const result = `Processed: ${payload.data.toUpperCase()}`;

    taskLogger.info({ taskId: payload.taskId, result }, 'Task completed');

    // Send result back
    self.postMessage({ type: 'result', payload: result });
  }
};
