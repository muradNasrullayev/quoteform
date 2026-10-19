/**
 * @jest-environment jsdom
 */
import { useState } from '@wordpress/element';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditorScreen from '../../../admin-src/screens/EditorScreen';
import { StoreProvider } from '../../../admin-src/state/StoreContext';
import { ApiError, getForm, updateForm } from '../../../admin-src/api/client';
import { defaultField } from '../../../admin-src/state/fields';

// `jest.mock()` tək başına MODULU BÜTÖV avtomock edir — `ApiError` də daxil
// olmaqla. Avtomock edilmiş sinif konstruktorda verilən vəziyyəti SÜKUTLA atır,
// ona görə `error.code` və `error.errors` `undefined` olur və koda görə
// budaqlanan hər test yalan nəticə verir. Fabrika ilə real sinfi saxlayıb
// yalnız funksiyaları stub edirik.
jest.mock( '../../../admin-src/api/client', () => {
	const actual = jest.requireActual( '../../../admin-src/api/client' );

	return {
		...actual,
		listForms: jest.fn(),
		getForm: jest.fn(),
		createForm: jest.fn(),
		updateForm: jest.fn(),
		deleteForm: jest.fn(),
	};
} );

const form = {
	id: 7,
	title: 'Cleaning quote',
	schema: {
		version: 1,
		settings: {
			currency: 'USD',
			currency_position: 'before',
			decimals: 2,
			submit_label: 'Get my quote',
			success_action: 'message',
			success_message: 'Thanks.',
			redirect_url: '',
			save_resume: false,
			store_ip: false,
		},
		fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
		steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
		rules: [],
		notifications: [],
	},
};

function renderEditor( onClose = () => {} ) {
	render(
		<StoreProvider>
			<EditorScreen formId={ 7 } onClose={ onClose } />
		</StoreProvider>
	);

	return userEvent.setup();
}

// Mağaza EKRANLAR ARASI paylaşılır (App-dəki tək `StoreProvider`), ona görə
// A-nın yarımçıq yazısı B açıldıqdan sonra da həmin mağazaya çata bilər.
function renderSwitchable() {
	function Harness() {
		const [ id, setId ] = useState( 7 );

		return (
			<StoreProvider>
				<button type="button" onClick={ () => setId( 8 ) }>
					open the other form
				</button>
				<EditorScreen formId={ id } onClose={ () => {} } />
			</StoreProvider>
		);
	}

	render( <Harness /> );

	return userEvent.setup();
}

function leaveConfirmation() {
	return screen.queryByText( 'You have unsaved changes. Leave anyway?' );
}

beforeEach( () => {
	jest.clearAllMocks();
	getForm.mockResolvedValue( form );
} );

describe( 'loading', () => {
	it( 'shows the form once it arrives', async () => {
		renderEditor();

		expect( await screen.findByDisplayValue( 'Cleaning quote' ) ).toBeInTheDocument();
	} );

	it( 'refuses to open an editor for a corrupt schema', async () => {
		getForm.mockRejectedValue(
			new ApiError( {
				code: 'qform_schema_corrupt',
				status: 500,
				message: 'The stored schema could not be read.',
				errors: [],
			} )
		);

		renderEditor();

		expect(
			await screen.findByText(
				'This form’s saved data could not be read. Editing it here would overwrite what is still stored, so Quoteform will not open it.'
			)
		).toBeInTheDocument();
		expect( screen.queryByLabelText( 'Currency' ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'button', { name: 'Save' } ) ).not.toBeInTheDocument();
	} );

	it( 'reports a form that is not there', async () => {
		getForm.mockRejectedValue(
			new ApiError( { code: 'qform_form_not_found', status: 404, message: 'Gone.', errors: [] } )
		);

		renderEditor();

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'That form no longer exists. It may have been moved to the trash.'
		);
	} );
} );

