import type { NextFunction, Request, Response } from "express";
import { ENV } from "./_core/env";

export function sameOriginGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  try {
    const requestOrigin = new URL(origin).origin;
    const configuredOrigin = ENV.appOrigin.trim();
    const expectedOrigin =
      configuredOrigin || `${req.protocol}://${req.get("host")}`;
    if (requestOrigin !== expectedOrigin) {
      res.status(403).json({
        error: {
          code: "CSRF_ORIGIN_MISMATCH",
          message: "Origin is not allowed",
        },
      });
      return;
    }
  } catch {
    res.status(403).json({
      error: { code: "CSRF_ORIGIN_INVALID", message: "Origin is not allowed" },
    });
    return;
  }

  next();
}
