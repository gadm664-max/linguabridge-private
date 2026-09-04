/**
 * Country list (ISO 3166-1 alpha-2). `defaultLanguage` only PRE-FILLS the join form;
 * the participant can and often will pick a different spoken language (AD-8).
 */
export interface CountryDef {
  code: string
  name: string
  flag: string
  defaultLanguage: string
}

function flagOf(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const RAW: Array<[string, string, string]> = [
  // Priority markets first
  ['EG', 'Egypt', 'ar'],
  ['SA', 'Saudi Arabia', 'ar'],
  ['AE', 'United Arab Emirates', 'ar'],
  ['ES', 'Spain', 'es'],
  ['IT', 'Italy', 'it'],
  ['FR', 'France', 'fr'],
  ['GB', 'United Kingdom', 'en'],
  ['US', 'United States', 'en'],
  ['DE', 'Germany', 'de'],
  // Rest (alphabetical)
  ['AR', 'Argentina', 'es'],
  ['AU', 'Australia', 'en'],
  ['AT', 'Austria', 'de'],
  ['BH', 'Bahrain', 'ar'],
  ['BE', 'Belgium', 'fr'],
  ['BR', 'Brazil', 'pt'],
  ['CA', 'Canada', 'en'],
  ['CL', 'Chile', 'es'],
  ['CO', 'Colombia', 'es'],
  ['DZ', 'Algeria', 'ar'],
  ['IE', 'Ireland', 'en'],
  ['IQ', 'Iraq', 'ar'],
  ['JO', 'Jordan', 'ar'],
  ['KW', 'Kuwait', 'ar'],
  ['LB', 'Lebanon', 'ar'],
  ['LY', 'Libya', 'ar'],
  ['MA', 'Morocco', 'ar'],
  ['MX', 'Mexico', 'es'],
  ['NL', 'Netherlands', 'en'],
  ['NZ', 'New Zealand', 'en'],
  ['OM', 'Oman', 'ar'],
  ['PE', 'Peru', 'es'],
  ['PT', 'Portugal', 'pt'],
  ['QA', 'Qatar', 'ar'],
  ['SD', 'Sudan', 'ar'],
  ['SE', 'Sweden', 'en'],
  ['CH', 'Switzerland', 'de'],
  ['TN', 'Tunisia', 'ar'],
  ['TR', 'Turkey', 'en'],
  ['IN', 'India', 'en'],
  ['SG', 'Singapore', 'en'],
  ['ZA', 'South Africa', 'en'],
  ['NG', 'Nigeria', 'en'],
  ['PK', 'Pakistan', 'en'],
  ['PH', 'Philippines', 'en'],
  ['MY', 'Malaysia', 'en'],
  ['ID', 'Indonesia', 'en'],
  ['JP', 'Japan', 'en'],
  ['KR', 'South Korea', 'en'],
  ['CN', 'China', 'en'],
  ['RU', 'Russia', 'en'],
  ['PL', 'Poland', 'en'],
  ['GR', 'Greece', 'en'],
  ['NO', 'Norway', 'en'],
  ['DK', 'Denmark', 'en'],
  ['FI', 'Finland', 'en'],
  ['CZ', 'Czechia', 'en'],
  ['HU', 'Hungary', 'en'],
  ['RO', 'Romania', 'en'],
  ['UA', 'Ukraine', 'en'],
  ['IL', 'Israel', 'en'],
  ['KE', 'Kenya', 'en'],
  ['GH', 'Ghana', 'en'],
  ['ET', 'Ethiopia', 'en'],
  ['YE', 'Yemen', 'ar'],
  ['PS', 'Palestine', 'ar'],
  ['SY', 'Syria', 'ar'],
  ['MR', 'Mauritania', 'ar'],
  ['SN', 'Senegal', 'fr'],
  ['CI', "Côte d'Ivoire", 'fr'],
  ['CM', 'Cameroon', 'fr'],
  ['LU', 'Luxembourg', 'fr'],
  ['MC', 'Monaco', 'fr'],
  ['AO', 'Angola', 'pt'],
  ['MZ', 'Mozambique', 'pt'],
  ['VE', 'Venezuela', 'es'],
  ['EC', 'Ecuador', 'es'],
  ['UY', 'Uruguay', 'es'],
  ['BO', 'Bolivia', 'es'],
  ['PY', 'Paraguay', 'es'],
  ['CU', 'Cuba', 'es'],
  ['DO', 'Dominican Republic', 'es'],
  ['GT', 'Guatemala', 'es'],
  ['CR', 'Costa Rica', 'es'],
  ['PA', 'Panama', 'es']
]

export const COUNTRIES: CountryDef[] = RAW.map(([code, name, defaultLanguage]) => ({
  code,
  name,
  flag: flagOf(code),
  defaultLanguage
}))

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code)

export function isSupportedCountry(code: unknown): code is string {
  return typeof code === 'string' && COUNTRY_CODES.includes(code)
}

export function getCountry(code: string | null | undefined): CountryDef | undefined {
  return code ? COUNTRIES.find((c) => c.code === code) : undefined
}
