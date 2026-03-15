export function isApiCronDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return /^true$/i.test(env.API_CRONS_DISABLED || '');
}
