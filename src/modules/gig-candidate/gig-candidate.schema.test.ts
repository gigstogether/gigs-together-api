import { model, Types } from 'mongoose';

import { GigSourceType } from '../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../gig/types/gig-source-user-origin-type.enum';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import { GigCandidateSchema } from './gig-candidate.schema';

const GigCandidateSchemaTestModel = model(
  'GigCandidateSchemaTest',
  GigCandidateSchema,
);

function createGigCandidateDocument(venueIds?: Types.ObjectId[]) {
  const gigDraft: {
    communityIds: Types.ObjectId[];
    venueIds?: Types.ObjectId[];
  } = {
    communityIds: [new Types.ObjectId('507f1f77bcf86cd799439011')],
  };
  if (venueIds !== undefined) {
    gigDraft.venueIds = venueIds;
  }

  return new GigCandidateSchemaTestModel({
    source: {
      type: GigSourceType.User,
      userId: new Types.ObjectId('507f1f77bcf86cd799439088'),
      origin: { type: GigSourceUserOriginType.Admin },
    },
    gigDraft,
    version: 0,
    status: GigCandidateStatus.Reviewing,
  });
}

describe('GigCandidateSchema', () => {
  it('should preserve an omitted Venue assignment as undefined', async () => {
    const document = createGigCandidateDocument();

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.gigDraft.venueIds).toBeUndefined();
  });

  it('should reject an explicitly empty Venue assignment', async () => {
    const document = createGigCandidateDocument([]);

    await expect(document.validate()).rejects.toMatchObject(
      expect.objectContaining({
        errors: expect.objectContaining({
          'gigDraft.venueIds': expect.objectContaining({
            message: 'venueIds must contain unique Venue ObjectIds',
          }),
        }),
      }),
    );
  });
});
