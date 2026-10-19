/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RulesPanel from '../../../admin-src/panels/RulesPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function schemaWith( { rules, fields, steps } ) {
	return {
		version: 1,
		settings: {},
		fields,
		steps,
		calculations: [ { key: 'total', expression: '0', label: 'Total', visible: true } ],
		rules,
		notifications: [],
	};
}

const FIELDS = {
	rooms: defaultField( 'number', 'rooms', 'Rooms' ),
	urgency: defaultField( 'select', 'urgency', 'Urgency' ),
	note: defaultField( 'text', 'note', 'Note' ),
};

const STEPS = [
	{ key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] },
	{ key: 'step_two', title: 'Two', description: '', fields: [ 'urgency', 'note' ] },
];

const condition = ( field, operator, value ) =>
	value === undefined ? { field, operator } : { field, operator, value };

const ONE_RULE = [
	{
		target: { kind: 'field', key: 'note' },
		action: 'show',
		match: 'all',
		conditions: [
			condition( 'urgency', 'equals', 'express' ),
			condition( 'rooms', 'greater', '3' ),
		],
	},
];

function Harness( { errorIndex = indexErrors( [] ), rules, fields = FIELDS, steps = STEPS } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( { id: 1, title: 'F', schema: schemaWith( { rules, fields, steps } ) } )
					)
				}
			>
				load
			</button>
			{ schema && <RulesPanel errorIndex={ errorIndex } /> }
		</>
	);
}

async function setup( props ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness { ...props } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

async function renderWithRule() {
	return setup( { rules: ONE_RULE } );
}

describe( 'the rule sentence', () => {
	it( 'keeps every select findable by its full name', async () => {
		await renderWithRule();

		for ( const name of [ 'Rule 1 target kind', 'Rule 1 target', 'Rule 1 action', 'Rule 1 match' ] ) {
			expect( screen.getByLabelText( name ) ).toBeInTheDocument();
		}
	} );

	it( 'hides those labels, because the sentence is their context', async () => {
		await renderWithRule();

		const action = screen.getByLabelText( 'Rule 1 action' );

		expect( document.querySelector( `label[for="${ action.id }"]` ) ).toHaveClass( 'screen-reader-text' );
	} );

	it( 'keeps the selects in their old order', async () => {
		await renderWithRule();

		const ids = Array.from( document.querySelectorAll( '.quoteform_rule__sentence select' ) ).map( ( el ) => el.id );

		expect( ids ).toEqual( [
			'quoteform_rule-0-target-kind',
			'quoteform_rule-0-target',
			'quoteform_rule-0-action',
			'quoteform_rule-0-match',
		] );
	} );

	it( 'joins conditions with the word that matches the rule', async () => {
		await renderWithRule(); // match: 'all', iki şərt

		const words = Array.from( document.querySelectorAll( '.quoteform_rule-condition .quoteform_rule__word' ) ).map(
			( el ) => el.textContent
		);

		expect( words ).toEqual( [ 'if', 'and' ] );
	} );

	it( 'joins conditions with "or" when any condition may match', async () => {
		await setup( { rules: [ { ...ONE_RULE[ 0 ], match: 'any' } ] } );

		const words = Array.from( document.querySelectorAll( '.quoteform_rule-condition .quoteform_rule__word' ) ).map(
			( el ) => el.textContent
		);

		expect( words ).toEqual( [ 'if', 'or' ] );
	} );

	it( 'keeps the condition controls named in full', async () => {
		await renderWithRule();

		expect( screen.getByLabelText( 'Rule 1 condition 2 operator' ) ).toBeInTheDocument();
	} );
} );
