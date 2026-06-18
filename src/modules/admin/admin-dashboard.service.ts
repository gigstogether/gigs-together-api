import { Injectable } from '@nestjs/common';
import { GigService } from '../gig/gig.service';
import { Status } from '../gig/types/status.enum';
import type { V1AdminDashboardResponseBody } from './types/requests/v1-admin-dashboard-response';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly gigService: GigService) {}

  async getDashboard(): Promise<V1AdminDashboardResponseBody> {
    const [pendingGigsCount, publishedGigsCount] = await Promise.all([
      this.gigService.getGigCountByStatus(Status.Pending),
      this.gigService.getGigCountByStatus(Status.Published),
    ]);

    return {
      summary: {
        pendingGigsCount,
        publishedGigsCount,
      },
    };
  }
}
