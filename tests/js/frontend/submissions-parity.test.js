import fixtures from '../../fixtures/submissions.json';
import { clearExpressionCache } from '../../../frontend-src/engine';
import { evaluateSubmission } from '../../../frontend-src/runtime/evaluate';

const closeOrNull = ( actual, expected ) => {
	if ( expected === null ) {
		expect( actual ).toBeNull();
		return;
	}

	expect( actual ).toBeCloseTo( expected, 9 );
};

describe( 'submission parity fixtures', () => {
	it( 'has unique case ids', () => {
		const ids = fixtures.cases.map( ( testCase ) => testCase.id );

		expect( new Set( ids ).size ).toBe( ids.length );
	} );

	it( 'names only schemas it defines', () => {
		fixtures.cases.forEach( ( testCase ) => {
			expect( fixtures.schemas[ testCase.schema ] ).toBeDefined();
		} );
	} );

	describe.each( fixtures.cases.map( ( testCase ) => [ testCase.id, testCase ] ) )( '%s', ( id, testCase ) => {
		it( 'matches the shared fixture', () => {
			clearExpressionCache();

			const actual = evaluateSubmission( fixtures.schemas[ testCase.schema ], testCase.values );
			const expected = testCase.expect;

			expect( actual.visible_fields ).toEqual( expected.visible_fields );
			expect( actual.visible_steps ).toEqual( expected.visible_steps );
			expect( actual.required ).toEqual( expected.required );
			expect( actual.errors ).toEqual( expected.errors );
			expect( actual.calc_error ).toBe( expected.calc_error );
			closeOrNull( actual.total, expected.total );
			expect( actual.breakdown.map( ( row ) => row.key ) ).toEqual( expected.breakdown.map( ( row ) => row.key ) );
			expected.breakdown.forEach( ( row, index ) => closeOrNull( actual.breakdown[ index ].amount, row.amount ) );
		} );
	} );
} );
