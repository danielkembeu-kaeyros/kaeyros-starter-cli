import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  AccountKind,
  AuditAction,
  AuditStatus,
  LoginMethod,
  OtpChannel,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { LoggerService } from '../../common/logging/logger.service';
import { AuditService } from '../audit/audit.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms.types';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '../../common/exceptions/custom-exceptions';
import { JwtPayload, RequestUser } from '../../common/authz/types';
import {
  DUMMY_BCRYPT_HASH,
  generateLinkToken,
  generateVerificationCode,
  hashToken,
} from './utils/token.utils';
import { RegisterDto } from './dto/register.dto';

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  // -------------------------------------------------------------------------
  // Login & session
  // -------------------------------------------------------------------------

  /**
   * Used by LocalStrategy on POST /auth/login.
   * Returns the RequestUser on success, or null on any failure.
   *
   * Enumeration parity: we always run bcrypt.compare (against a dummy hash
   * when the account doesn't exist), so timing doesn't disclose existence.
   * Disabled and unverified accounts also return null, but only AFTER the
   * password matches — at that point the email is known to be valid anyway.
   */
  async validateForLogin(email: string, password: string): Promise<RequestUser | null> {
    const account = await this.prisma.account.findFirst({
      where: { email, deletedAt: null },
    });

    const hash = account?.password ?? DUMMY_BCRYPT_HASH;
    const ok = await bcrypt.compare(password, hash);

    if (!account || !ok) {
      if (account) {
        await this.recordFailedLoginAttempt(account.id);
        await this.auditService.log({
          action: AuditAction.LOGIN_FAILED,
          actorAccountId: account.id,
          actorEmail: account.email,
          status: AuditStatus.FAILURE,
          metadata: { reason: 'bad_credentials' },
        });
      } else {
        await this.auditService.log({
          action: AuditAction.LOGIN_FAILED,
          actorEmail: email,
          status: AuditStatus.FAILURE,
          metadata: { reason: 'unknown_email' },
        });
      }
      return null;
    }

    if (account.lockedUntil && account.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked, try again later');
    }

    if (!account.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    if (!account.isEmailVerified) {
      // Hard gate at login; clear, actionable error for the frontend.
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    if (account.loginMethod === LoginMethod.OTP) {
      // The password matched, but this account only accepts OTP login.
      // Revealing this is acceptable: the caller already proved they
      // know the password (the hard part).
      throw new UnauthorizedException(
        'This account uses one-time codes. Request a code at /auth/login/request-otp.',
      );
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });

    return this.assembleRequestUser(account.id);
  }

  // -------------------------------------------------------------------------
  // OTP login
  // -------------------------------------------------------------------------

  /**
   * Public, silent endpoint. Always returns void regardless of outcome.
   * Generates a 6-digit OTP, persists a hashed-into-row entry, and
   * dispatches via the requested channel.
   *
   * Refuses silently for accounts that aren't OTP-eligible (no PASSWORD-only
   * account can be probed for OTP existence).
   */
  async requestLoginOtp(email: string, channel: OtpChannel, ctx: RequestContext): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: { email, deletedAt: null },
      include: { profile: true },
    });

    if (!account || !account.isActive || !account.isEmailVerified) return;
    if (account.lockedUntil && account.lockedUntil > new Date()) return;
    if (account.loginMethod === LoginMethod.PASSWORD) return;

    if (channel === OtpChannel.SMS && !account.profile?.phone) {
      // Caller asked for SMS but the account has no phone; silent miss.
      this.logger.warn(
        `OTP requested via SMS for account without phone: ${account.id}`,
        'AuthService',
      );
      return;
    }

    await this.prisma.loginOtp.updateMany({
      where: { accountId: account.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const codeLength = this.configService.get<number>('security.verificationCodeLength', 6);
    const ttlMinutes = this.configService.get<number>('security.loginOtpTtlMinutes', 5);
    const code = generateVerificationCode(codeLength);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.prisma.loginOtp.create({
      data: {
        accountId: account.id,
        code,
        channel,
        expiresAt,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });

    if (channel === OtpChannel.EMAIL) {
      const result = await this.emailService.sendLoginOtpEmail(
        account.email,
        code,
        ttlMinutes,
        account.profile?.firstName ?? undefined,
      );
      if (!result.success) {
        this.logger.error(
          `Failed to send login OTP email to ${account.email}`,
          undefined,
          'AuthService',
        );
      }
    } else {
      try {
        await this.smsProvider.send({
          to: account.profile!.phone!,
          body: `Your sign-in code is ${code}. It expires in ${ttlMinutes} minutes.`,
        });
      } catch (e) {
        this.logger.error(
          `Failed to send login OTP via SMS to account ${account.id}`,
          e instanceof Error ? e.stack : undefined,
          'AuthService',
        );
      }
    }
  }

  async verifyLoginOtp(email: string, code: string, ctx: RequestContext): Promise<RequestUser> {
    const account = await this.prisma.account.findFirst({
      where: { email, deletedAt: null },
    });
    if (!account || !account.isActive || account.loginMethod === LoginMethod.PASSWORD) {
      await this.auditService.log({
        action: AuditAction.LOGIN_FAILED,
        actorEmail: email,
        status: AuditStatus.FAILURE,
        metadata: { method: 'OTP', reason: 'no_eligible_account' },
      });
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (account.lockedUntil && account.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked, try again later');
    }

    const otp = await this.prisma.loginOtp.findFirst({
      where: { accountId: account.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.expiresAt <= new Date()) {
      await this.auditService.log({
        action: AuditAction.LOGIN_FAILED,
        actorAccountId: account.id,
        actorEmail: account.email,
        status: AuditStatus.FAILURE,
        metadata: { method: 'OTP', reason: 'no_active_code' },
      });
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (otp.attempts >= 5) {
      await this.prisma.loginOtp.update({
        where: { id: otp.id },
        data: { usedAt: new Date() },
      });
      throw new UnauthorizedException('Too many attempts; request a new code');
    }

    if (otp.code !== code) {
      await this.prisma.loginOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      await this.recordFailedLoginAttempt(account.id);
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.prisma.$transaction([
      this.prisma.loginOtp.update({
        where: { id: otp.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.account.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      }),
    ]);

    void ctx;
    return (await this.assembleRequestUser(account.id))!;
  }

  /**
   * Used by JwtStrategy.validate. Loads the account + RBAC graph fresh on
   * every request so revoked grants take effect immediately.
   */
  async resolveAuthenticatedUser(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.assembleRequestUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Account no longer valid');
    }
    return user;
  }

  /**
   * Called by the controller AFTER LocalAuthGuard has populated request.user
   * with the LocalStrategy result. Issues an access token + refresh token
   * and persists the refresh hash.
   */
  async issueTokensForLogin(user: RequestUser, ctx: RequestContext): Promise<TokenPair> {
    const pair = await this.issueTokens(user, ctx);
    this.logger.log(`Login: ${user.email}`, 'AuthService');
    await this.auditService.log({
      action: AuditAction.LOGIN,
      actorAccountId: user.id,
      actorEmail: user.email,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return pair;
  }

  /**
   * Atomic refresh-token rotation. The whole flow runs inside one
   * transaction so a partial failure cannot revoke without re-issuing.
   *
   * Reuse detection: if a presented token was already revoked AND has a
   * replacement chain, treat it as theft and revoke every other active
   * refresh token for that account.
   */
  async refreshTokens(rawRefreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // The DB stores sha256 of the opaque token carried in the JWT's `jti`,
    // not of the signed envelope — hash the jti to find the row.
    const tokenHash = hashToken(payload.jti);

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.findUnique({ where: { tokenHash } });

      if (!record) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const now = new Date();
      const isExpired = record.expiresAt <= now;
      const isRevoked = record.revokedAt !== null;

      if (isRevoked && record.replacedById) {
        // Reuse of a rotated token — likely theft. Revoke everything still
        // active on this account.
        await tx.refreshToken.updateMany({
          where: { accountId: record.accountId, revokedAt: null },
          data: { revokedAt: now },
        });
        this.logger.warn(
          `Refresh-token reuse detected for account ${record.accountId}; all sessions revoked`,
          'AuthService',
        );
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      if (isRevoked || isExpired || record.accountId !== payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const account = await tx.account.findFirst({
        where: { id: record.accountId, deletedAt: null },
      });
      if (!account || !account.isActive) {
        throw new UnauthorizedException('Account no longer active');
      }

      const newRaw = generateLinkToken();
      const newHash = hashToken(newRaw);
      const newExpiresAt = this.refreshExpiry();

      const inserted = await tx.refreshToken.create({
        data: {
          accountId: account.id,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      });

      await tx.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: now, replacedById: inserted.id },
      });

      const user = await this.assembleRequestUser(account.id, tx);
      const accessToken = this.signAccessToken(user!);
      const refreshToken = this.signRefreshToken(account.id, newRaw);

      return { accessToken, refreshToken, refreshExpiresAt: newExpiresAt };
    });
  }

  /**
   * Revoke the presented refresh token. Idempotent — unknown / already
   * revoked tokens silently succeed.
   */
  async logout(rawRefreshToken: string | undefined, actor?: RequestUser): Promise<void> {
    if (!rawRefreshToken) return;
    // The cookie carries the signed JWT; the DB row is keyed by sha256 of the
    // opaque token in its `jti`. Decode to recover the jti, tolerating a
    // malformed/expired token (logout is idempotent).
    let jti: string | undefined;
    try {
      const payload = this.jwtService.verify<{ jti: string }>(rawRefreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
      jti = payload.jti;
    } catch {
      jti = undefined;
    }
    if (jti) {
      const tokenHash = hashToken(jti);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (actor) {
      await this.auditService.log({
        action: AuditAction.LOGOUT,
        actorAccountId: actor.id,
        actorEmail: actor.email,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Registration & email verification
  // -------------------------------------------------------------------------

  /**
   * Public registration. Creates a USER account with isEmailVerified=false.
   * Does NOT issue tokens — the user must verify their email and then log in.
   */
  async register(dto: RegisterDto, ctx: RequestContext): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.account.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const rounds = this.configService.get<number>('security.bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const userRole = await this.prisma.role.findUniqueOrThrow({ where: { name: 'USER' } });

    const account = await this.prisma.$transaction(async (tx) => {
      const a = await tx.account.create({
        data: {
          email: dto.email,
          password: passwordHash,
          kind: AccountKind.USER,
          isEmailVerified: false,
        },
      });
      await tx.profile.create({
        data: { accountId: a.id, firstName: dto.firstName, lastName: dto.lastName },
      });
      await tx.accountRole.create({ data: { accountId: a.id, roleId: userRole.id } });
      return a;
    });

    await this.issueAndSendEmailVerification(account.id, account.email, dto.firstName);
    this.logger.log(`Registration: ${account.email}`, 'AuthService');
    await this.auditService.log({
      action: AuditAction.ACCOUNT_CREATED,
      actorAccountId: account.id,
      actorEmail: account.email,
      resource: 'account',
      resourceId: account.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { kind: 'USER', source: 'self-registration' },
    });

    return { id: account.id, email: account.email };
  }

  async verifyEmailByCode(email: string, code: string): Promise<void> {
    const account = await this.prisma.account.findFirst({ where: { email, deletedAt: null } });
    if (!account) {
      // Generic — protects email enumeration on this endpoint.
      throw new BadRequestException('Invalid or expired verification');
    }
    if (account.isEmailVerified) return;

    const verification = await this.prisma.emailVerification.findFirst({
      where: { accountId: account.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification || verification.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid or expired verification');
    }

    if (verification.attempts >= 5) {
      throw new BadRequestException('Too many attempts; request a new code');
    }

    if (verification.code !== code) {
      await this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired verification');
    }

    await this.markVerified(account.id, verification.id);
  }

  async verifyEmailByLink(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    const verification = await this.prisma.emailVerification.findUnique({
      where: { tokenHash },
      include: { account: true },
    });
    if (
      !verification ||
      verification.usedAt ||
      verification.expiresAt <= new Date() ||
      verification.account.deletedAt
    ) {
      throw new BadRequestException('Invalid or expired verification link');
    }
    if (verification.account.isEmailVerified) return;
    await this.markVerified(verification.accountId, verification.id);
  }

  /**
   * Always returns silently — even when the email is unknown — to avoid
   * enumeration. Throttling on the route blunts mass-resend attacks.
   */
  async resendVerification(email: string): Promise<void> {
    const account = await this.prisma.account.findFirst({ where: { email, deletedAt: null } });
    if (!account || account.isEmailVerified) return;
    const profile = await this.prisma.profile.findUnique({ where: { accountId: account.id } });
    await this.issueAndSendEmailVerification(account.id, account.email, profile?.firstName);
  }

  // -------------------------------------------------------------------------
  // Password management
  // -------------------------------------------------------------------------

  async requestPasswordReset(email: string): Promise<void> {
    const account = await this.prisma.account.findFirst({ where: { email, deletedAt: null } });
    if (!account || !account.isActive) return; // silent — no enumeration

    // Invalidate prior outstanding resets
    await this.prisma.passwordReset.updateMany({
      where: { accountId: account.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const raw = generateLinkToken();
    const ttl = this.configService.get<number>('security.passwordResetTtlMinutes', 60);
    const expiresAt = new Date(Date.now() + ttl * 60_000);

    await this.prisma.passwordReset.create({
      data: { accountId: account.id, tokenHash: hashToken(raw), expiresAt },
    });

    await this.auditService.log({
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      actorAccountId: account.id,
      actorEmail: account.email,
    });

    const frontendUrl = this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${raw}`;
    const profile = await this.prisma.profile.findUnique({ where: { accountId: account.id } });

    const result = await this.emailService.sendPasswordResetEmail(
      account.email,
      raw,
      profile?.firstName ?? undefined,
    );
    if (!result.success) {
      this.logger.error(`Failed to send reset email to ${account.email}`, undefined, 'AuthService');
    }
    void resetUrl; // built for the template once phase 5 updates the email helper signature
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash },
      include: { account: true },
    });

    if (
      !reset ||
      reset.usedAt ||
      reset.expiresAt <= new Date() ||
      reset.account.deletedAt ||
      !reset.account.isActive
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const rounds = this.configService.get<number>('security.bcryptRounds', 12);
    const hash = await bcrypt.hash(newPassword, rounds);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: reset.accountId },
        data: { password: hash, passwordChangedAt: now, mustChangePassword: false },
      }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { accountId: reset.accountId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    await this.auditService.log({
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      actorAccountId: reset.accountId,
      actorEmail: reset.account.email,
    });
  }

  async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    return this.applyPasswordChange(accountId, currentPassword, newPassword, false);
  }

  async changeInitialPassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    return this.applyPasswordChange(accountId, currentPassword, newPassword, true);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async applyPasswordChange(
    accountId: string,
    currentPassword: string,
    newPassword: string,
    initial: boolean,
  ): Promise<void> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new NotFoundException('Account not found');
    }
    if (initial && !account.mustChangePassword) {
      throw new BadRequestException('No initial-password change is pending for this account');
    }
    const ok = await bcrypt.compare(currentPassword, account.password);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }

    const rounds = this.configService.get<number>('security.bcryptRounds', 12);
    const hash = await bcrypt.hash(newPassword, rounds);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: accountId },
        data: { password: hash, passwordChangedAt: now, mustChangePassword: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    await this.auditService.log({
      action: AuditAction.PASSWORD_CHANGED,
      actorAccountId: accountId,
      actorEmail: account.email,
      metadata: { initial },
    });
  }

  private async issueTokens(user: RequestUser, ctx: RequestContext): Promise<TokenPair> {
    const raw = generateLinkToken();
    const refreshExpiresAt = this.refreshExpiry();

    await this.prisma.refreshToken.create({
      data: {
        accountId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: refreshExpiresAt,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });

    const accessToken = this.signAccessToken(user);
    const refreshToken = this.signRefreshToken(user.id, raw);
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  private signAccessToken(user: RequestUser): string {
    const payload: JwtPayload = { sub: user.id, kind: user.kind };
    return this.jwtService.sign(payload);
  }

  private signRefreshToken(accountId: string, raw: string): string {
    // The raw bytes are the actual secret; the JWT just transports them
    // signed so a leaked DB row (which only has the hash) cannot forge one.
    return this.jwtService.sign(
      { sub: accountId, jti: raw },
      {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn', '7d'),
      },
    );
  }

  private refreshExpiry(): Date {
    const spec = this.configService.get<string>('jwt.refreshExpiresIn', '7d');
    const match = spec.match(/^(\d+)([dhm])$/);
    const now = new Date();
    if (!match) {
      now.setDate(now.getDate() + 7);
      return now;
    }
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 'd':
        now.setDate(now.getDate() + value);
        break;
      case 'h':
        now.setHours(now.getHours() + value);
        break;
      case 'm':
        now.setMinutes(now.getMinutes() + value);
        break;
    }
    return now;
  }

  private async assembleRequestUser(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RequestUser | null> {
    const client = tx ?? this.prisma;
    const account = await client.account.findFirst({
      where: { id: accountId, deletedAt: null },
      include: {
        accountRoles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!account || !account.isActive) return null;

    const roles: string[] = [];
    const permissionsSet = new Set<string>();
    for (const ar of account.accountRoles) {
      roles.push(ar.role.name);
      for (const rp of ar.role.permissions) {
        permissionsSet.add(rp.permission.name);
      }
    }

    return {
      id: account.id,
      email: account.email,
      kind: account.kind,
      isActive: account.isActive,
      isEmailVerified: account.isEmailVerified,
      mustChangePassword: account.mustChangePassword,
      roles,
      permissions: [...permissionsSet],
    };
  }

  private async recordFailedLoginAttempt(accountId: string): Promise<void> {
    const threshold = this.configService.get<number>('security.loginLockoutThreshold', 5);
    const duration = this.configService.get<number>('security.loginLockoutDurationMinutes', 15);

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });

    if (updated.failedLoginAttempts >= threshold) {
      await this.prisma.account.update({
        where: { id: accountId },
        data: { lockedUntil: new Date(Date.now() + duration * 60_000), failedLoginAttempts: 0 },
      });
    }
  }

  private async issueAndSendEmailVerification(
    accountId: string,
    email: string,
    firstName: string | undefined | null,
  ): Promise<void> {
    const codeLength = this.configService.get<number>('security.verificationCodeLength', 6);
    const ttl = this.configService.get<number>('security.emailVerificationTtlMinutes', 15);

    // Mark prior outstanding verifications as used
    await this.prisma.emailVerification.updateMany({
      where: { accountId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = generateVerificationCode(codeLength);
    const rawToken = generateLinkToken();
    const expiresAt = new Date(Date.now() + ttl * 60_000);

    await this.prisma.emailVerification.create({
      data: { accountId, code, tokenHash: hashToken(rawToken), expiresAt },
    });

    const frontendUrl = this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');
    const verificationLink = `${frontendUrl}/verify-email?token=${rawToken}`;

    const result = await this.emailService.sendEmailVerification(
      email,
      code,
      firstName ?? undefined,
      verificationLink,
    );
    if (!result.success) {
      this.logger.error(`Failed to send verification email to ${email}`, undefined, 'AuthService');
    }
  }

  private async markVerified(accountId: string, verificationId: string): Promise<void> {
    const now = new Date();
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true },
    });
    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: verificationId },
        data: { usedAt: now },
      }),
      this.prisma.account.update({
        where: { id: accountId },
        data: { isEmailVerified: true, emailVerifiedAt: now },
      }),
    ]);
    await this.auditService.log({
      action: AuditAction.EMAIL_VERIFIED,
      actorAccountId: accountId,
      actorEmail: account?.email,
      resource: 'account',
      resourceId: accountId,
    });
  }
}
