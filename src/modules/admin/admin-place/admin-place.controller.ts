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
import { PlaceService } from '@modules/location/place/place.service';
import {
  mapV1AdminPlaceCreateRequest,
  mapV1AdminPlaceResponse,
  mapV1AdminPlacesGetRequest,
  mapV1AdminPlaceUpdateRequest,
} from './admin-place.mapper';
import {
  V1AdminPlaceCreateBodyDto,
  V1AdminPlaceIdParamsDto,
  V1AdminPlacePatchBodyDto,
  V1AdminPlacesGetQueryDto,
} from './types/requests/v1-admin-place-request';
import type {
  V1AdminPlaceResponseBody,
  V1AdminPlacesListResponseBody,
} from './types/requests/v1-admin-place-response';

@Controller('admin/places')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminPlaceController {
  constructor(private readonly placeService: PlaceService) {}

  @Version('1')
  @Get()
  async getPlacesV1(
    @Query() query: V1AdminPlacesGetQueryDto,
  ): Promise<V1AdminPlacesListResponseBody> {
    const places = await this.placeService.findPlaces(
      mapV1AdminPlacesGetRequest(query),
    );

    return { places: places.map(mapV1AdminPlaceResponse) };
  }

  @Version('1')
  @Get(':id')
  async getPlaceV1(
    @Param() params: V1AdminPlaceIdParamsDto,
  ): Promise<V1AdminPlaceResponseBody> {
    const place = await this.placeService.getPlaceById(params.id);

    return mapV1AdminPlaceResponse(place);
  }

  @Version('1')
  @Post()
  async createPlaceV1(
    @Body() body: V1AdminPlaceCreateBodyDto,
  ): Promise<V1AdminPlaceResponseBody> {
    const place = await this.placeService.createPlace(
      mapV1AdminPlaceCreateRequest(body),
    );

    return mapV1AdminPlaceResponse(place);
  }

  @Version('1')
  @Patch(':id')
  async updatePlaceV1(
    @Param() params: V1AdminPlaceIdParamsDto,
    @Body() body: V1AdminPlacePatchBodyDto,
  ): Promise<V1AdminPlaceResponseBody> {
    const place = await this.placeService.updatePlace(
      mapV1AdminPlaceUpdateRequest(params.id, body),
    );

    return mapV1AdminPlaceResponse(place);
  }

  @Version('1')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePlaceV1(@Param() params: V1AdminPlaceIdParamsDto): Promise<void> {
    return this.placeService.deletePlace(params.id);
  }
}
