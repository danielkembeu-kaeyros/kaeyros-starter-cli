import 'reflect-metadata';
import { Request, Response, NextFunction } from 'express';
import { RequestContextMiddleware } from '../request-context.middleware';

describe('RequestContextMiddleware', () => {
  let middleware: RequestContextMiddleware;

  beforeEach(() => {
    middleware = new RequestContextMiddleware();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const buildReqRes = () => {
    const req = {} as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;
    return { req, res, next, setHeader };
  };

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should set a uuid-ish requestId on the request', () => {
    const { req, res, next } = buildReqRes();

    middleware.use(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('should set a numeric requestStartTime', () => {
    const { req, res, next } = buildReqRes();
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    middleware.use(req, res, next);

    expect(req.requestStartTime).toBe(now);
  });

  it('should expose the request id on the X-Request-Id response header', () => {
    const { req, res, next, setHeader } = buildReqRes();

    middleware.use(req, res, next);

    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
  });

  it('should call next() exactly once with no arguments', () => {
    const { req, res, next } = buildReqRes();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('should generate a distinct requestId per request', () => {
    const a = buildReqRes();
    const b = buildReqRes();

    middleware.use(a.req, a.res, a.next);
    middleware.use(b.req, b.res, b.next);

    expect(a.req.requestId).not.toBe(b.req.requestId);
  });
});
