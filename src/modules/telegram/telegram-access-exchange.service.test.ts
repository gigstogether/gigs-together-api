import { Messenger } from '../../shared/types/messenger.enum';
import type { AuthenticationService } from '../auth/authentication.service';
import type { UserService } from '../user/user.service';
import { TelegramAccessExchangeService } from './telegram-access-exchange.service';

describe('TelegramAccessExchangeService', () => {
  const authenticationService = {
    signAccessToken: vi.fn(),
    signRefreshToken: vi.fn(),
    getAccessExpiresInSeconds: vi.fn(),
    getRefreshExpiresInSeconds: vi.fn(),
  };
  const userService = { findOrCreateMessengerUser: vi.fn() };
  const service = new TelegramAccessExchangeService(
    authenticationService as unknown as AuthenticationService,
    userService as unknown as UserService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    userService.findOrCreateMessengerUser.mockResolvedValue({
      id: '66a000000000000000000001',
      status: 'active',
      identities: [],
      createdAt: new Date('2026-08-22T10:00:00.000Z'),
      updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    authenticationService.signAccessToken.mockResolvedValue('access');
    authenticationService.signRefreshToken.mockResolvedValue('refresh');
    authenticationService.getAccessExpiresInSeconds.mockReturnValue(3_600);
    authenticationService.getRefreshExpiresInSeconds.mockReturnValue(86_400);
  });

  it('should upsert User and include its internal id in issued tokens', async () => {
    await service.buildAccessTokenExchange({
      tgUser: {
        id: 42,
        first_name: 'Arina',
        last_name: 'Goodboy',
        username: 'arina',
      },
      isAdmin: true,
    });

    expect(userService.findOrCreateMessengerUser).toHaveBeenCalledWith({
      messenger: Messenger.Telegram,
      externalUserId: '42',
      username: 'arina',
      displayName: 'Arina Goodboy',
    });
    expect(authenticationService.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'telegram',
        userId: '66a000000000000000000001',
        telegramUserId: 42,
      }),
    );
    expect(authenticationService.signRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '66a000000000000000000001',
      }),
    );
  });
});
