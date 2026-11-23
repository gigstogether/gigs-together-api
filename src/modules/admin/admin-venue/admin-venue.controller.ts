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
import { VenueService } from '@modules/location/venue/venue.service';
import {
  mapV1AdminVenueCreateRequest,
  mapV1AdminVenueResponse,
  mapV1AdminVenuesGetRequest,
  mapV1AdminVenueUpdateRequest,
} from './admin-venue.mapper';
import {
  V1AdminVenueCreateBodyDto,
  V1AdminVenueIdParamsDto,
  V1AdminVenuePatchBodyDto,
  V1AdminVenuesGetQueryDto,
} from './types/requests/v1-admin-venue-request';
import type {
  V1AdminVenueResponseBody,
  V1AdminVenuesListResponseBody,
} from './types/requests/v1-admin-venue-response';

@Controller('admin/venues')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminVenueController {
  constructor(private readonly venueService: VenueService) {}

  @Version('1')
  @Get()
  async getVenuesV1(
    @Query() query: V1AdminVenuesGetQueryDto,
  ): Promise<V1AdminVenuesListResponseBody> {
    const venues = await this.venueService.findVenues(
      mapV1AdminVenuesGetRequest(query),
    );

    return { venues: venues.map(mapV1AdminVenueResponse) };
  }

  @Version('1')
  @Get(':id')
  async getVenueV1(
    @Param() params: V1AdminVenueIdParamsDto,
  ): Promise<V1AdminVenueResponseBody> {
    const venue = await this.venueService.getVenueById(params.id);

    return mapV1AdminVenueResponse(venue);
  }

  @Version('1')
  @Post()
  async createVenueV1(
    @Body() body: V1AdminVenueCreateBodyDto,
  ): Promise<V1AdminVenueResponseBody> {
    const venue = await this.venueService.createVenue(
      mapV1AdminVenueCreateRequest(body),
    );

    return mapV1AdminVenueResponse(venue);
  }

  @Version('1')
  @Patch(':id')
  async updateVenueV1(
    @Param() params: V1AdminVenueIdParamsDto,
    @Body() body: V1AdminVenuePatchBodyDto,
  ): Promise<V1AdminVenueResponseBody> {
    const venue = await this.venueService.updateVenue(
      mapV1AdminVenueUpdateRequest(params.id, body),
    );

    return mapV1AdminVenueResponse(venue);
  }

  @Version('1')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVenueV1(@Param() params: V1AdminVenueIdParamsDto): Promise<void> {
    return this.venueService.deleteVenue(params.id);
  }
}
