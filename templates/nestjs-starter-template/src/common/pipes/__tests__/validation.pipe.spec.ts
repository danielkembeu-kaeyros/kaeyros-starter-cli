import { ArgumentMetadata } from '@nestjs/common';
import { ValidationPipe } from '../validation.pipe';
import { BadRequestException } from '../../../common/exceptions/custom-exceptions';
import { IsString, IsNumber, MinLength, MaxLength } from 'class-validator';

// Test DTO class
class TestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(10)
  name: string;

  @IsNumber()
  age: number;
}

describe('ValidationPipe', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  it('should return value if metatype is not provided', async () => {
    const value = 'test value';
    const metadata = { metatype: undefined } as ArgumentMetadata;

    const result = await pipe.transform(value, metadata);

    expect(result).toBe(value);
  });

  it('should return value if metatype is a native type', async () => {
    const value = 'test value';
    const metadata = { metatype: String } as ArgumentMetadata;

    const result = await pipe.transform(value, metadata);

    expect(result).toBe(value);
  });

  it('should transform and validate a valid object', async () => {
    const value = { name: 'John', age: 25 };
    const metadata = { metatype: TestDto } as ArgumentMetadata;

    const result = await pipe.transform(value, metadata);

    expect(result).toBeInstanceOf(TestDto);
    expect(result).toEqual({ name: 'John', age: 25 });
  });

  it('should throw BadRequestException for invalid data', async () => {
    const value = { name: 'Jo', age: 25 }; // name too short
    const metadata = { metatype: TestDto } as ArgumentMetadata;

    await expect(pipe.transform(value, metadata)).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException with formatted errors for validation failures', async () => {
    const value = { name: 'Jo', age: 'invalid' }; // both fields invalid
    const metadata = { metatype: TestDto } as ArgumentMetadata;

    try {
      await pipe.transform(value, metadata);
      fail('Should have thrown BadRequestException');
    } catch (error: any) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = error.getResponse();
      expect(response.message).toBe('Validation failed');
      expect(response.errors).toBeDefined();
      expect(response.errors.name).toBeDefined();
      expect(response.errors.name.join(' ')).toContain('must be longer than or equal to 3 characters');
      expect(response.errors.age).toBeDefined();
      expect(response.errors.age.join(' ')).toContain('must be a number');
    }
  });

  it('should transform and validate simple objects', async () => {
    const value = { name: 'Test', age: 30 };
    const metadata = { metatype: TestDto } as ArgumentMetadata;

    const result: any = await pipe.transform(value, metadata);

    expect(result).toBeInstanceOf(TestDto);
    expect(result.name).toBe('Test');
    expect(result.age).toBe(30);
  });
});
