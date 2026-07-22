import { Prisma } from '@prisma/client';
import { handlePrismaError } from '../prisma-error-handler.util';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '../../exceptions/custom-exceptions';

function knownError(
  code: string,
  message = 'prisma error',
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('handlePrismaError', () => {
  it('always throws (never returns)', () => {
    expect(() => handlePrismaError(new Error('x'))).toThrow();
  });

  describe('PrismaClientKnownRequestError mapping', () => {
    it('maps P2002 (unique constraint) to ConflictException including the field', () => {
      try {
        handlePrismaError(knownError('P2002', 'unique', { target: ['email'] }));
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).message).toContain('email');
      }
    });

    it('maps P2025 to NotFoundException', () => {
      expect(() => handlePrismaError(knownError('P2025'))).toThrow(NotFoundException);
    });

    it('maps P2003 (foreign key) to BadRequestException', () => {
      expect(() => handlePrismaError(knownError('P2003'))).toThrow(BadRequestException);
    });

    it('maps P2014 (relation violation) to BadRequestException', () => {
      expect(() => handlePrismaError(knownError('P2014'))).toThrow(BadRequestException);
    });

    it('maps an unknown Prisma code to InternalServerErrorException with the message', () => {
      try {
        handlePrismaError(knownError('P9999', 'boom'));
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(InternalServerErrorException);
        expect((err as InternalServerErrorException).message).toContain('boom');
      }
    });
  });

  describe('PrismaClientValidationError', () => {
    it('maps to BadRequestException', () => {
      const err = new Prisma.PrismaClientValidationError('bad', {
        clientVersion: 'test',
      });
      expect(() => handlePrismaError(err)).toThrow(BadRequestException);
    });
  });

  describe('default / passthrough case', () => {
    it('maps a generic Error to InternalServerErrorException', () => {
      try {
        handlePrismaError(new Error('something'));
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(InternalServerErrorException);
        expect((err as InternalServerErrorException).message).toContain('unexpected error');
      }
    });

    it('maps a non-error value to InternalServerErrorException', () => {
      expect(() => handlePrismaError('plain string')).toThrow(InternalServerErrorException);
    });
  });
});
