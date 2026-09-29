import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

export function validate(schema: ZodType, source: 'body' | 'query' | 'params' = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Assign parsed value back (applies zod transforms/defaults)
    if (source === 'body') req.body = result.data;
    else (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}
