import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Get the current language from the request
 * Can be used in controllers to access the current language
 *
 * @example
 * @Get()
 * async findAll(@I18nLang() lang: string) {
 *   // lang will be 'en', 'fr', etc.
 * }
 */
export const I18nLang = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.i18nLang || 'en';
});
