import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { V1GigAroundGetRequestQuery } from './v1-gig-around-get-request';
import { V1GigDatesGetRequestQuery } from './v1-gig-dates-get-request';
import { V1GigGetRequestQuery } from './v1-gig-get-request';

describe('V1GigGetRequestQuery', () => {
  it('should accept and normalize a complete location', async () => {
    const query = plainToInstance(V1GigGetRequestQuery, {
      city: 'Barcelona',
      country: 'es',
    });

    const validationErrors = await validate(query);

    expect({ validationErrors, country: query.country }).toEqual({
      validationErrors: [],
      country: 'ES',
    });
  });

  it('should reject a request without a location', async () => {
    const query = plainToInstance(V1GigGetRequestQuery, {});

    const validationErrors = await validate(query);

    expect(validationErrors.map(({ property }) => property).sort()).toEqual([
      'city',
      'country',
    ]);
  });
});

describe('V1GigDatesGetRequestQuery', () => {
  it('should accept and normalize a complete location', async () => {
    const query = plainToInstance(V1GigDatesGetRequestQuery, {
      city: 'Barcelona',
      country: 'es',
    });

    const validationErrors = await validate(query);

    expect({ validationErrors, country: query.country }).toEqual({
      validationErrors: [],
      country: 'ES',
    });
  });

  it('should reject a request without a location', async () => {
    const query = plainToInstance(V1GigDatesGetRequestQuery, {});

    const validationErrors = await validate(query);

    expect(validationErrors.map(({ property }) => property).sort()).toEqual([
      'city',
      'country',
    ]);
  });
});

describe('V1GigAroundGetRequestQuery', () => {
  it('should accept and normalize a complete location', async () => {
    const query = plainToInstance(V1GigAroundGetRequestQuery, {
      anchor: '2026-09-09',
      city: 'Barcelona',
      country: 'es',
    });

    const validationErrors = await validate(query);

    expect({ validationErrors, country: query.country }).toEqual({
      validationErrors: [],
      country: 'ES',
    });
  });

  it('should reject a request without a location', async () => {
    const query = plainToInstance(V1GigAroundGetRequestQuery, {
      anchor: '2026-09-09',
    });

    const validationErrors = await validate(query);

    expect(validationErrors.map(({ property }) => property).sort()).toEqual([
      'city',
      'country',
    ]);
  });
});
