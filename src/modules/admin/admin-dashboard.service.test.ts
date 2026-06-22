import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminDashboardService } from './admin-dashboard.service';
import { GigService } from '../gig/gig.service';
import { Status } from '../gig/types/status.enum';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;

  const gigServiceMock = {
    getGigCountByStatus: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        {
          provide: GigService,
          useValue: gigServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  describe('getDashboard', () => {
    it('should map gig status counts into dashboard summary', async () => {
      gigServiceMock.getGigCountByStatus.mockImplementation(
        (status: Status) => {
          if (status === Status.Pending) {
            return Promise.resolve(3);
          }
          if (status === Status.Published) {
            return Promise.resolve(12);
          }
          return Promise.resolve(0);
        },
      );

      await expect(service.getDashboard()).resolves.toEqual({
        summary: {
          pendingGigsCount: 3,
          publishedGigsCount: 12,
        },
      });
    });
  });
});
