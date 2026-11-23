import { Test } from '@nestjs/testing';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { GigService } from '@modules/gig/gig.service';
import { AdminGigController } from './admin-gig.controller';
import { AdminGigService } from './admin-gig.service';

describe('AdminGigController', () => {
  const adminGigService = {
    getGigsList: vi.fn().mockResolvedValue({ gigs: [] }),
    getGigByPublicId: vi.fn().mockResolvedValue({
      publicId: 'gig-42',
      title: 'Radiohead',
    }),
  } satisfies Pick<AdminGigService, 'getGigsList' | 'getGigByPublicId'>;
  const gigService = {
    createGigMainPost: vi.fn().mockResolvedValue(undefined),
    updateGigByPublicId: vi.fn(),
    updateGigVisibilityByPublicId: vi.fn(),
  } satisfies Pick<
    GigService,
    | 'createGigMainPost'
    | 'updateGigByPublicId'
    | 'updateGigVisibilityByPublicId'
  >;

  let controller: AdminGigController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AdminGigController],
      providers: [
        { provide: AdminGigService, useValue: adminGigService },
        { provide: GigService, useValue: gigService },
      ],
    })
      .overrideGuard(AccessJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminGigController);
  });

  it('should return gigs list from admin gig service', async () => {
    await expect(controller.getGigs({ limit: 20 })).resolves.toEqual({
      gigs: [],
    });
    expect(adminGigService.getGigsList).toHaveBeenCalledWith({ limit: 20 });
  });

  it('should return gig by public id from admin gig service', async () => {
    await expect(
      controller.getGigByPublicId({ publicId: 'gig-42' }),
    ).resolves.toEqual({ publicId: 'gig-42', title: 'Radiohead' });
    expect(adminGigService.getGigByPublicId).toHaveBeenCalledWith('gig-42');
  });

  it('should create main Telegram post via gig service', async () => {
    await expect(
      controller.createGigMainPostByPublicId(
        { publicId: 'gig-42' },
        { expectedVersion: 5 },
      ),
    ).resolves.toBeUndefined();
    expect(gigService.createGigMainPost).toHaveBeenCalledWith({
      publicId: 'gig-42',
      expectedVersion: 5,
    });
  });

  it('should update the Gig via gig service', async () => {
    const gig = {
      title: 'Radiohead',
      date: '2026-06-12',
      city: 'barcelona',
      country: 'ES',
      venue: 'Palau Sant Jordi',
      ticketsUrl: 'https://tickets.example',
    };
    gigService.updateGigByPublicId.mockResolvedValue({ publicId: 'gig-42' });

    await expect(
      controller.updateGigByPublicId({ publicId: 'gig-42' }, undefined, {
        expectedVersion: 5,
        gig,
      }),
    ).resolves.toEqual({ publicId: 'gig-42' });
    expect(gigService.updateGigByPublicId).toHaveBeenCalledWith({
      publicId: 'gig-42',
      expectedVersion: 5,
      gig,
      posterFile: undefined,
    });
  });

  it('should update Gig visibility via gig service', async () => {
    gigService.updateGigVisibilityByPublicId.mockResolvedValue({
      publicId: 'gig-42',
      version: 6,
      isVisible: true,
    });

    await expect(
      controller.updateGigVisibilityByPublicId(
        { publicId: 'gig-42' },
        { expectedVersion: 5, isVisible: true },
      ),
    ).resolves.toEqual({
      publicId: 'gig-42',
      version: 6,
      isVisible: true,
    });
  });
});
