import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailByCodeDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456', description: 'Verification code from the email' })
  @IsString()
  @Matches(/^\d{4,10}$/, { message: 'Verification code must be 4 to 10 digits' })
  code: string;
}

export class VerifyEmailByLinkDto {
  @ApiProperty({ description: 'Opaque token from the email link' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
