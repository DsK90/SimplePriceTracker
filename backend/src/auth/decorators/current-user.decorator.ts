import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type RequestUser = { userId: string; email: string };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
