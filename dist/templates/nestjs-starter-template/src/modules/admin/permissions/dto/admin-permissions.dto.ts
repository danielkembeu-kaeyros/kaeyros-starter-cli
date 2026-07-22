import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({ example: 'posts:read' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[a-z][a-z0-9]*(?::[a-z][a-z0-9]*)+$/, {
    message: 'Permission name must follow lowercase resource:action[:scope] format',
  })
  name: string;

  @ApiProperty({ example: 'posts' })
  @IsString()
  @MaxLength(64)
  resource: string;

  @ApiProperty({ example: 'read' })
  @IsString()
  @MaxLength(40)
  action: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;
}
