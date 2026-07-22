import { HttpException, HttpStatus } from '@nestjs/common';

export class UnauthorizedException extends HttpException {
  constructor(message: string = 'Unauthorized') {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message,
        error: 'Unauthorized',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class ForbiddenException extends HttpException {
  constructor(message: string = 'Forbidden') {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message,
        error: 'Forbidden',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class NotFoundException extends HttpException {
  constructor(message: string = 'Resource not found') {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message,
        error: 'Not Found',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ConflictException extends HttpException {
  constructor(message: string = 'Conflict') {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message,
        error: 'Conflict',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class BadRequestException extends HttpException {
  constructor(message: string = 'Bad Request', errors?: Record<string, string[]>) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        errorCode: 'BadRequest',
        ...(errors && { errors }),
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message: string = 'Internal Server Error') {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
        error: 'Internal Server Error',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(message: string = 'Unprocessable Entity') {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message,
        error: 'Unprocessable Entity',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class UnsupportedMediaTypeException extends HttpException {
  constructor(message: string = 'Unsupported Media Type') {
    super(
      {
        statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        message,
        error: 'Unsupported Media Type',
      },
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  }
}

export class PayloadTooLargeException extends HttpException {
  constructor(message: string = 'Payload Too Large') {
    super(
      {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message,
        error: 'Payload Too Large',
      },
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }
}
