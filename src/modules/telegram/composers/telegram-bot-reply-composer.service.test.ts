import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramBotReplyComposerService } from './telegram-bot-reply-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import type { TelegramTemplateKey } from '../telegram-template-keys';
import type { PlainTemplateParams } from '../telegram-template.service';
import { TelegramTemplateService } from '../telegram-template.service';
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

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramBotReplyComposerService,
        {
          provide: TelegramTemplateService,
          useValue: createMockTelegramTemplates(),
        },
      ],
    }).compile();

    composer = moduleRef.get(TelegramBotReplyComposerService);
    vi.stubEnv('APP_BASE_URL', 'https://gigs.example');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: 'start command',
      compose: () => composer.composeStartCommandResponse(12345),
      text: 'Start: <a href="https://t.me/gigs_together?topic=help&amp;source=bot">contact admins</a>.',
    },
    {
      name: 'unknown command',
      compose: () => composer.composeUnknownCommandResponse(12345),
      text: 'Unknown: <a href="https://t.me/gigs_together?topic=help&amp;source=bot">contact admins</a>.',
    },
    {
      name: 'unavailable incoming message',
      compose: () => composer.composeIncomingMessageUnavailable(12345),
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
              url: 'https://gigs.example/suggest/launch',
            },
          ],
        ],
      },
    });
  });

  it('should reject a user response when app URL is missing', () => {
    vi.stubEnv('APP_BASE_URL', '');

    expect(() => composer.composeStartCommandResponse(12345)).toThrowError(
      new BadRequestException(
        'Cannot compose user response: APP_BASE_URL is not configured.',
      ),
    );
  });
});
