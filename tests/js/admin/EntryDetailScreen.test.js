/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError, deleteEntry, getEntry, updateEntries } from '../../../admin-src/api/client';
import EntryDetailScreen, { neighbourLabels } from '../../../admin-src/entries/EntryDetailScreen';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listEntries: jest.fn(),
	getEntry: jest.fn(),
	updateEntries: jest.fn(),
	deleteEntry: jest.fn(),
} ) );

const config = { canDelete: true, canManageForms: true, builderUrl: 'http://example.test/wp-admin/admin.php?page=quoteform' };

function detail( extra = {} ) {
	return {
		id: 41,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: true,
		name: 'Jane',
		email: 'jane@example.com',
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25, 2026 1:30 am', full: '2026-09-25 01:30:00 +04', iso: '2026-09-24T21:30:00Z' },
		answers: [
			{ key: 'name', label: 'Your name', type: 'text', display: '<b>Jane</b>' },
			{ key: 'extras', label: 'Extras', type: 'checkbox', display: 'Oven, Fridge' },
			{ key: 'agree', label: 'Agree', type: 'toggle', display: 'Yes' },
			{ key: 'notes', label: 'Notes', type: 'textarea', display: 'Line one\nLine two' },
			{ key: 'phone', label: 'Phone', type: 'tel', display: '' },
			{ key: 'source', label: '', type: 'hidden', display: 'google' },
		],
		breakdown: { lines: [ { key: 'base', label: 'Rooms', amount_display: '$120.00' }, { key: 'extra', label: 'Extras', amount_display: '' } ], error: null },
		details: {
			ip: '203.0.113.9',
			user_agent: 'Firefox/130',
			user: { id: 3, name: 'Sam', url: 'http://example.test/wp-admin/user-edit.php?user_id=3' },
			submitted: { display: 'Sep 25, 2026 1:30 am', full: '2026-09-25 01:30:00 +04', iso: '2026-09-24T21:30:00Z' },
		},
		neighbours: { previous: 42, next: 40 },
		unread: 4,
		...extra,
	};
}

function setup( props = {} ) {
	const handlers = {
		onBack: jest.fn(),
		onNavigate: jest.fn(),
		onDeleted: jest.fn(),
		announce: jest.fn(),
		onUnread: jest.fn(),
	};

	render(
		<EntryDetailScreen
			id={ 41 }
			filters={ DEFAULT_FILTERS }
			config={ config }
			backHref="?page=quoteform-entries"
			{ ...handlers }
			{ ...props }
		/>
	);

	return handlers;
}

