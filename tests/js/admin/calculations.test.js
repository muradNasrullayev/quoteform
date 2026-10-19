import { defaultCalculation, calculationsReducer } from '../../../admin-src/state/calculations';
import { KEY_PATTERN } from '../../../admin-src/lib/keys';
import {
	addCalculation,
	moveCalculation,
	removeCalculation,
	updateCalculation,
} from '../../../admin-src/state/actions';

const calculations = [
	{ key: 'subtotal', expression: '{rooms} * 50', label: 'Subtotal', visible: false },
	{ key: 'total', expression: '{subtotal}', label: 'Total', visible: true },
];

describe( 'defaultCalculation', () => {
	it( 'has exactly the four keys the server requires', () => {
		expect( Object.keys( defaultCalculation( 'x' ) ).sort() ).toEqual( [
			'expression',
			'key',
			'label',
			'visible',
		] );
	} );

	it( 'starts with a formula that compiles, not an empty one', () => {
		expect( defaultCalculation( 'x' ).expression ).toBe( '0' );
	} );
} );

describe( 'calculationsReducer', () => {
	it( 'appends with a unique key, at the end, leaving the rest untouched', () => {
		const next = calculationsReducer( calculations, addCalculation() );

		expect( next ).toHaveLength( 3 );
		expect( new Set( next.map( ( c ) => c.key ) ).size ).toBe( 3 );
		expect( next[ 0 ] ).toBe( calculations[ 0 ] );
		expect( next[ 1 ] ).toBe( calculations[ 1 ] );
		expect( next[ 2 ].key ).toMatch( KEY_PATTERN );
	} );

	it( 'patches one calculation', () => {
		const next = calculationsReducer( calculations, updateCalculation( 0, { label: 'Sub' } ) );

		expect( next[ 0 ].label ).toBe( 'Sub' );
		expect( next[ 1 ].label ).toBe( 'Total' );
	} );

	it( 'removes one', () => {
		expect( calculationsReducer( calculations, removeCalculation( 0 ) ) ).toHaveLength( 1 );
	} );

	it( 'ignores an index that is not there', () => {
		expect( calculationsReducer( calculations, removeCalculation( 9 ) ) ).toBe( calculations );
		expect( calculationsReducer( calculations, updateCalculation( 9, { label: 'x' } ) ) ).toBe(
			calculations
		);
	} );

	it( 'moves one', () => {
		expect( calculationsReducer( calculations, moveCalculation( 1, 'up' ) )[ 0 ].key ).toBe( 'total' );
	} );

	it( 'does nothing for a direction it does not recognise', () => {
		expect( calculationsReducer( calculations, moveCalculation( 1, 'sideways' ) ) ).toBe(
			calculations
		);
	} );

	it( 'does nothing for an unrecognised direction even at a non-boundary index', () => {
		const three = [ ...calculations, { key: 'extra', expression: '1', label: 'Extra', visible: false } ];

		expect( calculationsReducer( three, moveCalculation( 1, 'sideways' ) ) ).toBe( three );
	} );

	it( 'returns the array it was given when a move hits the boundary', () => {
		expect( calculationsReducer( calculations, moveCalculation( 0, 'up' ) ) ).toBe( calculations );
		expect( calculationsReducer( calculations, moveCalculation( 1, 'down' ) ) ).toBe( calculations );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( calculations );

		calculationsReducer( calculations, updateCalculation( 0, { label: 'Changed' } ) );

		expect( JSON.stringify( calculations ) ).toBe( before );
	} );
} );
