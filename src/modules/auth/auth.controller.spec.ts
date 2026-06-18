import { AuthController } from './auth.controller';

describe('AuthController', () => {
  describe('me', () => {
    it('should return client profile from authenticated user', () => {
      const controller = new AuthController({} as never, {} as never);

      const result = controller.me({
        tgUser: {
          id: 42,
          first_name: 'Ada',
          username: 'ada_admin',
        },
        isAdmin: true,
      });

      expect(result).toEqual({
        profile: {
          displayLabel: '@ada_admin',
          isAdmin: true,
        },
      });
    });

    it('should reflect non-admin flag in profile', () => {
      const controller = new AuthController({} as never, {} as never);

      const result = controller.me({
        tgUser: {
          id: 7,
          first_name: 'Guest',
        },
        isAdmin: false,
      });

      expect(result.profile.isAdmin).toBe(false);
      expect(result.profile.displayLabel).toBe('Guest');
    });
  });
});
