import { Controller, Get, Query, Version } from '@nestjs/common';
import { LocalityService } from './locality.service';
import type { FindLocalitiesParams } from './locality.service';
import { mapV1LocalityListItemResponse } from './locality.mapper';
import { V1LocalitiesGetQueryDto } from './types/requests/v1-locality-list-request';
import type { V1LocalityListResponseBody } from './types/requests/v1-locality-list-response';

@Controller('localities')
export class LocalityController {
  constructor(private readonly localityService: LocalityService) {}

  @Version('1')
  @Get()
  async getLocalitiesV1(
    @Query() query: V1LocalitiesGetQueryDto,
  ): Promise<V1LocalityListResponseBody> {
    const params: FindLocalitiesParams = { countryIso: query.countryIso };
    const localities = await this.localityService.findLocalities(params);

    return { localities: localities.map(mapV1LocalityListItemResponse) };
  }
}
