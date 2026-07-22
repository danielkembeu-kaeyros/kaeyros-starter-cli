import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccountKind, LoginMethod } from '@prisma/client';

export class CreateAccountDto {
  @ApiProperty({ example: 'jane.admin@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ enum: AccountKind })
  @IsEnum(AccountKind)
  kind: AccountKind;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiProperty({ required: false, type: [String], description: 'Role ids to grant' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  roleIds?: string[];

  @ApiProperty({
    enum: LoginMethod,
    required: false,
    description: 'PASSWORD (default), OTP, or BOTH. OTP-only accounts get no temp password.',
  })
  @IsOptional()
  @IsEnum(LoginMethod)
  loginMethod?: LoginMethod;
}

export class UpdateAccountDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ enum: LoginMethod, required: false })
  @IsOptional()
  @IsEnum(LoginMethod)
  loginMethod?: LoginMethod;
}

export class SetAccountRolesDto {
  @ApiProperty({ type: [String], description: 'Replace the account roles with this set' })
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(0)
  @IsUUID('all', { each: true })
  roleIds: string[];
}
