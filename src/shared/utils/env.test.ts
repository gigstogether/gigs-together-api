import { ConfigService } from '@nestjs/config';
import { getRequiredConfigString } from './env';

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
