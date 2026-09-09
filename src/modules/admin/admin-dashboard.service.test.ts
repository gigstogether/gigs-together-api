import { Test } from '@nestjs/testing';

import { GigService } from '../gig/gig.service';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  it('should return all and visible Gig counts', async () => {
    const gigService = {
      getGigCount: vi.fn().mockResolvedValue(10),
      getVisibleGigCount: vi.fn().mockResolvedValue(7),
    };
    const module = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: GigService, useValue: gigService },
      ],
    }).compile();

    await expect(
      module.get(AdminDashboardService).getDashboard(),
    ).resolves.toEqual({
      summary: { gigsCount: 10, visibleGigsCount: 7 },
    });
  });
});
