import type { Span, SpanOptions, TraceContext } from '../types';
import { generateSpanId, createTraceContext, runWithTraceContext, resolveTraceContext } from './context';

/**
 * Span event
 */
interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Span status
 */
interface SpanStatus {
  code: 'unset' | 'ok' | 'error';
  message?: string;
}

/**
 * Span data for export
 */
export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean | string[] | number[] | boolean[]>;
  events: SpanEvent[];
  status: SpanStatus;
}

/**
 * Span implementation
 */
export class LoggerSpan implements Span {
  readonly context: TraceContext;
  readonly name: string;

  #ended = false;
  #kind: string;
  #startTime: number;
  #endTime?: number;
  #parentSpanId?: string;
  #attributes: Record<string, string | number | boolean | string[] | number[] | boolean[]> = {};
  #events: SpanEvent[] = [];
  #status: SpanStatus = { code: 'unset' };
  #onEnd?: (span: SpanData) => void;

  constructor(options: SpanOptions, parentContext?: TraceContext, onEnd?: (span: SpanData) => void) {
    this.name = options.name;
    this.#kind = options.kind ?? 'internal';
    this.#startTime = options.startTime ?? Date.now();
    this.#onEnd = onEnd;

    if (options.attributes) {
      this.#attributes = { ...options.attributes };
    }

    // Generate or inherit trace context
    if (parentContext) {
      this.context = {
        traceId: parentContext.traceId,
        spanId: generateSpanId(),
        traceFlags: parentContext.traceFlags,
        traceState: parentContext.traceState,
      };
      this.#parentSpanId = parentContext.spanId;
    } else {
      this.context = createTraceContext();
    }
  }

  get ended(): boolean {
    return this.#ended;
  }

  setAttribute(key: string, value: string | number | boolean): this {
    if (!this.#ended) {
      this.#attributes[key] = value;
    }
    return this;
  }

  setAttributes(attributes: Record<string, string | number | boolean>): this {
    if (!this.#ended) {
      Object.assign(this.#attributes, attributes);
    }
    return this;
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
    if (!this.#ended) {
      this.#events.push({
        name,
        timestamp: Date.now(),
        attributes,
      });
    }
    return this;
  }

  setStatus(status: 'ok' | 'error', message?: string): this {
    if (!this.#ended) {
      this.#status = { code: status, message };
    }
    return this;
  }

  recordException(error: Error): this {
    this.addEvent('exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack ?? '',
    });
    this.setStatus('error', error.message);
    return this;
  }

  end(endTime?: number): void {
    if (!this.#ended) {
      this.#endTime = endTime ?? Date.now();
      this.#ended = true;

      if (this.#onEnd) {
        this.#onEnd(this.toSpanData());
      }
    }
  }

  /**
   * Convert to span data for export
   */
  toSpanData(): SpanData {
    return {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.#parentSpanId,
      name: this.name,
      kind: this.#kind,
      startTime: this.#startTime,
      endTime: this.#endTime,
      attributes: { ...this.#attributes },
      events: [...this.#events],
      status: { ...this.#status },
    };
  }
}

/**
 * Create a new span
 */
export function createSpan(
  options: SpanOptions,
  onEnd?: (span: SpanData) => void
): LoggerSpan {
  const parentContext = resolveTraceContext();
  return new LoggerSpan(options, parentContext, onEnd);
}

/**
 * Run a function within a span
 */
export function withSpan<T>(
  name: string,
  fn: (span: Span) => T,
  onEnd?: (span: SpanData) => void
): T;
export function withSpan<T>(
  name: string,
  options: Partial<SpanOptions>,
  fn: (span: Span) => T,
  onEnd?: (span: SpanData) => void
): T;
export function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  onEnd?: (span: SpanData) => void
): Promise<T>;
export function withSpan<T>(
  name: string,
  options: Partial<SpanOptions>,
  fn: (span: Span) => Promise<T>,
  onEnd?: (span: SpanData) => void
): Promise<T>;
export function withSpan<T>(
  name: string,
  optionsOrFn: Partial<SpanOptions> | ((span: Span) => T),
  fnOrOnEnd?: ((span: Span) => T) | ((span: SpanData) => void),
  maybeOnEnd?: (span: SpanData) => void
): T {
  let options: Partial<SpanOptions> = {};
  let fn: (span: Span) => T;
  let onEnd: ((span: SpanData) => void) | undefined;

  if (typeof optionsOrFn === 'function') {
    fn = optionsOrFn;
    onEnd = fnOrOnEnd as ((span: SpanData) => void) | undefined;
  } else {
    options = optionsOrFn;
    fn = fnOrOnEnd as (span: Span) => T;
    onEnd = maybeOnEnd;
  }

  const span = createSpan({ name, ...options }, onEnd);

  try {
    const result = runWithTraceContext(span.context, () => fn(span));

    // Handle async functions
    if (result instanceof Promise) {
      return result
        .then((value) => {
          if (!span.ended) {
            span.setStatus('ok');
            span.end();
          }
          return value;
        })
        .catch((error) => {
          span.recordException(error);
          span.end();
          throw error;
        }) as T;
    }

    if (!span.ended) {
      span.setStatus('ok');
      span.end();
    }
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.end();
    throw error;
  }
}
