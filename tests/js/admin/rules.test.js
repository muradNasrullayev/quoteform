import {
	ACTION_LABELS,
	ACTIONS,
	defaultCondition,
	defaultRule,
	FIELD_ONLY_ACTIONS,
	OPERATOR_LABELS,
	OPERATORS,
	rulesReducer,
	VALUELESS_OPERATORS,
} from '../../../admin-src/state/rules';
import {
	addCondition,
	addRule,
	removeCondition,
	removeRule,
	updateCondition,
	updateRule,
} from '../../../admin-src/state/actions';

const rules = [
	{
		target: { kind: 'field', key: 'note' },
		action: 'show',
		match: 'all',
		conditions: [ { field: 'urgency', operator: 'equals', value: 'express' } ],
	},
];

describe( 'the vocabulary', () => {
	it( 'matches the server exactly', () => {
		expect( ACTIONS ).toEqual( [ 'show', 'hide', 'require', 'optional' ] );
		expect( FIELD_ONLY_ACTIONS ).toEqual( [ 'require', 'optional' ] );
		expect( OPERATORS ).toHaveLength( 10 );
		expect( OPERATORS[ 0 ] ).toBe( 'equals' );
		expect( VALUELESS_OPERATORS ).toEqual( [ 'is_empty', 'is_not_empty' ] );
	} );
} );

describe( 'defaults', () => {
	it( 'has a name for every operator and every action', () => {
		expect( Object.keys( OPERATOR_LABELS ) ).toEqual( OPERATORS );
		expect( Object.keys( ACTION_LABELS ) ).toEqual( ACTIONS );
	} );

	it( 'gives a rule exactly the four keys the server requires', () => {
		expect( Object.keys( defaultRule() ).sort() ).toEqual( [
			'action',
			'conditions',
			'match',
			'target',
		] );
	} );

	it( 'gives a rule one starter condition, because an empty list is invalid', () => {
		expect( defaultRule().conditions ).toHaveLength( 1 );
	} );

	it( 'gives a condition a value, because the default operator needs one', () => {
		expect( defaultCondition() ).toEqual( { field: '', operator: 'equals', value: '' } );
	} );
} );

describe( 'rulesReducer', () => {
	it( 'adds and removes rules', () => {
		expect( rulesReducer( rules, addRule() ) ).toHaveLength( 2 );
		expect( rulesReducer( rules, removeRule( 0 ) ) ).toHaveLength( 0 );
	} );

	it( 'patches a rule', () => {
		const next = rulesReducer( rules, updateRule( 0, { action: 'hide' } ) );

		expect( next[ 0 ].action ).toBe( 'hide' );
		expect( next[ 0 ].match ).toBe( 'all' );
	} );

	it( 'corrects a field-only action when the target becomes a step', () => {
		const withRequire = rulesReducer( rules, updateRule( 0, { action: 'require' } ) );
		const next = rulesReducer(
			withRequire,
			updateRule( 0, { target: { kind: 'step', key: 'step_two' } } )
		);

		expect( next[ 0 ].action ).toBe( 'show' );
	} );

	it( 'leaves a step-safe action alone when the target becomes a step', () => {
		const withHide = rulesReducer( rules, updateRule( 0, { action: 'hide' } ) );
		const next = rulesReducer(
			withHide,
			updateRule( 0, { target: { kind: 'step', key: 'step_two' } } )
		);

		expect( next[ 0 ].action ).toBe( 'hide' );
	} );

	it( 'corrects a field-only action requested directly on a rule whose target is already a step', () => {
		const stepRule = [
			{ ...rules[ 0 ], target: { kind: 'step', key: 'step_two' } },
		];
		const next = rulesReducer( stepRule, updateRule( 0, { action: 'require' } ) );

		expect( next[ 0 ].action ).toBe( 'show' );
	} );

	it( 'adds and removes conditions', () => {
		expect( rulesReducer( rules, addCondition( 0 ) )[ 0 ].conditions ).toHaveLength( 2 );

		const two = rulesReducer( rules, addCondition( 0 ) );

		expect( rulesReducer( two, removeCondition( 0, 1 ) )[ 0 ].conditions ).toHaveLength( 1 );
	} );

	it( 'refuses to remove the last condition', () => {
		expect( rulesReducer( rules, removeCondition( 0, 0 ) ) ).toBe( rules );
	} );

	it( 'drops the value key when the operator stops needing one', () => {
		const next = rulesReducer( rules, updateCondition( 0, 0, { operator: 'is_empty' } ) );

		expect( 'value' in next[ 0 ].conditions[ 0 ] ).toBe( false );
	} );

	it( 'puts the value key back when the operator needs one again', () => {
		const empty = rulesReducer( rules, updateCondition( 0, 0, { operator: 'is_empty' } ) );
		const back = rulesReducer( empty, updateCondition( 0, 0, { operator: 'equals' } ) );

		expect( back[ 0 ].conditions[ 0 ].value ).toBe( '' );
	} );

	it( 'ignores indexes that are not there', () => {
		expect( rulesReducer( rules, updateRule( 9, { action: 'hide' } ) ) ).toBe( rules );
		expect( rulesReducer( rules, updateCondition( 9, 0, {} ) ) ).toBe( rules );
		expect( rulesReducer( rules, updateCondition( 0, 9, {} ) ) ).toBe( rules );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( rules );

		rulesReducer( rules, updateRule( 0, { action: 'hide' } ) );

		expect( JSON.stringify( rules ) ).toBe( before );
	} );
} );
