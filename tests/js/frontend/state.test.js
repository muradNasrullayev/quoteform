import { createState } from '../../../frontend-src/runtime/state';

const schema = {
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', default: 1 },
		notes: { key: 'notes', type: 'textarea', label: 'Notes', default: '' },
		extras: { key: 'extras', type: 'checkbox', label: 'Extras', default: [] },
	},
};

describe( 'createState', () => {
	it( 'seeds itself from the schema defaults', () => {
		expect( createState( schema ).get() ).toEqual( { rooms: 1, notes: '', extras: [] } );
	} );

	it( 'notifies a subscriber when a value changes', () => {
		const state = createState( schema );
		const seen = [];

		state.subscribe( ( next ) => seen.push( next.rooms ) );
		state.set( 'rooms', 4 );

		expect( seen ).toEqual( [ 4 ] );
	} );

	it( 'does not notify when the value is unchanged', () => {
		const state = createState( schema );
		const seen = [];

		state.subscribe( () => seen.push( true ) );
		state.set( 'rooms', 1 );

		expect( seen ).toEqual( [] );
	} );

	it( 'treats an array value as changed only when its contents differ', () => {
		const state = createState( schema );
		const seen = [];

		state.subscribe( () => seen.push( true ) );
		state.set( 'extras', [] );
		state.set( 'extras', [ 'gift' ] );
		state.set( 'extras', [ 'gift' ] );

		expect( seen ).toHaveLength( 1 );
	} );

	it( 'hands out a copy, so a caller cannot mutate it from outside', () => {
		const state = createState( schema );

		state.get().rooms = 99;

		expect( state.get().rooms ).toBe( 1 );
	} );

	it( 'stops notifying after unsubscribe', () => {
		const state = createState( schema );
		const seen = [];
		const stop = state.subscribe( () => seen.push( true ) );

		stop();
		state.set( 'rooms', 7 );

		expect( seen ).toEqual( [] );
	} );
} );
