import { variablesFor } from '../../../frontend-src/runtime/values';

const field = ( key, type, extra = {} ) => ( { key, type, label: key, ...extra } );

const options = [
	{ label: 'Standard', value: 'standard', price: 0 },
	{ label: 'Express', value: 'express', price: 60 },
	{ label: 'Gift wrap', value: 'gift_wrap', price: 15 },
];

// Yalnız §7.5-in "coercion yoxdur" qaydasını lookup nöqtəsində sancmaq üçün:
// `express_plus` `express`-in prefiksi olaraq daxil edilib, `1` isə string
// deyil, ədəddir — hər ikisi `optionPrice()`-dəki `===`-i boşaltsa tutulur.
const looseOptions = [
	{ label: 'Express Plus', value: 'express_plus', price: 99 },
	{ label: 'One', value: 1, price: 42 },
];

const schema = {
	fields: {
		rooms: field( 'rooms', 'number' ),
		area: field( 'area', 'slider' ),
		gift: field( 'gift', 'toggle' ),
		urgency: field( 'urgency', 'select', { options } ),
		plan: field( 'plan', 'radio', { options } ),
		extras: field( 'extras', 'checkbox', { options } ),
		notes: field( 'notes', 'textarea' ),
		when: field( 'when', 'date' ),
		probe: field( 'probe', 'select', { options: looseOptions } ),
	},
};

const allVisible = () => new Set( Object.keys( schema.fields ) );

describe( 'variablesFor', () => {
	it( 'returns numbers for number and slider fields', () => {
		const vars = variablesFor( schema, { rooms: '3', area: '55.5' }, allVisible() );

		expect( vars.rooms ).toBe( 3 );
		expect( vars.area ).toBe( 55.5 );
	} );

	it( 'returns 1 or 0 for a toggle', () => {
		expect( variablesFor( schema, { gift: true }, allVisible() ).gift ).toBe( 1 );
		expect( variablesFor( schema, { gift: false }, allVisible() ).gift ).toBe( 0 );
	} );

	it( 'returns the selected value for select and radio', () => {
		const vars = variablesFor( schema, { urgency: 'express', plan: 'standard' }, allVisible() );

		expect( vars.urgency ).toBe( 'express' );
		expect( vars.plan ).toBe( 'standard' );
	} );

	it( 'returns the selected option price for select and radio', () => {
		const vars = variablesFor( schema, { urgency: 'express', plan: 'standard' }, allVisible() );

		expect( vars[ 'urgency.price' ] ).toBe( 60 );
		expect( vars[ 'plan.price' ] ).toBe( 0 );
	} );

	it( 'returns an array for a checkbox and the sum of its prices', () => {
		const vars = variablesFor( schema, { extras: [ 'express', 'gift_wrap' ] }, allVisible() );

		expect( vars.extras ).toEqual( [ 'express', 'gift_wrap' ] );
		expect( vars[ 'extras.price' ] ).toBe( 75 );
	} );

	it( 'returns an empty array and a zero price for an untouched checkbox', () => {
		const vars = variablesFor( schema, {}, allVisible() );

		expect( vars.extras ).toEqual( [] );
		expect( vars[ 'extras.price' ] ).toBe( 0 );
	} );

	it( 'returns strings for text-like fields and dates', () => {
		const vars = variablesFor( schema, { notes: 'hello', when: '2026-09-17' }, allVisible() );

		expect( vars.notes ).toBe( 'hello' );
		expect( vars.when ).toBe( '2026-09-17' );
	} );

	it( 'resolves an unfilled field to an empty string, not to zero', () => {
		const vars = variablesFor( schema, {}, allVisible() );

		expect( vars.rooms ).toBe( '' );
		expect( vars.notes ).toBe( '' );
	} );

	it( 'gives no price variable to a type that cannot carry one', () => {
		const vars = variablesFor( schema, { rooms: '3', gift: true }, allVisible() );

		expect( vars ).not.toHaveProperty( 'rooms.price' );
		expect( vars ).not.toHaveProperty( 'gift.price' );
	} );

	it( 'resolves a hidden field to empty and its price to zero', () => {
		const visible = allVisible();
		visible.delete( 'urgency' );
		visible.delete( 'extras' );

		const vars = variablesFor(
			schema,
			{ urgency: 'express', extras: [ 'gift_wrap' ] },
			visible
		);

		expect( vars.urgency ).toBe( '' );
		expect( vars[ 'urgency.price' ] ).toBe( 0 );
		expect( vars.extras ).toEqual( [] );
		expect( vars[ 'extras.price' ] ).toBe( 0 );
	} );

	it( 'ignores a selected value that is not among the options', () => {
		const vars = variablesFor( schema, { urgency: 'deleted_option' }, allVisible() );

		expect( vars.urgency ).toBe( 'deleted_option' );
		expect( vars[ 'urgency.price' ] ).toBe( 0 );
	} );

	it( 'treats a non-numeric entry in a number field as unfilled', () => {
		const vars = variablesFor( schema, { rooms: 'abc' }, allVisible() );

		expect( vars.rooms ).toBe( '' );
	} );

	it( 'does not match a stale value that is a prefix of a live option value', () => {
		const vars = variablesFor( schema, { probe: 'express' }, allVisible() );

		expect( vars.probe ).toBe( 'express' );
		expect( vars[ 'probe.price' ] ).toBe( 0 );
	} );

	it( 'does not coerce type when matching an option value', () => {
		const vars = variablesFor( schema, { probe: '1' }, allVisible() );

		expect( vars.probe ).toBe( '1' );
		expect( vars[ 'probe.price' ] ).toBe( 0 );
	} );

	it( 'does not hand out the checkbox state array by reference', () => {
		const state = { extras: [ 'express', 'gift_wrap' ] };
		const vars = variablesFor( schema, state, allVisible() );

		vars.extras.push( 'mutated' );

		expect( state.extras ).toEqual( [ 'express', 'gift_wrap' ] );
	} );
} );
