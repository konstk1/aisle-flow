const APPLICATION_ORIGIN = "https://aisle-flow.invalid";

export function getSafeRedirectPath(value: unknown) {
  if (typeof value !== "string") {
    return "/";
  }

  try {
    const url = new URL(value, APPLICATION_ORIGIN);

    if (url.origin !== APPLICATION_ORIGIN) {
      return "/";
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
