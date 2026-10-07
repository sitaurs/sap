/** Only application destinations; never accept an external redirect or auth loop. */
export function safeReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return "/dashboard";
  try {
    const url = new URL(value, "https://sap.invalid");
    if (
      url.origin !== "https://sap.invalid" ||
      !/^\/(dashboard(?:\/|$)|incidents(?:\/|$)|activities(?:\/|$))/.test(
        url.pathname,
      )
    )
      return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}
export function loginDestination(destination: string): string {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(destination))}`;
}