function answer( label ) {
	return screen.getByText( label, { selector: 'dt' } ).nextElementSibling;
}

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'EntryDetailScreen', () => {
	it( 'asks for the entry with the list filters and updates the menu badge', async () => {
		getEntry.mockResolvedValue( detail() );
		const { onUnread } = setup( { filters: { ...DEFAULT_FILTERS, status: 'new', orderby: 'total' } } );

		await screen.findByText( 'Answers' );

		expect( getEntry ).toHaveBeenCalledWith( 41, { status: 'new', orderby: 'total' } );
		expect( onUnread ).toHaveBeenCalledWith( 4 );
	} );

	it( 'shows every answer as plain text, with a dash for blanks and the key for unlabeled fields', async () => {
		getEntry.mockResolvedValue( detail() );
		setup();

		await screen.findByText( 'Answers' );

		expect( answer( 'Your name' ) ).toHaveTextContent( '<b>Jane</b>' );
		expect( answer( 'Your name' ).querySelector( 'b' ) ).toBeNull();
		expect( answer( 'Extras' ) ).toHaveTextContent( 'Oven, Fridge' );
		expect( answer( 'Agree' ) ).toHaveTextContent( 'Yes' );
		expect( answer( 'Notes' ).textContent ).toBe( 'Line one\nLine two' );
		expect( answer( 'Notes' ) ).toHaveClass( 'quoteform_entry__value' );
		expect( answer( 'Phone' ) ).toHaveTextContent( '—' );
		expect( answer( 'source' ) ).toHaveTextContent( 'google' );
	} );

	it( 'shows the stored price lines and the total', async () => {
		getEntry.mockResolvedValue( detail() );
		setup();

		const table = await screen.findByRole( 'table', { name: 'Price breakdown' } );

		expect( within( table ).getByRole( 'rowheader', { name: 'Rooms' } ).nextElementSibling ).toHaveTextContent( '$120.00' );
		expect( within( table ).getByRole( 'rowheader', { name: 'Extras' } ).nextElementSibling ).toHaveTextContent( '—' );
		expect( within( table ).getByRole( 'rowheader', { name: 'Total' } ).nextElementSibling ).toHaveTextContent( '$180.00' );
	} );

	it( 'explains a price that could not be worked out', async () => {
		getEntry.mockResolvedValue( detail( { total: null, total_display: '', breakdown: { lines: [], error: 'division_by_zero' } } ) );
		setup();

		expect( await screen.findByText( 'The price could not be worked out when this entry was sent (division_by_zero).' ) ).toBeInTheDocument();
		expect( within( screen.getByRole( 'table', { name: 'Price breakdown' } ) ).getByRole( 'rowheader', { name: 'Total' } ).nextElementSibling ).toHaveTextContent( '—' );
	} );

	it( 'lists the technical details and links the user profile', async () => {
		getEntry.mockResolvedValue( detail() );
		setup();

		await screen.findByText( 'Details' );

		expect( answer( 'IP address' ) ).toHaveTextContent( '203.0.113.9' );
		expect( answer( 'Browser' ) ).toHaveTextContent( 'Firefox/130' );
		expect( within( answer( 'User' ) ).getByRole( 'link', { name: 'Sam' } ) ).toHaveAttribute( 'href', 'http://example.test/wp-admin/user-edit.php?user_id=3' );
	} );

	it( 'leaves out an IP and a user that were not stored', async () => {
		getEntry.mockResolvedValue( detail( { details: { ip: null, user_agent: '', user: null, submitted: detail().details.submitted } } ) );
		setup();

		await screen.findByText( 'Details' );

		expect( screen.queryByText( 'IP address' ) ).not.toBeInTheDocument();
		expect( screen.queryByText( 'User' ) ).not.toBeInTheDocument();
		expect( answer( 'Browser' ) ).toHaveTextContent( '—' );
	} );

	it( 'steps to the neighbours and disables the arrow at the end of the list', async () => {
		getEntry.mockResolvedValue( detail( { neighbours: { previous: 42, next: null } } ) );
		const { onNavigate } = setup();
		const user = userEvent.setup();

		await screen.findByText( 'Answers' );

		expect( screen.getByRole( 'button', { name: 'Older entry' } ) ).toBeDisabled();

		await user.click( screen.getByRole( 'button', { name: 'Newer entry' } ) );

		expect( onNavigate ).toHaveBeenCalledWith( 42 );
	} );

	it( 'marks the entry unread in place, without reading it again', async () => {
		getEntry.mockResolvedValue( detail() );
		updateEntries.mockResolvedValue( { affected: 1, unread: 5 } );
		const { onUnread, announce } = setup();
		const user = userEvent.setup();

		await screen.findByText( 'Answers' );

		const toggle = screen.getByRole( 'button', { name: 'Mark as unread' } );

		await user.click( toggle );

		expect( updateEntries ).toHaveBeenCalledWith( 'unread', [ 41 ] );
		expect( await screen.findByRole( 'button', { name: 'Mark as read' } ) ).toBe( toggle );
		expect( toggle ).toHaveFocus();
		expect( screen.getByText( 'New', { selector: '.quoteform_entry__status' } ) ).toBeInTheDocument();
		expect( onUnread ).toHaveBeenLastCalledWith( 5 );
		expect( announce ).toHaveBeenCalledWith( 'Entry marked as unread.', { force: true } );
		expect( getEntry ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'deletes after confirmation and hands back to the list', async () => {
		getEntry.mockResolvedValue( detail() );
		deleteEntry.mockResolvedValue( { id: 41, deleted: true, unread: 3 } );
		const { onDeleted, onUnread, announce } = setup();
		const user = userEvent.setup();

		await screen.findByText( 'Answers' );

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );
		expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( deleteEntry ).toHaveBeenCalledWith( 41 );
		expect( onUnread ).toHaveBeenLastCalledWith( 3 );
		expect( announce ).toHaveBeenCalledWith( 'Entry #41 deleted.', { force: true } );
		expect( onDeleted ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'offers no Delete to someone who may only read', async () => {
		getEntry.mockResolvedValue( detail() );
		setup( { config: { ...config, canDelete: false, canManageForms: false } } );

		await screen.findByText( 'Answers' );

		expect( screen.queryByRole( 'button', { name: 'Delete' } ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'link', { name: 'Cleaning quote' } ) ).not.toBeInTheDocument();
	} );

	it( 'says when the entry does not exist', async () => {
		getEntry.mockRejectedValue( new ApiError( { code: 'qform_entry_not_found', status: 404, message: 'Entry not found.' } ) );
		const { onBack } = setup();
		const user = userEvent.setup();

		expect( await screen.findByText( 'Entry not found.' ) ).toBeInTheDocument();

		await user.click( screen.getByRole( 'link', { name: '← Back to entries' } ) );

		expect( onBack ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'shows other failures quietly, announces them and retries', async () => {
		getEntry
			.mockRejectedValueOnce( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) )
			.mockResolvedValueOnce( detail() );
		const { announce } = setup();
		const user = userEvent.setup();

		expect( await screen.findByText( 'You appear to be offline.' ) ).toBeInTheDocument();
		expect( announce ).toHaveBeenCalledWith( 'You appear to be offline.', { force: true } );
		expect( document.querySelector( '[role="alert"]' ) ).toBeNull();

		await user.click( screen.getByRole( 'button', { name: 'Try again' } ) );

		expect( await screen.findByText( 'Answers' ) ).toBeInTheDocument();
	} );

	it( 'takes focus to its heading when opened from the list', async () => {
		getEntry.mockResolvedValue( detail() );
		setup( { focusOnMount: true } );

		expect( screen.getByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus();
		await screen.findByText( 'Answers' );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus() );
	} );
} );

describe( 'neighbourLabels', () => {
	it( 'names the arrows by what they mean in the current order', () => {
		expect( neighbourLabels( DEFAULT_FILTERS ) ).toEqual( { previous: 'Newer entry', next: 'Older entry' } );
		expect( neighbourLabels( { ...DEFAULT_FILTERS, order: 'asc' } ) ).toEqual( { previous: 'Older entry', next: 'Newer entry' } );
		expect( neighbourLabels( { ...DEFAULT_FILTERS, orderby: 'total' } ) ).toEqual( { previous: 'Previous entry', next: 'Next entry' } );
	} );
} );
