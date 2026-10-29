// Which flag stands for a language, by its ISO 639 code (Lemmy's language
// codes). A flag is a country, not a language, so this is a convention:
// the country most associated with each language. Languages without a fair
// choice (Arabic, Esperanto, Swahili, Kurdish...) have none and show their code.
// The flags are flag-icons' SVGs, vendored (web/vendor/VENDOR.md).

export const FLAG_DIR = 'vendor/flag-icons@7.5.0/flags/4x3';

export const LANGUAGE_FLAGS = {
  af: 'za', am: 'et', az: 'az', be: 'by', bg: 'bg', bn: 'bd', bs: 'ba', ca: 'es-ct', cs: 'cz', cy: 'gb-wls',
  da: 'dk', de: 'de', el: 'gr', en: 'gb', es: 'es', et: 'ee', eu: 'es-pv', fa: 'ir', fi: 'fi', fr: 'fr', ga: 'ie',
  gd: 'gb-sct', gl: 'es-ga', he: 'il', hi: 'in', hr: 'hr', hu: 'hu', hy: 'am', id: 'id', is: 'is', it: 'it',
  ja: 'jp', ka: 'ge', kk: 'kz', km: 'kh', ko: 'kr', la: 'va', lb: 'lu', lo: 'la', lt: 'lt', lv: 'lv',
  mk: 'mk', mn: 'mn', ms: 'my', mt: 'mt', my: 'mm', nb: 'no', ne: 'np', nl: 'nl', nn: 'no', no: 'no',
  pl: 'pl', ps: 'af', pt: 'pt', ro: 'ro', ru: 'ru', si: 'lk', sk: 'sk', sl: 'si', sq: 'al', sr: 'rs',
  sv: 'se', ta: 'in', th: 'th', tl: 'ph', tr: 'tr', uk: 'ua', ur: 'pk', uz: 'uz', vi: 'vn', zh: 'cn',
};

/** The flag image's address for language [code], or null. */
export function flagFor(code) {
  const c = LANGUAGE_FLAGS[String(code || '').toLowerCase()];
  return c ? `${FLAG_DIR}/${c}.svg` : null;
}
