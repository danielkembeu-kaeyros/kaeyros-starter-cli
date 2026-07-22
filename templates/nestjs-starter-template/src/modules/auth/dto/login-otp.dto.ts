import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OtpChannel } from '@prisma/client';

export class RequestLoginOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    enum: OtpChannel,
    required: false,
    description: 'EMAIL (default) or SMS. SMS requires a phone number on the profile.',
  })
  @IsOptional()
  @IsEnum(OtpChannel)
  channel?: OtpChannel;
}

export class VerifyLoginOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{4,10}$/, { message: 'OTP must be 4 to 10 digits' })
  code: string;
}
