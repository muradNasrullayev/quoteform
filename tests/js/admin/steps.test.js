import { defaultStep, stepsReducer } from '../../../admin-src/state/steps';
import {
	addStep,
	assignField,
	moveStep,
	removeStep,
	unassignField,
	updateStep,
} from '../../../admin-src/state/actions';
import { KEY_PATTERN } from '../../../admin-src/lib/keys';

const steps = [
	{ key: 'step_one', title: 'One', description: '', fields: [ 'a', 'b' ] },
	{ key: 'step_two', title: 'Two', description: '', fields: [ 'c' ] },
];

describe( 'defaultStep', () => {
	it( 'has exactly the four keys the server requires', () => {
		expect( Object.keys( defaultStep( 'step_one', 'One' ) ).sort() ).toEqual( [
			'description',
			'fields',
			'key',
			'title',
		] );
	} );

	it( 'starts with an empty field list', () => {
		expect( defaultStep( 'step_one', 'One' ).fields ).toEqual( [] );
	} );
} );

describe( 'stepsReducer', () => {
	it( 'appends a step with a unique, lower-case key, in last position, keeping the existing steps by reference', () => {
		const next = stepsReducer( steps, addStep() );

		expect( next ).toHaveLength( 3 );
		expect( new Set( next.map( ( step ) => step.key ) ).size ).toBe( 3 );
		expect( next[ 0 ] ).toBe( steps[ 0 ] );
		expect( next[ 1 ] ).toBe( steps[ 1 ] );
		expect( KEY_PATTERN.test( next[ 2 ].key ) ).toBe( true );
	} );

	it( 'patches one step', () => {
		const next = stepsReducer( steps, updateStep( 1, { title: 'Renamed' } ) );

		expect( next[ 1 ].title ).toBe( 'Renamed' );
		expect( next[ 0 ].title ).toBe( 'One' );
	} );

	it( 'removes a step', () => {
		expect( stepsReducer( steps, removeStep( 0 ) ) ).toHaveLength( 1 );
	} );

	it( 'ignores an index that is not there', () => {
		expect( stepsReducer( steps, removeStep( 9 ) ) ).toBe( steps );
		expect( stepsReducer( steps, updateStep( 9, { title: 'x' } ) ) ).toBe( steps );
		expect( stepsReducer( steps, assignField( 'a', 9 ) ) ).toBe( steps );
		expect( stepsReducer( steps, unassignField( 'ghost' ) ) ).toBe( steps );
	} );

	it( 'moves a step', () => {
		expect( stepsReducer( steps, moveStep( 1, 'up' ) )[ 0 ].key ).toBe( 'step_two' );
		expect( stepsReducer( steps, moveStep( 0, 'down' ) )[ 0 ].key ).toBe( 'step_two' );
	} );

	it( 'does nothing for a direction that is neither up nor down', () => {
		expect( stepsReducer( steps, moveStep( 0, 'sideways' ) ) ).toBe( steps );
	} );

	it( 'assigns a field to a step and removes it from wherever it was', () => {
		const next = stepsReducer( steps, assignField( 'a', 1 ) );

		expect( next[ 0 ].fields ).toEqual( [ 'b' ] );
		expect( next[ 1 ].fields ).toEqual( [ 'c', 'a' ] );
	} );

	it( 'never leaves a field on two steps, even when assigned to the one it is already on', () => {
		const next = stepsReducer( steps, assignField( 'a', 0 ) );
		const appearances = next.reduce(
			( count, step ) => count + step.fields.filter( ( key ) => key === 'a' ).length,
			0
		);

		expect( appearances ).toBe( 1 );
	} );

	it( 'does not reorder a field within the step it already sits on', () => {
		expect( stepsReducer( steps, assignField( 'a', 0 ) ) ).toBe( steps );
	} );

	it( 'collapses a field present on two steps at once onto the target in a single pass', () => {
		const corrupt = [
			{ key: 'step_one', title: 'One', description: '', fields: [ 'a', 'b' ] },
			{ key: 'step_two', title: 'Two', description: '', fields: [ 'c', 'a' ] },
		];

		const next = stepsReducer( corrupt, assignField( 'a', 1 ) );

		expect( next[ 0 ].fields ).toEqual( [ 'b' ] );
		expect( next[ 1 ].fields ).toEqual( [ 'c', 'a' ] );
	} );

	it( 'unassigns a field from every step', () => {
		const next = stepsReducer( steps, unassignField( 'a' ) );

		expect( next[ 0 ].fields ).toEqual( [ 'b' ] );
		expect( next[ 1 ].fields ).toEqual( [ 'c' ] );
	} );

	it( 'does not rewrite step objects that did not have the unassigned field', () => {
		const next = stepsReducer( steps, unassignField( 'a' ) );

		expect( next[ 1 ] ).toBe( steps[ 1 ] );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( steps );

		stepsReducer( steps, assignField( 'a', 1 ) );

		expect( JSON.stringify( steps ) ).toBe( before );
	} );
} );

describe( 'stepsReducer with three steps (named vs. first)', () => {
	const three = () => [
		{ key: 'a', title: 'A', description: '', fields: [ 'x' ] },
		{ key: 'b', title: 'B', description: '', fields: [ 'y' ] },
		{ key: 'c', title: 'C', description: '', fields: [ 'z' ] },
	];

	it( 'removes the named step, not the first, leaving the others by identity', () => {
		const list = three();
		const next = stepsReducer( list, removeStep( 1 ) );

		expect( next.map( ( step ) => step.key ) ).toEqual( [ 'a', 'c' ] );
		expect( next[ 0 ] ).toBe( list[ 0 ] );
		expect( next[ 1 ] ).toBe( list[ 2 ] );
	} );

	it( 'patches only the named step, leaving the other two by identity', () => {
		const list = three();
		const next = stepsReducer( list, updateStep( 1, { title: 'Renamed' } ) );

		expect( next[ 0 ] ).toBe( list[ 0 ] );
		expect( next[ 1 ].title ).toBe( 'Renamed' );
		expect( next[ 2 ] ).toBe( list[ 2 ] );
	} );

	it( 'moves the named step, not the first, leaving the untouched step by identity', () => {
		const list = three();
		const next = stepsReducer( list, moveStep( 1, 'down' ) );

		expect( next.map( ( step ) => step.key ) ).toEqual( [ 'a', 'c', 'b' ] );
		expect( next[ 0 ] ).toBe( list[ 0 ] );
	} );

	it( 'assigns a field to the named step, leaving the untouched step alone', () => {
		const list = three();
		const next = stepsReducer( list, assignField( 'x', 2 ) );

		expect( next[ 0 ].fields ).toEqual( [] );
		expect( next[ 1 ].fields ).toEqual( [ 'y' ] );
		expect( next[ 2 ].fields ).toEqual( [ 'z', 'x' ] );
	} );

	it( 'unassigns a field from the middle step, leaving the other two alone', () => {
		const list = three();
		const next = stepsReducer( list, unassignField( 'y' ) );

		expect( next[ 0 ].fields ).toEqual( [ 'x' ] );
		expect( next[ 1 ].fields ).toEqual( [] );
		expect( next[ 2 ].fields ).toEqual( [ 'z' ] );
	} );
} );
