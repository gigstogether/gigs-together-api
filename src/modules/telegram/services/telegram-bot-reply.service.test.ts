import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramBotReplyComposerService } from '../composers/telegram-bot-reply-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import type { TelegramTemplateKey } from '../telegram-template-keys';
import { TelegramTemplateService } from '../telegram-template.service';
import { TelegramBotClient } from '../telegram-bot.client';
import type { TGMessage, TGSendMessage } from '../types/message.types';
import { TGParseMode } from '../types/message.types';
import { TelegramBotReplyService } from './telegram-bot-reply.service';

type MockTelegramTemplates = Pick<
  TelegramTemplateService,
  'getText' | 'render'
>;

function createMockTelegramTemplates(): MockTelegramTemplates {
  const texts: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.buttonSuggestGig]: 'Suggest a gig',
    [TELEGRAM_TEMPLATE_KEYS.linkContactAdmins]: 'https://t.me/admins',
  };
  const templates: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.commandStart]: 'Start {contactAdminsUrl}',
    [TELEGRAM_TEMPLATE_KEYS.commandUnknown]: 'Unknown {contactAdminsUrl}',
    [TELEGRAM_TEMPLATE_KEYS.incomingMessageUnavailable]:
      'Unavailable {contactAdminsUrl}',
  };

  return {
    getText: vi.fn((key: TelegramTemplateKey) => texts[key] ?? ''),
    render: vi.fn(
      (key: TelegramTemplateKey, params: Record<string, unknown>) => {
        const template = templates[key] ?? '';
        return template.replace(
          '{contactAdminsUrl}',
          String(params.contactAdminsUrl ?? ''),
        );
      },
    ),
  };
}

describe('TelegramBotReplyService', () => {
  let service: TelegramBotReplyService;
  const sendMessage = vi.fn<(message: TGSendMessage) => Promise<TGMessage>>();

  beforeEach(async () => {
    vi.stubEnv('APP_BASE_URL', 'https://gigs.example');
    vi.stubEnv(
      'SUGGEST_GIG_URL',
      'https://t.me/GigsTogetherStgBot/suggest?startapp=suggest',
    );
    sendMessage.mockResolvedValue({
      message_id: 1,
      chat: { id: 12345, type: 'private' },
      date: 1,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramBotReplyService,
        TelegramBotReplyComposerService,
        {
          provide: TelegramTemplateService,
          useValue: createMockTelegramTemplates(),
        },
        {
          provide: TelegramBotClient,
          useValue: { sendMessage },
        },
      ],
    }).compile();

    service = moduleRef.get(TelegramBotReplyService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should send the start response to a private chat', async () => {
    await service.sendStartCommandResponse({ id: 12345, type: 'private' });

    expect(sendMessage).toHaveBeenCalledWith({
      chat_id: 12345,
      text: 'Start https://t.me/admins',
      parse_mode: TGParseMode.HTML,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Suggest a gig',
              web_app: { url: 'https://gigs.example/suggest/launch' },
            },
          ],
        ],
      },
    });
  });

  it('should send the unknown-command response to a private chat', async () => {
    await service.sendUnknownCommandResponse({ id: 12345, type: 'private' });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 12345,
        text: 'Unknown https://t.me/admins',
      }),
    );
  });

  it('should send the unavailable response to a shared chat', async () => {
    await service.sendIncomingMessageUnavailable({
      id: -100123,
      type: 'supergroup',
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: -100123,
        text: 'Unavailable https://t.me/admins',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Suggest a gig',
                url: 'https://t.me/GigsTogetherStgBot/suggest?startapp=suggest',
              },
            ],
          ],
        },
      }),
    );
  });
});
