import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { CommunityService } from '@modules/community/community.service';
import { AdminCommunityService } from './admin-community.service';
import {
  mapV1AdminCommunityCreateRequest,
  mapV1AdminCommunityResponse,
  mapV1AdminCommunityUpdateRequest,
} from './admin-community.mapper';
import {
  V1AdminCommunityCreateBodyDto,
  V1AdminCommunityIdParamsDto,
  V1AdminCommunityPatchBodyDto,
} from './types/requests/v1-admin-community-request';
import type {
  V1AdminCommunitiesListResponseBody,
  V1AdminCommunityResponseBody,
} from './types/requests/v1-admin-community-response';

@Controller('admin/communities')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminCommunityController {
  constructor(
    private readonly communityService: CommunityService,
    private readonly adminCommunityService: AdminCommunityService,
  ) {}

  @Version('1')
  @Get()
  async getCommunitiesV1(): Promise<V1AdminCommunitiesListResponseBody> {
    const communities = await this.communityService.findAll();
    return { communities: communities.map(mapV1AdminCommunityResponse) };
  }

  @Version('1')
  @Get(':id')
  async getCommunityV1(
    @Param() params: V1AdminCommunityIdParamsDto,
  ): Promise<V1AdminCommunityResponseBody> {
    return mapV1AdminCommunityResponse(
      await this.communityService.getById(params.id),
    );
  }

  @Version('1')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCommunityV1(
    @Body() body: V1AdminCommunityCreateBodyDto,
  ): Promise<V1AdminCommunityResponseBody> {
    const community = await this.adminCommunityService.createCommunity(
      mapV1AdminCommunityCreateRequest(body),
    );
    return mapV1AdminCommunityResponse(community);
  }

  @Version('1')
  @Patch(':id')
  async updateCommunityV1(
    @Param() params: V1AdminCommunityIdParamsDto,
    @Body() body: V1AdminCommunityPatchBodyDto,
  ): Promise<V1AdminCommunityResponseBody> {
    const community = await this.adminCommunityService.updateCommunity(
      mapV1AdminCommunityUpdateRequest(params.id, body),
    );
    return mapV1AdminCommunityResponse(community);
  }
}
