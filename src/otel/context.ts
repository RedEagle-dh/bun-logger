import { AsyncLocalStorage } from 'node:async_hooks';
import type { TraceContext } from '../types';

/**
 * Global store for current trace context using AsyncLocalStorage
 */
const contextStore = new AsyncLocalStorage<TraceContext>();

/**
 * Get the current trace context from AsyncLocalStorage
 */
export function getTraceContext(): TraceContext | undefined {
  return contextStore.getStore();
}

/**
 * Run a function with a specific trace context
 */
export function runWithTraceContext<T>(context: TraceContext, fn: () => T): T {
  return contextStore.run(context, fn);
}

/**
 * Generate a random trace ID (128-bit, 32 hex chars)
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random span ID (64-bit, 16 hex chars)
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a new trace context
 */
export function createTraceContext(sampled = true): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    traceFlags: sampled ? 0x01 : 0x00,
  };
}

/**
 * Create a child span context from a parent
 */
export function createChildContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    traceFlags: parent.traceFlags,
    traceState: parent.traceState,
  };
}

/**
 * Validate a trace ID format (32 hex chars, not all zeros)
 */
export function isValidTraceId(traceId: string): boolean {
  if (traceId.length !== 32) return false;
  if (!/^[0-9a-f]+$/i.test(traceId)) return false;
  if (traceId === '00000000000000000000000000000000') return false;
  return true;
}

/**
 * Validate a span ID format (16 hex chars, not all zeros)
 */
export function isValidSpanId(spanId: string): boolean {
  if (spanId.length !== 16) return false;
  if (!/^[0-9a-f]+$/i.test(spanId)) return false;
  if (spanId === '0000000000000000') return false;
  return true;
}

/**
 * Parse W3C traceparent header
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
export function parseTraceparent(header: string): TraceContext | undefined {
  const parts = header.split('-');
  if (parts.length !== 4) return undefined;

  const [version, traceId, spanId, flags] = parts;

  // Only support version 00
  if (version !== '00') return undefined;

  if (!isValidTraceId(traceId!)) return undefined;
  if (!isValidSpanId(spanId!)) return undefined;

  const traceFlags = parseInt(flags!, 16);
  if (isNaN(traceFlags)) return undefined;

  return {
    traceId: traceId!.toLowerCase(),
    spanId: spanId!.toLowerCase(),
    traceFlags,
  };
}

/**
 * Format trace context as W3C traceparent header
 */
export function formatTraceparent(context: TraceContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, '0');
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Try to get trace context from @opentelemetry/api if available
 */
export function getOtelApiContext(): TraceContext | undefined {
  try {
    // Dynamic import to make @opentelemetry/api optional
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('@opentelemetry/api');
    const activeSpan = api.trace.getActiveSpan();

    if (!activeSpan) return undefined;

    const spanContext = activeSpan.spanContext();
    if (!api.isSpanContextValid(spanContext)) return undefined;

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
      traceState: spanContext.traceState?.serialize(),
    };
  } catch {
    // @opentelemetry/api not installed
    return undefined;
  }
}

/**
 * Resolve trace context from available sources
 * Priority: explicit > @opentelemetry/api > AsyncLocalStorage
 */
export function resolveTraceContext(explicit?: TraceContext): TraceContext | undefined {
  if (explicit) return explicit;

  // Try @opentelemetry/api first
  const otelContext = getOtelApiContext();
  if (otelContext) return otelContext;

  // Fall back to our AsyncLocalStorage
  return getTraceContext();
}
