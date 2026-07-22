import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: '5-digit verification code',
    example: '12345',
    minLength: 5,
    maxLength: 5,
  })
  @IsString()
  @Length(5, 5, { message: 'Verification code must be exactly 5 digits' })
  @Matches(/^\d{5}$/, { message: 'Verification code must contain only digits' })
  code: string;
}

export class ResendVerificationDto {
  // No fields needed - will use authenticated user's email
}
