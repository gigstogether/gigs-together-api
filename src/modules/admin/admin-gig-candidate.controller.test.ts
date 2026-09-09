import { PATH_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { User } from '../auth/types/user.types';
import { AccessJwtAuthGuard } from '../auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';
import { AdminGigCandidateController } from './admin-gig-candidate.controller';
import { AdminGigCandidateService } from './admin-gig-candidate.service';
import type { AdminGigCandidateDetails } from './admin-gig-candidate.types';
import type { GigApprovalResult } from '../gig-candidate/repositories/gig-candidate-approval.repository';

function buildGigCandidate(
  overrides: Partial<GigCandidate> = {},
): GigCandidate {
  return {
    id: '507f1f77bcf86cd799439099',
    source: {
      type: 'user',
      userId: '66a000000000000000000000042',
      origin: { type: 'admin' },
    },
    gigDraft: { title: 'Band' },
    version: 0,
    status: GigCandidateStatus.Reviewing,
    posts: [],
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    ...overrides,
  };
}

function buildDetails(
  overrides: Partial<AdminGigCandidateDetails> = {},
): AdminGigCandidateDetails {
  const gigCandidate = buildGigCandidate();
  return {
    id: gigCandidate.id,
    source:
      gigCandidate.source.type === 'user'
        ? { ...gigCandidate.source, isCurrentlyAdmin: true }
        : gigCandidate.source,
    gigDraft: gigCandidate.gigDraft,
    version: gigCandidate.version,
    status: gigCandidate.status,
    createdAt: gigCandidate.createdAt,
    updatedAt: gigCandidate.updatedAt,
    ...overrides,
  };
}

describe('AdminGigCandidateController', () => {
  let controller: AdminGigCandidateController;

  const gigCandidate = buildGigCandidate();
  const details = buildDetails();
  const user: User = {
    userId: '66a000000000000000000000042',
    tgUser: { id: 42, first_name: 'Admin' },
    isAdmin: true,
  };
  const gigApprovalResult: GigApprovalResult = {
    id: '507f1f77bcf86cd799439011',
    publicId: 'band-2026-09-20',
    title: 'Band',
    date: Date.UTC(2026, 8, 20),
    city: 'Barcelona',
    country: 'ES',
    venue: 'Venue',
    ticketsUrl: 'https://tickets.example/gig',
    source: {
      type: 'user',
      userId: user.userId,
      origin: { type: 'admin' },
    },
    version: 0,
    isVisible: true,
  };
  const gigCandidateService = {
    approveGigCandidate: vi.fn().mockResolvedValue(gigApprovalResult),
    createAdminGigCandidate: vi.fn().mockResolvedValue(gigCandidate),
    updateAdminGigCandidateDraft: vi.fn().mockResolvedValue(gigCandidate),
    rejectGigCandidate: vi.fn().mockResolvedValue(gigCandidate),
    sendGigCandidateToModeration: vi.fn().mockResolvedValue(gigCandidate),
    lookupGigCandidateDraft: vi.fn().mockResolvedValue({
      title: 'Band',
      date: '2026-09-20',
      city: 'Barcelona',
      country: 'ES',
      venue: 'Venue',
      ticketsUrl: 'https://tickets.example/gig',
    }),
  } satisfies Pick<
    GigCandidateService,
    | 'createAdminGigCandidate'
    | 'approveGigCandidate'
    | 'updateAdminGigCandidateDraft'
    | 'rejectGigCandidate'
    | 'sendGigCandidateToModeration'
    | 'lookupGigCandidateDraft'
  >;
  const adminGigCandidateService = {
    getList: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(details),
    resolveGigCandidate: vi.fn().mockResolvedValue(details),
  } satisfies Pick<
    AdminGigCandidateService,
    'getList' | 'getById' | 'resolveGigCandidate'
  >;
  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminGigCandidateController],
      providers: [
        { provide: GigCandidateService, useValue: gigCandidateService },
        {
          provide: AdminGigCandidateService,
          useValue: adminGigCandidateService,
        },
      ],
    })
      .overrideGuard(AccessJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminGigCandidateController);
  });

  it('should preserve the plural admin GigCandidate resource path', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AdminGigCandidateController),
    ).toBe('admin/gig-candidates');
  });

  it('should return mapped GigCandidates from the query service', async () => {
    await expect(
      controller.getGigCandidates({ status: 'new', limit: 20 }),
    ).resolves.toEqual({ gigCandidates: [] });
    expect(adminGigCandidateService.getList).toHaveBeenCalledWith({
      status: GigCandidateStatus.New,
      limit: 20,
      sortBy: undefined,
      sortOrder: undefined,
    });
  });

  it('should return a mapped GigCandidate by id', async () => {
    await expect(controller.getGigCandidateById(details.id)).resolves.toEqual(
      expect.objectContaining({ id: details.id }),
    );
    expect(adminGigCandidateService.getById).toHaveBeenCalledWith(details.id);
  });

  it('should create and resolve an admin GigCandidate', async () => {
    await controller.createGigCandidate(undefined, user, {
      gigDraft: { title: ' Band ', date: '2026-09-20' },
    });

    expect(gigCandidateService.createAdminGigCandidate).toHaveBeenCalledWith({
      userId: user.userId,
      gigDraft: {
        title: 'Band',
        date: Date.parse('2026-09-20T00:00:00.000Z'),
      },
      posterUrl: undefined,
      posterFile: undefined,
    });
    expect(adminGigCandidateService.resolveGigCandidate).toHaveBeenCalledWith(
      gigCandidate,
    );
  });

  it('should update the GigCandidate draft at the expected version', async () => {
    await controller.updateGigCandidateDraft(details.id, undefined, {
      expectedVersion: 0,
      gigDraft: { title: 'Updated' },
    });

    expect(
      gigCandidateService.updateAdminGigCandidateDraft,
    ).toHaveBeenCalledWith({
      gigCandidateId: details.id,
      expectedVersion: 0,
      gigDraft: { title: 'Updated' },
      posterUrl: undefined,
      posterFile: undefined,
    });
  });

  it('should reject with the authenticated internal user id', async () => {
    await controller.rejectGigCandidate(details.id, user, {
      expectedVersion: 0,
    });

    expect(gigCandidateService.rejectGigCandidate).toHaveBeenCalledWith({
      gigCandidateId: details.id,
      expectedVersion: 0,
      rejectedByUserId: user.userId,
    });
  });

  it('should approve with the expected version and authenticated internal user id', async () => {
    await controller.approveGigCandidate(details.id, user, {
      expectedVersion: 0,
    });

    expect(gigCandidateService.approveGigCandidate).toHaveBeenCalledWith({
      gigCandidateId: details.id,
      expectedVersion: 0,
      approvedByUserId: user.userId,
    });
    expect(adminGigCandidateService.getById).toHaveBeenCalledWith(details.id);
  });

  it('should send GigCandidate to moderation at the expected version', async () => {
    await controller.sendGigCandidateToModeration(details.id, {
      expectedVersion: 0,
    });

    expect(
      gigCandidateService.sendGigCandidateToModeration,
    ).toHaveBeenCalledWith({
      gigCandidateId: details.id,
      expectedVersion: 0,
    });
  });

  it('should return a side-effect-free lookup response', async () => {
    await expect(
      controller.lookupGigCandidateDraft({
        title: 'Band',
        location: 'Barcelona, ES',
      }),
    ).resolves.toEqual({
      gigDraft: expect.objectContaining({ title: 'Band' }),
    });
    expect(gigCandidateService.lookupGigCandidateDraft).toHaveBeenCalledWith({
      title: 'Band',
      location: 'Barcelona, ES',
    });
  });
});
