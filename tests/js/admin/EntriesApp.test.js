/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError, deleteEntry, getEntry, listEntries } from '../../../admin-src/api/client';
import EntriesApp from '../../../admin-src/entries/EntriesApp';

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
	exportUrl: 'http://localhost/wp-admin/admin-post.php?action=qform_export_entries&_wpnonce=abc',
	builderUrl: 'http://localhost/wp-admin/admin.php?page=quoteform',
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
		email: '',
		total: '10.0000',
		total_display: '$10.00',
		date: { display: 'Sep 25, 2026', full: '2026-09-25 01:30:00', iso: '2026-09-24T21:30:00Z' },
	};
}

function detail( id ) {
	return {
		...item( id ),
		is_read: true,
		answers: [],
		breakdown: { lines: [], error: null },
		details: { ip: null, user_agent: '', user: null, submitted: item( id ).date },
		neighbours: { previous: null, next: id - 1 },
		unread: 0,
	};
}

function liveRegions( container ) {
	return container.querySelectorAll( '[aria-live], [role="status"], [role="alert"]' );
}

function visit( search ) {
	window.history.replaceState( null, '', `/wp-admin/admin.php${ search }` );
}

beforeEach( () => {
	jest.resetAllMocks();
	listEntries.mockResolvedValue( { items: [ item( 41 ), item( 40 ) ], total: 2, pages: 1, page: 1, per_page: 20, unread: 2 } );
	getEntry.mockImplementation( ( id ) => Promise.resolve( detail( id ) ) );
} );

