import { Injectable } from '@nestjs/common';
import { COUNTRY_ISO_CODES } from './country.constants';

export interface Country {
  iso: string;
}

const COUNTRY_ISOS = new Set(COUNTRY_ISO_CODES);

@Injectable()
export class CountryService {
  getCountries(): Country[] {
    return COUNTRY_ISO_CODES.map((iso) => ({ iso }));
  }

  hasCountry(iso: string): boolean {
    return COUNTRY_ISOS.has(iso);
  }
}
