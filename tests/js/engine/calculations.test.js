import { evaluateAllCalculations, orderCalculations } from '../../../frontend-src/engine/calculations';

describe( 'orderCalculations', () => {
	it( 'orders dependencies before dependents', () => {
		expect(
			orderCalculations( [
				{ key: 'total', expression: '{subtotal} + 10' },
				{ key: 'subtotal', expression: '{a} * 2' },
			] )
		).toEqual( [ 'subtotal', 'total' ] );
	} );

	it( 'keeps declaration order when calculations are independent', () => {
		expect(
			orderCalculations( [
				{ key: 'b', expression: '2' },
				{ key: 'a', expression: '1' },
			] )
		).toEqual( [ 'b', 'a' ] );
	} );

	it( 'keeps declaration order for numeric-like keys', () => {
		expect(
			orderCalculations( [
				{ key: '2', expression: '20' },
				{ key: '1', expression: '10' },
			] )
		).toEqual( [ '2', '1' ] );
	} );
} );

describe( 'evaluateAllCalculations', () => {
	it( 'evaluates a chain', () => {
		expect(
			evaluateAllCalculations(
				[
					{ key: 'subtotal', expression: '{a} * 2' },
					{ key: 'total', expression: '{subtotal} + 10' },
				],
				{ a: 5 }
			)
		).toEqual( { subtotal: 10, total: 20 } );
	} );

	it( 'lets a calculation override a field of the same name', () => {
		const result = evaluateAllCalculations(
			[
				{ key: 'total', expression: '99' },
				{ key: 'doubled', expression: '{total} * 2' },
			],
			{ total: 5 }
		);

		expect( result ).toEqual( { total: 99, doubled: 198 } );
	} );
} );
