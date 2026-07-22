import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      requestStartTime?: number;
    }
  }
}

/**
 * Middleware to add request context (ID, start time) to each request
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Generate unique request ID
    req.requestId = uuidv4();
    req.requestStartTime = Date.now();

    // Add request ID to response headers
    res.setHeader('X-Request-Id', req.requestId);

    next();
  }
}
