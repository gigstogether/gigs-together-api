import type {
  Community,
  CommunityData,
} from '@modules/community/types/community.types';
import type { UpdateCommunityParams } from '@modules/community/community.service';
import type {
  V1AdminCommunityCreateBodyDto,
  V1AdminCommunityPatchBodyDto,
} from './types/requests/v1-admin-community-request';
import type { V1AdminCommunityResponseBody } from './types/requests/v1-admin-community-response';

export function mapV1AdminCommunityCreateRequest(
  body: V1AdminCommunityCreateBodyDto,
): CommunityData {
  return {
    countryIso: body.countryIso,
    slug: body.slug,
    nameTranslationKey: body.nameTranslationKey,
    timeZone: body.timeZone,
    isActive: body.isActive,
  };
}

export function mapV1AdminCommunityUpdateRequest(
  id: string,
  body: V1AdminCommunityPatchBodyDto,
): UpdateCommunityParams {
  const params: UpdateCommunityParams = { id };
  if (body.countryIso !== undefined) params.countryIso = body.countryIso;
  if (body.slug !== undefined) params.slug = body.slug;
  if (body.nameTranslationKey !== undefined)
    params.nameTranslationKey = body.nameTranslationKey;
  if (body.timeZone !== undefined) params.timeZone = body.timeZone;
  if (body.isActive !== undefined) params.isActive = body.isActive;
  return params;
}

export function mapV1AdminCommunityResponse(
  community: Community,
): V1AdminCommunityResponseBody {
  return {
    id: community.id,
    countryIso: community.countryIso,
    slug: community.slug,
    nameTranslationKey: community.nameTranslationKey,
    timeZone: community.timeZone,
    isActive: community.isActive,
  };
}
