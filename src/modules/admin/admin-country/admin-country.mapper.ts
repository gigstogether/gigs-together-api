import type { CreateCountryParams } from '@modules/location/country/country.service';
import type { Country } from '@modules/location/country/types/country.types';
import type { AdminCountryOption } from './admin-country.service';
import type { V1AdminCountryCreateBodyDto } from './types/requests/v1-admin-country-request';
import type {
  V1AdminCountryOptionResponseBody,
  V1AdminCountryResponseBody,
} from './types/requests/v1-admin-country-response';

export function mapV1AdminCountryCreateRequest(
  body: V1AdminCountryCreateBodyDto,
): CreateCountryParams {
  return { iso: body.iso };
}

export function mapV1AdminCountryResponse(
  country: Country,
): V1AdminCountryResponseBody {
  return { iso: country.iso };
}

export function mapV1AdminCountryOptionResponse(
  option: AdminCountryOption,
): V1AdminCountryOptionResponseBody {
  return {
    iso: option.iso,
    isConfigured: option.isConfigured,
  };
}
