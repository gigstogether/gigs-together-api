import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { GigFeedRevalidationService } from '@modules/gig/gig-feed/gig-feed-revalidation.service';
import { AdminFeedController } from './admin-feed.controller';

describe('AdminFeedController', () => {
  const gigFeedRevalidationService = {
    revalidateGigFeedsOrThrow: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<GigFeedRevalidationService, 'revalidateGigFeedsOrThrow'>;

  let controller: AdminFeedController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AdminFeedController],
      providers: [
        {
          provide: GigFeedRevalidationService,
          useValue: gigFeedRevalidationService,
        },
      ],
    })
      .overrideGuard(AccessJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminFeedController);
  });

  it('should strictly revalidate all feed paths via feed revalidate service', async () => {
    await expect(controller.revalidateGigFeeds()).resolves.toBeUndefined();

    expect(
      gigFeedRevalidationService.revalidateGigFeedsOrThrow,
    ).toHaveBeenCalledWith({});
  });

  it('should propagate manual feed revalidation failure', async () => {
    const e = new ServiceUnavailableException(
      'Feed revalidation service is unavailable',
    );
    gigFeedRevalidationService.revalidateGigFeedsOrThrow.mockRejectedValueOnce(
      e,
    );

    await expect(controller.revalidateGigFeeds()).rejects.toBe(e);
  });
});
