import { describe, it, expect, beforeEach } from 'bun:test';
import bunLogger from '../src';
import {
  generateTraceId,
  generateSpanId,
  createTraceContext,
  parseTraceparent,
  formatTraceparent,
  isValidTraceId,
  isValidSpanId,
  getSeverityNumber,
  getSeverityText,
  SeverityNumber,
  runWithTraceContext,
  getTraceContext,
} from '../src/otel';

describe('OTEL Context', () => {
  describe('ID generation', () => {
    it('generates valid trace IDs (32 hex chars)', () => {
      const traceId = generateTraceId();
      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]+$/);
      expect(isValidTraceId(traceId)).toBe(true);
    });

    it('generates valid span IDs (16 hex chars)', () => {
      const spanId = generateSpanId();
      expect(spanId).toHaveLength(16);
      expect(spanId).toMatch(/^[0-9a-f]+$/);
      expect(isValidSpanId(spanId)).toBe(true);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(200);
    });
  });

  describe('trace context creation', () => {
    it('creates trace context with sampled flag', () => {
      const ctx = createTraceContext(true);
      expect(ctx.traceFlags).toBe(0x01);
      expect(isValidTraceId(ctx.traceId)).toBe(true);
      expect(isValidSpanId(ctx.spanId)).toBe(true);
    });

    it('creates trace context without sampled flag', () => {
      const ctx = createTraceContext(false);
      expect(ctx.traceFlags).toBe(0x00);
    });
  });

  describe('traceparent parsing', () => {
    it('parses valid traceparent header', () => {
      const header = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const ctx = parseTraceparent(header);

      expect(ctx).toBeDefined();
      expect(ctx!.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(ctx!.spanId).toBe('b7ad6b7169203331');
      expect(ctx!.traceFlags).toBe(1);
    });

    it('returns undefined for invalid version', () => {
      const header = '01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('returns undefined for invalid trace ID', () => {
      const header = '00-invalid-b7ad6b7169203331-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('returns undefined for all-zero trace ID', () => {
      const header = '00-00000000000000000000000000000000-b7ad6b7169203331-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });
  });

  describe('traceparent formatting', () => {
    it('formats trace context as traceparent header', () => {
      const ctx = {
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: 1,
      };

      const header = formatTraceparent(ctx);
      expect(header).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    });

    it('round-trips through parse and format', () => {
      const original = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const ctx = parseTraceparent(original)!;
      const formatted = formatTraceparent(ctx);
      expect(formatted).toBe(original);
    });
  });

  describe('AsyncLocalStorage context', () => {
    it('stores and retrieves trace context', () => {
      const ctx = createTraceContext();

      runWithTraceContext(ctx, () => {
        const retrieved = getTraceContext();
        expect(retrieved).toBeDefined();
        expect(retrieved!.traceId).toBe(ctx.traceId);
        expect(retrieved!.spanId).toBe(ctx.spanId);
      });
    });

    it('returns undefined outside of context', () => {
      expect(getTraceContext()).toBeUndefined();
    });

    it('supports nested contexts', () => {
      const outer = createTraceContext();
      const inner = createTraceContext();

      runWithTraceContext(outer, () => {
        expect(getTraceContext()!.traceId).toBe(outer.traceId);

        runWithTraceContext(inner, () => {
          expect(getTraceContext()!.traceId).toBe(inner.traceId);
        });

        expect(getTraceContext()!.traceId).toBe(outer.traceId);
      });
    });
  });
});

describe('OTEL Severity', () => {
  it('maps log levels to severity numbers', () => {
    expect(getSeverityNumber(10)).toBe(SeverityNumber.TRACE);
    expect(getSeverityNumber(20)).toBe(SeverityNumber.DEBUG);
    expect(getSeverityNumber(30)).toBe(SeverityNumber.INFO);
    expect(getSeverityNumber(40)).toBe(SeverityNumber.WARN);
    expect(getSeverityNumber(50)).toBe(SeverityNumber.ERROR);
    expect(getSeverityNumber(60)).toBe(SeverityNumber.FATAL);
  });

  it('maps log levels to severity text', () => {
    expect(getSeverityText(10)).toBe('TRACE');
    expect(getSeverityText(20)).toBe('DEBUG');
    expect(getSeverityText(30)).toBe('INFO');
    expect(getSeverityText(40)).toBe('WARN');
    expect(getSeverityText(50)).toBe('ERROR');
    expect(getSeverityText(60)).toBe('FATAL');
  });
});

describe('Logger with OTEL', () => {
  describe('trace context injection', () => {
    it('injects trace context into logs when in span', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        otel: { serviceName: 'test-service' },
        destination: { write: (data) => (output = data) },
      });

      logger.withSpan('test-span', (log) => {
        log.info('test message');
      });

      const parsed = JSON.parse(output);
      expect(parsed.traceId).toHaveLength(32);
      expect(parsed.spanId).toHaveLength(16);
      expect(parsed.traceFlags).toBe(1);
    });

    it('child spans inherit trace ID', () => {
      const outputs: string[] = [];
      const logger = bunLogger({
        format: 'json',
        otel: { serviceName: 'test-service' },
        destination: { write: (data) => outputs.push(data) },
      });

      logger.withSpan('parent', (parentLog) => {
        parentLog.info('parent message');

        parentLog.withSpan('child', (childLog) => {
          childLog.info('child message');
        });
      });

      const parentLog = JSON.parse(outputs[0]!);
      const childLog = JSON.parse(outputs[1]!);

      expect(parentLog.traceId).toBe(childLog.traceId);
      expect(parentLog.spanId).not.toBe(childLog.spanId);
    });
  });

  describe('span management', () => {
    it('startSpan creates a spanned logger', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        otel: { serviceName: 'test-service' },
        destination: { write: (data) => (output = data) },
      });

      const spanned = logger.startSpan('my-span');
      expect(spanned.span).toBeDefined();
      expect(spanned.span.name).toBe('my-span');
      expect(spanned.span.ended).toBe(false);

      spanned.info('test');
      spanned.endSpan();

      expect(spanned.span.ended).toBe(true);
      const parsed = JSON.parse(output);
      expect(parsed.traceId).toBe(spanned.span.context.traceId);
    });

    it('span attributes can be set', () => {
      const logger = bunLogger({ otel: { serviceName: 'test' } });
      const spanned = logger.startSpan('test-span');

      spanned.span.setAttribute('key1', 'value1');
      spanned.span.setAttributes({ key2: 123, key3: true });

      const data = (spanned.span as any).toSpanData();
      expect(data.attributes.key1).toBe('value1');
      expect(data.attributes.key2).toBe(123);
      expect(data.attributes.key3).toBe(true);

      spanned.endSpan();
    });

    it('span records exceptions', () => {
      const logger = bunLogger({ otel: { serviceName: 'test' } });
      const spanned = logger.startSpan('test-span');

      const error = new Error('Test error');
      spanned.span.recordException(error);

      const data = (spanned.span as any).toSpanData();
      expect(data.events.length).toBe(1);
      expect(data.events[0].name).toBe('exception');
      expect(data.events[0].attributes['exception.message']).toBe('Test error');
      expect(data.status.code).toBe('error');

      spanned.endSpan();
    });

    it('withSpan handles sync functions', () => {
      const logger = bunLogger({ otel: { serviceName: 'test' } });

      const result = logger.withSpan('sync-span', () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('withSpan handles async functions', async () => {
      const logger = bunLogger({ otel: { serviceName: 'test' } });

      const result = await logger.withSpan('async-span', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return 'async result';
      });

      expect(result).toBe('async result');
    });

    it('withSpan handles errors', () => {
      const logger = bunLogger({ otel: { serviceName: 'test' } });

      expect(() => {
        logger.withSpan('error-span', () => {
          throw new Error('Test error');
        });
      }).toThrow('Test error');
    });
  });

  describe('withTraceContext', () => {
    it('creates child logger with explicit trace context', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        otel: { serviceName: 'test' },
        destination: { write: (data) => (output = data) },
      });

      const ctx = {
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: 1,
      };

      const child = logger.withTraceContext(ctx);
      child.info('test');

      const parsed = JSON.parse(output);
      expect(parsed.traceId).toBe(ctx.traceId);
      expect(parsed.spanId).toBe(ctx.spanId);
    });
  });
});