describe( 'EntriesApp', () => {
	it( 'reads the list state from the address and tidies the address', async () => {
		visit( '?page=quoteform-entries&status=new&orderby=nope&bogus=1' );

		render( <EntriesApp config={ config } /> );

		await screen.findByText( 'Person 41' );

		expect( listEntries ).toHaveBeenCalledWith( { status: 'new', page: 1, per_page: 20 } );
		expect( window.location.search ).toBe( '?page=quoteform-entries&status=new' );
		expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).not.toHaveFocus();
	} );

	it( 'opens an entry as a new history step and comes back to the same list', async () => {
		visit( '?page=quoteform-entries&status=new' );
		const user = userEvent.setup();
		const pushState = jest.spyOn( window.history, 'pushState' );

		render( <EntriesApp config={ config } /> );
		await user.click( await screen.findByRole( 'link', { name: 'View entry #41' } ) );

		expect( pushState ).toHaveBeenLastCalledWith( null, '', '?page=quoteform-entries&status=new&entry=41' );
		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus();
		expect( getEntry ).toHaveBeenCalledWith( 41, { status: 'new' } );

		await user.click( screen.getByRole( 'link', { name: '← Back to entries' } ) );

		expect( pushState ).toHaveBeenLastCalledWith( null, '', '?page=quoteform-entries&status=new' );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );

		pushState.mockRestore();
	} );

	it( 'keeps filter changes out of the back button', async () => {
		visit( '?page=quoteform-entries' );
		const user = userEvent.setup();
		const pushState = jest.spyOn( window.history, 'pushState' );

		render( <EntriesApp config={ config } /> );
		await screen.findByText( 'Person 41' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'read' );

		await waitFor( () => expect( window.location.search ).toBe( '?page=quoteform-entries&status=read' ) );
		expect( pushState ).not.toHaveBeenCalled();

		pushState.mockRestore();
	} );

	it( 'follows the browser back and forward buttons', async () => {
		visit( '?page=quoteform-entries' );

		render( <EntriesApp config={ config } /> );
		await screen.findByText( 'Person 41' );

		act( () => {
			window.history.pushState( null, '', '/wp-admin/admin.php?page=quoteform-entries&entry=5' );
			window.dispatchEvent( new PopStateEvent( 'popstate' ) );
		} );

		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entry #5' } ) ).toHaveFocus();

		act( () => {
			window.history.pushState( null, '', '/wp-admin/admin.php?page=quoteform-entries&form=7' );
			window.dispatchEvent( new PopStateEvent( 'popstate' ) );
		} );

		await waitFor( () => expect( listEntries ).toHaveBeenLastCalledWith( { form: '7', page: 1, per_page: 20 } ) );
	} );

	it( 'steps to a neighbour with the same filters', async () => {
		visit( '?page=quoteform-entries&status=new&entry=41' );
		const user = userEvent.setup();

		render( <EntriesApp config={ config } /> );
		await user.click( await screen.findByRole( 'button', { name: 'Older entry' } ) );

		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entry #40' } ) ).toHaveFocus();
		expect( getEntry ).toHaveBeenLastCalledWith( 40, { status: 'new' } );
		expect( window.location.search ).toBe( '?page=quoteform-entries&status=new&entry=40' );
	} );

	it( 'has exactly one live region on the list, after an error and on an entry', async () => {
		visit( '?page=quoteform-entries' );
		listEntries.mockRejectedValueOnce( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) );
		const user = userEvent.setup();

		const { container } = render( <EntriesApp config={ config } /> );

		await screen.findByText( 'You appear to be offline.' );
		expect( liveRegions( container ) ).toHaveLength( 1 );

		await user.click( screen.getByRole( 'button', { name: 'Try again' } ) );
		await screen.findByText( 'Person 41' );
		expect( liveRegions( container ) ).toHaveLength( 1 );

		await user.click( screen.getByRole( 'link', { name: 'View entry #41' } ) );
		await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } );
		expect( liveRegions( container ) ).toHaveLength( 1 );
	} );

	// R6: səhifə ölçüsü ekran yenidən qurulanda köhnə `config.perPage`-ə qayıtmır.
	it( 'keeps the chosen page size when the list comes back', async () => {
		visit( '?page=quoteform-entries' );
		const user = userEvent.setup();

		render( <EntriesApp config={ config } /> );
		await screen.findByText( 'Person 41' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Per page' } ), '50' );
		await waitFor( () => expect( listEntries ).toHaveBeenLastCalledWith( { page: 1, per_page: 50 } ) );

		await user.click( screen.getByRole( 'link', { name: 'View entry #41' } ) );
		await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } );

		listEntries.mockClear();
		await user.click( screen.getByRole( 'link', { name: '← Back to entries' } ) );

		await screen.findByText( 'Person 41' );
		expect( listEntries ).toHaveBeenCalledTimes( 1 );
		expect( listEntries ).toHaveBeenLastCalledWith( { page: 1, per_page: 50 } );
		expect( screen.getByRole( 'combobox', { name: 'Per page' } ) ).toHaveValue( '50' );
	} );

	it( 'keeps the chosen page size after the browser back button', async () => {
		visit( '?page=quoteform-entries' );
		const user = userEvent.setup();

		render( <EntriesApp config={ config } /> );
		await screen.findByText( 'Person 41' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Per page' } ), '50' );
		await user.click( screen.getByRole( 'link', { name: 'View entry #41' } ) );
		await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } );

		listEntries.mockClear();
		act( () => window.history.back() );

		await screen.findByText( 'Person 41' );
		expect( listEntries ).toHaveBeenLastCalledWith( { page: 1, per_page: 50 } );
	} );

	// R8: brauzerin öz geri/irəli düymələri (əl ilə göndərilmiş popstate yox).
	it( 'goes back to the same filtered list and forward to the same entry', async () => {
		visit( '?page=quoteform-entries&status=new&form=7' );
		const user = userEvent.setup();

		render( <EntriesApp config={ config } /> );
		await user.click( await screen.findByRole( 'link', { name: 'View entry #41' } ) );
		await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } );

		listEntries.mockClear();
		act( () => window.history.back() );

		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus();
		expect( window.location.search ).toBe( '?page=quoteform-entries&form=7&status=new' );
		await waitFor( () =>
			expect( listEntries ).toHaveBeenLastCalledWith( { form: '7', status: 'new', page: 1, per_page: 20 } )
		);
		expect( screen.getByRole( 'combobox', { name: 'Status' } ) ).toHaveValue( 'new' );

		getEntry.mockClear();
		act( () => window.history.forward() );

		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus();
		expect( getEntry ).toHaveBeenLastCalledWith( 41, { form: '7', status: 'new' } );
	} );

	it( 'rewrites the address for filters, sorting and pages without adding history steps', async () => {
		visit( '?page=quoteform-entries' );
		listEntries.mockResolvedValue( {
			items: [ item( 41 ), item( 40 ) ],
			total: 60,
			pages: 3,
			page: 1,
			per_page: 20,
			unread: 2,
		} );
		const user = userEvent.setup();
		const pushState = jest.spyOn( window.history, 'pushState' );
		const replaceState = jest.spyOn( window.history, 'replaceState' );
		const before = window.history.length;

		render( <EntriesApp config={ config } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'button', { name: 'Total' } ) );
		await waitFor( () => expect( window.location.search ).toBe( '?page=quoteform-entries&orderby=total' ) );

		listEntries.mockResolvedValue( {
			items: [ item( 21 ) ],
			total: 60,
			pages: 3,
			page: 2,
			per_page: 20,
			unread: 2,
		} );
		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 3' } ) );
		await waitFor( () => expect( window.location.search ).toBe( '?page=quoteform-entries&orderby=total&paged=2' ) );

		expect( pushState ).not.toHaveBeenCalled();
		expect( replaceState ).toHaveBeenLastCalledWith( null, '', '?page=quoteform-entries&orderby=total&paged=2' );
		expect( window.history.length ).toBe( before );
		expect( window.location.pathname ).toBe( '/wp-admin/admin.php' );

		pushState.mockRestore();
		replaceState.mockRestore();
	} );

	it( 'keeps the admin page and path when opening and closing an entry', async () => {
		visit( '?page=quoteform-entries&status=new' );
		const user = userEvent.setup();

		render( <EntriesApp config={ config } /> );
		await user.click( await screen.findByRole( 'link', { name: 'View entry #41' } ) );
		await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } );

		expect( window.location.pathname ).toBe( '/wp-admin/admin.php' );
		expect( new URLSearchParams( window.location.search ).get( 'page' ) ).toBe( 'quoteform-entries' );
		expect( new URLSearchParams( window.location.search ).get( 'entry' ) ).toBe( '41' );

		await user.click( screen.getByRole( 'link', { name: '← Back to entries' } ) );
		await screen.findByRole( 'heading', { level: 1, name: 'Entries' } );

		expect( window.location.pathname ).toBe( '/wp-admin/admin.php' );
		expect( new URLSearchParams( window.location.search ).get( 'page' ) ).toBe( 'quoteform-entries' );
		expect( new URLSearchParams( window.location.search ).has( 'entry' ) ).toBe( false );
	} );

	it( 'leaves ctrl, cmd and middle clicks on an entry link to the browser', async () => {
		visit( '?page=quoteform-entries' );
		const pushState = jest.spyOn( window.history, 'pushState' );
		const prevented = [];
		// React-dan SONRA işləyir: səhifənin nəyi saxladığını qeyd edir, sonra jsdom-un
		// (dəstəklənməyən) naviqasiyasını dayandırır.
		const record = ( event ) => {
			prevented.push( event.defaultPrevented );
			event.preventDefault();
		};

		window.addEventListener( 'click', record );

		render( <EntriesApp config={ config } /> );
		const link = await screen.findByRole( 'link', { name: 'View entry #41' } );

		expect( link ).toHaveAttribute( 'href', '?page=quoteform-entries&entry=41' );

		fireEvent.click( link, { button: 0, ctrlKey: true } );
		fireEvent.click( link, { button: 0, metaKey: true } );
		fireEvent.click( link, { button: 1 } );

		expect( prevented ).toEqual( [ false, false, false ] );
		expect( pushState ).not.toHaveBeenCalled();
		expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toBeInTheDocument();

		fireEvent.click( link, { button: 0 } );

		expect( prevented ).toEqual( [ false, false, false, true ] );
		expect( pushState ).toHaveBeenLastCalledWith( null, '', '?page=quoteform-entries&entry=41' );
		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus();

		window.removeEventListener( 'click', record );
		pushState.mockRestore();
	} );

	it( 'replaces the address of a deleted entry instead of adding a step', async () => {
		visit( '?page=quoteform-entries&entry=41' );
		deleteEntry.mockResolvedValue( { deleted: true, unread: 0 } );
		const user = userEvent.setup();
		const pushState = jest.spyOn( window.history, 'pushState' );

		render( <EntriesApp config={ config } /> );
		await user.click( await screen.findByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus();
		expect( window.location.search ).toBe( '?page=quoteform-entries' );
		expect( pushState ).not.toHaveBeenCalled();

		pushState.mockRestore();
	} );

	// Fix round 1: eyni səhifədəki `#` linki (WP-nin "Skip to main content" → `#wpbody-content`)
	// popstate göndərir; marşrut dəyişməyibsə ekran yenidən qurulmamalıdır.
	it( 'ignores a popstate that only changes the hash', async () => {
		visit( '?page=quoteform-entries&status=new' );
		const user = userEvent.setup();

		render( <EntriesApp config={ config } /> );
		await screen.findByText( 'Person 41' );

		const checkbox = screen.getByRole( 'checkbox', { name: 'Select entry #41' } );

		await user.click( checkbox );
		expect( checkbox ).toBeChecked();
		expect( checkbox ).toHaveFocus();
		listEntries.mockClear();

		act( () => {
			window.history.pushState( null, '', '#wpbody-content' );
			window.dispatchEvent( new PopStateEvent( 'popstate' ) );
		} );

		await act( async () => {
			await Promise.resolve();
		} );

		expect( listEntries ).not.toHaveBeenCalled();
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) ).toBeChecked();
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) ).toHaveFocus();
		expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).not.toHaveFocus();
	} );

	it.each( [ 'abc', '-1', '0', '1.5' ] )( 'shows the list for entry=%s', async ( value ) => {
		visit( `?page=quoteform-entries&entry=${ value }` );

		render( <EntriesApp config={ config } /> );

		expect( await screen.findByText( 'Person 41' ) ).toBeInTheDocument();
		expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toBeInTheDocument();
		expect( getEntry ).not.toHaveBeenCalled();
		expect( window.location.search ).toBe( '?page=quoteform-entries' );
	} );
} );
