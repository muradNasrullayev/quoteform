import { calculate } from '../../../frontend-src/runtime/calculate';

const schema = ( calculations ) => ( {
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	calculations,
} );

describe( 'calculate with a malformed calculations entry', () => {
	it( 'ignores a null entry instead of throwing (Ruling R4)', () => {
		const result = calculate(
			schema( [ { key: 'total', expression: '{n} * 3', label: 'Total', visible: true }, null ] ),
			{ n: 2 }
		);

		expect( result.error ).toBeNull();
		expect( result.total ).toBe( 6 );
		expect( result.breakdown.map( ( row ) => row.key ) ).toEqual( [ 'total' ] );
	} );
} );
