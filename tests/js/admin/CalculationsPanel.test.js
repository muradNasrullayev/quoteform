/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CalculationsPanel from '../../../admin-src/panels/CalculationsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function schemaWith( { calculations, fields = {} } ) {
	return {
		version: 1,
		settings: {},
		fields,
		steps: [],
		calculations,
		rules: [],
		notifications: [],
	};
}

function Harness( { errorIndex = indexErrors( [] ), calculations, fields } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( { id: 1, title: 'F', schema: schemaWith( { calculations, fields } ) } )
					)
				}
			>
				load
			</button>
			{ schema && <CalculationsPanel errorIndex={ errorIndex } /> }
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

const calc = ( key, expression, label ) => ( { key, expression, label, visible: false } );

const three = [
	calc( 'first', '1', 'First' ),
	calc( 'middle', '2', 'Middle' ),
	calc( 'total', '{first} + {middle}', 'Total' ),
];

function keysInOrder() {
	return screen
		.getAllByLabelText( /^Calculation \d+ key$/ )
		.map( ( input ) => input.value );
}

describe( 'CalculationsPanel', () => {
	it( 'keeps focus on the moved row, so pressing move down twice moves the same one twice', async () => {
		const user = await setup( { calculations: three } );

		await user.click( screen.getByRole( 'button', { name: 'Move first down' } ) );

		expect( document.activeElement ).toHaveAccessibleName( 'Move first down' );

		await user.keyboard( '{Enter}' );

		expect( keysInOrder() ).toEqual( [ 'middle', 'total', 'first' ] );
	} );

	it( 'names the move buttons by row number while the key is still empty', async () => {
		await setup( {
			calculations: [ calc( '', '0', 'One' ), calc( 'total', '0', 'Total' ) ],
		} );

		expect( screen.getByRole( 'button', { name: 'Move 1 down' } ) ).toBeInTheDocument();
	} );

	it( 'accepts .price on a price-bearing field, because the server does', async () => {
		await setup( {
			calculations: [ calc( 'total', '{urgency.price}', 'Total' ) ],
			fields: {
				urgency: defaultField( 'select', 'urgency', 'Urgency' ),
				rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			},
		} );

		expect( await screen.findByRole( 'status' ) ).toHaveTextContent( 'This formula is valid.' );
	} );

	it( 'rejects .price on a field that carries no price, because the server does', async () => {
		await setup( {
			calculations: [ calc( 'total', '{rooms.price}', 'Total' ) ],
			fields: {
				urgency: defaultField( 'select', 'urgency', 'Urgency' ),
				rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			},
		} );

		expect( await screen.findByRole( 'status' ) ).toHaveTextContent(
			'Only “.price” works here, and only on a dropdown, radio or checkbox field: rooms.price.'
		);
	} );

	it( 'warns when there is no total, because the server will reject the save', async () => {
		await setup( { calculations: [] } );

		expect(
			screen.getByText( 'Every form needs a calculation named “total”.' )
		).toBeInTheDocument();
	} );

	it( 'stops warning once a total exists', async () => {
		await setup( { calculations: [ calc( 'total', '0', 'Total' ) ] } );

		expect(
			screen.queryByText( 'Every form needs a calculation named “total”.' )
		).not.toBeInTheDocument();
	} );

	it( 'adds a calculation at the end, leaving the others alone', async () => {
		const user = await setup( { calculations: [ calc( 'total', '0', 'Total' ) ] } );

		await user.click( screen.getByRole( 'button', { name: 'Add calculation' } ) );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'total' );
		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'calculation' );
	} );

	it( 'edits the calculation named in the control, not the first one', async () => {
		const user = await setup( { calculations: three } );

		await user.clear( screen.getByLabelText( 'Calculation 2 label' ) );
		await user.type( screen.getByLabelText( 'Calculation 2 label' ), 'Renamed' );

		expect( screen.getByLabelText( 'Calculation 1 label' ) ).toHaveValue( 'First' );
		expect( screen.getByLabelText( 'Calculation 2 label' ) ).toHaveValue( 'Renamed' );
		expect( screen.getByLabelText( 'Calculation 3 label' ) ).toHaveValue( 'Total' );
	} );

	it( 'moves the calculation named in the button, not the first one', async () => {
		const user = await setup( { calculations: three } );

		await user.click( screen.getByRole( 'button', { name: 'Move middle up' } ) );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'middle' );
		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'first' );
		expect( screen.getByLabelText( 'Calculation 3 key' ) ).toHaveValue( 'total' );
	} );

	it( 'removes the calculation named in the button, after confirming', async () => {
		const user = await setup( { calculations: three } );

		await user.click( screen.getByRole( 'button', { name: 'Remove calculation middle' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Yes, remove middle' } ) );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'first' );
		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'total' );
		expect( screen.queryByLabelText( 'Calculation 3 key' ) ).not.toBeInTheDocument();
	} );

	it( 'keeps the calculation and restores focus when the removal is cancelled', async () => {
		const user = await setup( { calculations: three } );

		const remove = screen.getByRole( 'button', { name: 'Remove calculation middle' } );
		await user.click( remove );
		await user.click( screen.getByRole( 'button', { name: 'Keep middle' } ) );

		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'middle' );
		expect( remove ).toHaveFocus();
	} );

	it( 'warns about a key that collides with a field key', async () => {
		await setup( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			calculations: [ calc( 'rooms', '0', 'Rooms' ), calc( 'total', '0', 'Total' ) ],
		} );

		expect( screen.getByText( 'That key is already used by a field.' ) ).toBeInTheDocument();
	} );

	it( 'warns about a circular reference before the save', async () => {
		await setup( {
			calculations: [ calc( 'a', '{b}', 'A' ), calc( 'b', '{a}', 'B' ), calc( 'total', '0', 'T' ) ],
		} );

		expect(
			screen.getByText( 'These calculations reference each other in a loop.' )
		).toBeInTheDocument();
	} );

	it( 'puts a server error on the calculation it belongs to', async () => {
		await setup( {
			calculations: three,
			errorIndex: indexErrors( [
				{ path: 'calculations.1.expression', code: 'invalid_expression', message: 'Bad formula.' },
			] ),
		} );

		const second = screen.getByLabelText( 'Calculation 2 formula' );

		expect( second ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( screen.getByText( 'Bad formula.' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Calculation 1 formula' ) ).not.toHaveAttribute( 'aria-invalid' );
	} );

	it( 'keeps focus in the key field while the key is being typed', async () => {
		const user = await setup( { calculations: [ calc( 'calculation', '0', 'New' ) ] } );

		const key = screen.getByLabelText( 'Calculation 1 key' );

		await user.clear( key );
		await user.type( key, 'total' );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'total' );
		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveFocus();
	} );

	it( "falls back to the row number for the remove button's name when the key is empty", async () => {
		const user = await setup( { calculations: three } );

		await user.clear( screen.getByLabelText( 'Calculation 2 key' ) );

		expect( screen.getByRole( 'button', { name: 'Remove calculation 2' } ) ).toBeInTheDocument();
	} );

	it( 'edits the key named in the control, not the first one', async () => {
		const user = await setup( { calculations: three } );

		await user.clear( screen.getByLabelText( 'Calculation 2 key' ) );
		await user.type( screen.getByLabelText( 'Calculation 2 key' ), 'renamed' );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'first' );
		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'renamed' );
		expect( screen.getByLabelText( 'Calculation 3 key' ) ).toHaveValue( 'total' );
	} );

	it( 'edits the formula named in the control, not the first one', async () => {
		const user = await setup( { calculations: three } );

		await user.clear( screen.getByLabelText( 'Calculation 2 formula' ) );
		await user.type( screen.getByLabelText( 'Calculation 2 formula' ), '99' );

		expect( screen.getByLabelText( 'Calculation 1 formula' ) ).toHaveValue( '1' );
		expect( screen.getByLabelText( 'Calculation 2 formula' ) ).toHaveValue( '99' );
		expect( screen.getByLabelText( 'Calculation 3 formula' ) ).toHaveValue( '{first} + {middle}' );
	} );

	it( 'toggles the visibility named in the control, not the first one', async () => {
		const user = await setup( { calculations: three } );

		await user.click( screen.getByLabelText( 'Show calculation 2 to the visitor' ) );

		expect( screen.getByLabelText( 'Show calculation 1 to the visitor' ) ).not.toBeChecked();
		expect( screen.getByLabelText( 'Show calculation 2 to the visitor' ) ).toBeChecked();
		expect( screen.getByLabelText( 'Show calculation 3 to the visitor' ) ).not.toBeChecked();
	} );

	it( 'moves down the calculation named in the button, not the first one', async () => {
		const user = await setup( { calculations: three } );

		await user.click( screen.getByRole( 'button', { name: 'Move middle down' } ) );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'first' );
		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'total' );
		expect( screen.getByLabelText( 'Calculation 3 key' ) ).toHaveValue( 'middle' );
	} );

	it( 'does not warn about a loop for the ordinary fixture', async () => {
		await setup( { calculations: three } );

		expect(
			screen.queryByText( 'These calculations reference each other in a loop.' )
		).not.toBeInTheDocument();
	} );

	it( 'warns about two calculations sharing a key, with a message distinct from a field collision', async () => {
		await setup( {
			calculations: [
				calc( 'dup', '0', 'First dup' ),
				calc( 'dup', '0', 'Second dup' ),
				calc( 'total', '0', 'Total' ),
			],
		} );

		expect(
			screen.getAllByText( 'Two calculations cannot share a key.' )
		).toHaveLength( 2 );
		expect(
			screen.queryByText( 'That key is already used by a field.' )
		).not.toBeInTheDocument();
	} );

	it( 'moves focus to the Add button once a removal is confirmed', async () => {
		const user = await setup( { calculations: three } );

		await user.click( screen.getByRole( 'button', { name: 'Remove calculation middle' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Yes, remove middle' } ) );

		expect( screen.getByRole( 'button', { name: 'Add calculation' } ) ).toHaveFocus();
	} );

	it( 'disables the first row’s up button and the last row’s down button', async () => {
		await setup( { calculations: three } );

		expect( screen.getByRole( 'button', { name: 'Move first up' } ) ).toBeDisabled();
		expect( screen.getByRole( 'button', { name: 'Move total down' } ) ).toBeDisabled();
		expect( screen.getByRole( 'button', { name: 'Move first down' } ) ).not.toBeDisabled();
		expect( screen.getByRole( 'button', { name: 'Move total up' } ) ).not.toBeDisabled();
	} );
} );
