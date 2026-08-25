import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { meetingsRouter } from "./routers/meetings";
import { minutesRouter } from "./routers/minutes";
import { mobileRouter } from "./routers/mobile";
import { translationRouter } from "./routers/translation";
import { whatsappRouter } from "./routers/whatsapp";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    bootstrap: protectedProcedure.query(async ({ ctx }) => {
      const workspace = await db.ensurePersonalOrganization(ctx.user);
      const organizations = await db.getUserOrganizations(ctx.user.id);
      return { user: ctx.user, workspace, organizations };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  meetings: meetingsRouter,
  mobile: mobileRouter,
  minutes: minutesRouter,
  translation: translationRouter,
  whatsapp: whatsappRouter,

});

export type AppRouter = typeof appRouter;
