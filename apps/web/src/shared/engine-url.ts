const isEngineUrl = (candidate: string) => {
  if (!URL.canParse(candidate)) return false;

  const protocol = new URL(candidate).protocol;

  return protocol === "ws:" || protocol === "wss:";
};

export const resolveEngineUrl = (
  search: string,
  configured: string | undefined,
  fallback: string,
) => {
  const requested = new URLSearchParams(search).get("engine");

  if (requested !== null && isEngineUrl(requested)) return requested;

  if (configured !== undefined && isEngineUrl(configured)) return configured;

  return fallback;
};
