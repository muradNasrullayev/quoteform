/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditorScreen from '../../../admin-src/screens/EditorScreen';
import { StoreProvider } from '../../../admin-src/state/StoreContext';
import { getForm, updateForm } from '../../../admin-src/api/client';

// EditorScreen.test.js-dəki naxışın eynisi: `jest.mock()` modulu bütöv
// avtomock edir, `ApiError` də daxil olmaqla. Avtomock edilmiş sinif
// konstruktorda verilən vəziyyəti sükutla atır, ona görə real sinfi
// `jest.requireActual` ilə saxlayıb yalnız API funksiyalarını stub edirik.
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
	title: 'Cleaning',
	schema: {
		version: 1,
		settings: {
			currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Go',
			success_action: 'message', success_message: 'Thanks', redirect_url: '',
			save_resume: false, store_ip: false,
		},
		fields: {
			rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', placeholder: '', required: false, default: 1 },
		},
		steps: [ { key: 'one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		calculations: [ { key: 'total', label: 'Total', expression: '{rooms}', visible: true } ],
		rules: [],
		notifications: [],
	},
};

async function openEditor() {
	getForm.mockResolvedValue( form );
	render(
		<StoreProvider>
			<EditorScreen formId={ 7 } onClose={ jest.fn() } />
		</StoreProvider>
	);
	await screen.findByLabelText( 'Form title' );
}

beforeEach( () => {
	jest.clearAllMocks();
} );

describe( 'the editor shell', () => {
	it( 'shows the Calculations section as "Pricing"', async () => {
		const user = userEvent.setup();

		await openEditor();
		await user.click( screen.getByRole( 'button', { name: 'Pricing' } ) );

		expect( screen.getByRole( 'heading', { name: 'Calculations' } ) ).toBeInTheDocument();
	} );

	it( 'no longer has a tab called Calculations', async () => {
		await openEditor();

		expect( screen.queryByRole( 'button', { name: 'Calculations' } ) ).not.toBeInTheDocument();
	} );

	it( 'counts what each section holds', async () => {
		await openEditor();

		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).toHaveAccessibleDescription( '1 item' );
		expect( screen.getByRole( 'button', { name: 'Pricing' } ) ).toHaveAccessibleDescription( '1 item' );
		expect( screen.getByRole( 'button', { name: 'Rules' } ) ).toHaveAccessibleDescription( '0 items' );
	} );

	it( 'points at the section a save error lives in', async () => {
		const user = userEvent.setup();

		await openEditor();
		updateForm.mockRejectedValue( {
			code: 'qform_invalid_schema',
			status: 400,
			message: 'The form has problems.',
			errors: [ { path: 'calculations.0.expression', code: 'x', message: 'Broken.' } ],
		} );
		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'button', { name: 'Pricing' } ) ).toHaveAccessibleDescription(
			'1 item, has a problem'
		);
		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).toHaveAccessibleDescription( '1 item' );
	} );

	it( 'keeps the Save name while saving, and says it is busy', async () => {
		const user = userEvent.setup();
		let resolveSave;

		await openEditor();
		updateForm.mockImplementation( () => new Promise( ( resolve ) => { resolveSave = resolve; } ) );

		const save = screen.getByRole( 'button', { name: 'Save' } );

		await user.click( save );
		expect( save ).toHaveAttribute( 'aria-busy', 'true' );
		expect( save ).toHaveAccessibleName( 'Save' );

		await act( async () => resolveSave( form ) );
		expect( save ).not.toHaveAttribute( 'aria-busy' );
	} );

	it( 'shows "Forms" on the back button but keeps its full name', async () => {
		await openEditor();

		const back = screen.getByRole( 'button', { name: 'Back to all forms' } );

		expect( back ).toHaveTextContent( 'Forms' );
	} );
} );
