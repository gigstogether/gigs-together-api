import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  Version,
} from '@nestjs/common';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { LocaleService } from '@modules/locale/locale.service';
import type { SupportedLocale } from '@modules/locale/types/locale.types';
import {
  V1AdminLocalePatchBodyDto,
  V1AdminLocalesOrderPatchBodyDto,
} from './types/requests/v1-admin-locale-patch-body';

@Controller('admin/locales')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminLocaleController {
  constructor(private readonly localeService: LocaleService) {}

  @Version('1')
  @Get()
  getLocales(): Promise<readonly SupportedLocale[]> {
    return this.localeService.getAllLocalesOrdered();
  }

  @Version('1')
  @Patch('order')
  patchLocalesOrder(
    @Body() body: V1AdminLocalesOrderPatchBodyDto,
  ): Promise<readonly SupportedLocale[]> {
    return this.localeService.updateLocalesOrder({
      locales: body.locales,
    });
  }

  @Version('1')
  @Patch(':iso')
  patchLocale(
    @Param('iso') iso: string,
    @Body() body: V1AdminLocalePatchBodyDto,
  ): Promise<SupportedLocale> {
    return this.localeService.updateLocaleByIso({ iso, ...body });
  }
}
