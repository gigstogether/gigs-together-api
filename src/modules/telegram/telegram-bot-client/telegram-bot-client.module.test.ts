import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TELEGRAM_BOT_HTTP, TELEGRAM_FILE_HTTP } from './telegram-bot.client';
import { TelegramBotClientModule } from './telegram-bot-client.module';

describe('TelegramBotClientModule', () => {
  let module: TestingModule;

  afterEach(async () => {
    await module?.close();
    vi.restoreAllMocks();
  });

  it('should configure named Bot API and File API HTTP services from one token read', async () => {
    const configService = {
      get: vi.fn((key: string) =>
        key === 'BOT_TOKEN' ? 'test-token' : undefined,
      ),
    };
    module = await Test.createTestingModule({
      imports: [TelegramBotClientModule],
    })
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    const botHttpService = module.get<HttpService>(TELEGRAM_BOT_HTTP);
    const fileHttpService = module.get<HttpService>(TELEGRAM_FILE_HTTP);

    expect(botHttpService.axiosRef.defaults.baseURL).toBe(
      'https://api.telegram.org/bottest-token',
    );
    expect(fileHttpService.axiosRef.defaults.baseURL).toBe(
      'https://api.telegram.org/file/bottest-token',
    );
    expect(configService.get).toHaveBeenCalledOnce();
    expect(configService.get).toHaveBeenCalledWith('BOT_TOKEN');
  });
});
