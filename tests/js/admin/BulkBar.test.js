/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BulkBar from '../../../admin-src/entries/BulkBar';

function setup( props = {} ) {
	const handlers = { onRead: jest.fn(), onUnread: jest.fn(), onDelete: jest.fn() };
	const view = render( <BulkBar count={ 3 } canDelete busy={ false } { ...handlers } { ...props } /> );

	return { ...handlers, ...view };
}

describe( 'BulkBar', () => {
	it( 'is absent when nothing is selected', () => {
		setup( { count: 0 } );

		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
	} );

	it( 'says how many are selected and marks them', async () => {
		const { onRead, onUnread } = setup();
		const user = userEvent.setup();

		expect( screen.getByRole( 'group', { name: 'Bulk actions' } ) ).toHaveTextContent( '3 selected' );

		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as unread' } ) );

		expect( onRead ).toHaveBeenCalledTimes( 1 );
		expect( onUnread ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'asks before deleting and gives focus back when cancelled', async () => {
		const { onDelete } = setup();
		const user = userEvent.setup();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );

		expect( screen.getByText( 'Delete 3 entries? This cannot be undone.' ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Delete permanently' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );

		expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toHaveFocus();
		expect( onDelete ).not.toHaveBeenCalled();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( onDelete ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'closes an open confirmation when the selection changes', async () => {
		const { rerender, onRead, onUnread, onDelete } = setup();
		const user = userEvent.setup();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		rerender( <BulkBar count={ 4 } canDelete busy={ false } onRead={ onRead } onUnread={ onUnread } onDelete={ onDelete } /> );

		expect( screen.queryByRole( 'button', { name: 'Delete permanently' } ) ).not.toBeInTheDocument();
	} );

	it( 'offers no Delete to someone who may only read', () => {
		setup( { canDelete: false } );

		expect( screen.queryByRole( 'button', { name: 'Delete' } ) ).not.toBeInTheDocument();
	} );
} );
