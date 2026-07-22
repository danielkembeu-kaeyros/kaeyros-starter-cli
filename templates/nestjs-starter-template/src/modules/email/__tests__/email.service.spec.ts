import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email.service';
import { LoggerService } from '@common/logging/logger.service';

describe('EmailService', () => {
  let service: EmailService;
  let configService: ConfigService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                email: {
                  provider: 'smtp',
                  from: 'test@example.com',
                  fromName: 'Test',
                  smtp: {
                    host: 'smtp.example.com',
                    port: 587,
                    secure: false,
                    auth: {
                      user: 'test',
                      pass: 'test',
                    },
                  },
                  ses: {
                    region: 'us-east-1',
                    accessKeyId: '',
                    secretAccessKey: '',
                  },
                  sendgrid: {
                    apiKey: '',
                  },
                  previewMode: true,
                },
                app: {
                  frontendUrl: 'http://localhost:3000',
                },
              };
              return config[key];
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    configService = module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have sendEmail method', () => {
    expect(service.sendEmail).toBeDefined();
  });

  it('should have sendPasswordResetEmail method', () => {
    expect(service.sendPasswordResetEmail).toBeDefined();
  });

  it('should have sendWelcomeEmail method', () => {
    expect(service.sendWelcomeEmail).toBeDefined();
  });

  it('should have sendEmailVerification method', () => {
    expect(service.sendEmailVerification).toBeDefined();
  });

  it('should have verifyConnection method', () => {
    expect(service.verifyConnection).toBeDefined();
  });
});
