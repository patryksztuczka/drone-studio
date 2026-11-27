import { Context } from "effect";

import type { User } from "./user.ts";

export class CurrentUser extends Context.Service<CurrentUser, User>()(
  "drone-studio/domain/identity/CurrentUser",
) {}
