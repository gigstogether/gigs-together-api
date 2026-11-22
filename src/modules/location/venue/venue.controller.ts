import { Controller, Get, Query, Version } from '@nestjs/common';
import { mapV1LocalityListItemResponse } from '../locality/locality.mapper';
import type { Venue } from './types/venue.types';
import { VenueService } from './venue.service';
import { V1VenuesGetQueryDto } from './types/requests/v1-venue-list-request';
import type {
  V1VenueListItemResponseBody,
  V1VenueListResponseBody,
} from './types/requests/v1-venue-list-response';

@Controller('venues')
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  @Version('1')
  @Get()
  async getVenuesV1(
    @Query() query: V1VenuesGetQueryDto,
  ): Promise<V1VenueListResponseBody> {
    const catalog = await this.venueService.getActiveVenueCatalog(
      query.localityId,
    );

    return {
      locality: mapV1LocalityListItemResponse(catalog.locality),
      venues: catalog.venues.map(mapV1VenueListItemResponse),
    };
  }
}

function mapV1VenueListItemResponse(venue: Venue): V1VenueListItemResponseBody {
  return {
    id: venue.id,
    name: venue.name,
  };
}
