import { IsOptional, IsDateString, IsUUID, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Base filter DTO with common filters for all entities
 * All fields are optional to allow flexible filtering
 */
export class BaseFiltersDto {
  // ==================== DATE FILTERS ====================

  @ApiPropertyOptional({
    description: 'Filter by exact date (YYYY-MM-DD)',
    example: '2025-01-15',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Filter by start date for date range (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by end date for date range (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  // ==================== USER FILTERS ====================

  @ApiPropertyOptional({
    description: 'Filter by user who created the entity',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Filter by user who last updated the entity',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  updatedBy?: string;

  // ==================== COMMON FILTERS ====================

  @ApiPropertyOptional({
    description: 'Search text (searches across relevant text fields)',
    example: 'search term',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Include soft-deleted records',
    example: false,
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by active/inactive status',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
