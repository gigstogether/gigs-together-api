import { PATH_METADATA } from '@nestjs/common/constants';

import { GigCandidateController } from './gig-candidate.controller';

describe('GigCandidateController', () => {
  it('should expose the plural gig candidates resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, GigCandidateController)).toBe(
      'gig-candidates',
    );
  });
});
