import fixtures from '../../fixtures/calculations.json';
import { clearExpressionCache } from '../../../frontend-src/engine';
import { evaluateAllCalculations } from '../../../frontend-src/engine/calculations';

describe( 'calculation parity fixtures', () => {
	it( 'has unique case ids', () => {
		const ids = fixtures.cases.map( ( testCase ) => testCase.id );

		expect( new Set( ids ).size ).toBe( ids.length );
	} );

	describe.each( fixtures.cases.map( ( testCase ) => [ testCase.id, testCase ] ) )( '%s', ( id, testCase ) => {
		beforeEach( () => {
			clearExpressionCache();
		} );

		it( 'matches the shared fixture', () => {
			if ( Object.prototype.hasOwnProperty.call( testCase, 'error' ) ) {
				try {
					evaluateAllCalculations( testCase.calculations, testCase.vars );
					throw new Error( `Case "${ id }" should have raised "${ testCase.error }".` );
				} catch ( error ) {
					expect( error.codeSlug ).toBe( testCase.error );
				}

				return;
			}

			const actual = evaluateAllCalculations( testCase.calculations, testCase.vars );

			expect( Object.keys( actual ).sort() ).toEqual( Object.keys( testCase.expect ).sort() );

			Object.entries( testCase.expect ).forEach( ( [ key, expected ] ) => {
				if ( typeof expected === 'boolean' || typeof expected === 'string' ) {
					expect( actual[ key ] ).toBe( expected );
					return;
				}

				expect( actual[ key ] ).toBeCloseTo( expected, 9 );
			} );
		} );
	} );
} );
