import { ConfigService } from '@nestjs/config';
import { getConfigPositiveSafeInteger, getRequiredConfigString } from './env';

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
