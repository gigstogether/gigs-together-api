import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { LocalityService } from '@modules/location/locality/locality.service';
import {
  mapV1AdminLocalitiesGetRequest,
  mapV1AdminLocalityCreateRequest,
  mapV1AdminLocalityResponse,
  mapV1AdminLocalityUpdateRequest,
} from './admin-locality.mapper';
import {
  V1AdminLocalitiesGetQueryDto,
  V1AdminLocalityCreateBodyDto,
  V1AdminLocalityIdParamsDto,
  V1AdminLocalityPatchBodyDto,
} from './types/requests/v1-admin-locality-request';
import type {
  V1AdminLocalitiesListResponseBody,
  V1AdminLocalityResponseBody,
} from './types/requests/v1-admin-locality-response';

@Controller('admin/localities')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminLocalityController {
  constructor(private readonly localityService: LocalityService) {}

  @Version('1')
  @Get()
  async getLocalitiesV1(
    @Query() query: V1AdminLocalitiesGetQueryDto,
  ): Promise<V1AdminLocalitiesListResponseBody> {
    const localities = await this.localityService.findLocalities(
      mapV1AdminLocalitiesGetRequest(query),
    );

    return { localities: localities.map(mapV1AdminLocalityResponse) };
  }

  @Version('1')
  @Get(':id')
  async getLocalityV1(
    @Param() params: V1AdminLocalityIdParamsDto,
  ): Promise<V1AdminLocalityResponseBody> {
    const locality = await this.localityService.getLocalityById(params.id);

    return mapV1AdminLocalityResponse(locality);
  }

  @Version('1')
  @Post()
  async createLocalityV1(
    @Body() body: V1AdminLocalityCreateBodyDto,
  ): Promise<V1AdminLocalityResponseBody> {
    const locality = await this.localityService.createLocality(
      mapV1AdminLocalityCreateRequest(body),
    );

    return mapV1AdminLocalityResponse(locality);
  }

  @Version('1')
  @Patch(':id')
  async updateLocalityV1(
    @Param() params: V1AdminLocalityIdParamsDto,
    @Body() body: V1AdminLocalityPatchBodyDto,
  ): Promise<V1AdminLocalityResponseBody> {
    const locality = await this.localityService.updateLocality(
      mapV1AdminLocalityUpdateRequest(params.id, body),
    );

    return mapV1AdminLocalityResponse(locality);
  }

  @Version('1')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLocalityV1(@Param() params: V1AdminLocalityIdParamsDto): Promise<void> {
    return this.localityService.deleteLocality(params.id);
  }
}
