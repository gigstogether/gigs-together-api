import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import {
  CountryReferenceService,
  parseCountryReferences,
} from './country-reference.service';

const HEADER_CELLS = ['ISO-alpha2 Code', 'ISO-alpha3 Code'];

describe('parseCountryReferences', () => {
  it('should parse and sort UNSD country ISO codes', () => {
    const html = createCountryTableHtml(200);

    const countries = parseCountryReferences(html);

    expect(countries).toHaveLength(200);
    expect(countries[0]).toEqual({ iso: 'AA' });
  });

  it('should reject a table without the ISO alpha-2 header', () => {
    const html = '<table id="downloadTableEN"><tr><td>Name</td></tr></table>';

    expect(() => parseCountryReferences(html)).toThrow(
      'UNSD country table must contain the ISO alpha-2 header',
    );
  });
});

describe('CountryReferenceService', () => {
  let service: CountryReferenceService;

  const getMock = vi.fn();

  beforeEach(async () => {
    getMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CountryReferenceService,
        { provide: HttpService, useValue: { get: getMock } },
      ],
    }).compile();

    service = module.get<CountryReferenceService>(CountryReferenceService);
  });

  it('should cache the parsed country references', async () => {
    getMock.mockReturnValue(of({ data: createCountryTableHtml(200) }));

    await service.getCountries();
    await expect(service.hasCountry('AA')).resolves.toBe(true);

    expect(getMock).toHaveBeenCalledOnce();
  });

  it('should expose an unavailable response when the source request fails', async () => {
    getMock.mockReturnValue(throwError(() => new Error('UNSD is offline')));

    await expect(service.getCountries()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

function createCountryTableHtml(countryCount: number): string {
  const headers = HEADER_CELLS.map((header) => `<td>${header}</td>`).join('');
  const rows = Array.from({ length: countryCount }, (_, index) => {
    const firstLetter = String.fromCharCode(65 + Math.floor(index / 26));
    const secondLetter = String.fromCharCode(65 + (index % 26));

    return `<tr><td>${firstLetter}${secondLetter}</td><td>AAA</td></tr>`;
  })
    .reverse()
    .join('');

  return `<table id="downloadTableEN"><tr>${headers}</tr>${rows}</table>`;
}
