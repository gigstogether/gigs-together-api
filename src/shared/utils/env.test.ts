import { ConfigService } from '@nestjs/config';
import {
  getConfigBoolean,
  getConfigPositiveSafeInteger,
  getRequiredConfigString,
} from './env';

describe('getRequiredConfigString', () => {
  it('should return a trimmed configured string', () => {
    const configService = new ConfigService({
      TEST_REQUIRED_CONFIG_STRING: '  configured value  ',
    });

    expect(
      getRequiredConfigString(configService, 'TEST_REQUIRED_CONFIG_STRING'),
    ).toBe('configured value');
  });

  it.each([
    { value: undefined, description: 'missing' },
    { value: '', description: 'empty' },
    { value: '   ', description: 'blank' },
    { value: 42, description: 'not a string' },
  ])('should reject a $description value', ({ value }) => {
    const configService = new ConfigService({
      TEST_REQUIRED_CONFIG_STRING: value,
    });

    expect(() =>
      getRequiredConfigString(configService, 'TEST_REQUIRED_CONFIG_STRING'),
    ).toThrowError('TEST_REQUIRED_CONFIG_STRING is not configured.');
  });
});

describe('getConfigPositiveSafeInteger', () => {
  it.each(['42', 42, '1e3'])(
    'should return a configured positive safe integer from %s',
    (value) => {
      const configService = new ConfigService({ TEST_POSITIVE_INTEGER: value });

      expect(
        getConfigPositiveSafeInteger(configService, 'TEST_POSITIVE_INTEGER'),
      ).toBe(Number(value));
    },
  );

  it.each([undefined, '', '   '])(
    'should return undefined when the configured value is %s',
    (value) => {
      const configService = new ConfigService({
        TEST_POSITIVE_INTEGER: value,
      });

      expect(
        getConfigPositiveSafeInteger(configService, 'TEST_POSITIVE_INTEGER'),
      ).toBeUndefined();
    },
  );

  it.each(['0', '-1', '1.5', 'invalid', '9007199254740992'])(
    'should reject invalid value %s',
    (value) => {
      const configService = new ConfigService({
        TEST_POSITIVE_INTEGER: value,
      });

      expect(() =>
        getConfigPositiveSafeInteger(configService, 'TEST_POSITIVE_INTEGER'),
      ).toThrowError('TEST_POSITIVE_INTEGER must be a positive safe integer.');
    },
  );
});

describe('getConfigBoolean', () => {
  it.each(['true', '1', 'yes', 'on', true])(
    'should return true for %s',
    (value) => {
      const configService = new ConfigService({ TEST_BOOLEAN: value });

      expect(getConfigBoolean(configService, 'TEST_BOOLEAN')).toBe(true);
    },
  );

  it.each(['false', '0', 'no', 'off', false])(
    'should return false for %s',
    (value) => {
      const configService = new ConfigService({ TEST_BOOLEAN: value });

      expect(getConfigBoolean(configService, 'TEST_BOOLEAN')).toBe(false);
    },
  );

  it.each([undefined, '', '   '])(
    'should return undefined when the configured value is %s',
    (value) => {
      const configService = new ConfigService({ TEST_BOOLEAN: value });

      expect(getConfigBoolean(configService, 'TEST_BOOLEAN')).toBeUndefined();
    },
  );

  it('should reject an unsupported boolean value', () => {
    const configService = new ConfigService({ TEST_BOOLEAN: 'enabled' });

    expect(() => getConfigBoolean(configService, 'TEST_BOOLEAN')).toThrowError(
      'TEST_BOOLEAN must be a boolean.',
    );
  });
});
