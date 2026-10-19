/**
 * @jest-environment jsdom
 */
import fixture from '../../fixtures/entry-filters.json';
import {
	DEFAULT_FILTERS,
	filterParams,
	filtersAreActive,
	isCalendarDate,
	normaliseFilters,
} from '../../../admin-src/entries/filters';

describe( 'normaliseFilters matches the PHP side', () => {
	it.each( fixture.cases.map( ( item ) => [ item.name, item ] ) )( '%s', ( name, item ) => {
		expect( normaliseFilters( item.params ) ).toStrictEqual( { ...DEFAULT_FILTERS, ...item.expected } );
	} );
} );

describe( 'filterParams', () => {
	it( 'leaves out empty filters and the default sort', () => {
		expect( filterParams( DEFAULT_FILTERS ) ).toEqual( {} );
		expect( filterParams( { ...DEFAULT_FILTERS, form: 7, status: 'new', orderby: 'total' } ) ).toEqual( {
			form: '7',
			status: 'new',
			orderby: 'total',
		} );
	} );

	it( 'reads back as the same filters for every fixture case', () => {
		fixture.cases.forEach( ( item ) => {
			const filters = { ...DEFAULT_FILTERS, ...item.expected };

			expect( normaliseFilters( filterParams( filters ) ) ).toStrictEqual( filters );
		} );
	} );
} );

describe( 'filtersAreActive', () => {
	it( 'ignores the sort order', () => {
		expect( filtersAreActive( { ...DEFAULT_FILTERS, orderby: 'total', order: 'asc' } ) ).toBe( false );
		expect( filtersAreActive( { ...DEFAULT_FILTERS, min: '0' } ) ).toBe( true );
	} );
} );

describe( 'isCalendarDate', () => {
	it( 'knows month lengths and leap years', () => {
		expect( isCalendarDate( '2024-02-29' ) ).toBe( true );
		expect( isCalendarDate( '2023-02-29' ) ).toBe( false );
		expect( isCalendarDate( '2023-04-31' ) ).toBe( false );
		expect( isCalendarDate( 20230430 ) ).toBe( false );
	} );
} );

describe( 'DEFAULT_FILTERS', () => {
	it( 'cannot be changed by accident', () => {
		expect( Object.isFrozen( DEFAULT_FILTERS ) ).toBe( true );
	} );
} );
