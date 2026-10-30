import { Types } from 'mongoose';
import { Messenger } from '@shared/types/messenger.enum';
import { PostType } from '@shared/types/post-type.enum';
import { GigSourceType } from '../../../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../../../gig/types/gig-source-user-origin-type.enum';
import { GigCandidateApprovalRepositoryMapper } from './gig-candidate-approval.repository.mapper';
import type { GigApprovalResultLeanDocument } from './gig-candidate-approval.repository.mapper';

const completeGigDraft = {
  title: 'Radiohead',
  date: Date.UTC(2026, 5, 12),
  city: 'Barcelona',
  country: 'ES',
  venue: 'Palau Sant Jordi',
  ticketsUrl: 'https://tickets.example/radiohead',
};

describe('GigCandidateApprovalRepositoryMapper', () => {
  describe('assertApprovedStateIsValid', () => {
    it('should accept a complete approved state', () => {
      expect(() =>
        GigCandidateApprovalRepositoryMapper.assertApprovedStateIsValid({
          id: '507f1f77bcf86cd799439099',
          gigDraft: completeGigDraft,
          gigId: '507f1f77bcf86cd799439011',
          approvedAt: new Date('2026-05-01T00:00:00.000Z'),
          approvedByUserId: '507f1f77bcf86cd799439012',
          hasRejectionAudit: false,
        }),
      ).not.toThrow();
    });

    it('should reject an incomplete approved state', () => {
      expect(() =>
        GigCandidateApprovalRepositoryMapper.assertApprovedStateIsValid({
          id: '507f1f77bcf86cd799439099',
          gigDraft: { title: 'Radiohead' },
          gigId: '507f1f77bcf86cd799439011',
          approvedAt: new Date('2026-05-01T00:00:00.000Z'),
          approvedByUserId: '507f1f77bcf86cd799439012',
          hasRejectionAudit: false,
        }),
      ).toThrowError(/Approved gigDraft is missing/);
    });
  });

  describe('toGigCreationData', () => {
    it('should map approval data to Gig persistence data', () => {
      const data = GigCandidateApprovalRepositoryMapper.toGigCreationData({
        gigId: '507f1f77bcf86cd799439011',
        publicId: 'radiohead-2026-06-12',
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        endDate: Date.UTC(2026, 5, 13),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        poster: { bucketPath: 'posters/radiohead.jpg' },
        source: {
          type: GigSourceType.User,
          userId: '507f1f77bcf86cd799439012',
          origin: { type: GigSourceUserOriginType.Admin },
        },
        moderationPost: {
          to: Messenger.Telegram,
          type: PostType.Moderation,
          chatId: 123,
          id: 456,
          fileId: 'poster-file-id',
          date: Date.UTC(2026, 4, 1),
        },
      });

      expect(data).toEqual({
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        publicId: 'radiohead-2026-06-12',
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        endDate: Date.UTC(2026, 5, 13),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        poster: { bucketPath: 'posters/radiohead.jpg' },
        source: {
          type: GigSourceType.User,
          userId: new Types.ObjectId('507f1f77bcf86cd799439012'),
          origin: { type: GigSourceUserOriginType.Admin },
        },
        version: 0,
        isVisible: true,
        posts: [
          {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: 123,
            id: 456,
            fileId: 'poster-file-id',
            date: Date.UTC(2026, 4, 1),
          },
        ],
      });
    });
  });

  describe('toGigApprovalResult', () => {
    it('should map a stored Gig to the approval result', () => {
      const document: GigApprovalResultLeanDocument = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        publicId: 'radiohead-2026-06-12',
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        endDate: Date.UTC(2026, 5, 13),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        poster: { bucketPath: 'posters/radiohead.jpg' },
        source: {
          type: 'user',
          userId: new Types.ObjectId('507f1f77bcf86cd799439012'),
          origin: { type: GigSourceUserOriginType.Admin },
        },
        version: 0,
        isVisible: true,
      };

      const result =
        GigCandidateApprovalRepositoryMapper.toGigApprovalResult(document);

      expect(result).toEqual({
        id: '507f1f77bcf86cd799439011',
        publicId: 'radiohead-2026-06-12',
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        endDate: Date.UTC(2026, 5, 13),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        poster: { bucketPath: 'posters/radiohead.jpg' },
        source: {
          type: 'user',
          userId: '507f1f77bcf86cd799439012',
          origin: { type: GigSourceUserOriginType.Admin },
        },
        version: 0,
        isVisible: true,
      });
    });
  });
});
