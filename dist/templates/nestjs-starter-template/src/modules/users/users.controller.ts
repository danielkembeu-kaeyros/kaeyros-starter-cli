import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Authenticated } from '../../common/decorators/authenticated.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedPublicUsersDto, PublicUserDto } from './dto/public-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MessageResponseDto } from '../auth/dto/auth-response.dto';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ---------------------------------------------------------------------------
  // Self endpoints (any signed-in account)
  // ---------------------------------------------------------------------------

  @Authenticated()
  @Get('me')
  @ApiOperation({ summary: 'Get your own profile (works for users and admins alike)' })
  @ApiResponse({ status: 200, description: 'Your own profile.' })
  async getOwn(@CurrentUser('id') accountId: string) {
    return this.usersService.getOwnProfile(accountId);
  }

  @RequirePermissions('profile:update:own')
  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile fields' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async updateOwn(
    @CurrentUser('id') accountId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<MessageResponseDto> {
    await this.usersService.updateOwnProfile(accountId, dto);
    return { message: 'Profile updated.' };
  }

  // ---------------------------------------------------------------------------
  // Public directory (admin-readable; backed by the public_users view so
  // admins NEVER appear in this listing regardless of who is calling)
  // ---------------------------------------------------------------------------

  @RequirePermissions('accounts:read')
  @Get()
  @ApiOperation({ summary: 'List end-users (admins are excluded by the underlying view)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, type: PaginatedPublicUsersDto })
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ): Promise<PaginatedPublicUsersDto> {
    return this.usersService.listPublicUsers({ page, limit, search });
  }

  @RequirePermissions('accounts:read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a single end-user by id' })
  @ApiResponse({ status: 200, type: PublicUserDto })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getOne(@Param('id') id: string): Promise<PublicUserDto> {
    return this.usersService.findPublicUser(id);
  }
}
