import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from '@common/logging/logger.service';
import { EmailOptions, SendEmailResult } from './interfaces/email.interface';

@Injectable()
export class EmailService {
  private transporter: Transporter;
  private readonly from: string;
  private readonly fromName: string;
  private readonly previewMode: boolean;
  private readonly templatesPath: string;
  private templateCache: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const emailConfig = this.configService.get('email');
    this.from = emailConfig.from;
    this.fromName = emailConfig.fromName;
    this.previewMode = emailConfig.previewMode;
    this.templatesPath = path.join(process.cwd(), 'src', 'modules', 'email', 'templates');

    this.registerHandlebarsHelpers();
    this.initializeTransporter();
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHandlebarsHelpers(): void {
    handlebars.registerHelper('currentYear', () => new Date().getFullYear());
  }

  /**
   * Initialize the email transporter based on configured provider
   */
  private initializeTransporter(): void {
    const emailConfig = this.configService.get('email');
    const provider = emailConfig.provider;

    try {
      switch (provider) {
        case 'smtp':
          this.transporter = nodemailer.createTransport({
            host: emailConfig.smtp.host,
            port: emailConfig.smtp.port,
            secure: emailConfig.smtp.secure,
            auth: {
              user: emailConfig.smtp.auth.user,
              pass: emailConfig.smtp.auth.pass,
            },
          });
          this.logger.log('SMTP email transporter initialized', 'EmailService');
          break;

        case 'ses':
          // For AWS SES, we use the SMTP interface
          this.transporter = nodemailer.createTransport({
            host: `email-smtp.${emailConfig.ses.region}.amazonaws.com`,
            port: 587,
            secure: false,
            auth: {
              user: emailConfig.ses.accessKeyId,
              pass: emailConfig.ses.secretAccessKey,
            },
          });
          this.logger.log('AWS SES email transporter initialized', 'EmailService');
          break;

        case 'sendgrid':
          this.transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            secure: false,
            auth: {
              user: 'apikey',
              pass: emailConfig.sendgrid.apiKey,
            },
          });
          this.logger.log('SendGrid email transporter initialized', 'EmailService');
          break;

        default:
          throw new Error(`Unsupported email provider: ${provider}`);
      }

      // In preview mode, use ethereal email for testing
      if (this.previewMode) {
        this.createTestAccount();
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize email transporter: ${error.message}`,
        error.stack,
        'EmailService',
      );
      throw error;
    }
  }

  /**
   * Create a test account for preview mode (development)
   */
  private async createTestAccount(): Promise<void> {
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      this.logger.log(
        'Email preview mode enabled - Using Ethereal Email for testing',
        'EmailService',
      );
    } catch {
      this.logger.warn(
        'Failed to create test account, using configured transporter',
        'EmailService',
      );
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<SendEmailResult> {
    try {
      const { to, subject, html, text, template, context, attachments, cc, bcc, replyTo } = options;

      let emailHtml = html;
      let emailText = text;

      // If template is specified, compile and render it
      if (template) {
        const compiled = await this.compileTemplate(template, context || {});
        emailHtml = compiled.html;
        emailText = compiled.text || emailText;
      }

      const mailOptions = {
        from: `${this.fromName} <${this.from}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html: emailHtml,
        text: emailText,
        attachments,
        cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
        replyTo: replyTo || undefined,
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Get preview URL in preview mode
      const previewUrl = this.previewMode ? nodemailer.getTestMessageUrl(info) : undefined;

      if (previewUrl) {
        this.logger.log(`Email preview URL: ${previewUrl}`, 'EmailService');
      }

      this.logger.log(
        `Email sent successfully to ${to}. Message ID: ${info.messageId}`,
        'EmailService',
      );

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: previewUrl || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack, 'EmailService');
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Compile a template with context data
   */
  private async compileTemplate(
    templateName: string,
    context: Record<string, unknown>,
  ): Promise<{ html: string; text?: string }> {
    try {
      // Check cache first
      let compiledTemplate = this.templateCache.get(templateName);

      if (!compiledTemplate) {
        const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);

        if (!fs.existsSync(templatePath)) {
          throw new Error(`Template not found: ${templateName}`);
        }

        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        compiledTemplate = handlebars.compile(templateSource);

        // Cache the compiled template
        this.templateCache.set(templateName, compiledTemplate);
      }

      const html = compiledTemplate(context);

      return { html };
    } catch (error) {
      this.logger.error(
        `Failed to compile template ${templateName}: ${error.message}`,
        error.stack,
        'EmailService',
      );
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    userName?: string,
  ): Promise<SendEmailResult> {
    const resetUrl = `${this.configService.get('app.frontendUrl') || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    return this.sendEmail({
      to,
      subject: 'Password Reset Request',
      template: 'password-reset',
      context: {
        userName: userName || 'User',
        resetUrl,
        resetToken,
        expiryTime: '1 hour',
      },
    });
  }

  /**
   * One-time sign-in code for the OTP login flow.
   */
  async sendLoginOtpEmail(
    to: string,
    code: string,
    expiryMinutes: number,
    userName?: string,
  ): Promise<SendEmailResult> {
    return this.sendEmail({
      to,
      subject: 'Your sign-in code',
      template: 'login-otp',
      context: {
        userName: userName || null,
        code,
        expiryMinutes,
      },
    });
  }

  /**
   * Welcome notification for admins provisioned with loginMethod=OTP.
   * Replaces the temp-password admin-invite email when the new admin does
   * not have a password to receive.
   */
  async sendOtpAdminInviteEmail(
    to: string,
    options: { userName?: string; invitedBy?: string },
  ): Promise<SendEmailResult> {
    const frontendUrl = this.configService.get('app.frontendUrl') || 'http://localhost:3000';
    return this.sendEmail({
      to,
      subject: 'Your administrator account is ready',
      template: 'admin-invite-otp',
      context: {
        email: to,
        userName: options.userName || null,
        invitedBy: options.invitedBy || null,
        loginUrl: `${frontendUrl}/login`,
      },
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(to: string, userName: string): Promise<SendEmailResult> {
    return this.sendEmail({
      to,
      subject: 'Welcome to NestJS Starter',
      template: 'welcome',
      context: {
        userName,
        loginUrl: `${this.configService.get('app.frontendUrl') || 'http://localhost:3000'}/login`,
      },
    });
  }

  /**
   * Send email verification email with a code AND a link.
   * Both target the same EmailVerification row server-side; the user can
   * use either path to complete verification.
   */
  async sendEmailVerification(
    to: string,
    verificationCode: string,
    userName?: string,
    verificationLink?: string,
  ): Promise<SendEmailResult> {
    return this.sendEmail({
      to,
      subject: 'Verify Your Email Address',
      template: 'email-verification',
      context: {
        userName: userName || 'User',
        verificationCode,
        verificationLink: verificationLink ?? null,
      },
    });
  }

  /**
   * Verify email transporter connection
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log('Email transporter connection verified', 'EmailService');
      return true;
    } catch (error) {
      this.logger.error(
        `Email transporter verification failed: ${error.message}`,
        error.stack,
        'EmailService',
      );
      return false;
    }
  }
}
