/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { ApiError, listEntries, updateEntries } from '../../../admin-src/api/client';
import BulkBar from '../../../admin-src/entries/BulkBar';
import EntriesListScreen from '../../../admin-src/entries/EntriesListScreen';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listEntries: jest.fn(),
	getEntry: jest.fn(),
	updateEntries: jest.fn(),
	deleteEntry: jest.fn(),
} ) );

const config = {
	perPage: 20,
	canDelete: true,
	canManageForms: true,
	canExport: true,
	exportUrl: 'http://example.test/wp-admin/admin-post.php?action=qform_export_entries&_wpnonce=abc',
	builderUrl: 'http://example.test/wp-admin/admin.php?page=quoteform',
	forms: [ { id: 7, title: 'Cleaning quote' } ],
	hasDeletedForms: false,
};

function item( id ) {
	return {
		id,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: false,
		name: `Person ${ id }`,
		email: `p${ id }@example.com`,
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25, 2026', full: '2026-09-25 01:30:00', iso: '2026-09-24T21:30:00Z' },
	};
}

function result( items, extra = {} ) {
	return { items, total: items.length, pages: 1, page: 1, per_page: 20, unread: 2, ...extra };
}

function Harness( { announce = jest.fn(), onUnread = jest.fn() } ) {
	const [ state, setState ] = useState( { filters: DEFAULT_FILTERS, paged: 1 } );

	return (
		<EntriesListScreen
			config={ config }
			filters={ state.filters }
			paged={ state.paged }
			onChange={ ( patch ) => setState( ( current ) => ( { ...current, ...patch } ) ) }
			onOpen={ jest.fn() }
			announce={ announce }
			onUnread={ onUnread }
		/>
	);
}

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise( ( done, fail ) => {
		resolve = done;
		reject = fail;
	} );

	return { promise, resolve, reject };
}

const forbidden = () => new ApiError( { code: 'rest_forbidden', status: 403, message: 'no' } );
const offline = () => new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } );

function heading() {
	return screen.getByRole( 'heading', { level: 1, name: 'Entries' } );
}

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'BulkBar while busy', () => {
	it( 'keeps its buttons focusable and ignores clicks', async () => {
		const handlers = { onRead: jest.fn(), onUnread: jest.fn(), onDelete: jest.fn() };
		const user = userEvent.setup();

		render( <BulkBar count={ 2 } canDelete busy { ...handlers } /> );

		for ( const name of [ 'Mark as read', 'Mark as unread', 'Delete' ] ) {
			const button = screen.getByRole( 'button', { name } );

			expect( button ).not.toBeDisabled();
			expect( button ).toHaveAttribute( 'aria-disabled', 'true' );

			await user.click( button );
			expect( button ).toHaveFocus();
		}

		expect( handlers.onRead ).not.toHaveBeenCalled();
		expect( handlers.onUnread ).not.toHaveBeenCalled();
		expect( screen.queryByRole( 'button', { name: 'Delete permanently' } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'focus after a failed bulk action', () => {
	it( 'stays on "Mark as read" while busy and after the failure', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		const pending = deferred();

		updateEntries.mockImplementation( () => pending.promise );
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		const button = screen.getByRole( 'button', { name: 'Mark as read' } );

		expect( button ).not.toBeDisabled();
		expect( button ).toHaveAttribute( 'aria-disabled', 'true' );
		expect( document.activeElement ).toBe( button );

		await act( async () => {
			pending.reject( forbidden() );
		} );

		expect( screen.getByText( 'You are no longer allowed to see entries. Reload the page and sign in again.' ) ).toBeInTheDocument();
		expect( document.activeElement ).toBe( screen.getByRole( 'button', { name: 'Mark as read' } ) );
	} );

	it( 'returns focus to the bulk Delete button when the confirmed delete fails', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		updateEntries.mockRejectedValue( forbidden() );
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		await screen.findByText( 'You are no longer allowed to see entries. Reload the page and sign in again.' );
		await waitFor( () => expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toHaveFocus() );
	} );
} );

describe( 'a failed load forgets what the next load should do', () => {
	it( 'does not move focus to the heading after a failed page change and a later filter change', async () => {
		listEntries.mockImplementation( ( { page, status } ) => {
			if ( page === 2 ) {
				return Promise.reject( offline() );
			}

			return Promise.resolve( result( [ item( status ? 7 : 100 ) ], { page, pages: 3, total: 50 } ) );
		} );
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 100' );

		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 3' } ) );
		await screen.findByText( 'You appear to be offline.' );

		const status = screen.getByRole( 'combobox', { name: 'Status' } );

		await user.selectOptions( status, 'new' );
		await screen.findByText( 'Person 7' );

		expect( heading() ).not.toHaveFocus();
		expect( status ).toHaveFocus();
	} );

	it( 'does not announce a count after a failed filter change and a later page change', async () => {
		let failedOnce = false;

		listEntries.mockImplementation( ( { page, status } ) => {
			if ( status === 'new' && ! failedOnce ) {
				failedOnce = true;

				return Promise.reject( offline() );
			}

			return Promise.resolve( result( [ item( page * 100 ) ], { page, pages: 3, total: 50 } ) );
		} );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 100' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'new' );
		await waitFor( () => expect( announce ).toHaveBeenCalledWith( 'You appear to be offline.', { force: true } ) );

		// Filtr eyni qalır (status=new); yalnız səhifə dəyişir — bu, "N found" elanı deyil.
		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 3' } ) );
		await screen.findByText( 'Person 200' );

		expect( announce ).not.toHaveBeenCalledWith( expect.stringMatching( /found\.$/ ) );
	} );
} );

describe( 'Try again with stale rows on screen', () => {
	it( 'is offered when a reload fails while old rows are still shown', async () => {
		listEntries
			.mockResolvedValueOnce( result( [ item( 100 ) ], { page: 1, pages: 3, total: 50 } ) )
			.mockRejectedValueOnce( offline() )
			.mockResolvedValueOnce( result( [ item( 200 ) ], { page: 2, pages: 3, total: 50 } ) );
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 100' );

		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 3' } ) );
		await screen.findByText( 'You appear to be offline.' );

		expect( screen.getByText( 'Person 100' ) ).toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Try again' } ) );

		expect( await screen.findByText( 'Person 200' ) ).toBeInTheDocument();
		expect( listEntries ).toHaveBeenLastCalledWith( { page: 2, per_page: 20 } );
		expect( screen.queryByRole( 'button', { name: 'Try again' } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'leaving the screen mid-action', () => {
	it( 'does not announce or update the badge after unmount', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		const pending = deferred();

		updateEntries.mockImplementation( () => pending.promise );
		const announce = jest.fn();
		const onUnread = jest.fn();
		const user = userEvent.setup();

		const { unmount } = render( <Harness announce={ announce } onUnread={ onUnread } /> );

		await screen.findByText( 'Person 41' );
		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		announce.mockClear();
		onUnread.mockClear();
		unmount();

		await act( async () => {
			pending.resolve( { affected: 1, unread: 0 } );
		} );

		expect( announce ).not.toHaveBeenCalled();
		expect( onUnread ).not.toHaveBeenCalled();
	} );
} );
