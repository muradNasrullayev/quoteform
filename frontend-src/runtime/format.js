import { roundHalfAwayFromZero } from '../engine/functions';

const SYMBOLS = {
	USD: '$',
	EUR: '€',
	GBP: '£',
	JPY: '¥',
	AUD: 'A$',
	CAD: 'C$',
	CHF: 'CHF',
	SEK: 'kr',
	NOK: 'kr',
	DKK: 'kr',
	PLN: 'zł',
	TRY: '₺',
	AZN: '₼',
	RUB: '₽',
	INR: '₹',
	BRL: 'R$',
	ZAR: 'R',
	NZD: 'NZ$',
};

export function formatMoney( amount, settings ) {
	if ( typeof amount !== 'number' || ! isFinite( amount ) ) {
		return '—';
	}

	const decimals = Number.isInteger( settings.decimals ) ? settings.decimals : 2;
	const rounded = roundHalfAwayFromZero( amount, decimals );
	const symbol = SYMBOLS[ settings.currency ] || settings.currency || '';
	const negative = rounded < 0;

	const digits = Math.abs( rounded ).toLocaleString( documentLocale(), {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	} );

	const body = settings.currency_position === 'after' ? `${ digits } ${ symbol }` : `${ symbol }${ digits }`;

	return negative ? `-${ body }` : body;
}

// `<html lang>` PLUGIN-in idarə etmədiyi bir atributdur: mövzu onu
// `get_locale()`-dan birbaşa çap edə bilər (`en_US` — WordPress locale-ı,
// BCP-47 deyil), başqa bir plugin isə ora istənilən şeyi yaza bilər.
// `toLocaleString()` isə struktur baxımından yanlış teqdə RangeError atır və o
// xəta `refresh()`-i — yəni bütün formanı — öldürürdü.
//
// Ona görə dəyər TANINMIR, SINANILIR: BCP-47-ni regex ilə tanımağa çalışmaq ya
// düzgün teqi rədd edər, ya da pisini buraxardı. Sinaq üçün seçim parametri
// verilmir ki, yalnız locale-ın özü sınansın.
const FALLBACK_LOCALE = 'en-US';

function documentLocale() {
	const lang = typeof document !== 'undefined' ? String( document.documentElement.lang || '' ) : '';
	const candidate = lang.trim().replace( /_/g, '-' );

	if ( candidate === '' ) {
		return FALLBACK_LOCALE;
	}

	try {
		( 0 ).toLocaleString( candidate );
	} catch ( error ) {
		return FALLBACK_LOCALE;
	}

	return candidate;
}
