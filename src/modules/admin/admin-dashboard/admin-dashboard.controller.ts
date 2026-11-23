import { Controller, Get, UseGuards, Version } from '@nestjs/common';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import type { V1AdminDashboardResponseBody } from './types/requests/v1-admin-dashboard-response';

@Controller('admin/dashboard')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Version('1')
  @Get()
  getDashboard(): Promise<V1AdminDashboardResponseBody> {
    return this.adminDashboardService.getDashboard();
  }
}
