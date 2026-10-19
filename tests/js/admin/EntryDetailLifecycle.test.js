/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError, deleteEntry, getEntry, updateEntries } from '../../../admin-src/api/client';
import EntryDetailScreen from '../../../admin-src/entries/EntryDetailScreen';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	getEntry: jest.fn(),
	updateEntries: jest.fn(),
	deleteEntry: jest.fn(),
} ) );

const config = { canDelete: true, canManageForms: false, builderUrl: '' };

function detail( extra = {} ) {
	return {
		id: 41,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: true,
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25', full: 'Sep 25 full', iso: '2026-09-24T21:30:00Z' },
		answers: [ { key: 'name', label: 'Your name', type: 'text', display: 'Jane' } ],
		breakdown: { lines: [], error: null },
		details: { ip: null, user_agent: '', user: null, submitted: { display: 'Sep 25', full: 'x', iso: '2026-09-24T21:30:00Z' } },
		neighbours: { previous: 42, next: 40 },
		unread: 4,
		...extra,
	};
}

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise( ( yes, no ) => {
		resolve = yes;
		reject = no;
	} );

	return { promise, resolve, reject };
}

function handlers() {
	return { onBack: jest.fn(), onNavigate: jest.fn(), onDeleted: jest.fn(), announce: jest.fn(), onUnread: jest.fn() };
}

function screenFor( id, props ) {
	return <EntryDetailScreen id={ id } filters={ DEFAULT_FILTERS } config={ config } backHref="?page=quoteform-entries" { ...props } />;
}

let consoleError;

beforeEach( () => {
	jest.resetAllMocks();
	consoleError = jest.spyOn( console, 'error' ).mockImplementation( () => {} );
} );

afterEach( () => {
	consoleError.mockRestore();
} );

async function confirmDelete( user ) {
	await screen.findByText( 'Answers' );
	await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
	await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );
}

describe( 'EntryDetailScreen lifecycle', () => {
	it( 'reports a delete that finishes after the screen was left, but does not navigate', async () => {
		getEntry.mockResolvedValue( detail() );
		const pending = deferred();
		deleteEntry.mockReturnValue( pending.promise );
		const props = handlers();
		const { unmount } = render( screenFor( 41, props ) );
		const user = userEvent.setup();

		await confirmDelete( user );
		unmount();
		await act( async () => pending.resolve( { id: 41, deleted: true, unread: 3 } ) );

		expect( props.onUnread ).toHaveBeenLastCalledWith( 3 );
		expect( props.announce ).toHaveBeenCalledWith( 'Entry #41 deleted.', { force: true } );
		expect( props.onDeleted ).not.toHaveBeenCalled();
	} );

	it( 'treats a delete of an entry someone else already removed as done', async () => {
		getEntry.mockResolvedValue( detail() );
		deleteEntry.mockRejectedValue( new ApiError( { code: 'qform_entry_not_found', status: 404, message: 'Entry not found.' } ) );
		const props = handlers();
		render( screenFor( 41, props ) );
		const user = userEvent.setup();

		await confirmDelete( user );

		expect( props.announce ).toHaveBeenCalledWith( 'Entry #41 was already deleted.', { force: true } );
		expect( props.onDeleted ).toHaveBeenCalledTimes( 1 );
		expect( screen.queryByText( 'That entry no longer exists.' ) ).not.toBeInTheDocument();
	} );

	it( 'does not navigate for an already-deleted entry once the screen was left', async () => {
		getEntry.mockResolvedValue( detail() );
		const pending = deferred();
		deleteEntry.mockReturnValue( pending.promise );
		const props = handlers();
		const { unmount } = render( screenFor( 41, props ) );
		const user = userEvent.setup();

		await confirmDelete( user );
		unmount();
		await act( async () => pending.reject( new ApiError( { code: 'qform_entry_not_found', status: 404, message: 'x' } ) ) );

		expect( props.announce ).toHaveBeenCalledWith( 'Entry #41 was already deleted.', { force: true } );
		expect( props.onDeleted ).not.toHaveBeenCalled();
	} );

	it( 'moves focus to the heading when the error notice is dismissed', async () => {
		getEntry.mockResolvedValue( detail() );
		updateEntries.mockRejectedValue( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) );
		render( screenFor( 41, handlers() ) );
		const user = userEvent.setup();

		await user.click( await screen.findByRole( 'button', { name: 'Mark as unread' } ) );
		await user.click( await screen.findByRole( 'button', { name: 'Dismiss this notice' } ) );

		expect( screen.queryByText( 'You appear to be offline.' ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus();
	} );

	it( 'ignores a load that finishes after the id changed', async () => {
		const first = deferred();
		getEntry.mockReturnValueOnce( first.promise ).mockResolvedValueOnce( detail( { id: 40, answers: [ { key: 'name', label: 'Your name', type: 'text', display: 'Second' } ] } ) );
		const props = handlers();
		const { rerender } = render( screenFor( 41, props ) );

		rerender( screenFor( 40, props ) );
		expect( await screen.findByText( 'Second' ) ).toBeInTheDocument();

		await act( async () => first.resolve( detail( { answers: [ { key: 'name', label: 'Your name', type: 'text', display: 'Stale' } ], unread: 99 } ) ) );

		expect( screen.queryByText( 'Stale' ) ).not.toBeInTheDocument();
		expect( screen.getByText( 'Second' ) ).toBeInTheDocument();
		expect( props.onUnread ).not.toHaveBeenCalledWith( 99 );
		expect( consoleError ).not.toHaveBeenCalled();
	} );

	it( 'ignores a load that finishes after unmount', async () => {
		const pending = deferred();
		getEntry.mockReturnValue( pending.promise );
		const props = handlers();
		const { unmount } = render( screenFor( 41, props ) );

		unmount();
		await act( async () => pending.resolve( detail() ) );
		await act( async () => {} );

		expect( props.onUnread ).not.toHaveBeenCalled();
		expect( consoleError ).not.toHaveBeenCalled();
	} );

	it( 'shows a deleted user as plain text without a link', async () => {
		getEntry.mockResolvedValue(
			detail( { details: { ip: null, user_agent: '', user: { id: 9, name: 'Deleted user #9', url: null }, submitted: detail().details.submitted } } )
		);
		render( screenFor( 41, handlers() ) );

		await screen.findByText( 'Details' );

		const value = screen.getByText( 'User', { selector: 'dt' } ).nextElementSibling;

		expect( value ).toHaveTextContent( 'Deleted user #9' );
		expect( value.querySelector( 'a' ) ).toBeNull();
	} );
} );
