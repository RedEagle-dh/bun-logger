import { Logger } from '../logger';
import type { LoggerOptions, TraceContext } from '../types';
import { getWorkerTraceContext } from './context';

/**
 * Worker logger options
 */
export interface WorkerLoggerOptions extends Omit<LoggerOptions, 'otel'> {
  /** Worker-specific bindings */
  bindings?: Record<string, unknown>;
  /** Worker ID (auto-generated if not provided) */
  workerId?: string;
  /** Initial trace context */
  traceContext?: TraceContext;
}

/**
 * Get shared configuration from main thread via environment data
 */
function getSharedConfig(): Partial<LoggerOptions> | undefined {
  try {
    // Try to get config from worker_threads environment data
    const { getEnvironmentData } = require('worker_threads');
    return getEnvironmentData('bunlogger:config') as Partial<LoggerOptions> | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get worker ID from environment data or generate one
 */
function getWorkerId(): string {
  try {
    const { getEnvironmentData } = require('worker_threads');
    const id = getEnvironmentData('bunlogger:workerId') as string | undefined;
    if (id) return id;
  } catch {
    // Ignore
  }
  return `worker-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Create a logger instance for use within a worker thread
 *
 * This factory function creates a logger that:
 * - Automatically inherits configuration from the main thread (if available)
 * - Adds worker-specific bindings (workerId, workerThread: true)
 * - Supports trace context propagation
 *
 * @example
 * ```typescript
 * // In worker.ts
 * import { createWorkerLogger, initWorkerContextListener } from 'bun-logger/worker';
 *
 * // Initialize context listener for trace propagation
 * initWorkerContextListener();
 *
 * // Create logger
 * const logger = createWorkerLogger({
 *   bindings: { module: 'image-processor' }
 * });
 *
 * logger.info('Worker started');
 * ```
 */
export function createWorkerLogger(options: WorkerLoggerOptions = {}): Logger {
  // Get shared configuration from main thread
  const sharedConfig = getSharedConfig();

  // Determine worker identity
  const workerId = options.workerId ?? getWorkerId();

  // Build worker-specific bindings
  const workerBindings: Record<string, unknown> = {
    workerId,
    workerThread: true,
    ...options.bindings,
  };

  // Merge configurations (worker options override shared config)
  const mergedOptions: LoggerOptions = {
    ...sharedConfig,
    name: options.name ?? sharedConfig?.name,
    level: options.level ?? sharedConfig?.level,
    format: options.format ?? sharedConfig?.format,
    serializers: { ...sharedConfig?.serializers, ...options.serializers },
    redact: options.redact ?? sharedConfig?.redact,
    base: { ...sharedConfig?.base, ...workerBindings },
    destination: options.destination ?? sharedConfig?.destination,
    timestamp: options.timestamp ?? sharedConfig?.timestamp,
  };

  // Create the logger
  const logger = new Logger(mergedOptions);

  // Apply initial trace context if provided
  if (options.traceContext) {
    return logger.withTraceContext(options.traceContext);
  }

  // Check for trace context from worker context
  const workerContext = getWorkerTraceContext();
  if (workerContext) {
    return logger.withTraceContext(workerContext);
  }

  return logger;
}

/**
 * Spawn a logger-aware worker with configuration pre-set
 *
 * This helper:
 * - Sets up environment data with logger configuration
 * - Optionally sends initial trace context
 * - Returns the worker instance
 *
 * @example
 * ```typescript
 * import { spawnLoggerAwareWorker } from 'bun-logger/worker';
 *
 * const worker = spawnLoggerAwareWorker(logger, {
 *   script: './worker.ts',
 *   workerId: 'image-worker-1',
 *   traceContext: getTraceContext(),
 * });
 * ```
 */
export interface SpawnWorkerOptions {
  /** Path to worker script */
  script: string;
  /** Worker ID */
  workerId?: string;
  /** Initial trace context to propagate */
  traceContext?: TraceContext;
  /** Worker-specific bindings */
  bindings?: Record<string, unknown>;
  /** Use smol mode for memory-constrained workers */
  smol?: boolean;
}

export function spawnLoggerAwareWorker(
  logger: Logger,
  options: SpawnWorkerOptions
): Worker {
  const workerId = options.workerId ?? `worker-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // Set environment data BEFORE creating worker
    const { setEnvironmentData } = require('worker_threads');

    // Extract config from logger (we need to access private fields indirectly)
    const config: Partial<LoggerOptions> = {
      name: logger.bindings().name as string | undefined,
      level: logger.level,
      base: logger.bindings(),
    };

    setEnvironmentData('bunlogger:config', config);
    setEnvironmentData('bunlogger:workerId', workerId);
  } catch {
    // worker_threads not available, continue without environment data
  }

  // Create the worker
  const worker = new Worker(options.script, {
    smol: options.smol ?? false,
  });

  // Send initial trace context if provided
  if (options.traceContext) {
    worker.postMessage({
      type: 'bunlogger:context',
      payload: options.traceContext,
    });
  }

  logger.debug('Worker spawned', {
    workerId,
    script: options.script,
    hasTraceContext: !!options.traceContext,
  });

  return worker;
}
