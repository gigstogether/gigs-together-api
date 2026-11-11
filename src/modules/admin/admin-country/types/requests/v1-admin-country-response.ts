export interface V1AdminCountryResponseBody {
  iso: string;
}

export interface V1AdminCountriesListResponseBody {
  countries: V1AdminCountryResponseBody[];
}

export interface V1AdminCountryOptionResponseBody {
  iso: string;
  isConfigured: boolean;
}

export interface V1AdminCountryOptionsListResponseBody {
  countries: V1AdminCountryOptionResponseBody[];
}
