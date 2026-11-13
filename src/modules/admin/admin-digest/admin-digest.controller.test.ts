import { Test } from '@nestjs/testing';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { DigestService } from '@modules/digest/digest.service';
import { AdminDigestController } from './admin-digest.controller';

describe('AdminDigestController', () => {
  const digestService = {
    createPost: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<DigestService, 'createPost'>;

  let controller: AdminDigestController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AdminDigestController],
      providers: [{ provide: DigestService, useValue: digestService }],
    })
      .overrideGuard(AccessJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminDigestController);
  });

  it('should create weekly digest post via digest service', async () => {
    await expect(controller.createDigestPost()).resolves.toBeUndefined();

    expect(digestService.createPost).toHaveBeenCalledTimes(1);
  });
});
