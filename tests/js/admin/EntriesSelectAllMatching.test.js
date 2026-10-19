/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { ApiError, listEntries, updateEntries, updateMatchingEntries } from '../../../admin-src/api/client';
import EntriesListScreen from '../../../admin-src/entries/EntriesListScreen';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listEntries: jest.fn(),
	getEntry: jest.fn(),
	updateEntries: jest.fn(),
	updateMatchingEntries: jest.fn(),
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

/** İki sətirlik səhifə, filtrdə isə 60 müraciət. */
function page( extra = {} ) {
	return { items: [ item( 41 ), item( 40 ) ], total: 60, pages: 30, page: 1, per_page: 2, unread: 5, max_id: 912, ...extra };
}

function Harness( { initialFilters = DEFAULT_FILTERS, initialPaged = 1, announce = jest.fn(), onUnread = jest.fn() } ) {
	const [ state, setState ] = useState( { filters: initialFilters, paged: initialPaged } );

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
	const promise = new Promise( ( done ) => {
		resolve = done;
	} );

	return { promise, resolve };
}

const OFFER = 'Select all 60 entries matching this filter';

function bar() {
	return screen.getByRole( 'group', { name: 'Bulk actions' } );
}

async function selectPage( user ) {
	await screen.findByText( 'Person 41' );
	await user.click( screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } ) );
}

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'selecting every entry that matches the filter', () => {
	it( 'offers the whole filter only when the page is fully selected and the filter holds more', async () => {
		listEntries.mockResolvedValue( page() );
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		expect( screen.queryByRole( 'button', { name: OFFER } ) ).not.toBeInTheDocument();

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) );
		expect( bar() ).toHaveTextContent( 'All 2 entries on this page are selected.' );
		expect( screen.getByRole( 'button', { name: OFFER } ) ).toBeInTheDocument();
	} );

	it( 'makes no offer when the page already shows the whole filter', async () => {
		listEntries.mockResolvedValue( page( { total: 2, pages: 1 } ) );
		const user = userEvent.setup();

		render( <Harness /> );
		await selectPage( user );

		expect( bar() ).toHaveTextContent( '2 selected' );
		expect( screen.queryByRole( 'button', { name: /matching this filter/ } ) ).not.toBeInTheDocument();
	} );

	it( 'switches to the whole filter, says so, and Clear selection deselects everything (R12)', async () => {
		listEntries.mockResolvedValue( page() );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await selectPage( user );

		await user.click( screen.getByRole( 'button', { name: OFFER } ) );

		expect( bar() ).toHaveTextContent( 'All 60 entries selected.' );
		expect( announce ).toHaveBeenCalledWith( 'All 60 entries selected.' );
		expect( screen.getByRole( 'button', { name: 'Clear selection' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Clear selection' } ) );

		const header = screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } );

		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
		expect( header ).not.toBeChecked();
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) ).not.toBeChecked();
		expect( header ).toHaveFocus();
	} );

	it( 'deletes the whole filter by scope and highest id after its own confirmation', async () => {
		listEntries.mockResolvedValueOnce( page( { max_id: 912 } ) ).mockResolvedValue( page( { items: [], total: 0, pages: 0, max_id: null } ) );
		updateMatchingEntries.mockResolvedValue( { affected: 58, unread: 1 } );
		const announce = jest.fn();
		const onUnread = jest.fn();
		const user = userEvent.setup();
		const filters = { ...DEFAULT_FILTERS, form: 7, status: 'new' };

		render( <Harness initialFilters={ filters } initialPaged={ 1 } announce={ announce } onUnread={ onUnread } /> );
		await selectPage( user );
		await user.click( screen.getByRole( 'button', { name: OFFER } ) );

		await user.click( within( bar() ).getByRole( 'button', { name: 'Delete' } ) );
		expect( screen.getByText( 'Delete all 60 entries matching this filter? This cannot be undone.' ) ).toBeInTheDocument();
		expect( updateMatchingEntries ).not.toHaveBeenCalled();

		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( updateMatchingEntries ).toHaveBeenCalledWith( 'delete', filters, 912, 60 );
		expect( updateEntries ).not.toHaveBeenCalled();
		await waitFor( () => expect( announce ).toHaveBeenCalledWith( '58 entries deleted.', { force: true } ) );
		expect( onUnread ).toHaveBeenCalledWith( 1 );
		await waitFor( () => expect( listEntries ).toHaveBeenCalledTimes( 2 ) );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );
		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
	} );

	it( 'marks the whole filter read or unread the same way', async () => {
		listEntries.mockResolvedValue( page() );
		updateMatchingEntries.mockResolvedValue( { affected: 60, unread: 0 } );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await selectPage( user );
		await user.click( screen.getByRole( 'button', { name: OFFER } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		expect( updateMatchingEntries ).toHaveBeenCalledWith( 'read', DEFAULT_FILTERS, 912, 60 );
		await waitFor( () => expect( announce ).toHaveBeenCalledWith( '60 entries marked as read.', { force: true } ) );
		await waitFor( () => expect( screen.queryByText( 'All 60 entries selected.' ) ).not.toBeInTheDocument() );
	} );

	it( 'keeps the busy buttons focusable and inert while the request runs', async () => {
		listEntries.mockResolvedValue( page() );
		const pending = deferred();
		updateMatchingEntries.mockImplementation( () => pending.promise );
		const user = userEvent.setup();

		render( <Harness /> );
		await selectPage( user );
		await user.click( screen.getByRole( 'button', { name: OFFER } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as unread' } ) );

		const trigger = screen.getByRole( 'button', { name: 'Mark as unread' } );
		const clear = screen.getByRole( 'button', { name: 'Clear selection' } );

		expect( trigger ).toHaveFocus();
		expect( trigger ).toHaveAttribute( 'aria-disabled', 'true' );
		expect( trigger ).not.toBeDisabled();
		expect( clear ).toHaveAttribute( 'aria-disabled', 'true' );

		await user.click( clear );
		await user.click( trigger );

		expect( bar() ).toHaveTextContent( 'All 60 entries selected.' );
		expect( updateMatchingEntries ).toHaveBeenCalledTimes( 1 );

		await act( async () => {
			pending.resolve( { affected: 60, unread: 60 } );
		} );
	} );
} );

describe( 'never acting on a list that is not on screen', () => {
	it( 'drops the selection the moment a filter changes, so nothing can be sent before the new list arrives', async () => {
		const slow = deferred();

		listEntries.mockResolvedValueOnce( page() ).mockImplementationOnce( () => slow.promise );
		const user = userEvent.setup();

		render( <Harness initialFilters={ { ...DEFAULT_FILTERS, form: 7 } } /> );
		await selectPage( user );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'new' );

		// Köhnə sətirlər hələ ekrandadır (yeni siyahı gəlməyib), amma seçim və təklif yoxdur.
		expect( screen.getByText( 'Person 41' ) ).toBeInTheDocument();
		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'button', { name: OFFER } ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) ).not.toBeChecked();

		await act( async () => {
			slow.resolve( page( { total: 3 } ) );
		} );
	} );

	it( 'drops the selection on sort, page and page-size changes too', async () => {
		const slow = deferred();

		listEntries.mockResolvedValueOnce( page() ).mockImplementation( () => slow.promise );
		const user = userEvent.setup();

		render( <Harness /> );

		for ( const change of [
			() => user.click( screen.getByRole( 'button', { name: 'Total' } ) ),
			() => user.click( screen.getByRole( 'button', { name: 'Page 2 of 30' } ) ),
			() => user.selectOptions( screen.getByRole( 'combobox', { name: 'Per page' } ), '50' ),
		] ) {
			await selectPage( user );
			expect( bar() ).toBeInTheDocument();

			await change();

			expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
		}
	} );

	it( 'keeps every bulk action inert when the filters change from outside (browser back) while the old list is shown', async () => {
		const slow = deferred();

		listEntries.mockResolvedValueOnce( page() ).mockImplementationOnce( () => slow.promise );
		const user = userEvent.setup();
		const props = { config, paged: 1, onChange: jest.fn(), onOpen: jest.fn(), announce: jest.fn(), onUnread: jest.fn() };
		const { rerender } = render( <EntriesListScreen { ...props } filters={ { ...DEFAULT_FILTERS, form: 7 } } /> );

		await selectPage( user );
		await user.click( within( bar() ).getByRole( 'button', { name: 'Delete' } ) );
		expect( screen.getByRole( 'button', { name: 'Delete permanently' } ) ).toBeInTheDocument();

		rerender( <EntriesListScreen { ...props } filters={ { ...DEFAULT_FILTERS, form: 8 } } /> );

		expect( screen.queryByRole( 'button', { name: 'Delete permanently' } ) ).not.toBeInTheDocument();

		for ( const name of [ 'Mark as read', 'Mark as unread', 'Delete', OFFER ] ) {
			const button = within( bar() ).getByRole( 'button', { name } );

			expect( button ).toHaveAttribute( 'aria-disabled', 'true' );
			await user.click( button );
		}

		expect( screen.queryByRole( 'button', { name: 'Delete permanently' } ) ).not.toBeInTheDocument();
		expect( screen.queryByText( 'All 60 entries selected.' ) ).not.toBeInTheDocument();
		expect( updateEntries ).not.toHaveBeenCalled();
		expect( updateMatchingEntries ).not.toHaveBeenCalled();

		await act( async () => {
			slow.resolve( page( { items: [ item( 8 ) ], total: 40, max_id: 555 } ) );
		} );
	} );

	it( 'sends the filters, highest id and count of one and the same loaded list — never a mix', async () => {
		listEntries
			.mockResolvedValueOnce( page( { total: 60, max_id: 912 } ) )
			.mockResolvedValueOnce( page( { items: [ item( 30 ), item( 29 ) ], total: 40, max_id: 555 } ) )
			.mockResolvedValue( page( { items: [], total: 0, pages: 0, max_id: null } ) );
		updateMatchingEntries.mockResolvedValue( { affected: 40, unread: 0 } );
		const user = userEvent.setup();

		render( <Harness initialFilters={ { ...DEFAULT_FILTERS, form: 7 } } /> );
		await screen.findByText( 'Person 41' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'new' );
		await screen.findByText( 'Person 30' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Select all 40 entries matching this filter' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		expect( updateMatchingEntries ).toHaveBeenCalledWith( 'read', { ...DEFAULT_FILTERS, form: 7, status: 'new' }, 555, 40 );
	} );

	it( 'reloads, leaves the mode and says so when the server reports the list changed', async () => {
		listEntries.mockResolvedValueOnce( page() ).mockResolvedValueOnce( page( { total: 61, max_id: 913 } ) );
		updateMatchingEntries.mockRejectedValue(
			new ApiError( { code: 'qform_list_changed', status: 409, message: 'The list changed. Review it and try again.' } )
		);
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await selectPage( user );
		await user.click( screen.getByRole( 'button', { name: OFFER } ) );
		await user.click( within( bar() ).getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		const message = 'The list changed. Review it and try again.';

		await waitFor( () => expect( announce ).toHaveBeenCalledWith( message, { force: true } ) );
		await waitFor( () => expect( listEntries ).toHaveBeenCalledTimes( 2 ) );
		await waitFor( () => expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument() );
		expect( screen.queryByText( 'All 60 entries selected.' ) ).not.toBeInTheDocument();
		expect( screen.getByText( message ) ).toBeInTheDocument();
		expect( screen.getByText( '61 entries' ) ).toBeInTheDocument();
	} );
} );

describe( 'leaving the whole-filter selection', () => {
	it( 'leaves it as soon as a filter changes, before the new list arrives', async () => {
		const slow = deferred();

		listEntries.mockResolvedValueOnce( page() ).mockImplementationOnce( () => slow.promise );
		const user = userEvent.setup();

		render( <Harness /> );
		await selectPage( user );
		await user.click( screen.getByRole( 'button', { name: OFFER } ) );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'new' );

		expect( screen.queryByText( 'All 60 entries selected.' ) ).not.toBeInTheDocument();

		await act( async () => {
			slow.resolve( page( { total: 3 } ) );
		} );
	} );

	it( 'leaves it on a page change', async () => {
		listEntries.mockImplementation( ( { page: number } ) => Promise.resolve( page( { page: number } ) ) );
		const user = userEvent.setup();

		render( <Harness /> );
		await selectPage( user );
		await user.click( screen.getByRole( 'button', { name: OFFER } ) );

		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 30' } ) );

		await waitFor( () => expect( screen.queryByText( 'All 60 entries selected.' ) ).not.toBeInTheDocument() );
		await waitFor( () => expect( listEntries ).toHaveBeenCalledTimes( 2 ) );
		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
	} );

	it( 'leaves it when a row is unticked, and then acts on the ticked ids only', async () => {
		listEntries.mockResolvedValue( page() );
		updateEntries.mockResolvedValue( { affected: 1, unread: 4 } );
		const user = userEvent.setup();

		render( <Harness /> );
		await selectPage( user );
		await user.click( screen.getByRole( 'button', { name: OFFER } ) );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) );

		expect( bar() ).toHaveTextContent( '1 selected' );
		expect( bar() ).not.toHaveTextContent( 'All 60 entries selected.' );

		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		expect( updateEntries ).toHaveBeenCalledWith( 'read', [ 41 ] );
		expect( updateMatchingEntries ).not.toHaveBeenCalled();
	} );

	it( 'does not come back after re-ticking the page', async () => {
		listEntries.mockResolvedValue( page() );
		const user = userEvent.setup();

		render( <Harness /> );
		await selectPage( user );
		await user.click( screen.getByRole( 'button', { name: OFFER } ) );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } ) );
		await user.click( screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } ) );

		expect( bar() ).toHaveTextContent( 'All 2 entries on this page are selected.' );
		expect( screen.getByRole( 'button', { name: OFFER } ) ).toBeInTheDocument();
	} );
} );
