/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FormListScreen from '../../../admin-src/screens/FormListScreen';
import { ApiError, createForm, deleteForm, listForms } from '../../../admin-src/api/client';

// Full automocking replaces `ApiError` with a mock class whose constructor
// discards every argument, so `new ApiError( { code, message, ... } )` in
// these tests would produce an error with no code and no message. Keep the
// real `ApiError` and mock only the network-calling functions.
jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listForms: jest.fn(),
	getForm: jest.fn(),
	createForm: jest.fn(),
	updateForm: jest.fn(),
	deleteForm: jest.fn(),
} ) );

const twoForms = {
	forms: [
		{ id: 3, title: 'Cleaning quote', modified: '2026-09-15T11:20:45' },
		{ id: 4, title: 'Moving quote', modified: '2026-09-14T09:00:00' },
	],
	total: 2,
	totalPages: 1,
};

const trashCleaningQuote = 'Move “Cleaning quote” to trash (form 3)';
const trashMovingQuote = 'Move “Moving quote” to trash (form 4)';

beforeEach( () => {
	// clearAllMocks only clears call data; a mockRejectedValue set up by an
	// earlier test's implementation would otherwise leak into a later one.
	// resetAllMocks clears implementations too, so every test must (and,
	// below, does) set up its own listForms/createForm/deleteForm behaviour.
	jest.resetAllMocks();
} );

