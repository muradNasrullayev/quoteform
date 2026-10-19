/**
 * @jest-environment jsdom
 */
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';
import { buildSearch, isPlainClick, parseState } from '../../../admin-src/entries/urlState';

describe( 'parseState', () => {
	it( 'reads filters, page and the open entry', () => {
		expect( parseState( '?page=quoteform-entries&form=7&status=new&orderby=total&paged=3&entry=41' ) ).toEqual( {
			filters: { ...DEFAULT_FILTERS, form: 7, status: 'new', orderby: 'total' },
			paged: 3,
			entry: 41,
		} );
	} );

	it( 'falls back quietly on values it cannot use', () => {
		expect( parseState( '?page=quoteform-entries&form=abc&paged=0&entry=-2&from=2026-02-30' ) ).toEqual( {
			filters: DEFAULT_FILTERS,
			paged: 1,
			entry: null,
		} );
		expect( parseState( '?paged=2.5&entry=4e2' ) ).toEqual( { filters: DEFAULT_FILTERS, paged: 1, entry: null } );
	} );

	it( 'takes the last copy of a repeated parameter, as PHP does', () => {
		expect( parseState( '?status=read&status=new' ).filters.status ).toBe( 'new' );
	} );
} );

describe( 'buildSearch', () => {
	it( 'keeps the WordPress page slug and leaves defaults out', () => {
		expect( buildSearch( { filters: DEFAULT_FILTERS, paged: 1, entry: null } ) ).toBe( '?page=quoteform-entries' );
	} );

	it( 'writes what differs from the defaults', () => {
		expect(
			buildSearch( { filters: { ...DEFAULT_FILTERS, form: 'deleted', min: '10.5', order: 'asc' }, paged: 2, entry: 9 } )
		).toBe( '?page=quoteform-entries&form=deleted&min=10.5&order=asc&paged=2&entry=9' );
	} );

	it( 'round-trips through parseState', () => {
		const state = { filters: { ...DEFAULT_FILTERS, status: 'read', from: '2026-09-01', to: '2026-09-25' }, paged: 4, entry: null };

		expect( parseState( buildSearch( state ) ) ).toEqual( state );
	} );
} );

describe( 'isPlainClick', () => {
	it( 'lets modified and middle clicks open a new tab', () => {
		expect( isPlainClick( { button: 0 } ) ).toBe( true );
		expect( isPlainClick( { button: 1 } ) ).toBe( false );
		expect( isPlainClick( { button: 0, ctrlKey: true } ) ).toBe( false );
		expect( isPlainClick( { button: 0, metaKey: true } ) ).toBe( false );
		expect( isPlainClick( { button: 0, shiftKey: true } ) ).toBe( false );
		expect( isPlainClick( { button: 0, altKey: true } ) ).toBe( false );
	} );
} );
