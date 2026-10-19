/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BulkBar from '../../../admin-src/entries/BulkBar';

function renderBar( props = {} ) {
	const handlers = {
		onRead: jest.fn(),
		onUnread: jest.fn(),
		onDelete: jest.fn(),
		onMatchAll: jest.fn(),
		onClearMatch: jest.fn(),
	};
	const base = { count: 20, canDelete: true, busy: false, pageComplete: true, matchTotal: 60, matching: false };
	const view = render( <BulkBar { ...base } { ...handlers } { ...props } /> );
	const again = ( next ) => view.rerender( <BulkBar { ...base } { ...handlers } { ...props } { ...next } /> );

	return { ...handlers, ...view, again };
}

describe( 'BulkBar — every entry matching the filter', () => {
	it( 'offers the whole filter once the page is fully selected and more entries exist', async () => {
		const { onMatchAll } = renderBar();
		const user = userEvent.setup();
		const bar = screen.getByRole( 'group', { name: 'Bulk actions' } );

		expect( bar ).toHaveTextContent( 'All 20 entries on this page are selected.' );

		await user.click( screen.getByRole( 'button', { name: 'Select all 60 entries matching this filter' } ) );

		expect( onMatchAll ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'makes no offer when the page already holds every matching entry', () => {
		renderBar( { matchTotal: 20 } );

		expect( screen.queryByRole( 'button', { name: /matching this filter/ } ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'group', { name: 'Bulk actions' } ) ).not.toHaveTextContent( 'on this page are selected' );
	} );

	it( 'makes no offer while only part of the page is selected', () => {
		renderBar( { count: 3, pageComplete: false } );

		expect( screen.queryByRole( 'button', { name: /matching this filter/ } ) ).not.toBeInTheDocument();
	} );

	it( 'says the whole filter is selected and can clear back to the page', async () => {
		const { onClearMatch } = renderBar( { matching: true } );
		const user = userEvent.setup();
		const bar = screen.getByRole( 'group', { name: 'Bulk actions' } );

		expect( bar ).toHaveTextContent( 'All 60 entries selected.' );
		expect( bar ).not.toHaveTextContent( '20 selected' );
		expect( screen.queryByRole( 'button', { name: /matching this filter/ } ) ).not.toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Clear selection' } ) );

		expect( onClearMatch ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'moves focus to Clear selection when it replaces the offer', async () => {
		const { again } = renderBar();
		const user = userEvent.setup();

		await user.click( screen.getByRole( 'button', { name: 'Select all 60 entries matching this filter' } ) );
		again( { matching: true } );

		expect( screen.getByRole( 'button', { name: 'Clear selection' } ) ).toHaveFocus();
	} );

	it( 'asks about the whole filter before deleting it', async () => {
		const { onDelete } = renderBar( { matching: true } );
		const user = userEvent.setup();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );

		expect( screen.getByText( 'Delete all 60 entries matching this filter? This cannot be undone.' ) ).toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( onDelete ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'closes an open confirmation when the mode changes, so a page-sized question is not answered for the filter', async () => {
		const { again } = renderBar();
		const user = userEvent.setup();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		expect( screen.getByText( 'Delete 20 entries? This cannot be undone.' ) ).toBeInTheDocument();

		again( { matching: true } );

		expect( screen.queryByRole( 'button', { name: 'Delete permanently' } ) ).not.toBeInTheDocument();
	} );

	it( 'keeps the mode buttons focusable but inert while busy', async () => {
		const { onMatchAll, onClearMatch, again } = renderBar( { busy: true } );
		const user = userEvent.setup();
		const offer = screen.getByRole( 'button', { name: 'Select all 60 entries matching this filter' } );

		expect( offer ).not.toBeDisabled();
		expect( offer ).toHaveAttribute( 'aria-disabled', 'true' );

		await user.click( offer );
		expect( onMatchAll ).not.toHaveBeenCalled();
		expect( offer ).toHaveFocus();

		again( { busy: true, matching: true } );
		const clear = screen.getByRole( 'button', { name: 'Clear selection' } );

		expect( clear ).not.toBeDisabled();
		expect( clear ).toHaveAttribute( 'aria-disabled', 'true' );
		await user.click( clear );
		expect( onClearMatch ).not.toHaveBeenCalled();
	} );

	it( 'is inert while the list on screen is out of date: every action is focusable but ignored', async () => {
		const { onRead, onUnread, onMatchAll } = renderBar( { inert: true } );
		const user = userEvent.setup();

		for ( const name of [ 'Mark as read', 'Mark as unread', 'Delete', 'Select all 60 entries matching this filter' ] ) {
			const button = screen.getByRole( 'button', { name } );

			expect( button ).toHaveAttribute( 'aria-disabled', 'true' );
			expect( button ).not.toBeDisabled();
			await user.click( button );
		}

		expect( onRead ).not.toHaveBeenCalled();
		expect( onUnread ).not.toHaveBeenCalled();
		expect( onMatchAll ).not.toHaveBeenCalled();
		expect( screen.queryByRole( 'button', { name: 'Delete permanently' } ) ).not.toBeInTheDocument();
	} );

	it( 'closes an open confirmation as soon as the list goes out of date', async () => {
		const { again, onDelete } = renderBar( { matching: true } );
		const user = userEvent.setup();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		again( { matching: true, inert: true } );

		expect( screen.queryByRole( 'button', { name: 'Delete permanently' } ) ).not.toBeInTheDocument();
		expect( onDelete ).not.toHaveBeenCalled();
	} );
} );
