import { PipeTransform, Injectable, ArgumentMetadata, Type } from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BadRequestException } from '../exceptions/custom-exceptions';

@Injectable()
export class ValidationPipe implements PipeTransform {
  async transform(value: unknown, { metatype }: ArgumentMetadata): Promise<unknown> {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // Transform with class-transformer decorators
    const object = plainToInstance(metatype, value, {
      enableImplicitConversion: false, // Be explicit about type conversion
      excludeExtraneousValues: false, // Allow all properties by default
      exposeDefaultValues: true,
    });

    // Validate with class-validator
    const errors = await validate(object, {
      whitelist: true, // strip undeclared properties from the validated DTO
      forbidNonWhitelisted: true, // reject the request when unknown fields are present
      skipMissingProperties: false, // validate every declared property
      validationError: { target: false, value: false }, // don't leak inputs in errors
    });

    if (errors.length > 0) {
      const formattedErrors = this.formatValidationErrors(errors);
      throw new BadRequestException('Validation failed', formattedErrors);
    }

    return object;
  }

  private toValidate(metatype: Type<unknown>): boolean {
    const types: Type<unknown>[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  /**
   * Format validation errors recursively to handle nested objects
   * Returns structured field-level errors: { field: [messages] }
   */
  private formatValidationErrors(
    errors: ValidationError[],
    parentPath = '',
  ): Record<string, string[]> {
    const formattedErrors: Record<string, string[]> = {};

    errors.forEach((error) => {
      const propertyPath = parentPath ? `${parentPath}.${error.property}` : error.property;

      // Handle constraint errors at current level
      if (error.constraints) {
        formattedErrors[propertyPath] = Object.values(error.constraints);
      }

      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const nestedErrors = this.formatValidationErrors(error.children, propertyPath);
        Object.assign(formattedErrors, nestedErrors);
      }
    });

    return formattedErrors;
  }
}
