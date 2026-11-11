import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import {
  mapV1AdminCountryCreateRequest,
  mapV1AdminCountryOptionResponse,
  mapV1AdminCountryResponse,
} from './admin-country.mapper';
import { AdminCountryService } from './admin-country.service';
import { V1AdminCountryCreateBodyDto } from './types/requests/v1-admin-country-request';
import type {
  V1AdminCountriesListResponseBody,
  V1AdminCountryOptionsListResponseBody,
  V1AdminCountryResponseBody,
} from './types/requests/v1-admin-country-response';

@Controller('admin/countries')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminCountryController {
  constructor(private readonly adminCountryService: AdminCountryService) {}

  @Version('1')
  @Get()
  async getCountriesV1(): Promise<V1AdminCountriesListResponseBody> {
    const countries = await this.adminCountryService.getCountries();

    return { countries: countries.map(mapV1AdminCountryResponse) };
  }

  @Version('1')
  @Get('options')
  async getCountryOptionsV1(): Promise<V1AdminCountryOptionsListResponseBody> {
    const countries = await this.adminCountryService.getCountryOptions();

    return { countries: countries.map(mapV1AdminCountryOptionResponse) };
  }

  @Version('1')
  @Post()
  async createCountryV1(
    @Body() body: V1AdminCountryCreateBodyDto,
  ): Promise<V1AdminCountryResponseBody> {
    const country = await this.adminCountryService.createCountry(
      mapV1AdminCountryCreateRequest(body),
    );

    return mapV1AdminCountryResponse(country);
  }
}
