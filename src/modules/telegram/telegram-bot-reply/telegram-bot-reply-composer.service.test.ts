import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramBotReplyComposerService } from './telegram-bot-reply-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import type { TelegramTemplateKey } from '../telegram-template-keys';
import type { PlainTemplateParams } from '../telegram-template.service';
import { TelegramTemplateService } from '../telegram-template.service';
import { TelegramService } from '../telegram.service';
import type { TGChat } from '../types/chat.types';
import { TGParseMode } from '../types/message.types';

type MockTelegramTemplates = Pick<
  TelegramTemplateService,
  'getText' | 'render'
>;

function renderPlainTemplate(
  template: string,
  params: PlainTemplateParams,
): string {
  return template.replace(/\{(\w+)\}/g, (match, rawKey: string) => {
    const value = params[rawKey];
    if (value === null || value === undefined) {
      return match;
    }
    return String(value);
  });
}

function createMockTelegramTemplates(): MockTelegramTemplates {
  const texts: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.buttonSuggestGig]: 'Suggest a gig',
    [TELEGRAM_TEMPLATE_KEYS.linkContactAdmins]:
      'https://t.me/gigs_together?topic=help&source=bot',
  };
  const templates: Partial<Record<TelegramTemplateKey, string>> = {
    [TELEGRAM_TEMPLATE_KEYS.commandStart]:
      'Start: <a href="{contactAdminsUrl}">contact admins</a>.',
    [TELEGRAM_TEMPLATE_KEYS.commandUnknown]:
      'Unknown: <a href="{contactAdminsUrl}">contact admins</a>.',
    [TELEGRAM_TEMPLATE_KEYS.incomingMessageUnavailable]:
      'Unavailable: <a href="{contactAdminsUrl}">contact admins</a>.',
  };

  return {
    getText: vi.fn((key: TelegramTemplateKey) => texts[key] ?? ''),
    render: vi.fn((key: TelegramTemplateKey, params: PlainTemplateParams) => {
      const template = templates[key];
      if (template === undefined) {
        return '';
      }
      return renderPlainTemplate(template, params);
    }),
  };
}

describe('TelegramBotReplyComposerService', () => {
  let composer: TelegramBotReplyComposerService;
  const telegramService = {
    getBotUsername: vi.fn().mockReturnValue('GigsTogetherStgBot'),
    getSuggestMiniAppShortName: vi.fn().mockReturnValue('suggest'),
    getAppBaseUrl: vi.fn().mockReturnValue('https://gigs.example'),
  };
  const privateChat = {
    id: 12345,
    type: 'private',
  } satisfies TGChat;
  const supergroupChat = {
    id: -100123,
    type: 'supergroup',
  } satisfies TGChat;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramBotReplyComposerService,
        {
          provide: TelegramTemplateService,
          useValue: createMockTelegramTemplates(),
        },
        { provide: TelegramService, useValue: telegramService },
      ],
    }).compile();

    composer = moduleRef.get(TelegramBotReplyComposerService);
    telegramService.getAppBaseUrl.mockReturnValue('https://gigs.example');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each([
    {
      name: 'start command',
      compose: () => composer.composeStartCommandResponse(privateChat),
      text: 'Start: <a href="https://t.me/gigs_together?topic=help&amp;source=bot">contact admins</a>.',
    },
    {
      name: 'unknown command',
      compose: () => composer.composeUnknownCommandResponse(privateChat),
      text: 'Unknown: <a href="https://t.me/gigs_together?topic=help&amp;source=bot">contact admins</a>.',
    },
    {
      name: 'unavailable incoming message',
      compose: () => composer.composeIncomingMessageUnavailable(privateChat),
      text: 'Unavailable: <a href="https://t.me/gigs_together?topic=help&amp;source=bot">contact admins</a>.',
    },
  ])('should compose the $name response', ({ compose, text }) => {
    expect(compose()).toEqual({
      chat_id: 12345,
      text,
      parse_mode: TGParseMode.HTML,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Suggest a gig',
              web_app: {
                url: 'https://gigs.example/suggest/launch',
              },
            },
          ],
        ],
      },
    });
  });

  it('should compose a Mini App direct link for a shared chat', () => {
    const response = composer.composeStartCommandResponse(supergroupChat);

    expect(response.reply_markup?.inline_keyboard[0]?.[0]).toEqual({
      text: 'Suggest a gig',
      url: 'https://t.me/GigsTogetherStgBot/suggest',
    });
  });

  it('should reject a private response when app base URL is missing', () => {
    telegramService.getAppBaseUrl.mockReturnValueOnce(undefined);

    expect(() =>
      composer.composeStartCommandResponse(privateChat),
    ).toThrowError(
      'Cannot compose private user response: APP_BASE_URL is not configured.',
    );
  });

  it('should reject a private response when app base URL is invalid', () => {
    telegramService.getAppBaseUrl.mockReturnValueOnce('not-a-url');

    expect(() =>
      composer.composeStartCommandResponse(privateChat),
    ).toThrowError(
      'Cannot compose private user response: APP_BASE_URL must be a valid URL.',
    );
  });
});
