import { signInMethods } from "@drone-studio/client-runtime/identity";
import type { SignInMethods, SocialProvider } from "@drone-studio/domain/identity/sign-in-methods";
import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";

const socialProviders = (
  result: AsyncResult.AsyncResult<SignInMethods, unknown>,
): ReadonlyArray<SocialProvider> =>
  Option.match(AsyncResult.value(result), {
    onNone: () => [],
    onSome: (methods) => methods.socialProviders,
  });

export const useSocialProviders = () => useAtomValue(signInMethods, socialProviders);
