import { fieldReferences } from '../../../admin-src/lib/references';

function schema( overrides ) {
	return {
		version: 1,
		settings: {},
		fields: {},
		steps: [],
		calculations: [],
		rules: [],
		notifications: [],
		...overrides,
	};
}

describe( 'fieldReferences', () => {
	it( 'finds nothing for an unused key', () => {
		expect( fieldReferences( schema( {} ), 'rooms' ) ).toEqual( [] );
	} );

	it( 'finds a step that shows the field', () => {
		const found = fieldReferences(
			schema( { steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ] } ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
		expect( found[ 0 ] ).toContain( 'One' );
	} );

	it( 'finds a calculation that uses the field', () => {
		const found = fieldReferences(
			schema( {
				calculations: [
					{ key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true },
				],
			} ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
		expect( found[ 0 ] ).toContain( 'total' );
	} );

	it( 'finds the price suffix too', () => {
		const found = fieldReferences(
			schema( {
				calculations: [
					{ key: 'total', expression: '{urgency.price}', label: 'Total', visible: true },
				],
			} ),
			'urgency'
		);

		expect( found ).toHaveLength( 1 );
	} );

	it( 'does NOT match a key that merely shares a prefix', () => {
		const found = fieldReferences(
			schema( {
				calculations: [
					{ key: 'total', expression: '{bedrooms} * 50', label: 'Total', visible: true },
				],
			} ),
			'rooms'
		);

		expect( found ).toEqual( [] );
	} );

	it( 'ignores a broken expression instead of throwing', () => {
		expect( () =>
			fieldReferences(
				schema( {
					calculations: [ { key: 'total', expression: '{rooms} * ', label: 'T', visible: true } ],
				} ),
				'rooms'
			)
		).not.toThrow();
	} );

	it( 'finds a rule that targets the field', () => {
		const found = fieldReferences(
			schema( {
				rules: [
					{
						target: { kind: 'field', key: 'rooms' },
						action: 'show',
						match: 'all',
						conditions: [],
					},
				],
			} ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
	} );

	it( 'finds a rule whose condition tests the field', () => {
		const found = fieldReferences(
			schema( {
				rules: [
					{
						target: { kind: 'step', key: 'step_two' },
						action: 'hide',
						match: 'all',
						conditions: [ { field: 'rooms', operator: 'is_empty', value: '' } ],
					},
				],
			} ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
	} );

	it( 'survives a schema full of malformed parts', () => {
		expect( () =>
			fieldReferences(
				schema( {
					steps: [ null, 'nope', { fields: 'not-a-list' } ],
					calculations: [ null, { expression: 42 } ],
					rules: [ null, { target: 'nope', conditions: 'nope' } ],
				} ),
				'rooms'
			)
		).not.toThrow();
	} );

	it( 'survives steps, calculations and rules that are not arrays at all', () => {
		// Kills: the mutant that removes the top-level
		// `Array.isArray( schema.X ) ? schema.X : []` guards — the
		// existing malformed-parts test only puts junk INSIDE arrays, it
		// never puts junk in place of the arrays themselves.
		expect( () =>
			fieldReferences(
				schema( { steps: 'nope', calculations: 42, rules: null } ),
				'rooms'
			)
		).not.toThrow();

		expect(
			fieldReferences( schema( { steps: 'nope', calculations: 42, rules: null } ), 'rooms' )
		).toEqual( [] );
	} );

	it( 'reports a rule once, not twice, when it both targets and tests the key', () => {
		// Kills: the mutant that pushes once per matching condition
		// (`targetsIt` and `testsIt` each a separate `if`/push) instead
		// of a single `if ( targetsIt || testsIt )`.
		const found = fieldReferences(
			schema( {
				rules: [
					{
						target: { kind: 'field', key: 'rooms' },
						action: 'show',
						match: 'all',
						conditions: [ { field: 'rooms', operator: 'is_empty', value: '' } ],
					},
				],
			} ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
	} );
} );
