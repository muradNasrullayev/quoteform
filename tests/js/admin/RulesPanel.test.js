/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
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

const rule = ( key, action, conditions ) => ( {
	target: { kind: 'field', key },
	action,
	match: 'all',
	conditions,
} );

const condition = ( field, operator, value ) =>
	value === undefined ? { field, operator } : { field, operator, value };

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

const three = [
	rule( 'note', 'show', [ condition( 'urgency', 'equals', 'express' ) ] ),
	rule( 'rooms', 'hide', [ condition( 'note', 'contains', 'urgent' ) ] ),
	rule( 'urgency', 'require', [ condition( 'rooms', 'greater', '3' ) ] ),
];

describe( 'RulesPanel', () => {
	it( 'names the condition fields so two same-labelled fields can be told apart', async () => {
		const user = await setup( {
			rules: [],
			fields: {
				first: defaultField( 'number', 'first', 'New field' ),
				second: defaultField( 'number', 'second', 'New field' ),
			},
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add rule' } ) );

		const options = within(
			screen.getByLabelText( 'Rule 1 condition 1 field' )
		).getAllByRole( 'option' );

		const labels = options.map( ( option ) => option.textContent );

		expect( labels ).toContain( 'New field (first)' );
		expect( labels ).toContain( 'New field (second)' );
		expect( new Set( labels ).size ).toBe( labels.length );
	} );

	it( 'says so when there are no rules', async () => {
		await setup( { rules: [] } );

		expect(
			screen.getByText( 'No rules yet. Add one to show or hide things conditionally.' )
		).toBeInTheDocument();
	} );

	it( 'adds a rule with one condition', async () => {
		const user = await setup( { rules: [] } );

		await user.click( screen.getByRole( 'button', { name: 'Add rule' } ) );

		expect( screen.getByLabelText( 'Rule 1 target' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Rule 1 condition 1 field' ) ).toBeInTheDocument();
		expect( screen.queryByLabelText( 'Rule 1 condition 2 field' ) ).not.toBeInTheDocument();
	} );

	it( 'shows a placeholder rather than “Unrecognised value” for a fresh rule', async () => {
		const user = await setup( { rules: [] } );

		await user.click( screen.getByRole( 'button', { name: 'Add rule' } ) );

		expect( screen.queryByText( /Unrecognised value/ ) ).not.toBeInTheDocument();
		expect( screen.getByText( 'Choose a field…' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Choose a field to test…' ) ).toBeInTheDocument();
	} );

	it( 'offers field keys when the target kind is field', async () => {
		await setup( { rules: [ three[ 0 ] ] } );

		const options = within( screen.getByLabelText( 'Rule 1 target' ) ).getAllByRole( 'option' );

		expect( options.map( ( option ) => option.value ) ).toEqual( [ 'rooms', 'urgency', 'note' ] );
	} );

	it( 'offers step keys when the target kind is step', async () => {
		const user = await setup( { rules: [ three[ 0 ] ] } );

		await user.selectOptions( screen.getByLabelText( 'Rule 1 target kind' ), 'step' );

		const options = within( screen.getByLabelText( 'Rule 1 target' ) ).getAllByRole( 'option' );

		expect( options.map( ( option ) => option.value ) ).toEqual(
			expect.arrayContaining( [ 'step_one', 'step_two' ] )
		);
		expect( options.map( ( option ) => option.value ) ).not.toContain( 'rooms' );
	} );

	it( 'narrows the action list for a step target', async () => {
		const user = await setup( { rules: [ three[ 0 ] ] } );

		await user.selectOptions( screen.getByLabelText( 'Rule 1 target kind' ), 'step' );

		const options = within( screen.getByLabelText( 'Rule 1 action' ) ).getAllByRole( 'option' );

		expect( options.map( ( option ) => option.value ) ).toEqual( [ 'show', 'hide' ] );
	} );

	it( 'corrects a field-only action when the target becomes a step', async () => {
		const user = await setup( { rules: [ three[ 2 ] ] } );

		expect( screen.getByLabelText( 'Rule 1 action' ) ).toHaveValue( 'require' );

		await user.selectOptions( screen.getByLabelText( 'Rule 1 target kind' ), 'step' );

		expect( screen.getByLabelText( 'Rule 1 action' ) ).toHaveValue( 'show' );
	} );

	it( 'reads its operators as English, not snake_case', async () => {
		await setup( { rules: [ three[ 1 ] ] } );

		const options = within(
			screen.getByLabelText( 'Rule 1 condition 1 operator' )
		).getAllByRole( 'option' );

		expect( options.map( ( option ) => option.textContent ) ).toEqual( [
			'is equal to',
			'is not equal to',
			'is greater than',
			'is greater than or equal to',
			'is less than',
			'is less than or equal to',
			'contains',
			'does not contain',
			'is empty',
			'is not empty',
		] );
	} );

	it( 'hides the value control for a valueless operator', async () => {
		const user = await setup( { rules: [ three[ 0 ] ] } );

		expect( screen.getByLabelText( 'Rule 1 condition 1 value' ) ).toBeInTheDocument();

		await user.selectOptions(
			screen.getByLabelText( 'Rule 1 condition 1 operator' ),
			'is_empty'
		);

		expect( screen.queryByLabelText( 'Rule 1 condition 1 value' ) ).not.toBeInTheDocument();
	} );

	it( 'edits the rule named in the control, not the first one', async () => {
		const user = await setup( { rules: three } );

		await user.selectOptions( screen.getByLabelText( 'Rule 2 action' ), 'show' );

		expect( screen.getByLabelText( 'Rule 1 action' ) ).toHaveValue( 'show' );
		expect( screen.getByLabelText( 'Rule 2 action' ) ).toHaveValue( 'show' );
		expect( screen.getByLabelText( 'Rule 3 action' ) ).toHaveValue( 'require' );
	} );

	it( 'edits the condition named in the control, not the first one', async () => {
		const user = await setup( {
			rules: [
				rule( 'note', 'show', [
					condition( 'urgency', 'equals', 'express' ),
					condition( 'rooms', 'greater', '3' ),
					condition( 'note', 'contains', 'x' ),
				] ),
			],
		} );

		await user.selectOptions(
			screen.getByLabelText( 'Rule 1 condition 2 operator' ),
			'less'
		);

		expect( screen.getByLabelText( 'Rule 1 condition 1 operator' ) ).toHaveValue( 'equals' );
		expect( screen.getByLabelText( 'Rule 1 condition 2 operator' ) ).toHaveValue( 'less' );
		expect( screen.getByLabelText( 'Rule 1 condition 3 operator' ) ).toHaveValue( 'contains' );
	} );

	it( 'edits the target kind of the rule named in the control, not the first one', async () => {
		const user = await setup( { rules: [ three[ 0 ], three[ 1 ] ] } );

		await user.selectOptions( screen.getByLabelText( 'Rule 2 target kind' ), 'step' );

		expect( screen.getByLabelText( 'Rule 1 target kind' ) ).toHaveValue( 'field' );
		expect( screen.getByLabelText( 'Rule 2 target kind' ) ).toHaveValue( 'step' );
	} );

	it( 'edits the target of the rule named in the control, not the first one', async () => {
		const user = await setup( { rules: [ three[ 0 ], three[ 1 ] ] } );

		await user.selectOptions( screen.getByLabelText( 'Rule 2 target' ), 'urgency' );

		expect( screen.getByLabelText( 'Rule 1 target' ) ).toHaveValue( 'note' );
		expect( screen.getByLabelText( 'Rule 2 target' ) ).toHaveValue( 'urgency' );
	} );

	it( 'edits the match mode of the rule named in the control, not the first one', async () => {
		const user = await setup( { rules: [ three[ 0 ], three[ 1 ] ] } );

		await user.selectOptions( screen.getByLabelText( 'Rule 2 match' ), 'any' );

		expect( screen.getByLabelText( 'Rule 1 match' ) ).toHaveValue( 'all' );
		expect( screen.getByLabelText( 'Rule 2 match' ) ).toHaveValue( 'any' );
	} );

	it( 'edits the condition of the rule named in the control, not the first rule', async () => {
		const user = await setup( { rules: [ three[ 0 ], three[ 1 ] ] } );

		await user.selectOptions(
			screen.getByLabelText( 'Rule 2 condition 1 operator' ),
			'not_contains'
		);

		expect( screen.getByLabelText( 'Rule 1 condition 1 operator' ) ).toHaveValue( 'equals' );
		expect( screen.getByLabelText( 'Rule 2 condition 1 operator' ) ).toHaveValue( 'not_contains' );
	} );

	it( 'removes the rule named in the button, after confirming', async () => {
		const user = await setup( { rules: three } );

		await user.click( screen.getByRole( 'button', { name: 'Remove rule 2' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Yes, remove rule 2' } ) );

		expect( screen.getByLabelText( 'Rule 1 target' ) ).toHaveValue( 'note' );
		expect( screen.getByLabelText( 'Rule 2 target' ) ).toHaveValue( 'urgency' );
		expect( screen.queryByLabelText( 'Rule 3 target' ) ).not.toBeInTheDocument();
	} );

	it( 'adds a condition to the rule named in the button', async () => {
		const user = await setup( { rules: [ three[ 0 ] ] } );

		await user.click( screen.getByRole( 'button', { name: 'Add condition to rule 1' } ) );

		expect( screen.getByLabelText( 'Rule 1 condition 2 field' ) ).toBeInTheDocument();
	} );

	it( 'disables Remove condition when the rule has only one condition', async () => {
		await setup( { rules: [ three[ 0 ] ] } );

		expect(
			screen.getByRole( 'button', { name: 'Remove condition 1 from rule 1' } )
		).toBeDisabled();
	} );

	it( 'removes the condition named in the button, after confirming', async () => {
		const user = await setup( {
			rules: [
				rule( 'note', 'show', [
					condition( 'urgency', 'equals', 'express' ),
					condition( 'rooms', 'greater', '3' ),
				] ),
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Remove condition 2 from rule 1' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Yes, remove rule 1 condition 2' } ) );

		expect( screen.getByLabelText( 'Rule 1 condition 1 field' ) ).toHaveValue( 'urgency' );
		expect( screen.queryByLabelText( 'Rule 1 condition 2 field' ) ).not.toBeInTheDocument();
	} );

	it( 'focuses the confirm button when opening a condition removal, and the Remove button again on cancel', async () => {
		const user = await setup( {
			rules: [
				rule( 'note', 'show', [
					condition( 'urgency', 'equals', 'express' ),
					condition( 'rooms', 'greater', '3' ),
				] ),
			],
		} );

		const removeButton = screen.getByRole( 'button', { name: 'Remove condition 2 from rule 1' } );

		await user.click( removeButton );

		expect( screen.getByRole( 'button', { name: 'Yes, remove rule 1 condition 2' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Keep rule 1 condition 2' } ) );

		expect( removeButton ).toHaveFocus();
	} );

	it( 'warns when a condition tests the very field the rule targets', async () => {
		await setup( {
			rules: [ rule( 'rooms', 'show', [ condition( 'rooms', 'greater', '3' ) ] ) ],
		} );

		expect(
			screen.getByText( 'A rule cannot test the same field it changes.' )
		).toBeInTheDocument();
	} );

	it( 'does not warn when the tested field is a different one', async () => {
		await setup( { rules: [ three[ 0 ] ] } );

		expect(
			screen.queryByText( 'A rule cannot test the same field it changes.' )
		).not.toBeInTheDocument();
	} );

	it( 'does not warn about a freshly added rule, whose target and condition are both unset', async () => {
		const user = await setup( { rules: [] } );

		await user.click( screen.getByRole( 'button', { name: 'Add rule' } ) );

		expect(
			screen.queryByText( 'A rule cannot test the same field it changes.' )
		).not.toBeInTheDocument();
	} );

	it( 'puts a server error on the condition it belongs to', async () => {
		await setup( {
			rules: three,
			errorIndex: indexErrors( [
				{ path: 'rules.1.conditions.0.field', code: 'unknown_reference', message: 'No such field.' },
			] ),
		} );

		expect( screen.getByLabelText( 'Rule 2 condition 1 field' ) ).toHaveAttribute(
			'aria-invalid',
			'true'
		);
		expect( screen.getByText( 'No such field.' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Rule 1 condition 1 field' ) ).not.toHaveAttribute(
			'aria-invalid'
		);
	} );

	it( 'shows server errors placed on the target object and on a whole condition', async () => {
		await setup( {
			rules: three,
			errorIndex: indexErrors( [
				{ path: 'rules.0.target', code: 'invalid_target', message: 'This target is not valid.' },
				{
					path: 'rules.0.conditions.0',
					code: 'invalid_condition',
					message: 'This condition is not valid.',
				},
			] ),
		} );

		expect( screen.getByText( 'This target is not valid.' ) ).toBeInTheDocument();
		expect( screen.getByText( 'This condition is not valid.' ) ).toBeInTheDocument();
	} );

	it( 'closes a stale condition confirmation instead of letting it resolve onto a different rule', async () => {
		const user = await setup( {
			rules: [
				rule( 'note', 'show', [ condition( 'urgency', 'equals', 'express' ) ] ),
				rule( 'rooms', 'hide', [
					condition( 'note', 'contains', 'urgent' ),
					condition( 'urgency', 'equals', 'x' ),
				] ),
				rule( 'urgency', 'require', [
					condition( 'rooms', 'greater', '3' ),
					condition( 'note', 'contains', 'y' ),
				] ),
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Remove condition 2 from rule 2' } ) );
		expect(
			screen.getByRole( 'button', { name: 'Yes, remove rule 2 condition 2' } )
		).toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Remove rule 1' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Yes, remove rule 1' } ) );

		expect( screen.queryByText( /Yes, remove/ ) ).not.toBeInTheDocument();
		expect( screen.getByLabelText( 'Rule 2 condition 1 field' ) ).toHaveValue( 'rooms' );
		expect( screen.getByLabelText( 'Rule 2 condition 2 field' ) ).toHaveValue( 'note' );
	} );
} );
