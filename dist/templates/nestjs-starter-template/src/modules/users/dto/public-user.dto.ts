import { ApiProperty } from '@nestjs/swagger';

export class PublicUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  firstName?: string | null;

  @ApiProperty({ required: false })
  lastName?: string | null;

  @ApiProperty({ required: false })
  avatar?: string | null;

  @ApiProperty({ required: false })
  bio?: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedPublicUsersDto {
  @ApiProperty({ type: [PublicUserDto] })
  data: PublicUserDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
