/**
 * @jest-environment jsdom
 */
import { useState } from '@wordpress/element';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FieldsPanel from '../../../admin-src/panels/FieldsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField, TYPE_LABELS } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function schemaWith( fields ) {
	return {
		version: 1,
		settings: {},
		fields,
		steps: [],
		calculations: [],
		rules: [],
		notifications: [],
	};
}

function Harness( { errorIndex = indexErrors( [] ), fields } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();
	const [ selected, setSelected ] = useState( null );

	return (
		<>
			<button
				onClick={ () =>
					dispatch( loadSucceeded( { id: 1, title: 'F', schema: schemaWith( fields ) } ) )
				}
			>
				load
			</button>
			<p data-testid="selected-key">{ selected === null ? '(none)' : selected }</p>
			{ schema && (
				<FieldsPanel errorIndex={ errorIndex } selectedKey={ selected } onSelect={ setSelected } />
			) }
		</>
	);
}

async function renderLoaded( fields, errorIndex ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness fields={ fields } errorIndex={ errorIndex } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

describe( 'FieldsPanel', () => {
	it( 'says so when there are no fields', async () => {
		await renderLoaded( {} );

		expect( screen.getByText( 'No fields yet. Add one to get started.' ) ).toBeInTheDocument();
	} );

	it( 'lists each field by label and type', async () => {
		await renderLoaded( {
			rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			notes: defaultField( 'textarea', 'notes', 'Notes' ),
		} );

		expect( screen.getByText( 'Rooms (rooms)' ) ).toBeInTheDocument();
		// Kills: a mutant that drops the row's type column entirely.
		expect( screen.getByText( 'Rooms (rooms)' ).closest( 'li' ) ).toHaveTextContent(
			TYPE_LABELS.number
		);
		expect( screen.getByText( 'Notes (notes)' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Notes (notes)' ).closest( 'li' ) ).toHaveTextContent(
			TYPE_LABELS.textarea
		);
	} );

	it( 'falls back to the key when a field has no label', async () => {
		await renderLoaded( { intro: defaultField( 'html', 'intro', '' ) } );

		expect( screen.getByText( 'intro' ) ).toBeInTheDocument();
	} );

	it( 'adds a field of the chosen type', async () => {
		const user = await renderLoaded( {} );

		await user.selectOptions( screen.getByLabelText( 'Field type' ), 'email' );
		await user.click( screen.getByRole( 'button', { name: 'Add field' } ) );

		expect( screen.getByText( 'New field (email)' ) ).toBeInTheDocument();
		// Kills: a mutant that always adds a 'number' field regardless of
		// the type the user picked.
		expect( screen.getByText( 'New field (email)' ).closest( 'li' ) ).toHaveTextContent(
			TYPE_LABELS.email
		);
		expect( screen.queryByText( 'No fields yet. Add one to get started.' ) ).not.toBeInTheDocument();
	} );

	it( 'gives two freshly added fields names that can be told apart', async () => {
		const user = await renderLoaded( {} );

		await user.click( screen.getByRole( 'button', { name: 'Add field' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Add field' } ) );

		expect( screen.getByRole( 'button', { name: 'Remove New field (number)' } ) ).toBeInTheDocument();
		expect(
			screen.getByRole( 'button', { name: 'Remove New field (number_2)' } )
		).toBeInTheDocument();

		const names = screen
			.getAllByRole( 'button', { name: /^Remove New field/ } )
			.map( ( button ) => button.getAttribute( 'aria-label' ) );

		expect( new Set( names ).size ).toBe( names.length );
	} );

	it( 'offers all thirteen types', async () => {
		await renderLoaded( {} );

		expect( screen.getByLabelText( 'Field type' ).querySelectorAll( 'option' ) ).toHaveLength( 13 );
	} );

	it( 'removes a field after confirmation', async () => {
		const user = await renderLoaded( { rooms: defaultField( 'number', 'rooms', 'Rooms' ) } );

		await user.click( screen.getByRole( 'button', { name: 'Remove Rooms (rooms)' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove field' } ) );

		expect( screen.queryByText( 'Rooms (rooms)' ) ).not.toBeInTheDocument();
	} );

	it( 'marks a field that has a server error', async () => {
		await renderLoaded(
			{ rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			indexErrors( [
				{ path: 'fields.rooms.label', code: 'missing_field', message: 'Needs a label.', context: {} },
			] )
		);

		expect( screen.getByText( 'Rooms (rooms)' ).closest( 'li' ) ).toHaveTextContent( 'Has a problem' );
	} );

	it( 'does not mark a field whose key merely shares a prefix', async () => {
		await renderLoaded(
			{
				room: defaultField( 'number', 'room', 'Room' ),
				room_count: defaultField( 'number', 'room_count', 'Room count' ),
			},
			indexErrors( [
				{ path: 'fields.room_count.label', code: 'missing_field', message: 'x', context: {} },
			] )
		);

		expect( screen.getByText( 'Room (room)' ).closest( 'li' ) ).not.toHaveTextContent( 'Has a problem' );
		expect( screen.getByText( 'Room count (room_count)' ).closest( 'li' ) ).toHaveTextContent( 'Has a problem' );
	} );

	it( 'selects a field when its name is clicked', async () => {
		const user = await renderLoaded( {
			rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			notes: defaultField( 'textarea', 'notes', 'Notes' ),
		} );

		await user.click( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) );

		// Kills: a mutant that never calls `onSelect`; a mutant that drops
		// the selected row's `is-selected` marker.
		expect( screen.getByText( 'Rooms (rooms)' ).closest( 'li' ) ).toHaveClass( 'is-selected' );
		expect( screen.getByText( 'Notes (notes)' ).closest( 'li' ) ).not.toHaveClass( 'is-selected' );
	} );

	it( 'exposes the selected field to assistive technology via aria-current', async () => {
		const user = await renderLoaded( {
			rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			notes: defaultField( 'textarea', 'notes', 'Notes' ),
		} );

		await user.click( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) );

		expect( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) ).toHaveAttribute(
			'aria-current',
			'true'
		);
		expect( screen.getByRole( 'button', { name: 'Notes (notes)' } ) ).not.toHaveAttribute(
			'aria-current'
		);
	} );

	it( 'deselects a field that has just been removed', async () => {
		const user = await renderLoaded( {
			rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			notes: defaultField( 'textarea', 'notes', 'Notes' ),
		} );

		await user.click( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) );
		expect( screen.getByTestId( 'selected-key' ) ).toHaveTextContent( 'rooms' );

		await user.click( screen.getByRole( 'button', { name: 'Remove Rooms (rooms)' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove field' } ) );

		// Kills: a mutant that fails to call `onSelect( null )` when the
		// selected field is the one being removed, which would leave a
		// stale key selected after the row it named is gone. The removed
		// row's own absence of `aria-current` proves nothing here, since a
		// gone row shows no marker either way — the selection state itself
		// (surfaced by the harness) is what must actually clear.
		expect( screen.queryByText( 'Rooms (rooms)' ) ).not.toBeInTheDocument();
		expect( screen.getByTestId( 'selected-key' ) ).toHaveTextContent( '(none)' );
	} );

	it( 'leaves the selection alone when removing a field that is not selected', async () => {
		const user = await renderLoaded( {
			rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			notes: defaultField( 'textarea', 'notes', 'Notes' ),
		} );

		await user.click( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) );
		expect( screen.getByTestId( 'selected-key' ) ).toHaveTextContent( 'rooms' );

		await user.click( screen.getByRole( 'button', { name: 'Remove Notes (notes)' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove field' } ) );

		// Kills: a mutant that always clears the selection on any removal,
		// regardless of whether the removed field was the selected one.
		expect( screen.queryByText( 'Notes (notes)' ) ).not.toBeInTheDocument();
		expect( screen.getByTestId( 'selected-key' ) ).toHaveTextContent( 'rooms' );
		expect( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) ).toHaveAttribute(
			'aria-current',
			'true'
		);
	} );

	it( 'removes only the field whose remove button was clicked, not the first one in the list', async () => {
		const user = await renderLoaded( {
			rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			notes: defaultField( 'textarea', 'notes', 'Notes' ),
			agree: defaultField( 'toggle', 'agree', 'Agree' ),
		} );

		await user.click( screen.getByRole( 'button', { name: 'Remove Notes (notes)' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove field' } ) );

		// Kills: a mutant that always confirms removal of the first field
		// in the list rather than the one named by the clicked button —
		// indistinguishable from correct behaviour with only one field.
		expect( screen.getByText( 'Rooms (rooms)' ) ).toBeInTheDocument();
		expect( screen.queryByText( 'Notes (notes)' ) ).not.toBeInTheDocument();
		expect( screen.getByText( 'Agree (agree)' ) ).toBeInTheDocument();
	} );

	it( 'moves focus to the confirm button, then back to Remove on cancel', async () => {
		const user = await renderLoaded( { rooms: defaultField( 'number', 'rooms', 'Rooms' ) } );

		await user.click( screen.getByRole( 'button', { name: 'Remove Rooms (rooms)' } ) );
		expect( screen.getByRole( 'button', { name: 'Remove field' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );
		expect( screen.getByRole( 'button', { name: 'Remove Rooms (rooms)' } ) ).toHaveFocus();
	} );

	it( 'moves focus to Add field after a removal, since that row is gone', async () => {
		const user = await renderLoaded( { rooms: defaultField( 'number', 'rooms', 'Rooms' ) } );

		await user.click( screen.getByRole( 'button', { name: 'Remove Rooms (rooms)' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove field' } ) );

		expect( screen.getByRole( 'button', { name: 'Add field' } ) ).toHaveFocus();
	} );

	it( 'does not render the remove confirmation as a modal dialog', async () => {
		const user = await renderLoaded( { rooms: defaultField( 'number', 'rooms', 'Rooms' ) } );

		await user.click( screen.getByRole( 'button', { name: 'Remove Rooms (rooms)' } ) );

		expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument();
	} );
} );
