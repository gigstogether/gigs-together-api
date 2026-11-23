import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
  Version,
} from '@nestjs/common';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { TranslationRevalidateService } from '@modules/translation/translation-revalidate.service';
import { TranslationService } from '@modules/translation/translation.service';
import type { UpsertTranslationRecordInput } from '@modules/translation/translation.service';
import type { StoredTranslationRecord } from '@modules/translation/types/translation-record.types';
import type { V1AdminTranslationNamespacesListResponseBody } from './types/requests/v1-admin-translation-namespaces-list-response';
import {
  V1AdminTranslationPutBodyDto,
  V1AdminTranslationPutParamsDto,
} from './types/requests/v1-admin-translation-put-request';
import {
  V1AdminTranslationSetActiveBodyDto,
  V1AdminTranslationSetActiveParamsDto,
} from './types/requests/v1-admin-translation-set-active-body';
import { V1AdminTranslationsGetQueryDto } from './types/requests/v1-admin-translations-get-query';
import type { V1AdminTranslationsListResponseBody } from './types/requests/v1-admin-translations-list-response';

interface MapV1AdminTranslationPutRequestParams {
  path: V1AdminTranslationPutParamsDto;
  body: V1AdminTranslationPutBodyDto;
}

interface TranslationPutHttpResponse {
  status(statusCode: HttpStatus): void;
}

function mapV1AdminTranslationPutRequest(
  params: MapV1AdminTranslationPutRequestParams,
): UpsertTranslationRecordInput {
  return {
    namespace: params.path.namespace,
    locale: params.path.locale,
    key: params.path.key,
    value: params.body.value,
    format: params.body.format,
    kind: params.body.kind,
    isActive: params.body.isActive,
  };
}

@Controller('admin/translations')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminTranslationController {
  constructor(
    private readonly translationService: TranslationService,
    private readonly translationRevalidateService: TranslationRevalidateService,
  ) {}

  @Version('1')
  @Post('revalidate')
  @HttpCode(HttpStatus.NO_CONTENT)
  revalidateTranslations(): Promise<void> {
    return this.translationRevalidateService.revalidateAll();
  }

  @Version('1')
  @Get('namespaces')
  async getTranslationNamespaces(): Promise<V1AdminTranslationNamespacesListResponseBody> {
    const namespaces = await this.translationService.listDistinctNamespaces();

    return { namespaces };
  }

  @Version('1')
  @Get()
  async getTranslations(
    @Query() query: V1AdminTranslationsGetQueryDto,
  ): Promise<V1AdminTranslationsListResponseBody> {
    const records = await this.translationService.listRecords({
      namespace: query.namespace,
      locale: query.locale,
    });

    return { records };
  }

  @Version('1')
  @Put(':namespace/:locale/:key')
  async putTranslation(
    @Param() path: V1AdminTranslationPutParamsDto,
    @Body() body: V1AdminTranslationPutBodyDto,
    @Res({ passthrough: true }) response: TranslationPutHttpResponse,
  ): Promise<void> {
    const result = await this.translationService.upsertRecord(
      mapV1AdminTranslationPutRequest({ path, body }),
    );

    response.status(
      result.isCreated ? HttpStatus.CREATED : HttpStatus.NO_CONTENT,
    );
  }

  @Version('1')
  @Patch(':id/active')
  patchTranslationActive(
    @Param() params: V1AdminTranslationSetActiveParamsDto,
    @Body() body: V1AdminTranslationSetActiveBodyDto,
  ): Promise<StoredTranslationRecord> {
    return this.translationService.setActiveById({
      id: params.id,
      isActive: body.isActive,
    });
  }
}
