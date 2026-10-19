import { formatModified, toUtcIso } from '../../../admin-src/lib/dates';
import { shortcodeFor } from '../../../admin-src/lib/shortcode';

describe( 'formatModified', () => {
	it( 'turns the REST timestamp into a readable date', () => {
		const text = formatModified( '2026-09-16T15:28:58', 'en-GB' );

		expect( text ).toContain( '2026' );
		expect( text ).not.toContain( 'T' );
	} );

	it( 'reads an offset-less REST timestamp as UTC, whatever the browser zone', () => {
		const expected = new Intl.DateTimeFormat( 'en-GB', {
			dateStyle: 'medium',
			timeStyle: 'short',
		} ).format( new Date( '2026-09-16T15:28:58Z' ) );

		expect( formatModified( '2026-09-16T15:28:58', 'en-GB' ) ).toBe( expected );
	} );

	it( 'keeps an explicit offset instead of adding a second Z', () => {
		const expected = new Intl.DateTimeFormat( 'en-GB', {
			dateStyle: 'medium',
			timeStyle: 'short',
		} ).format( new Date( '2026-09-16T15:28:58+04:00' ) );

		expect( formatModified( '2026-09-16T15:28:58+04:00', 'en-GB' ) ).toBe( expected );
		expect( toUtcIso( '2026-09-16T15:28:58+04:00' ) ).toBe( '2026-09-16T15:28:58+04:00' );
		expect( toUtcIso( '2026-09-16T15:28:58+0400' ) ).toBe( '2026-09-16T15:28:58+0400' );
		expect( toUtcIso( '2026-09-16T15:28:58Z' ) ).toBe( '2026-09-16T15:28:58Z' );
		expect( toUtcIso( '2026-09-16T15:28:58' ) ).toBe( '2026-09-16T15:28:58Z' );
	} );

	it( 'gives back what it could not read, instead of "Invalid Date"', () => {
		expect( formatModified( 'garbage', 'en-GB' ) ).toBe( 'garbage' );
		expect( formatModified( '', 'en-GB' ) ).toBe( '' );
		expect( formatModified( null, 'en-GB' ) ).toBe( '' );
		expect( formatModified( undefined, 'en-GB' ) ).toBe( '' );
	} );

	it( 'falls back to the browser locale for a locale it does not know', () => {
		expect( () => formatModified( '2026-09-16T15:28:58', 'not a locale!!' ) ).not.toThrow();
	} );
} );

describe( 'shortcodeFor', () => {
	it( 'builds the shortcode a page needs', () => {
		expect( shortcodeFor( 328 ) ).toBe( '[quoteform id="328"]' );
	} );
} );
