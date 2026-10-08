/**
 * Naming (rethink §12 Q2, decided 2026-10-08).
 *
 * The platform is ChurchConnect. Each church gives its connect ministry its
 * own name ("Encounter Connect"), shown as "Encounter Connect through
 * ChurchConnect". People at a church see their church's name first; the
 * platform name is the quiet second line.
 */

export const PLATFORM_NAME = 'ChurchConnect';

/** The operator contact shown in legal pages and the geocoder User-Agent. */
export const PLATFORM_CONTACT_EMAIL = 'dev@encounterthelord.com';

export interface ChurchNaming {
  name: string;
  connect_name?: string | null;
}

/** "Encounter Connect", or "<Church> Connect" until the church names it. */
export function connectName(church: ChurchNaming | null | undefined): string {
  if (!church) return PLATFORM_NAME;
  const own = church.connect_name?.trim();
  return own || `${church.name.trim()} Connect`;
}

/** "Encounter Connect through ChurchConnect". */
export function connectNameWithPlatform(church: ChurchNaming | null | undefined): string {
  if (!church) return PLATFORM_NAME;
  return `${connectName(church)} through ${PLATFORM_NAME}`;
}
