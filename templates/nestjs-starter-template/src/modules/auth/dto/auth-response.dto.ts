import { ApiProperty } from '@nestjs/swagger';
import { AccountKind } from '@prisma/client';

export class AuthenticatedUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: AccountKind })
  kind: AccountKind;

  @ApiProperty()
  isEmailVerified: boolean;

  @ApiProperty()
  mustChangePassword: boolean;

  @ApiProperty({ type: [String] })
  roles: string[];

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty({ required: false })
  firstName?: string;

  @ApiProperty({ required: false })
  lastName?: string;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ type: AuthenticatedUserDto })
  user: AuthenticatedUserDto;
}

export class RefreshResponseDto {
  @ApiProperty({ description: 'New JWT access token' })
  accessToken: string;
}

export class MessageResponseDto {
  @ApiProperty()
  message: string;
}
