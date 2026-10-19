import { compare, equals, isNumericLike, toBool, toNumber } from '../../../frontend-src/engine/values';

describe( 'toNumber', () => {
	it( 'treats empty values as zero', () => {
		expect( toNumber( null ) ).toBe( 0 );
		expect( toNumber( '' ) ).toBe( 0 );
	} );

	it( 'converts booleans', () => {
		expect( toNumber( true ) ).toBe( 1 );
		expect( toNumber( false ) ).toBe( 0 );
	} );

	it( 'converts numeric strings', () => {
		expect( toNumber( '12.5' ) ).toBe( 12.5 );
		expect( toNumber( '-3' ) ).toBe( -3 );
	} );

	it.each( [ 'express', ' 12', '12abc', '0x1A' ] )( 'rejects %s', ( value ) => {
		try {
			toNumber( value );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'type_error' );
		}
	} );

	it( 'rejects a list', () => {
		try {
			toNumber( [ 'a', 'b' ] );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'type_error' );
		}
	} );
} );

describe( 'toBool', () => {
	it( 'matches the php truthiness table', () => {
		expect( toBool( null ) ).toBe( false );
		expect( toBool( '' ) ).toBe( false );
		expect( toBool( 0 ) ).toBe( false );
		expect( toBool( false ) ).toBe( false );
		expect( toBool( [] ) ).toBe( false );
		expect( toBool( '0' ) ).toBe( true );
		expect( toBool( 1 ) ).toBe( true );
		expect( toBool( [ 'a' ] ) ).toBe( true );
	} );
} );

describe( 'isNumericLike', () => {
	it( 'accepts empty, boolean, number and numeric string', () => {
		expect( isNumericLike( null ) ).toBe( true );
		expect( isNumericLike( '' ) ).toBe( true );
		expect( isNumericLike( true ) ).toBe( true );
		expect( isNumericLike( 5 ) ).toBe( true );
		expect( isNumericLike( '5' ) ).toBe( true );
		expect( isNumericLike( 'express' ) ).toBe( false );
		expect( isNumericLike( [ 1 ] ) ).toBe( false );
	} );
} );

describe( 'equals', () => {
	it( 'is type strict', () => {
		expect( equals( '5', 5 ) ).toBe( false );
		expect( equals( 5, 5 ) ).toBe( true );
		expect( equals( 'express', 'express' ) ).toBe( true );
		expect( equals( true, 1 ) ).toBe( false );
	} );

	it( 'treats null as an empty string', () => {
		expect( equals( null, '' ) ).toBe( true );
	} );
} );

describe( 'compare', () => {
	it( 'compares numbers numerically', () => {
		expect( compare( 5, 2 ) ).toBe( 1 );
		expect( compare( 2, 5 ) ).toBe( -1 );
		expect( compare( 5, 5 ) ).toBe( 0 );
	} );

	it( 'compares a number with a numeric string numerically', () => {
		expect( compare( 10, '9' ) ).toBe( 1 );
	} );

	it( 'compares strings lexicographically', () => {
		expect( compare( '2026-03-01', '2026-01-01' ) ).toBe( 1 );
	} );

	it( 'rejects mixed types', () => {
		try {
			compare( 5, 'express' );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'type_error' );
		}
	} );
} );
