import { Test } from '@nestjs/testing';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardController', () => {
  const adminDashboardService = {
    getDashboard: vi.fn().mockResolvedValue({
      summary: {
        gigsCount: 15,
        visibleGigsCount: 12,
      },
    }),
  } satisfies Pick<AdminDashboardService, 'getDashboard'>;

  let controller: AdminDashboardController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [
        { provide: AdminDashboardService, useValue: adminDashboardService },
      ],
    })
      .overrideGuard(AccessJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminDashboardController);
  });

  it('should return dashboard summary counts from admin dashboard service', async () => {
    await expect(controller.getDashboard()).resolves.toEqual({
      summary: {
        gigsCount: 15,
        visibleGigsCount: 12,
      },
    });
  });
});
