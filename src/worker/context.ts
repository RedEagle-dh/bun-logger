import type { TraceContext } from '../types';

declare const self: Worker | undefined;

/**
 * Current trace context in worker thread
 */
let currentContext: TraceContext | undefined;

/**
 * Message handler for trace context updates
 */
type ContextMessageHandler = (context: TraceContext) => void;
let contextHandler: ContextMessageHandler | undefined;

/**
 * Initialize context listener in worker
 * Call this at the start of your worker to receive trace context updates
 */
export function initWorkerContextListener(handler?: ContextMessageHandler): void {
  contextHandler = handler;

  // Listen for context messages from main thread
  if (typeof self !== 'undefined' && 'onmessage' in self) {
    const originalHandler = (self as Worker).onmessage;

    (self as Worker).onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'bunlogger:context') {
        currentContext = event.data.payload as TraceContext;
        if (contextHandler) {
          contextHandler(currentContext);
        }
        return;
      }

      // Forward to original handler if set
      if (originalHandler) {
        originalHandler.call(self, event);
      }
    };
  }
}

/**
 * Get current trace context in worker
 */
export function getWorkerTraceContext(): TraceContext | undefined {
  return currentContext;
}

/**
 * Set trace context in worker (for manual propagation)
 */
export function setWorkerTraceContext(context: TraceContext | undefined): void {
  currentContext = context;
}

/**
 * Run code with specific trace context in worker
 */
export function runWithWorkerContext<T>(context: TraceContext, fn: () => T): T {
  const previous = currentContext;
  currentContext = context;
  try {
    return fn();
  } finally {
    currentContext = previous;
  }
}

/**
 * Send trace context to a worker
 */
export function sendTraceContextToWorker(worker: Worker, context: TraceContext): void {
  worker.postMessage({
    type: 'bunlogger:context',
    payload: context,
  });
}
