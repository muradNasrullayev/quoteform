/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
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

describe( 'the fields layout', () => {
	it( 'invites you to pick a field while none is selected', async () => {
		await openEditor();

		expect( screen.getByText( 'Select a field to edit it.' ) ).toBeInTheDocument();
	} );

	it( 'replaces the invitation with the editor once a field is picked', async () => {
		const user = userEvent.setup();

		await openEditor();
		await user.click( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) );

		expect( screen.queryByText( 'Select a field to edit it.' ) ).not.toBeInTheDocument();
		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'rooms' );
	} );
} );
