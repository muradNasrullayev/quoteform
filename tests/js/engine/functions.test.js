import { callFunction, hasFunction, roundHalfAwayFromZero } from '../../../frontend-src/engine/functions';

describe( 'hasFunction', () => {
	it( 'registers the built-in set', () => {
		[ 'min', 'max', 'round', 'ceil', 'floor', 'abs', 'sum' ].forEach( ( name ) => {
			expect( hasFunction( name ) ).toBe( true );
		} );

		expect( hasFunction( 'sqrt' ) ).toBe( false );
		expect( hasFunction( 'if' ) ).toBe( false );
	} );
} );

describe( 'roundHalfAwayFromZero', () => {
	it( 'rounds half away from zero, unlike Math.round', () => {
		expect( roundHalfAwayFromZero( 2.5 ) ).toBe( 3 );
		expect( roundHalfAwayFromZero( -2.5 ) ).toBe( -3 );
		expect( Math.round( -2.5 ) ).toBe( -2 );
		expect( roundHalfAwayFromZero( 0.5 ) ).toBe( 1 );
		expect( roundHalfAwayFromZero( 1.5 ) ).toBe( 2 );
		expect( roundHalfAwayFromZero( 0 ) ).toBe( 0 );
	} );

	it( 'compensates for float representation error', () => {
		expect( roundHalfAwayFromZero( 1.005, 2 ) ).toBe( 1.01 );
		expect( roundHalfAwayFromZero( 2.675, 2 ) ).toBe( 2.68 );
		expect( roundHalfAwayFromZero( 1.145, 2 ) ).toBe( 1.15 );
	} );

	it( 'rounds to negative precision', () => {
		expect( roundHalfAwayFromZero( 125, -1 ) ).toBe( 130 );
	} );
} );

describe( 'callFunction', () => {
	it( 'evaluates the built-ins', () => {
		expect( callFunction( 'min', [ 5, 2, 9 ] ) ).toBe( 2 );
		expect( callFunction( 'max', [ 5, 2, 9 ] ) ).toBe( 9 );
		expect( callFunction( 'sum', [ 1, 2, 3, 4 ] ) ).toBe( 10 );
		expect( callFunction( 'sum', [] ) ).toBe( 0 );
		expect( callFunction( 'ceil', [ 2.1 ] ) ).toBe( 3 );
		expect( callFunction( 'floor', [ 2.9 ] ) ).toBe( 2 );
		expect( callFunction( 'abs', [ -4.5 ] ) ).toBe( 4.5 );
		expect( callFunction( 'round', [ 2.5 ] ) ).toBe( 3 );
		expect( callFunction( 'round', [ 2.4567, 2 ] ) ).toBe( 2.46 );
	} );

	it( 'treats an empty argument as zero', () => {
		expect( callFunction( 'abs', [ null ] ) ).toBe( 0 );
		expect( callFunction( 'min', [ '', 5 ] ) ).toBe( 0 );
	} );

	it.each( [
		[ 'abs', [ 1, 2 ], 'wrong_argument_count' ],
		[ 'min', [], 'wrong_argument_count' ],
		[ 'sqrt', [ 4 ], 'unknown_function' ],
	] )( 'rejects %s', ( name, args, codeSlug ) => {
		try {
			callFunction( name, args );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( codeSlug );
		}
	} );
} );
