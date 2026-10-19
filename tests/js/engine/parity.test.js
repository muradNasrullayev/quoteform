import fixtures from '../../fixtures/expressions.json';
import { clearExpressionCache, evaluateExpression } from '../../../frontend-src/engine';

describe( 'expression parity fixtures', () => {
	it( 'has unique case ids', () => {
		const ids = fixtures.cases.map( ( testCase ) => testCase.id );

		expect( new Set( ids ).size ).toBe( ids.length );
	} );

	it( 'declares exactly one of expect or error per case', () => {
		fixtures.cases.forEach( ( testCase ) => {
			const hasExpect = Object.prototype.hasOwnProperty.call( testCase, 'expect' );
			const hasError = Object.prototype.hasOwnProperty.call( testCase, 'error' );

			expect( hasExpect !== hasError ).toBe( true );
		} );
	} );

	describe.each( fixtures.cases.map( ( testCase ) => [ testCase.id, testCase ] ) )( '%s', ( id, testCase ) => {
		beforeEach( () => {
			clearExpressionCache();
		} );

		it( 'matches the shared fixture', () => {
			if ( Object.prototype.hasOwnProperty.call( testCase, 'error' ) ) {
				try {
					evaluateExpression( testCase.expr, testCase.vars );
					throw new Error( `Case "${ id }" should have raised "${ testCase.error }".` );
				} catch ( error ) {
					expect( error.codeSlug ).toBe( testCase.error );
				}

				return;
			}

			const actual = evaluateExpression( testCase.expr, testCase.vars );

			if ( typeof testCase.expect === 'boolean' || typeof testCase.expect === 'string' ) {
				expect( actual ).toBe( testCase.expect );
				return;
			}

			expect( actual ).toBeCloseTo( testCase.expect, 9 );
		} );
	} );
} );