describe( 'pagination', () => {
	it( 'offers no page controls when everything fits on one page', async () => {
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		await screen.findByText( 'Cleaning quote' );

		expect( screen.queryByRole( 'navigation', { name: 'Form list pages' } ) ).not.toBeInTheDocument();
	} );

	it( 'reaches the forms that do not fit on the first page', async () => {
		listForms.mockImplementation( ( { page } = {} ) =>
			Promise.resolve(
				page === 2
					? {
							forms: [ { id: 21, title: 'Form 21', modified: '2026-09-13T09:00:00' } ],
							total: 21,
							totalPages: 2,
					  }
					: { ...twoForms, total: 21, totalPages: 2 }
			)
		);

		const user = userEvent.setup();

		render( <FormListScreen onOpen={ () => {} } /> );

		await screen.findByText( 'Cleaning quote' );

		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 2' } ) );

		expect( await screen.findByText( 'Form 21' ) ).toBeInTheDocument();
		expect( screen.queryByText( 'Cleaning quote' ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Page 2 of 2' } ) ).toHaveAttribute(
			'aria-current',
			'page'
		);
	} );

	it( 'asks the server for the page it is showing, not always the first', async () => {
		listForms.mockImplementation( ( { page } = {} ) =>
			Promise.resolve( {
				forms: [ { id: page, title: `Form ${ page }`, modified: '2026-09-13T09:00:00' } ],
				total: 21,
				totalPages: 2,
			} )
		);

		const user = userEvent.setup();

		render( <FormListScreen onOpen={ () => {} } /> );

		await screen.findByText( 'Form 1' );

		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 2' } ) );
		await screen.findByText( 'Form 2' );

		expect( listForms ).toHaveBeenLastCalledWith( { page: 2 } );
	} );
} );

describe( 'listing', () => {
	it( 'shows the forms it loaded', async () => {
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		expect( await screen.findByText( 'Cleaning quote' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Moving quote' ) ).toBeInTheDocument();
	} );

	it( 'says so when there are none, instead of showing an empty table', async () => {
		listForms.mockResolvedValue( { forms: [], total: 0, totalPages: 0 } );

		render( <FormListScreen onOpen={ () => {} } /> );

		expect(
			await screen.findByText( 'No forms yet. Create your first one.' )
		).toBeInTheDocument();
	} );

	// Kills the mutant that drops the `forms.length > 0` guard around the
	// table, which would render an empty table next to the empty-state text.
	it( 'does not render the table when there are no forms', async () => {
		listForms.mockResolvedValue( { forms: [], total: 0, totalPages: 0 } );

		render( <FormListScreen onOpen={ () => {} } /> );

		await screen.findByText( 'No forms yet. Create your first one.' );
		expect( screen.queryByRole( 'table' ) ).not.toBeInTheDocument();
	} );

	it( 'reports a failed load and keeps the create button usable', async () => {
		listForms.mockRejectedValue(
			new ApiError( { code: 'qform_network_error', status: 0, message: 'No connection.', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'No connection.' );
		expect( screen.getByRole( 'button', { name: 'Create a form' } ) ).toBeEnabled();
	} );

	// Kills the mutant that drops the `! error` guard from the empty-state
	// condition, which would show "No forms yet…" underneath a load error.
	it( 'does not show the empty state alongside a load error', async () => {
		listForms.mockRejectedValue(
			new ApiError( { code: 'qform_network_error', status: 0, message: 'No connection.', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await screen.findByRole( 'alert' );
		expect( screen.queryByText( 'No forms yet. Create your first one.' ) ).not.toBeInTheDocument();
	} );

	// Kills a mutant that drops rest_cookie_invalid_nonce from the reload
	// branch, which would otherwise fall through to the raw error message.
	it( 'treats an expired nonce the same as a lost capability', async () => {
		listForms.mockRejectedValue(
			new ApiError( {
				code: 'rest_cookie_invalid_nonce',
				status: 403,
				message: 'Cookie check failed.',
				errors: [],
			} )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'You are no longer allowed to manage forms. Reload the page and sign in again.'
		);
	} );

	// Kills a mutant that drops rest_forbidden_context from the reload branch.
	it( 'treats a forbidden request context the same as a lost capability', async () => {
		listForms.mockRejectedValue(
			new ApiError( { code: 'rest_forbidden_context', status: 403, message: 'Sorry.', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'You are no longer allowed to manage forms. Reload the page and sign in again.'
		);
	} );

	// Kills a mutant that removes the `|| __( 'Something went wrong…' )`
	// fallback in messageFor, which would render an empty notice body.
	it( 'falls back to a generic message when the error carries none', async () => {
		listForms.mockRejectedValue(
			new ApiError( { code: 'qform_mystery', status: 500, message: '', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'Something went wrong. Please try again.'
		);
	} );

	// Kills mutants that remove the "Try again" button, or that fail to wire
	// it back to load(), leaving a load failure with no way to recover.
	it( 'offers a way to retry after a failed load, and the retry can succeed', async () => {
		const user = userEvent.setup();
		listForms
			.mockRejectedValueOnce(
				new ApiError( { code: 'qform_network_error', status: 0, message: 'No connection.', errors: [] } )
			)
			.mockResolvedValueOnce( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		await screen.findByRole( 'alert' );
		await user.click( screen.getByRole( 'button', { name: 'Try again' } ) );

		expect( await screen.findByText( 'Cleaning quote' ) ).toBeInTheDocument();
		expect( listForms ).toHaveBeenCalledTimes( 2 );
	} );

	// Kills a mutant that would show "Try again" for a non-load error too
	// (e.g. one that never resets canRetryLoad on a create/delete failure).
	it( 'does not offer to retry a load after a failed delete', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockRejectedValue(
			new ApiError( { code: 'qform_delete_failed', status: 500, message: 'Could not delete.', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		await screen.findByRole( 'alert' );
		expect( screen.queryByRole( 'button', { name: 'Try again' } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'opening', () => {
	it( 'opens the form that was clicked', async () => {
		const user = userEvent.setup();
		const onOpen = jest.fn();
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ onOpen } /> );

		await user.click(
			await screen.findByRole( 'button', { name: 'Edit “Moving quote” (form 4)' } )
		);

		expect( onOpen ).toHaveBeenCalledWith( 4 );
	} );

	// Kills a mutant that drops `form.id` from the accessible name, which
	// would make every unnamed row (the default state of a new install)
	// read as an identical "Edit Untitled form" / "Move Untitled form to
	// trash" button.
	it( 'gives identically titled forms distinct accessible names via their id', async () => {
		listForms.mockResolvedValue( {
			forms: [
				{ id: 11, title: 'Untitled form', modified: '2026-09-15T11:20:45' },
				{ id: 12, title: 'Untitled form', modified: '2026-09-14T09:00:00' },
			],
			total: 2,
			totalPages: 1,
		} );

		render( <FormListScreen onOpen={ () => {} } /> );

		expect(
			await screen.findByRole( 'button', { name: 'Edit “Untitled form” (form 11)' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'button', { name: 'Edit “Untitled form” (form 12)' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'button', { name: 'Move “Untitled form” to trash (form 11)' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'button', { name: 'Move “Untitled form” to trash (form 12)' } )
		).toBeInTheDocument();
	} );
} );

describe( 'creating', () => {
	it( 'creates a form and opens it immediately', async () => {
		const user = userEvent.setup();
		const onOpen = jest.fn();
		listForms.mockResolvedValue( twoForms );
		createForm.mockResolvedValue( { id: 9, title: 'Untitled form', schema: {} } );

		render( <FormListScreen onOpen={ onOpen } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Create a form' } ) );

		await waitFor( () => expect( onOpen ).toHaveBeenCalledWith( 9 ) );
		expect( createForm ).toHaveBeenCalledWith( 'Untitled form' );
	} );

	it( 'reports a failed create without navigating anywhere', async () => {
		const user = userEvent.setup();
		const onOpen = jest.fn();
		listForms.mockResolvedValue( twoForms );
		createForm.mockRejectedValue(
			new ApiError( { code: 'qform_create_failed', status: 500, message: 'Could not create.', errors: [] } )
		);

		render( <FormListScreen onOpen={ onOpen } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Create a form' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not create.' );
		expect( onOpen ).not.toHaveBeenCalled();
	} );

	// Kills mutants that remove `disabled={ busy }` from the create button,
	// or that remove the `setBusy( true )` call in handleCreate.
	it( 'disables the create button while a create request is in flight', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		let resolveCreate;
		createForm.mockReturnValue(
			new Promise( ( resolve ) => {
				resolveCreate = resolve;
			} )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		const createButton = await screen.findByRole( 'button', { name: 'Create a form' } );
		await user.click( createButton );

		expect( createButton ).toBeDisabled();

		resolveCreate( { id: 9, title: 'Untitled form', schema: {} } );
		await waitFor( () => expect( createButton ).toBeEnabled() );
	} );

	// Kills mutants that remove the `setError( null )` reset at the top of
	// handleCreate, which would leave a stale error notice on screen while
	// a brand new request is already in flight.
	it( 'clears a previous error as soon as a new create request starts', async () => {
		const user = userEvent.setup();
		listForms.mockRejectedValueOnce(
			new ApiError( { code: 'qform_network_error', status: 0, message: 'No connection.', errors: [] } )
		);
		let resolveCreate;
		createForm.mockReturnValue(
			new Promise( ( resolve ) => {
				resolveCreate = resolve;
			} )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await screen.findByRole( 'alert' );

		await user.click( screen.getByRole( 'button', { name: 'Create a form' } ) );

		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();

		resolveCreate( { id: 9, title: 'Untitled form', schema: {} } );
	} );
} );

describe( 'deleting', () => {
	it( 'asks before trashing, and does nothing if refused', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );

		expect( deleteForm ).not.toHaveBeenCalled();
		expect( screen.getByText( 'Cleaning quote' ) ).toBeInTheDocument();
		// Kills the mutant that removes `setConfirming( null )` from the
		// cancel handler, which would leave the confirmation open forever.
		expect( screen.queryByRole( 'button', { name: 'Cancel' } ) ).not.toBeInTheDocument();
	} );

	it( 'trashes on confirmation and drops the row', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockResolvedValue( { id: 3, deleted: true } );

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		await waitFor( () =>
			expect( screen.queryByText( 'Cleaning quote' ) ).not.toBeInTheDocument()
		);
		expect( screen.getByText( 'Moving quote' ) ).toBeInTheDocument();
		expect( deleteForm ).toHaveBeenCalledWith( 3 );
	} );

	// Kills the mutant that hardcodes deletion of forms[0]/the first row
	// instead of the row that was actually confirmed.
	it( 'deletes the row that was confirmed, not the first row', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockResolvedValue( { id: 4, deleted: true } );

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashMovingQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		await waitFor( () =>
			expect( screen.queryByText( 'Moving quote' ) ).not.toBeInTheDocument()
		);
		expect( screen.getByText( 'Cleaning quote' ) ).toBeInTheDocument();
		expect( deleteForm ).toHaveBeenCalledWith( 4 );
	} );

	// Kills the mutant that removes `setConfirming( null )` from the top of
	// handleDelete, which would leave the confirm/cancel buttons visible
	// while the delete request is still in flight.
	it( 'closes the confirmation immediately on confirm, before the request resolves', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		let resolveDelete;
		deleteForm.mockReturnValue(
			new Promise( ( resolve ) => {
				resolveDelete = resolve;
			} )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		expect( screen.queryByRole( 'button', { name: 'Move to trash' } ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'button', { name: 'Cancel' } ) ).not.toBeInTheDocument();

		resolveDelete( { id: 3, deleted: true } );
		await waitFor( () =>
			expect( screen.queryByText( 'Cleaning quote' ) ).not.toBeInTheDocument()
		);
	} );

	// Kills a mutant that leaves `busy` permanently true after a failed
	// delete, which would freeze every Trash button and the Create button.
	it( 'recovers after a failed delete, so the screen is usable again', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockRejectedValue(
			new ApiError( { code: 'qform_delete_failed', status: 500, message: 'Could not delete.', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		await screen.findByRole( 'alert' );

		expect( screen.getByRole( 'button', { name: 'Create a form' } ) ).toBeEnabled();
		expect( screen.getByRole( 'button', { name: trashCleaningQuote } ) ).toBeEnabled();
	} );

	// Kills mutants that remove the `setError( null )` reset at the top of
	// handleDelete, which would leave a stale error notice on screen while
	// a brand new delete request is already in flight.
	it( 'clears a previous error as soon as a new delete request starts', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		createForm.mockRejectedValue(
			new ApiError( { code: 'qform_create_failed', status: 500, message: 'Could not create.', errors: [] } )
		);
		let resolveDelete;
		deleteForm.mockReturnValue(
			new Promise( ( resolve ) => {
				resolveDelete = resolve;
			} )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Create a form' } ) );
		await screen.findByRole( 'alert' );

		await user.click( screen.getByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();

		resolveDelete( { id: 3, deleted: true } );
		await waitFor( () =>
			expect( screen.queryByText( 'Cleaning quote' ) ).not.toBeInTheDocument()
		);
	} );

	it( 'explains that the site has the trash switched off', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockRejectedValue(
			new ApiError( {
				code: 'rest_trash_not_supported',
				status: 501,
				message: 'The trash is not supported.',
				errors: [],
			} )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'This site has the trash switched off, so deleting a form would be permanent. Quoteform will not do that.'
		);
		expect( screen.getByText( 'Cleaning quote' ) ).toBeInTheDocument();
	} );

	it( 'tells the user to reload when the capability is gone', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockRejectedValue(
			new ApiError( { code: 'rest_forbidden', status: 403, message: 'Sorry.', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'You are no longer allowed to manage forms. Reload the page and sign in again.'
		);
	} );
} );

describe( 'the trash confirmation is inline, not a modal dialog', () => {
	// Kills a mutant that reintroduces role="dialog"/aria-modal="true" on
	// the confirmation, which would tell assistive technology to suppress
	// everything else on the page even though nothing here traps focus.
	it( 'does not present the confirmation as a modal dialog', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );

		expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument();
	} );

	// Kills a mutant that renders the confirm/cancel buttons somewhere other
	// than immediately after the row's Trash button (e.g. before it, or
	// outside the row), which is what kept the honest tab order broken.
	it( 'places the confirm and cancel buttons immediately after the button that opened them', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		const trashButton = await screen.findByRole( 'button', { name: trashCleaningQuote } );
		await user.click( trashButton );

		const row = trashButton.closest( 'tr' );
		const buttonNames = within( row )
			.getAllByRole( 'button' )
			.map( ( button ) => button.textContent );

		// The row now also holds the Shortcode column's Copy button (spec §6);
		// this still proves the confirm/cancel pair lands right after Trash.
		expect( buttonNames ).toEqual( [ 'Copy', 'Edit', 'Trash', 'Move to trash', 'Cancel' ] );
	} );

	// Kills mutants that drop the focus-on-open effect, leaving focus
	// wherever the click left it (the row's own Trash button) instead of
	// moving it into the confirmation the way the fix requires.
	it( 'moves focus to the confirm button when the confirmation opens', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );

		expect( screen.getByRole( 'button', { name: 'Move to trash' } ) ).toHaveFocus();
	} );

	// Kills a mutant that drops the trash-button refocus in the cancel
	// handler, which would otherwise leave focus on <body>.
	it( 'returns focus to the row’s trash button on cancel', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		const trashButton = await screen.findByRole( 'button', { name: trashCleaningQuote } );
		await user.click( trashButton );
		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );

		expect( trashButton ).toHaveFocus();
	} );

	// Kills a mutant that drops the create-button refocus on a successful
	// delete, which would otherwise leave focus on <body> once the row the
	// keyboard user was on has been removed.
	it( 'moves focus to the create button after a successful delete', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockResolvedValue( { id: 3, deleted: true } );

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: trashCleaningQuote } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		await waitFor( () =>
			expect( screen.getByRole( 'button', { name: 'Create a form' } ) ).toHaveFocus()
		);
	} );
} );
