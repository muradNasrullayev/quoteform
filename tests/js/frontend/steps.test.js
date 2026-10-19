import { settleStep, stepPosition, visibleSteps } from '../../../frontend-src/runtime/steps';

const schema = {
	steps: [
		{ key: 'one', title: 'One', description: '', fields: [] },
		{ key: 'two', title: 'Two', description: '', fields: [] },
		{ key: 'three', title: 'Three', description: '', fields: [] },
		{ key: 'four', title: 'Four', description: '', fields: [] },
	],
};

const visibility = ( keys ) => ( { steps: new Set( keys ) } );

describe( 'visibleSteps', () => {
	it( 'keeps schema order', () => {
		const steps = visibleSteps( schema, visibility( [ 'four', 'one', 'three' ] ) );

		expect( steps.map( ( step ) => step.key ) ).toEqual( [ 'one', 'three', 'four' ] );
	} );

	it( 'returns an empty list when everything is hidden', () => {
		expect( visibleSteps( schema, visibility( [] ) ) ).toEqual( [] );
	} );
} );

describe( 'stepPosition', () => {
	it( 'counts only visible steps', () => {
		const steps = visibleSteps( schema, visibility( [ 'one', 'three', 'four' ] ) );

		expect( stepPosition( steps, 'three' ) ).toEqual( { index: 1, total: 3 } );
		expect( stepPosition( steps, 'four' ) ).toEqual( { index: 2, total: 3 } );
	} );

	it( 'reports index -1 for a step that is no longer visible', () => {
		const steps = visibleSteps( schema, visibility( [ 'one', 'four' ] ) );

		expect( stepPosition( steps, 'two' ).index ).toBe( -1 );
	} );
} );

describe( 'settleStep', () => {
	it( 'leaves a still-visible step alone', () => {
		const steps = visibleSteps( schema, visibility( [ 'one', 'three', 'four' ] ) );

		expect( settleStep( schema, steps, 'three' ) ).toBe( 'three' );
	} );

	it( 'falls back to the nearest visible step before the one that vanished', () => {
		const steps = visibleSteps( schema, visibility( [ 'one', 'two', 'four' ] ) );

		expect( settleStep( schema, steps, 'three' ) ).toBe( 'two' );
	} );

	it( 'falls forward only when nothing visible precedes the one that vanished', () => {
		const steps = visibleSteps( schema, visibility( [ 'three', 'four' ] ) );

		expect( settleStep( schema, steps, 'one' ) ).toBe( 'three' );
	} );

	it( 'has nowhere to settle when every step is hidden', () => {
		expect( settleStep( schema, [], 'one' ) ).toBeNull();
	} );
} );
