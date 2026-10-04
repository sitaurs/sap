// Opt in locally. This public flag contains no credential and is disabled in production.
export const activitiesMockEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_SAP_ACTIVITIES_MOCK === "1";
