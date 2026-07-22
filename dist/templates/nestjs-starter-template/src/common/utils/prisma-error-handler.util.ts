import { Prisma } from '@prisma/client';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '../exceptions/custom-exceptions';

/**
 * Handle Prisma errors and convert them to appropriate HTTP exceptions
 */
export function handlePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        const field = error.meta?.target as string[];
        throw new ConflictException(`A record with this ${field?.join(', ')} already exists`);
      case 'P2025':
        // Record not found
        throw new NotFoundException('Record not found');
      case 'P2003':
        // Foreign key constraint violation
        throw new BadRequestException('Cannot perform this operation due to related records');
      case 'P2014':
        // Relation violation
        throw new BadRequestException('Invalid relation in the request');
      default:
        throw new InternalServerErrorException(`Database error: ${error.message}`);
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    throw new BadRequestException('Invalid data provided');
  }

  throw new InternalServerErrorException('An unexpected error occurred');
}
