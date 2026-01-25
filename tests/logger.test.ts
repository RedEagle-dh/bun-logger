import { describe, it, expect, beforeEach, mock } from 'bun:test';
import bunLogger, { Logger, LogLevels } from '../src';

describe('Logger', () => {
  describe('basic logging', () => {
    it('creates a logger with default options', () => {
      const logger = bunLogger();
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.level).toBe('info');
    });

    it('creates a logger with custom name', () => {
      const logger = bunLogger({ name: 'test-app' });
      const bindings = logger.bindings();
      expect(bindings.name).toBe('test-app');
    });

    it('creates a logger with custom level', () => {
      const logger = bunLogger({ level: 'debug' });
      expect(logger.level).toBe('debug');
    });

    it('respects log level filtering', () => {
      const output: string[] = [];
      const logger = bunLogger({
        level: 'warn',
        destination: { write: (data) => output.push(data) },
      });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Only warn and error should be logged
      expect(output.length).toBe(2);
      expect(output[0]).toContain('"level":40');
      expect(output[1]).toContain('"level":50');
    });

    it('changes level dynamically', () => {
      const logger = bunLogger({ level: 'info' });
      expect(logger.isLevelEnabled('debug')).toBe(false);

      logger.level = 'debug';
      expect(logger.isLevelEnabled('debug')).toBe(true);
    });
  });

  describe('log output format', () => {
    it('outputs JSON with correct structure', () => {
      let output = '';
      const logger = bunLogger({
        name: 'test',
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      logger.info('test message');

      const parsed = JSON.parse(output);
      expect(parsed.level).toBe(30);
      expect(parsed.msg).toBe('test message');
      expect(parsed.name).toBe('test');
      expect(parsed.time).toBeNumber();
      expect(parsed.pid).toBeNumber();
      expect(parsed.hostname).toBeString();
    });

    it('includes additional data in log', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      logger.info({ userId: 123, action: 'login' }, 'User action');

      const parsed = JSON.parse(output);
      expect(parsed.userId).toBe(123);
      expect(parsed.action).toBe('login');
      expect(parsed.msg).toBe('User action');
    });

    it('supports printf-style formatting', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      logger.info('User %s has %d items', 'alice', 5);

      const parsed = JSON.parse(output);
      expect(parsed.msg).toBe('User alice has 5 items');
    });

    it('supports %j for JSON formatting', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      logger.info('Data: %j', { key: 'value' });

      const parsed = JSON.parse(output);
      expect(parsed.msg).toBe('Data: {"key":"value"}');
    });
  });

  describe('error logging', () => {
    it('serializes error objects', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      const err = new Error('Test error');
      logger.error(err);

      const parsed = JSON.parse(output);
      expect(parsed.err).toBeDefined();
      expect(parsed.err.type).toBe('Error');
      expect(parsed.err.message).toBe('Test error');
      expect(parsed.err.stack).toContain('Error: Test error');
      expect(parsed.msg).toBe('Test error');
    });

    it('serializes error with custom message', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      const err = new Error('Original error');
      logger.error(err, 'Custom message');

      const parsed = JSON.parse(output);
      expect(parsed.msg).toBe('Custom message');
      expect(parsed.err.message).toBe('Original error');
    });

    it('serializes error with code property', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      const err = new Error('Network error') as Error & { code: string };
      err.code = 'ECONNREFUSED';
      logger.error(err);

      const parsed = JSON.parse(output);
      expect(parsed.err.code).toBe('ECONNREFUSED');
    });

    it('serializes nested error cause', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      const cause = new Error('Root cause');
      const err = new Error('Wrapper error', { cause });
      logger.error(err);

      const parsed = JSON.parse(output);
      expect(parsed.err.cause).toBeDefined();
      expect(parsed.err.cause.message).toBe('Root cause');
    });
  });

  describe('child loggers', () => {
    it('creates child logger with additional bindings', () => {
      let output = '';
      const logger = bunLogger({
        name: 'parent',
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      const child = logger.child({ requestId: 'abc-123' });
      child.info('Child message');

      const parsed = JSON.parse(output);
      expect(parsed.name).toBe('parent');
      expect(parsed.requestId).toBe('abc-123');
    });

    it('child logger inherits parent bindings', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        base: { service: 'api' },
        destination: { write: (data) => (output = data) },
      });

      const child = logger.child({ module: 'auth' });
      child.info('test');

      const parsed = JSON.parse(output);
      expect(parsed.service).toBe('api');
      expect(parsed.module).toBe('auth');
    });

    it('child logger can override level', () => {
      const logger = bunLogger({ level: 'info' });
      const child = logger.child({}, { level: 'debug' });
      expect(child.isLevelEnabled('debug')).toBe(true);
    });

    it('supports nested child loggers', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        destination: { write: (data) => (output = data) },
      });

      const child1 = logger.child({ depth: 1 });
      const child2 = child1.child({ depth: 2 });
      const child3 = child2.child({ depth: 3 });
      child3.info('nested');

      const parsed = JSON.parse(output);
      expect(parsed.level).toBe(30);
      expect(parsed.depth).toBe(3); // Last binding wins
    });
  });

  describe('redaction', () => {
    it('redacts specified fields', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        redact: ['password', 'secret'],
        destination: { write: (data) => (output = data) },
      });

      logger.info({ password: 'secret123', username: 'alice' }, 'Login');

      const parsed = JSON.parse(output);
      expect(parsed.password).toBe('[REDACTED]');
      expect(parsed.username).toBe('alice');
    });

    it('redacts nested fields', () => {
      let output = '';
      const logger = bunLogger({
        format: 'json',
        redact: ['user.password'],
        destination: { write: (data) => (output = data) },
      });

      logger.info({ user: { name: 'alice', password: 'secret' } }, 'User data');

      const parsed = JSON.parse(output);
      expect(parsed.user.name).toBe('alice');
      expect(parsed.user.password).toBe('[REDACTED]');
    });
  });

  describe('level checking', () => {
    it('isLevelEnabled returns correct values', () => {
      const logger = bunLogger({ level: 'warn' });

      expect(logger.isLevelEnabled('trace')).toBe(false);
      expect(logger.isLevelEnabled('debug')).toBe(false);
      expect(logger.isLevelEnabled('info')).toBe(false);
      expect(logger.isLevelEnabled('warn')).toBe(true);
      expect(logger.isLevelEnabled('error')).toBe(true);
      expect(logger.isLevelEnabled('fatal')).toBe(true);
    });
  });

  describe('bindings', () => {
    it('returns current bindings', () => {
      const logger = bunLogger({
        name: 'test',
        base: { env: 'production' },
      });

      const bindings = logger.bindings();
      expect(bindings.name).toBe('test');
      expect(bindings.env).toBe('production');
    });

    it('bindings are immutable', () => {
      const logger = bunLogger({ base: { key: 'value' } });
      const bindings = logger.bindings();
      bindings.key = 'modified';

      const newBindings = logger.bindings();
      expect(newBindings.key).toBe('value');
    });
  });
});

describe('LogLevels', () => {
  it('has correct numeric values', () => {
    expect(LogLevels.trace).toBe(10);
    expect(LogLevels.debug).toBe(20);
    expect(LogLevels.info).toBe(30);
    expect(LogLevels.warn).toBe(40);
    expect(LogLevels.error).toBe(50);
    expect(LogLevels.fatal).toBe(60);
    expect(LogLevels.silent).toBe(Infinity);
  });
});
