import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Authenticated } from '../../common/decorators/authenticated.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/authz/types';
import { AllowedWhilePasswordChange } from './decorators/allowed-while-password-change.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  ResendVerificationDto,
  VerifyEmailByCodeDto,
  VerifyEmailByLinkDto,
} from './dto/verify-email.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestLoginOtpDto, VerifyLoginOtpDto } from './dto/login-otp.dto';
import { OtpChannel } from '@prisma/client';
import {
  AuthenticatedUserDto,
  LoginResponseDto,
  MessageResponseDto,
  RefreshResponseDto,
} from './dto/auth-response.dto';
import { BadRequestException } from '../../common/exceptions/custom-exceptions';

const REFRESH_COOKIE = 'refreshToken';

@ApiTags('Authentication')
@Controller('auth')
// Stricter rate limit on the whole auth surface — login, register, reset
// and verification are the brute-force / enumeration / spam surface.
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ---------------------------------------------------------------------------
  // Public endpoints
  // ---------------------------------------------------------------------------

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async login(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { accessToken, refreshToken, refreshExpiresAt } =
      await this.authService.issueTokensForLogin(user, this.context(req));
    this.setRefreshCookie(res, refreshToken, refreshExpiresAt);
    return { accessToken, user: this.projectUser(user) };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new end-user account' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<MessageResponseDto> {
    await this.authService.register(dto, this.context(req));
    return { message: 'Account created. Check your inbox to verify your email.' };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and return a new access token' })
  @ApiResponse({ status: 200, type: RefreshResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponseDto> {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const raw = cookies?.[REFRESH_COOKIE];
    if (!raw) throw new BadRequestException('Refresh cookie missing');
    const { accessToken, refreshToken, refreshExpiresAt } = await this.authService.refreshTokens(
      raw,
      this.context(req),
    );
    this.setRefreshCookie(res, refreshToken, refreshExpiresAt);
    return { accessToken };
  }

  @Public()
  @Post('verify-email/code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email by entering the 6-digit code' })
  @ApiBody({ type: VerifyEmailByCodeDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async verifyByCode(@Body() dto: VerifyEmailByCodeDto): Promise<MessageResponseDto> {
    await this.authService.verifyEmailByCode(dto.email, dto.code);
    return { message: 'Email verified. You can now log in.' };
  }

  @Public()
  @Post('verify-email/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email by submitting the link token' })
  @ApiBody({ type: VerifyEmailByLinkDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async verifyByLinkPost(@Body() dto: VerifyEmailByLinkDto): Promise<MessageResponseDto> {
    await this.authService.verifyEmailByLink(dto.token);
    return { message: 'Email verified. You can now log in.' };
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email via the link in the email (GET shortcut)' })
  @ApiQuery({
    name: 'token',
    required: true,
    type: String,
    description: 'Verification token from the email link',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async verifyByLinkGet(@Query('token') token: string): Promise<MessageResponseDto> {
    if (!token) throw new BadRequestException('token query parameter is required');
    await this.authService.verifyEmailByLink(token);
    return { message: 'Email verified. You can now log in.' };
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend a verification email (silent — always 200)' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<MessageResponseDto> {
    await this.authService.resendVerification(dto.email);
    return { message: 'If the email exists and is not yet verified, a new code has been sent.' };
  }

  @Public()
  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password-reset link (silent — always 200)' })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<MessageResponseDto> {
    await this.authService.requestPasswordReset(dto.email);
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a password reset using the emailed token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password updated. Please log in with the new password.' };
  }

  @Public()
  @Post('login/request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a one-time sign-in code (silent — always 200)',
    description:
      'Triggers an OTP via the requested channel for accounts whose ' +
      'loginMethod is OTP or BOTH. Always returns 200 to avoid email enumeration.',
  })
  @ApiBody({ type: RequestLoginOtpDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async requestLoginOtp(
    @Body() dto: RequestLoginOtpDto,
    @Req() req: Request,
  ): Promise<MessageResponseDto> {
    await this.authService.requestLoginOtp(
      dto.email,
      dto.channel ?? OtpChannel.EMAIL,
      this.context(req),
    );
    return {
      message: 'If the email is eligible for OTP sign-in, a code has been sent.',
    };
  }

  @Public()
  @Post('login/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange an OTP for access + refresh tokens' })
  @ApiBody({ type: VerifyLoginOtpDto })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async verifyLoginOtp(
    @Body() dto: VerifyLoginOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const user = await this.authService.verifyLoginOtp(dto.email, dto.code, this.context(req));
    const { accessToken, refreshToken, refreshExpiresAt } =
      await this.authService.issueTokensForLogin(user, this.context(req));
    this.setRefreshCookie(res, refreshToken, refreshExpiresAt);
    return { accessToken, user: this.projectUser(user) };
  }

  // ---------------------------------------------------------------------------
  // Authenticated endpoints
  // ---------------------------------------------------------------------------

  @Authenticated()
  @AllowedWhilePasswordChange()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the refresh token and clear the cookie' })
  @ApiBearerAuth('JWT')
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    await this.authService.logout(cookies?.[REFRESH_COOKIE], user);
    res.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
    return { message: 'Logged out.' };
  }

  @Authenticated()
  @Get('me')
  @ApiOperation({ summary: 'Return the current authenticated user' })
  @ApiBearerAuth('JWT')
  @ApiResponse({ status: 200, type: AuthenticatedUserDto })
  async me(@CurrentUser() user: RequestUser): Promise<AuthenticatedUserDto> {
    return this.projectUser(user);
  }

  @Authenticated()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change your password (current password required)' })
  @ApiBearerAuth('JWT')
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async changePassword(
    @CurrentUser('id') accountId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    await this.authService.changePassword(accountId, dto.currentPassword, dto.newPassword);
    return { message: 'Password updated. Please log in again.' };
  }

  @Authenticated()
  @AllowedWhilePasswordChange()
  @Post('change-initial-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete the admin first-sign-in password change',
    description: 'Only callable while the account has mustChangePassword=true.',
  })
  @ApiBearerAuth('JWT')
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async changeInitialPassword(
    @CurrentUser('id') accountId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    await this.authService.changeInitialPassword(accountId, dto.currentPassword, dto.newPassword);
    return { message: 'Initial password changed. Please log in again.' };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private projectUser(user: RequestUser): AuthenticatedUserDto {
    return {
      id: user.id,
      email: user.email,
      kind: user.kind,
      isEmailVerified: user.isEmailVerified,
      mustChangePassword: user.mustChangePassword,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  private context(req: Request): { ipAddress?: string; userAgent?: string } {
    return {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.refreshCookieOptions(),
      expires: expiresAt,
    });
  }

  private refreshCookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    };
  }
}
