/**
 * @jest-environment jsdom
 */
import { formatMoney } from '../../../frontend-src/runtime/format';

const settings = ( overrides ) => ( {
	currency: 'USD',
	currency_position: 'before',
	decimals: 2,
	...overrides,
} );

describe( 'formatMoney', () => {
	it( 'puts the symbol before the amount', () => {
		expect( formatMoney( 1234.5, settings() ) ).toBe( '$1,234.50' );
	} );

	it( 'puts the symbol after the amount when asked', () => {
		expect( formatMoney( 1234.5, settings( { currency_position: 'after', currency: 'EUR' } ) ) ).toBe( '1,234.50 €' );
	} );

	it( 'honours the decimal setting', () => {
		expect( formatMoney( 1234.567, settings( { decimals: 0 } ) ) ).toBe( '$1,235' );
		expect( formatMoney( 1234.5, settings( { decimals: 3 } ) ) ).toBe( '$1,234.500' );
	} );

	it( 'rounds half away from zero, matching the engine', () => {
		expect( formatMoney( 2.5, settings( { decimals: 0 } ) ) ).toBe( '$3' );
		expect( formatMoney( -2.5, settings( { decimals: 0 } ) ) ).toBe( '-$3' );
	} );

	it( 'falls back to the currency code when there is no known symbol', () => {
		expect( formatMoney( 10, settings( { currency: 'XYZ' } ) ) ).toBe( 'XYZ10.00' );
	} );

	it( 'shows a dash rather than NaN when the amount is not a number', () => {
		expect( formatMoney( null, settings() ) ).toBe( '—' );
		expect( formatMoney( NaN, settings() ) ).toBe( '—' );
	} );
} );

// `<html lang>` plugin-in yazdığı atribut DEYİL. Mövzu onu `get_locale()`-dan
// birbaşa çap edə bilər (`en_US` — WordPress locale-ı, BCP-47 deyil) və
// `toLocaleString()` belə dəyərdə RangeError atır. Həmin xəta `formatMoney`-dən
// qaçıb `refresh()`-i öldürürdü: ziyarətçi boş `.quoteform` qabığı görürdü.
describe( 'formatMoney and the document language', () => {
	afterEach( () => {
		document.documentElement.removeAttribute( 'lang' );
	} );

	it( 'formats with an underscored WordPress locale instead of dying on it', () => {
		document.documentElement.lang = 'en_US';

		expect( formatMoney( 1234.5, settings() ) ).toBe( '$1,234.50' );
	} );

	it( 'formats with outright garbage in the attribute', () => {
		document.documentElement.lang = 'not a locale!!';

		expect( () => formatMoney( 1234.5, settings() ) ).not.toThrow();
		expect( formatMoney( 1234.5, settings() ) ).toBe( '$1,234.50' );
	} );

	it( 'still honours a well-formed locale', () => {
		document.documentElement.lang = 'de-DE';

		expect( formatMoney( 1234.5, settings() ) ).toBe( '$1.234,50' );
	} );

	it( 'honours the hyphenated form of the same locale it is given underscored', () => {
		document.documentElement.lang = 'de_DE';

		expect( formatMoney( 1234.5, settings() ) ).toBe( '$1.234,50' );
	} );
} );
