/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { ApiError, deleteEntry, listEntries, updateEntries } from '../../../admin-src/api/client';
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

function item( id, extra = {} ) {
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
		...extra,
	};
}

function result( items, extra = {} ) {
	return { items, total: items.length, pages: 1, page: 1, per_page: 20, unread: 2, ...extra };
}

function Harness( { initialFilters = DEFAULT_FILTERS, initialPaged = 1, onChangeSpy = jest.fn(), announce = jest.fn(), onUnread = jest.fn(), screenConfig = config } ) {
	const [ state, setState ] = useState( { filters: initialFilters, paged: initialPaged } );

	return (
		<EntriesListScreen
			config={ screenConfig }
			filters={ state.filters }
			paged={ state.paged }
			onChange={ ( patch ) => {
				onChangeSpy( patch );
				setState( ( current ) => ( { ...current, ...patch } ) );
			} }
			onOpen={ jest.fn() }
			announce={ announce }
			onUnread={ onUnread }
		/>
	);
}

function deferred() {
	let resolve;
	const promise = new Promise( ( done ) => {
		resolve = done;
	} );

	return { promise, resolve };
}

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'loading the list', () => {
	it( 'asks for the current filters, page and page size and shows the rows', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ), item( 40 ) ] ) );
		const onUnread = jest.fn();

		render( <Harness initialFilters={ { ...DEFAULT_FILTERS, status: 'new' } } initialPaged={ 1 } onUnread={ onUnread } /> );

		expect( await screen.findByText( 'Person 41' ) ).toBeInTheDocument();
		expect( listEntries ).toHaveBeenCalledWith( { status: 'new', page: 1, per_page: 20 } );
		expect( screen.getByText( '2 entries' ) ).toBeInTheDocument();
		expect( onUnread ).toHaveBeenCalledWith( 2 );
	} );

	it( 'never lets a slow earlier answer replace a newer one', async () => {
		const slow = deferred();

		listEntries
			.mockImplementationOnce( () => slow.promise )
			.mockImplementationOnce( () => Promise.resolve( result( [ item( 2, { name: 'Fresh' } ) ] ) ) );

		const props = { config, paged: 1, onChange: jest.fn(), onOpen: jest.fn(), announce: jest.fn(), onUnread: jest.fn() };
		const { rerender } = render( <EntriesListScreen { ...props } filters={ DEFAULT_FILTERS } /> );

		rerender( <EntriesListScreen { ...props } filters={ { ...DEFAULT_FILTERS, status: 'new' } } /> );
		expect( await screen.findByText( 'Fresh' ) ).toBeInTheDocument();

		await act( async () => {
			slow.resolve( result( [ item( 1, { name: 'Stale' } ) ] ) );
		} );

		expect( screen.queryByText( 'Stale' ) ).not.toBeInTheDocument();
		expect( screen.getByText( 'Fresh' ) ).toBeInTheDocument();
	} );

	it( 'moves to the last page the server has when the asked page is gone', async () => {
		listEntries.mockImplementation( ( { page } ) => Promise.resolve( result( [ item( page ) ], { page: 2, pages: 2, total: 21 } ) ) );
		const onChangeSpy = jest.fn();

		render( <Harness initialPaged={ 5 } onChangeSpy={ onChangeSpy } /> );

		await waitFor( () => expect( onChangeSpy ).toHaveBeenCalledWith( { paged: 2 } ) );
	} );

	it( 'shows a plain error, announces it and can try again', async () => {
		listEntries.mockRejectedValueOnce( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) );
		listEntries.mockResolvedValueOnce( result( [ item( 41 ) ] ) );
		const announce = jest.fn();
		const user = userEvent.setup();

		const { container } = render( <Harness announce={ announce } /> );

		expect( await screen.findByText( 'You appear to be offline.' ) ).toBeInTheDocument();
		expect( announce ).toHaveBeenCalledWith( 'You appear to be offline.', { force: true } );
		expect( container.querySelector( '[role="alert"], [role="status"], [aria-live]' ) ).toBeNull();

		await user.click( screen.getByRole( 'button', { name: 'Try again' } ) );

		expect( await screen.findByText( 'Person 41' ) ).toBeInTheDocument();
	} );
} );

describe( 'empty states', () => {
	it( 'explains where entries come from when there are none at all', async () => {
		listEntries.mockResolvedValue( result( [] ) );

		render( <Harness /> );

		expect( await screen.findByText( 'No entries yet. They appear here when visitors send one of your forms.' ) ).toBeInTheDocument();
		expect( screen.getByText( /\[quoteform id="7"\]/ ) ).toBeInTheDocument();
	} );

	it( 'offers to clear filters when nothing matches', async () => {
		listEntries.mockResolvedValue( result( [] ) );
		const onChangeSpy = jest.fn();
		const user = userEvent.setup();

		render( <Harness initialFilters={ { ...DEFAULT_FILTERS, status: 'new', order: 'asc' } } onChangeSpy={ onChangeSpy } /> );

		const card = ( await screen.findByText( 'No entries match these filters.' ) ).closest( '.quoteform_card' );

		await user.click( within( card ).getByRole( 'button', { name: 'Clear filters' } ) );

		expect( onChangeSpy ).toHaveBeenCalledWith( { filters: { ...DEFAULT_FILTERS, order: 'asc' }, paged: 1 } );
	} );
} );

