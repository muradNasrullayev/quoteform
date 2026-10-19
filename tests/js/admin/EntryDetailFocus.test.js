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

function detail() {
	return {
		id: 41,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: true,
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25', full: 'Sep 25 full', iso: '2026-09-24T21:30:00Z' },
		answers: [],
		breakdown: { lines: [], error: null },
		details: { ip: null, user_agent: '', user: null, submitted: { display: 'Sep 25', full: 'x', iso: '2026-09-24T21:30:00Z' } },
		neighbours: { previous: null, next: null },
		unread: 4,
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

function mount( props = {} ) {
	const handlers = { onBack: jest.fn(), onNavigate: jest.fn(), onDeleted: jest.fn(), announce: jest.fn(), onUnread: jest.fn() };
	const view = render(
		<EntryDetailScreen id={ 41 } filters={ DEFAULT_FILTERS } config={ config } backHref="?page=quoteform-entries" { ...handlers } { ...props } />
	);

	return { ...handlers, ...view };
}

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'EntryDetailScreen focus and busy state', () => {
	it( 'keeps the read toggle focusable while busy and ignores a second click', async () => {
		getEntry.mockResolvedValue( detail() );
		const pending = deferred();
		updateEntries.mockReturnValue( pending.promise );
		mount();
		const user = userEvent.setup();

		const toggle = await screen.findByRole( 'button', { name: 'Mark as unread' } );

		await user.click( toggle );
		await user.click( toggle );

		expect( toggle ).not.toBeDisabled();
		expect( toggle ).toHaveAttribute( 'aria-disabled', 'true' );
		expect( toggle ).toHaveFocus();
		expect( updateEntries ).toHaveBeenCalledTimes( 1 );

		await act( async () => pending.resolve( { affected: 1, unread: 5 } ) );

		expect( toggle ).not.toHaveAttribute( 'aria-disabled' );
		expect( toggle ).toHaveFocus();
	} );

	it( 'keeps the entry on screen when a delete fails, with focus on Delete', async () => {
		getEntry.mockResolvedValue( detail() );
		deleteEntry.mockRejectedValue( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) );
		const { announce, onDeleted } = mount();
		const user = userEvent.setup();

		await screen.findByText( 'Answers' );
		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( await screen.findByText( 'You appear to be offline.' ) ).toBeInTheDocument();
		expect( announce ).toHaveBeenCalledWith( 'You appear to be offline.', { force: true } );
		expect( screen.queryByText( 'Entry not found.' ) ).not.toBeInTheDocument();
		expect( screen.getByText( 'Answers' ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toHaveFocus();
		expect( screen.getByRole( 'button', { name: 'Delete' } ) ).not.toHaveAttribute( 'aria-disabled' );
		expect( onDeleted ).not.toHaveBeenCalled();
	} );

	it( 'moves focus to the heading once Try again succeeds', async () => {
		getEntry
			.mockRejectedValueOnce( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) )
			.mockResolvedValueOnce( detail() );
		mount();
		const user = userEvent.setup();

		await user.click( await screen.findByRole( 'button', { name: 'Try again' } ) );
		await screen.findByText( 'Answers' );

		expect( screen.getByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus();
	} );

	it( 'does not update state after it has been unmounted', async () => {
		const errors = jest.spyOn( console, 'error' ).mockImplementation( () => {} );
		getEntry.mockResolvedValue( detail() );
		const pending = deferred();
		updateEntries.mockReturnValue( pending.promise );
		const { unmount, announce } = mount();
		const user = userEvent.setup();

		await user.click( await screen.findByRole( 'button', { name: 'Mark as unread' } ) );
		unmount();
		await act( async () => pending.reject( new ApiError( { code: 'fetch_error', status: 0, message: 'Offline.' } ) ) );

		expect( announce ).not.toHaveBeenCalled();
		expect( errors ).not.toHaveBeenCalled();
		errors.mockRestore();
	} );
} );
