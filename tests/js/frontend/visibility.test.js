import { resolveVisibility } from '../../../frontend-src/runtime/visibility';

const baseSchema = ( rules ) => ( {
	fields: {
		urgency: { key: 'urgency', type: 'select', label: 'Urgency', options: [
			{ label: 'Standard', value: 'standard', price: 0 },
			{ label: 'Express', value: 'express', price: 60 },
		] },
		notes: { key: 'notes', type: 'textarea', label: 'Notes', required: true },
		rooms: { key: 'rooms', type: 'number', label: 'Rooms' },
	},
	steps: [
		{ key: 'step_one', title: 'One', description: '', fields: [ 'urgency', 'rooms' ] },
		{ key: 'step_two', title: 'Two', description: '', fields: [ 'notes' ] },
	],
	calculations: [ { key: 'total', expression: '0', label: 'Total', visible: true } ],
	rules: rules || [],
} );

const rule = ( kind, key, action, conditions, match = 'all' ) => ( {
	target: { kind, key },
	action,
	match,
	conditions,
} );

describe( 'resolveVisibility', () => {
	it( 'shows everything when there are no rules', () => {
		const { fields, steps } = resolveVisibility( baseSchema(), {} );

		expect( [ ...fields ].sort() ).toEqual( [ 'notes', 'rooms', 'urgency' ] );
		expect( [ ...steps ].sort() ).toEqual( [ 'step_one', 'step_two' ] );
	} );

	it( 'hides a field when a hide rule fires', () => {
		const schema = baseSchema( [
			rule( 'field', 'notes', 'hide', [ { field: 'urgency', operator: 'equals', value: 'standard' } ] ),
		] );

		expect( resolveVisibility( schema, { urgency: 'standard' } ).fields.has( 'notes' ) ).toBe( false );
		expect( resolveVisibility( schema, { urgency: 'express' } ).fields.has( 'notes' ) ).toBe( true );
	} );

	it( 'hides a step, and its fields with it', () => {
		const schema = baseSchema( [
			rule( 'step', 'step_two', 'hide', [ { field: 'urgency', operator: 'equals', value: 'standard' } ] ),
		] );

		const resolved = resolveVisibility( schema, { urgency: 'standard' } );

		expect( resolved.steps.has( 'step_two' ) ).toBe( false );
		expect( resolved.fields.has( 'notes' ) ).toBe( false );
	} );

	it( 'makes a hidden required field not required', () => {
		const schema = baseSchema( [
			rule( 'field', 'notes', 'hide', [ { field: 'urgency', operator: 'equals', value: 'standard' } ] ),
		] );

		expect( resolveVisibility( schema, { urgency: 'standard' } ).required.has( 'notes' ) ).toBe( false );
		expect( resolveVisibility( schema, { urgency: 'express' } ).required.has( 'notes' ) ).toBe( true );
	} );

	it( 'applies require and optional rules to a visible field', () => {
		const required = baseSchema( [
			rule( 'field', 'rooms', 'require', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );
		const optional = baseSchema( [
			rule( 'field', 'notes', 'optional', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		expect( resolveVisibility( required, { urgency: 'express' } ).required.has( 'rooms' ) ).toBe( true );
		expect( resolveVisibility( optional, { urgency: 'express' } ).required.has( 'notes' ) ).toBe( false );
	} );

	it( 'ignores a require rule aimed at a step', () => {
		const schema = baseSchema( [
			rule( 'step', 'step_two', 'require', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		expect( () => resolveVisibility( schema, { urgency: 'express' } ) ).not.toThrow();
		expect( resolveVisibility( schema, { urgency: 'express' } ).steps.has( 'step_two' ) ).toBe( true );
	} );

	it( 'treats a hidden field as empty when a later rule tests it', () => {
		const schema = baseSchema( [
			rule( 'field', 'urgency', 'hide', [ { field: 'rooms', operator: 'greater', value: 2 } ] ),
			rule( 'field', 'notes', 'hide', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		const resolved = resolveVisibility( schema, { rooms: 5, urgency: 'express' } );

		expect( resolved.fields.has( 'urgency' ) ).toBe( false );
		expect( resolved.fields.has( 'notes' ) ).toBe( true );
	} );

	it( 'settles rather than hanging when two rules chase each other', () => {
		const schema = baseSchema( [
			rule( 'field', 'urgency', 'hide', [ { field: 'notes', operator: 'is_empty' } ] ),
			rule( 'field', 'notes', 'hide', [ { field: 'urgency', operator: 'is_empty' } ] ),
		] );

		const resolved = resolveVisibility( schema, { urgency: '', notes: '' } );

		expect( resolved.fields ).toBeInstanceOf( Set );
	} );

	it( 'lets the last rule win when two disagree', () => {
		const schema = baseSchema( [
			rule( 'field', 'rooms', 'hide', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
			rule( 'field', 'rooms', 'show', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		expect( resolveVisibility( schema, { urgency: 'express' } ).fields.has( 'rooms' ) ).toBe( true );
	} );

	it( 'ignores a rule aimed at something that no longer exists', () => {
		const schema = baseSchema( [
			rule( 'field', 'ghost', 'hide', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
			rule( 'step', 'ghost_step', 'hide', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		expect( () => resolveVisibility( schema, { urgency: 'express' } ) ).not.toThrow();
	} );
} );