describe( 'sorting, pages and filters', () => {
	it( 'flips the order of the active column and starts other columns highest first', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		const onChangeSpy = jest.fn();
		const user = userEvent.setup();

		render( <Harness onChangeSpy={ onChangeSpy } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'button', { name: 'Date' } ) );
		expect( onChangeSpy ).toHaveBeenLastCalledWith( { filters: { ...DEFAULT_FILTERS, order: 'asc' }, paged: 1 } );

		await user.click( screen.getByRole( 'button', { name: 'Total' } ) );
		expect( onChangeSpy ).toHaveBeenLastCalledWith( { filters: { ...DEFAULT_FILTERS, orderby: 'total', order: 'desc' }, paged: 1 } );
	} );

	it( 'moves focus to the heading after a page change', async () => {
		listEntries.mockImplementation( ( { page } ) =>
			Promise.resolve( result( [ item( page * 100 ) ], { page, pages: 3, total: 50 } ) )
		);
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 100' );

		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 3' } ) );

		expect( await screen.findByText( 'Person 200' ) ).toBeInTheDocument();
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );
	} );

	it( 'sends a new page size and starts again from page one', async () => {
		listEntries.mockImplementation( ( { page } ) => Promise.resolve( result( [ item( 41 ) ], { page, pages: 3, total: 50 } ) ) );
		const user = userEvent.setup();

		render( <Harness initialPaged={ 2 } /> );
		await screen.findByText( 'Person 41' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Per page' } ), '50' );

		await waitFor( () => expect( listEntries ).toHaveBeenLastCalledWith( { page: 1, per_page: 50 } ) );
	} );

	it( 'says how many entries a filter found', async () => {
		listEntries.mockResolvedValueOnce( result( [ item( 41 ), item( 40 ) ] ) ).mockResolvedValueOnce( result( [ item( 41 ) ] ) );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 40' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'new' );

		await waitFor( () => expect( announce ).toHaveBeenCalledWith( '1 entry found.' ) );
	} );

	it( 'links the export to the filters on screen', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );

		render( <Harness initialFilters={ { ...DEFAULT_FILTERS, status: 'read' } } /> );
		await screen.findByText( 'Person 41' );

		const href = screen.getByRole( 'link', { name: 'Export CSV' } ).getAttribute( 'href' );

		expect( href ).toContain( '_wpnonce=abc' );
		expect( href ).toContain( 'status=read' );
	} );

	it( 'hides export and delete from someone without those rights', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );

		render( <Harness screenConfig={ { ...config, canDelete: false, canExport: false, canManageForms: false } } /> );
		await screen.findByText( 'Person 41' );

		expect( screen.queryByRole( 'link', { name: 'Export CSV' } ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'button', { name: 'Delete entry #41' } ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'link', { name: 'Cleaning quote' } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'acting on entries', () => {
	it( 'marks the selected entries, announces it, reloads and focuses the heading', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ), item( 40 ) ] ) );
		updateEntries.mockResolvedValue( { affected: 2, unread: 0 } );
		const announce = jest.fn();
		const onUnread = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } onUnread={ onUnread } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		expect( updateEntries ).toHaveBeenCalledWith( 'read', [ 41, 40 ] );
		expect( announce ).toHaveBeenCalledWith( '2 entries marked as read.', { force: true } );
		expect( onUnread ).toHaveBeenCalledWith( 0 );

		await waitFor( () => expect( listEntries ).toHaveBeenCalledTimes( 2 ) );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );
		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
	} );

	it( 'forgets the selection whenever the list changes, so a bulk delete cannot reach hidden rows', async () => {
		listEntries.mockResolvedValueOnce( result( [ item( 41 ), item( 40 ) ] ) ).mockResolvedValueOnce( result( [ item( 40 ) ] ) );
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		expect( screen.getByRole( 'group', { name: 'Bulk actions' } ) ).toHaveTextContent( '1 selected' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'read' );
		await waitFor( () => expect( screen.queryByText( 'Person 41' ) ).not.toBeInTheDocument() );

		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) ).not.toBeChecked();
	} );

	it( 'deletes the selection only after confirmation', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ), item( 40 ) ] ) );
		updateEntries.mockResolvedValue( { affected: 1, unread: 1 } );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } ) );
		await user.click( within( screen.getByRole( 'group', { name: 'Bulk actions' } ) ).getByRole( 'button', { name: 'Delete' } ) );

		expect( updateEntries ).not.toHaveBeenCalled();

		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( updateEntries ).toHaveBeenCalledWith( 'delete', [ 41, 40 ] );
		expect( announce ).toHaveBeenCalledWith( '1 entry deleted.', { force: true } );
	} );

	it( 'deletes one row after confirmation and returns focus on cancel', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		deleteEntry.mockResolvedValue( { id: 41, deleted: true, unread: 0 } );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'button', { name: 'Delete entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );

		expect( screen.getByRole( 'button', { name: 'Delete entry #41' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Delete entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( deleteEntry ).toHaveBeenCalledWith( 41 );
		expect( announce ).toHaveBeenCalledWith( 'Entry #41 deleted.', { force: true } );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );
	} );

	it( 'keeps the selection and says so when a bulk action fails', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		updateEntries.mockRejectedValue( new ApiError( { code: 'rest_forbidden', status: 403, message: 'no' } ) );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		const message = 'You are no longer allowed to see entries. Reload the page and sign in again.';

		expect( await screen.findByText( message ) ).toBeInTheDocument();
		expect( announce ).toHaveBeenCalledWith( message, { force: true } );
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) ).toBeChecked();
	} );
} );