describe( 'saving', () => {
	it( 'sends the whole document and reports success', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );
		updateForm.mockResolvedValue( form );

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		await waitFor( () => expect( updateForm ).toHaveBeenCalledWith( 7, {
			title: 'Cleaning quote',
			schema: form.schema,
		} ) );

		expect( await screen.findByText( 'Saved.' ) ).toBeInTheDocument();
	} );

	it( 'routes each validation error to its own control and lists them all', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		updateForm.mockRejectedValue(
			new ApiError( {
				code: 'qform_invalid_schema',
				status: 400,
				message: 'The form could not be saved.',
				errors: [
					{
						path: 'settings.decimals',
						code: 'out_of_range',
						message: 'Between 0 and 6.',
						context: { min: 0, max: 6 },
					},
					{
						path: 'calculations.0.expression',
						code: 'invalid_expression',
						message: 'Broken formula.',
						context: { engine_code: 'unexpected_token', position: 3 },
					},
				],
			} )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'settings.decimals' );
		expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'calculations.0.expression' );

		// The banner lists every error; the control only shows its own, and
		// only on the tab it lives on — which is exactly why the banner exists.
		await user.click( screen.getByRole( 'button', { name: 'Settings' } ) );

		expect( screen.getByLabelText( 'Decimal places' ) ).toHaveAccessibleDescription(
			'Between 0 and 6.'
		);

		await user.click( screen.getByRole( 'button', { name: 'Pricing' } ) );

		expect( screen.getByLabelText( 'Calculation 1 formula' ) ).toHaveAccessibleDescription(
			'Broken formula.'
		);

		await user.click( screen.getByRole( 'button', { name: 'Settings' } ) );

		expect( screen.getByLabelText( 'Decimal places' ) ).not.toHaveAccessibleDescription(
			'Broken formula.'
		);
	} );

	it( 'stays dirty when the write did not land', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );

		updateForm.mockRejectedValue(
			new ApiError( {
				code: 'qform_update_failed',
				status: 500,
				message: 'Could not save.',
				errors: [],
			} )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'The form was not saved. Your changes are still here — try again.'
		);
		expect( screen.getByText( 'Unsaved changes' ) ).toBeInTheDocument();
	} );

	it( 'offers a reload when the session lost its permissions', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		updateForm.mockRejectedValue(
			new ApiError( { code: 'rest_forbidden', status: 403, message: 'Sorry.', errors: [] } )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'You are no longer allowed to manage forms. Reload the page and sign in again.'
		);
		expect( screen.getByRole( 'button', { name: 'Reload page' } ) ).toBeInTheDocument();
	} );

	it( 'dismisses the save-error notice when its dismiss button is pressed', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		updateForm.mockRejectedValue(
			new ApiError( {
				code: 'qform_update_failed',
				status: 500,
				message: 'Could not save.',
				errors: [],
			} )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );
		await screen.findByRole( 'alert' );

		await user.click( screen.getByRole( 'button', { name: 'Dismiss this notice' } ) );

		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();
	} );

	it( 'explains an expired nonce and offers a reload, which is the likeliest save failure', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		updateForm.mockRejectedValue(
			new ApiError( {
				code: 'rest_cookie_invalid_nonce',
				status: 403,
				message: 'Cookie check failed',
				errors: [],
			} )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		const notice = await screen.findByRole( 'alert' );

		expect( notice ).toHaveTextContent(
			'You are no longer allowed to manage forms. Reload the page and sign in again.'
		);
		expect( notice ).not.toHaveTextContent( 'Cookie check failed' );
		expect( screen.getByRole( 'button', { name: 'Reload page' } ) ).toBeInTheDocument();
	} );

	it( 'says something useful for a failure it has no wording of its own for', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		updateForm.mockRejectedValue(
			new ApiError( { code: 'qform_unheard_of', status: 500, message: '', errors: [] } )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'Something went wrong. Please try again.'
		);
	} );

	it( 'does not write an abandoned form’s save into the store the next form shares', async () => {
		const other = { ...form, id: 8, title: 'Painting quote' };

		getForm.mockImplementation( ( id ) =>
			Promise.resolve( id === 8 ? other : form )
		);

		const user = renderSwitchable();

		await screen.findByDisplayValue( 'Cleaning quote' );

		let resolveSave;
		updateForm.mockImplementation(
			() =>
				new Promise( ( resolve ) => {
					resolveSave = resolve;
				} )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );
		await user.click( screen.getByRole( 'button', { name: 'open the other form' } ) );
		await screen.findByDisplayValue( 'Painting quote' );

		await act( async () => {
			resolveSave( form );
		} );

		expect( screen.getByDisplayValue( 'Painting quote' ) ).toBeInTheDocument();
		expect( screen.queryByText( 'Loading…' ) ).not.toBeInTheDocument();
	} );

	it( 'refuses to show a form whose identity is not the one it was asked for', async () => {
		getForm.mockResolvedValue( { ...form, id: 99 } );

		renderEditor();

		expect( await screen.findByText( 'Loading…' ) ).toBeInTheDocument();
		expect( screen.queryByDisplayValue( 'Cleaning quote' ) ).not.toBeInTheDocument();
	} );

	it( 'returns focus to Save once the request settles', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		let resolveSave;
		updateForm.mockImplementation(
			() =>
				new Promise( ( resolve ) => {
					resolveSave = resolve;
				} )
		);

		const saveButton = screen.getByRole( 'button', { name: 'Save' } );

		await user.click( saveButton );

		expect( saveButton ).toBeDisabled();

		// A real browser blurs a focused element the instant it becomes
		// disabled; jsdom does not model that, so `toHaveFocus()` alone would
		// pass here whether or not the screen ever calls `.focus()` back.
		// Spying on the call (started only now, after the click's own focus)
		// is what actually proves the refocus happens.
		const focusSpy = jest.spyOn( saveButton, 'focus' );

		await act( async () => {
			resolveSave( form );
		} );

		expect( focusSpy ).toHaveBeenCalled();
	} );
} );

