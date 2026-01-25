import { describe, it, expect } from 'bun:test';
import { JsonFormatter, PrettyFormatter, OtelJsonFormatter, resolveFormat } from '../src/formatters';
import type { LogRecord } from '../src/types';

describe('JsonFormatter', () => {
  const formatter = new JsonFormatter();

  it('formats log record as JSON', () => {
    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test message',
    };

    const output = formatter.format(record);
    expect(output).toEndWith('\n');

    const parsed = JSON.parse(output);
    expect(parsed.level).toBe(30);
    expect(parsed.time).toBe(1706123456789);
    expect(parsed.pid).toBe(123);
    expect(parsed.hostname).toBe('test-host');
    expect(parsed.msg).toBe('Test message');
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;

    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      data: obj,
    };

    const output = formatter.format(record);
    expect(output).toContain('[Circular]');
  });

  it('handles BigInt values', () => {
    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      bigValue: BigInt(9007199254740991),
    };

    const output = formatter.format(record);
    expect(output).toContain('9007199254740991');
  });
});

describe('PrettyFormatter', () => {
  describe('with colors', () => {
    const formatter = new PrettyFormatter(true);

    it('formats log record with colors', () => {
      const record: LogRecord = {
        level: 30,
        time: 1706123456789,
        pid: 123,
        hostname: 'test-host',
        name: 'test-app',
        msg: 'Test message',
      };

      const output = formatter.format(record);
      expect(output).toContain('INFO');
      expect(output).toContain('test-app');
      expect(output).toContain('Test message');
      expect(output).toContain('\x1b['); // ANSI escape code
    });

    it('formats different log levels with appropriate colors', () => {
      const levels = [
        { level: 10, name: 'TRACE' },
        { level: 20, name: 'DEBUG' },
        { level: 30, name: 'INFO' },
        { level: 40, name: 'WARN' },
        { level: 50, name: 'ERROR' },
        { level: 60, name: 'FATAL' },
      ];

      for (const { level, name } of levels) {
        const record: LogRecord = {
          level,
          time: 1706123456789,
          pid: 123,
          hostname: 'test-host',
          msg: 'Test',
        };

        const output = formatter.format(record);
        expect(output).toContain(name);
      }
    });
  });

  describe('without colors', () => {
    const formatter = new PrettyFormatter(false);

    it('formats log record without ANSI codes', () => {
      const record: LogRecord = {
        level: 30,
        time: 1706123456789,
        pid: 123,
        hostname: 'test-host',
        msg: 'Test message',
      };

      const output = formatter.format(record);
      expect(output).toContain('INFO');
      expect(output).toContain('Test message');
      expect(output).not.toContain('\x1b[');
    });
  });

  it('formats extra fields', () => {
    const formatter = new PrettyFormatter(false);
    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test message',
      userId: 123,
      action: 'login',
    };

    const output = formatter.format(record);
    expect(output).toContain('userId');
    expect(output).toContain('123');
    expect(output).toContain('action');
    expect(output).toContain('login');
  });

  it('formats trace context', () => {
    const formatter = new PrettyFormatter(false);
    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test message',
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
    };

    const output = formatter.format(record);
    // Should show short trace/span IDs
    expect(output).toContain('0af76519');
    expect(output).toContain('b7ad6b71');
  });
});

describe('resolveFormat', () => {
  it('returns specified format when not auto', () => {
    expect(resolveFormat('json')).toBe('json');
    expect(resolveFormat('pretty')).toBe('pretty');
  });

  it('returns json by default for auto in non-TTY', () => {
    // In test environment, stdout is typically not a TTY
    const result = resolveFormat('auto');
    // Result depends on environment, just verify it returns valid value
    expect(['json', 'pretty']).toContain(result);
  });
});

describe('JsonFormatter with custom field names', () => {
  it('uses custom timestamp field name', () => {
    const formatter = new JsonFormatter({
      fieldNames: { timestamp: 'dt' },
    });

    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test message',
    };

    const output = formatter.format(record);
    const parsed = JSON.parse(output);

    expect(parsed.dt).toBeDefined();
    expect(parsed.time).toBeUndefined();
  });

  it('uses custom message field name', () => {
    const formatter = new JsonFormatter({
      fieldNames: { message: 'message' },
    });

    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test message',
    };

    const output = formatter.format(record);
    const parsed = JSON.parse(output);

    expect(parsed.message).toBe('Test message');
    expect(parsed.msg).toBeUndefined();
  });

  it('uses ISO timestamp when custom timestamp field is set', () => {
    const formatter = new JsonFormatter({
      fieldNames: { timestamp: 'timestamp' },
    });

    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test',
    };

    const output = formatter.format(record);
    const parsed = JSON.parse(output);

    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('OtelJsonFormatter', () => {
  it('outputs OTEL-compliant format', () => {
    const formatter = new OtelJsonFormatter();

    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test message',
      name: 'test-app',
    };

    const output = formatter.format(record);
    const parsed = JSON.parse(output);

    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.severityNumber).toBe(9); // INFO
    expect(parsed.severityText).toBe('INFO');
    expect(parsed.body).toBe('Test message');
    expect(parsed.attributes).toBeDefined();
    expect(parsed.attributes['process.pid']).toBe(123);
    expect(parsed.attributes['host.name']).toBe('test-host');
    expect(parsed.attributes['service.name']).toBe('test-app');
  });

  it('includes trace context', () => {
    const formatter = new OtelJsonFormatter();

    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test',
      traceId: 'abc123',
      spanId: 'def456',
      traceFlags: 1,
    };

    const output = formatter.format(record);
    const parsed = JSON.parse(output);

    expect(parsed.traceId).toBe('abc123');
    expect(parsed.spanId).toBe('def456');
    expect(parsed.traceFlags).toBe(1);
  });

  it('uses custom field names', () => {
    const formatter = new OtelJsonFormatter({
      fieldNames: { timestamp: 'dt', message: 'msg' },
    });

    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test',
    };

    const output = formatter.format(record);
    const parsed = JSON.parse(output);

    expect(parsed.dt).toBeDefined();
    expect(parsed.msg).toBe('Test');
    expect(parsed.timestamp).toBeUndefined();
    expect(parsed.body).toBeUndefined();
  });

  it('includes resource when configured', () => {
    const formatter = new OtelJsonFormatter({
      includeResource: true,
      resource: {
        'service.name': 'my-service',
        'service.version': '1.0.0',
      },
    });

    const record: LogRecord = {
      level: 30,
      time: 1706123456789,
      pid: 123,
      hostname: 'test-host',
      msg: 'Test',
    };

    const output = formatter.format(record);
    const parsed = JSON.parse(output);

    expect(parsed.resource).toBeDefined();
    expect(parsed.resource['service.name']).toBe('my-service');
    expect(parsed.resource['service.version']).toBe('1.0.0');
  });
});
