import { conditionHolds, ruleFires } from '../../../frontend-src/runtime/conditions';

const condition = ( field, operator, value ) =>
	value === undefined ? { field, operator } : { field, operator, value };

const field = ( key, type ) => ( { key, type, label: key } );

const schema = {
	fields: {
		rooms: field( 'rooms', 'number' ),
		gift: field( 'gift', 'toggle' ),
		urgency: field( 'urgency', 'text' ),
		toppings: field( 'toppings', 'checkbox' ),
	},
};

describe( 'conditionHolds', () => {
	it( 'compares equality without coercing types', () => {
		expect( conditionHolds( condition( 'a', 'equals', 'express' ), { a: 'express' } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'equals', 'express' ), { a: 'standard' } ) ).toBe( false );
		expect( conditionHolds( condition( 'a', 'equals', 5 ), { a: '5' } ) ).toBe( false );
	} );

	it( 'handles the five ordering operators numerically', () => {
		expect( conditionHolds( condition( 'a', 'not_equals', 2 ), { a: 3 } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'greater', 2 ), { a: 3 } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'greater_or_equal', 3 ), { a: 3 } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'less', 4 ), { a: 3 } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'less_or_equal', 3 ), { a: 3 } ) ).toBe( true );
	} );

	it( 'tests membership of a checkbox array', () => {
		expect( conditionHolds( condition( 'a', 'contains', 'gift' ), { a: [ 'gift', 'express' ] } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'contains', 'none' ), { a: [ 'gift' ] } ) ).toBe( false );
		expect( conditionHolds( condition( 'a', 'not_contains', 'none' ), { a: [ 'gift' ] } ) ).toBe( true );
	} );

	it( 'tests emptiness without treating zero as empty', () => {
		expect( conditionHolds( condition( 'a', 'is_empty' ), { a: '' } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'is_empty' ), { a: 0 } ) ).toBe( false );
		expect( conditionHolds( condition( 'a', 'is_not_empty' ), { a: 'x' } ) ).toBe( true );
	} );

	it( 'passes a value containing quotes and braces through untouched', () => {
		const awkward = 'he said "go" \\ {rooms}';

		expect( conditionHolds( condition( 'a', 'equals', awkward ), { a: awkward } ) ).toBe( true );
	} );

	it( 'is false rather than throwing when the operator is unknown', () => {
		expect( conditionHolds( condition( 'a', 'sideways', 1 ), { a: 1 } ) ).toBe( false );
	} );

	it( 'is false rather than throwing when the field no longer exists', () => {
		expect( conditionHolds( condition( 'ghost', 'equals', 'x' ), {} ) ).toBe( false );
	} );

	it( 'compares a number field against the string the builder stored', () => {
		expect( conditionHolds( condition( 'rooms', 'equals', '3' ), { rooms: 3 }, schema ) ).toBe( true );
		expect( conditionHolds( condition( 'rooms', 'greater', '2' ), { rooms: 3 }, schema ) ).toBe( true );
		expect( conditionHolds( condition( 'rooms', 'equals', '4' ), { rooms: 3 }, schema ) ).toBe( false );
	} );

	it( 'compares a toggle against the string the builder stored', () => {
		expect( conditionHolds( condition( 'gift', 'equals', '1' ), { gift: 1 }, schema ) ).toBe( true );
		expect( conditionHolds( condition( 'gift', 'equals', '0' ), { gift: 0 }, schema ) ).toBe( true );
	} );

	it( 'leaves a text field comparing as text', () => {
		expect( conditionHolds( condition( 'urgency', 'equals', 'express' ), { urgency: 'express' }, schema ) ).toBe( true );
		expect( conditionHolds( condition( 'urgency', 'equals', '5' ), { urgency: '5' }, schema ) ).toBe( true );
	} );

	it( 'fires contains on a checkbox field with the schema passed', () => {
		expect(
			conditionHolds( condition( 'toppings', 'contains', 'sprinkles' ), { toppings: [ 'sprinkles', 'cherry' ] }, schema )
		).toBe( true );
		expect(
			conditionHolds( condition( 'toppings', 'contains', 'none' ), { toppings: [ 'sprinkles', 'cherry' ] }, schema )
		).toBe( false );
	} );

	it( 'fires not_contains on a checkbox field with the schema passed', () => {
		expect(
			conditionHolds( condition( 'toppings', 'not_contains', 'sprinkles' ), { toppings: [ 'sprinkles', 'cherry' ] }, schema )
		).toBe( false );
		expect(
			conditionHolds( condition( 'toppings', 'not_contains', 'none' ), { toppings: [ 'sprinkles', 'cherry' ] }, schema )
		).toBe( true );
	} );

	it( 'compares equals against a checkbox field sensibly with the schema passed', () => {
		expect(
			conditionHolds( condition( 'toppings', 'equals', 'sprinkles' ), { toppings: [ 'sprinkles' ] }, schema )
		).toBe( false );
		expect(
			conditionHolds( condition( 'toppings', 'equals', 'sprinkles' ), { toppings: [] }, schema )
		).toBe( false );
	} );
} );

describe( 'ruleFires', () => {
	const rule = ( match, conditions ) => ( {
		target: { kind: 'field', key: 'target' },
		action: 'show',
		match,
		conditions,
	} );

	it( 'requires every condition when match is all', () => {
		const conditions = [ condition( 'a', 'equals', 1 ), condition( 'b', 'equals', 2 ) ];

		expect( ruleFires( rule( 'all', conditions ), { a: 1, b: 2 } ) ).toBe( true );
		expect( ruleFires( rule( 'all', conditions ), { a: 1, b: 9 } ) ).toBe( false );
	} );

	it( 'requires one condition when match is any', () => {
		const conditions = [ condition( 'a', 'equals', 1 ), condition( 'b', 'equals', 2 ) ];

		expect( ruleFires( rule( 'any', conditions ), { a: 1, b: 9 } ) ).toBe( true );
		expect( ruleFires( rule( 'any', conditions ), { a: 9, b: 9 } ) ).toBe( false );
	} );

	it( 'does not fire on an empty condition list', () => {
		expect( ruleFires( rule( 'all', [] ), {} ) ).toBe( false );
		expect( ruleFires( rule( 'any', [] ), {} ) ).toBe( false );
	} );
} );
