import { IsEmail, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendEmailDto {
  @ApiProperty({
    description: 'Recipient email address(es)',
    example: 'user@example.com',
  })
  @IsEmail({}, { each: true })
  to: string | string[];

  @ApiProperty({
    description: 'Email subject',
    example: 'Welcome to our platform',
  })
  @IsString()
  subject: string;

  @ApiProperty({
    description: 'Email HTML content',
    example: '<h1>Welcome!</h1><p>Thank you for joining us.</p>',
    required: false,
  })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiProperty({
    description: 'Email plain text content',
    example: 'Welcome! Thank you for joining us.',
    required: false,
  })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty({
    description: 'Template name to use',
    example: 'welcome',
    required: false,
  })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiProperty({
    description: 'Context data for template',
    example: { userName: 'John Doe', loginUrl: 'https://example.com/login' },
    required: false,
  })
  @IsOptional()
  context?: Record<string, unknown>;

  @ApiProperty({
    description: 'CC email addresses',
    example: ['cc@example.com'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiProperty({
    description: 'BCC email addresses',
    example: ['bcc@example.com'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @ApiProperty({
    description: 'Reply-to email address',
    example: 'support@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  replyTo?: string;
}
