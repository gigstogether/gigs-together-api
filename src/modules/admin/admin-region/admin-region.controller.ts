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
import { RegionService } from '@modules/location/region/region.service';
import {
  mapV1AdminRegionCreateRequest,
  mapV1AdminRegionResponse,
  mapV1AdminRegionsGetRequest,
  mapV1AdminRegionUpdateRequest,
} from './admin-region.mapper';
import {
  V1AdminRegionCreateBodyDto,
  V1AdminRegionIdParamsDto,
  V1AdminRegionPatchBodyDto,
  V1AdminRegionsGetQueryDto,
} from './types/requests/v1-admin-region-request';
import type {
  V1AdminRegionResponseBody,
  V1AdminRegionsListResponseBody,
} from './types/requests/v1-admin-region-response';

@Controller('admin/regions')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminRegionController {
  constructor(private readonly regionService: RegionService) {}

  @Version('1')
  @Get()
  async getRegionsV1(
    @Query() query: V1AdminRegionsGetQueryDto,
  ): Promise<V1AdminRegionsListResponseBody> {
    const regions = await this.regionService.findRegions(
      mapV1AdminRegionsGetRequest(query),
    );

    return { regions: regions.map(mapV1AdminRegionResponse) };
  }

  @Version('1')
  @Get(':id')
  async getRegionV1(
    @Param() params: V1AdminRegionIdParamsDto,
  ): Promise<V1AdminRegionResponseBody> {
    const region = await this.regionService.getRegionById(params.id);

    return mapV1AdminRegionResponse(region);
  }

  @Version('1')
  @Post()
  async createRegionV1(
    @Body() body: V1AdminRegionCreateBodyDto,
  ): Promise<V1AdminRegionResponseBody> {
    const region = await this.regionService.createRegion(
      mapV1AdminRegionCreateRequest(body),
    );

    return mapV1AdminRegionResponse(region);
  }

  @Version('1')
  @Patch(':id')
  async updateRegionV1(
    @Param() params: V1AdminRegionIdParamsDto,
    @Body() body: V1AdminRegionPatchBodyDto,
  ): Promise<V1AdminRegionResponseBody> {
    const region = await this.regionService.updateRegion(
      mapV1AdminRegionUpdateRequest(params.id, body),
    );

    return mapV1AdminRegionResponse(region);
  }

  @Version('1')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRegionV1(@Param() params: V1AdminRegionIdParamsDto): Promise<void> {
    return this.regionService.deleteRegion(params.id);
  }
}
