import { Injectable } from '@nestjs/common';
import { GigService } from '../gig/gig.service';
import type { V1AdminDashboardResponseBody } from './types/requests/v1-admin-dashboard-response';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly gigService: GigService) {}

  async getDashboard(): Promise<V1AdminDashboardResponseBody> {
    const [gigsCount, visibleGigsCount] = await Promise.all([
      this.gigService.getGigCount(),
      this.gigService.getVisibleGigCount(),
    ]);

    return {
      summary: {
        gigsCount,
        visibleGigsCount,
      },
    };
  }
}
