import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../validators/is-strong-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    example: 'CorrectHorseBatteryStaple!1',
    description: 'Min 10 chars, must include upper, lower, digit, and symbol',
  })
  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
