import { calculate } from '../../../frontend-src/runtime/calculate';

const schema = ( calculations ) => ( {
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	calculations,
} );

const chain = [
	{ key: 'subtotal', expression: '{rooms} * 50', label: 'Subtotal', visible: true },
	{ key: 'fee', expression: '{subtotal} * 0.1', label: 'Service fee', visible: false },
	{ key: 'total', expression: '{subtotal} + {fee}', label: 'Total', visible: true },
];

describe( 'calculate', () => {
	it( 'resolves calculations that depend on each other', () => {
		const result = calculate( schema( chain ), { rooms: 2 } );

		expect( result.values.subtotal ).toBe( 100 );
		expect( result.values.fee ).toBe( 10 );
		expect( result.total ).toBe( 110 );
	} );

	it( 'includes invisible calculations in the maths but not the breakdown', () => {
		const result = calculate( schema( chain ), { rooms: 2 } );

		expect( result.breakdown.map( ( row ) => row.key ) ).toEqual( [ 'subtotal', 'total' ] );
		expect( result.values.fee ).toBe( 10 );
	} );

	it( 'formats every breakdown row', () => {
		const result = calculate( schema( chain ), { rooms: 2 } );

		expect( result.breakdown[ 0 ] ).toEqual( { key: 'subtotal', label: 'Subtotal', amount: 100, formatted: '$100.00' } );
	} );

	it( 'reports a runtime error instead of throwing', () => {
		const result = calculate(
			schema( [ { key: 'total', expression: '{rooms} / 0', label: 'Total', visible: true } ] ),
			{ rooms: 2 }
		);

		expect( result.error ).toBe( 'division_by_zero' );
		expect( result.total ).toBeNull();
		expect( result.breakdown ).toEqual( [] );
	} );

	it( 'reports a reference to a field that no longer exists', () => {
		const result = calculate(
			schema( [ { key: 'total', expression: '{ghost} * 2', label: 'Total', visible: true } ] ),
			{}
		);

		expect( result.error ).toBe( 'unknown_variable' );
		expect( result.total ).toBeNull();
	} );

	it( 'reports a circular reference rather than looping', () => {
		const result = calculate(
			schema( [
				{ key: 'a', expression: '{b}', label: 'A', visible: true },
				{ key: 'b', expression: '{a}', label: 'B', visible: true },
				{ key: 'total', expression: '0', label: 'Total', visible: true },
			] ),
			{}
		);

		expect( result.error ).toBe( 'circular_reference' );
	} );

	it( 'returns a null total when the schema has no total calculation', () => {
		const result = calculate(
			schema( [ { key: 'subtotal', expression: '10', label: 'Subtotal', visible: true } ] ),
			{}
		);

		expect( result.total ).toBeNull();
		expect( result.error ).toBeNull();
	} );

	it( 'never returns the total as a string', () => {
		const result = calculate( schema( chain ), { rooms: 2 } );

		expect( typeof result.total ).toBe( 'number' );
	} );
} );