describe( 'field selection', () => {
	it( 'follows a field through a rename instead of losing the selection', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );
		await user.click( screen.getByRole( 'button', { name: 'Fields' } ) );

		await user.click( screen.getByRole( 'button', { name: 'Add field' } ) );
		await user.click( screen.getByRole( 'button', { name: 'New field (number)' } ) );

		const keyInput = screen.getByLabelText( 'Key' );
		await user.clear( keyInput );
		await user.type( keyInput, 'remarks' );
		await user.tab();

		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'remarks' );

		const current = screen
			.getAllByRole( 'button' )
			.filter( ( button ) => button.getAttribute( 'aria-current' ) === 'true' );

		expect( current ).toHaveLength( 1 );
		expect( current[ 0 ] ).toHaveTextContent( 'New field (remarks)' );
	} );
} );

describe( 'the unsaved-changes guard', () => {
	it( 'says nothing while the form is clean', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );

		expect( leaveConfirmation() ).not.toBeInTheDocument();
	} );

	it( 'asks before leaving with unsaved work', async () => {
		const onClose = jest.fn();
		const user = renderEditor( onClose );

		await screen.findByDisplayValue( 'Cleaning quote' );

		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );
		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );

		expect( leaveConfirmation() ).toBeInTheDocument();
		expect( onClose ).not.toHaveBeenCalled();

		await user.click( screen.getByRole( 'button', { name: 'Leave without saving' } ) );

		expect( onClose ).toHaveBeenCalled();
	} );

	it( 'does not ask again after a successful save', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );

		updateForm.mockResolvedValue( { ...form, title: 'Renamed' } );

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );
		await screen.findByText( 'Saved.' );

		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );

		expect( leaveConfirmation() ).not.toBeInTheDocument();
	} );

	it( 'registers a beforeunload guard while dirty and clears it once clean again', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		const cleanAttempt = new Event( 'beforeunload', { cancelable: true } );
		window.dispatchEvent( cleanAttempt );
		expect( cleanAttempt.defaultPrevented ).toBe( false );

		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );

		const dirtyAttempt = new Event( 'beforeunload', { cancelable: true } );
		window.dispatchEvent( dirtyAttempt );
		expect( dirtyAttempt.defaultPrevented ).toBe( true );

		updateForm.mockResolvedValue( { ...form, title: 'Renamed' } );
		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );
		await screen.findByText( 'Saved.' );

		const afterSaveAttempt = new Event( 'beforeunload', { cancelable: true } );
		window.dispatchEvent( afterSaveAttempt );
		expect( afterSaveAttempt.defaultPrevented ).toBe( false );
	} );

	it( 'clears the leave confirmation itself, not only via a parent that unmounts the screen', async () => {
		const onClose = jest.fn();
		const user = renderEditor( onClose );

		await screen.findByDisplayValue( 'Cleaning quote' );
		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );

		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );
		expect( leaveConfirmation() ).toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Leave without saving' } ) );

		expect( onClose ).toHaveBeenCalledTimes( 1 );
		expect( leaveConfirmation() ).not.toBeInTheDocument();
	} );

	it( 'lets Escape cancel the confirmation even after focus has left it', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );
		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );

		const back = screen.getByRole( 'button', { name: 'Back to all forms' } );
		await user.click( back );

		expect( screen.getByRole( 'button', { name: 'Stay here' } ) ).toHaveFocus();

		await user.tab();
		expect( screen.getByRole( 'button', { name: 'Stay here' } ) ).not.toHaveFocus();

		await user.keyboard( '{Escape}' );

		expect( leaveConfirmation() ).not.toBeInTheDocument();
		expect( back ).toHaveFocus();
	} );

	// FieldsPanel və StepsPanel-dəki eyni iddia: bu budaq ŞÜURLU olaraq
	// modal deyil — fokus tələsi də, `inert` arxa fon da yoxdur, ona görə
	// `role="dialog"` iddiası yalan olardı.
	it( 'is an inline confirmation, not a dialog it cannot enforce', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );
		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );
		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );

		expect( leaveConfirmation() ).toBeInTheDocument();
		expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'alertdialog' ) ).not.toBeInTheDocument();
	} );

	it( 'returns focus to Back when the leave confirmation is dismissed', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );
		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );

		const back = screen.getByRole( 'button', { name: 'Back to all forms' } );
		await user.click( back );

		expect( screen.getByRole( 'button', { name: 'Stay here' } ) ).toHaveFocus();

		await user.keyboard( '{Escape}' );

		expect( leaveConfirmation() ).not.toBeInTheDocument();
		expect( back ).toHaveFocus();
	} );
} );
