import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { UnauthorizedException } from '../../../common/exceptions/custom-exceptions';
import { RequestUser } from '../../../common/authz/types';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, password: string): Promise<RequestUser> {
    const result = await this.authService.validateForLogin(email, password);
    if (!result) {
      // Generic message — no enumeration leak.
      throw new UnauthorizedException('Invalid credentials');
    }
    return result;
  }
}
