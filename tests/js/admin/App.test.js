/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../../../admin-src/App';
import { getForm, listForms } from '../../../admin-src/api/client';
import { defaultField } from '../../../admin-src/state/fields';

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
	id: 3,
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
		calculations: [],
		rules: [],
		notifications: [],
	},
};

beforeEach( () => {
	jest.clearAllMocks();
	listForms.mockResolvedValue( { forms: [], total: 0, totalPages: 0 } );
} );

describe( 'App', () => {
	it( 'renders the builder heading', async () => {
		render( <App /> );

		expect(
			await screen.findByRole( 'heading', { name: 'Quoteform' } )
		).toBeInTheDocument();
	} );

	it( 'opens the editor for a chosen form', async () => {
		listForms.mockResolvedValue( {
			forms: [ { id: 3, title: 'Cleaning quote', modified: '2026-01-01' } ],
			total: 1,
			totalPages: 1,
		} );
		getForm.mockResolvedValue( form );

		const user = userEvent.setup();

		render( <App /> );

		const editButton = await screen.findByRole( 'button', {
			name: 'Edit “Cleaning quote” (form 3)',
		} );

		await user.click( editButton );

		expect( await screen.findByLabelText( 'Form title' ) ).toHaveValue( 'Cleaning quote' );
	} );

	it( 'does not take focus away from the page on the first render', async () => {
		render( <App /> );

		await screen.findByRole( 'heading', { name: 'Quoteform' } );

		expect( screen.getByRole( 'heading', { name: 'Quoteform' } ) ).not.toHaveFocus();
		expect( document.body ).toHaveFocus();
	} );

	it( 'moves focus to the editor heading when a form is opened, since the Edit button is gone', async () => {
		listForms.mockResolvedValue( {
			forms: [ { id: 3, title: 'Cleaning quote', modified: '2026-01-01' } ],
			total: 1,
			totalPages: 1,
		} );
		getForm.mockResolvedValue( form );

		const user = userEvent.setup();

		render( <App /> );

		await user.click(
			await screen.findByRole( 'button', { name: 'Edit “Cleaning quote” (form 3)' } )
		);

		expect( await screen.findByRole( 'heading', { name: 'Edit form' } ) ).toHaveFocus();

		// Başlıq hər üç budaqda eyni mövqedədir, ona görə "Loading…"-dən
		// yüklənmiş ekrana keçid onu yenidən qurmur və fokus itmir.
		await screen.findByDisplayValue( 'Cleaning quote' );

		expect( screen.getByRole( 'heading', { name: 'Edit form' } ) ).toHaveFocus();
	} );

	it( 'moves focus to the list heading on the way back, since the Back button is gone', async () => {
		listForms.mockResolvedValue( {
			forms: [ { id: 3, title: 'Cleaning quote', modified: '2026-01-01' } ],
			total: 1,
			totalPages: 1,
		} );
		getForm.mockResolvedValue( form );

		const user = userEvent.setup();

		render( <App /> );

		await user.click(
			await screen.findByRole( 'button', { name: 'Edit “Cleaning quote” (form 3)' } )
		);
		await screen.findByDisplayValue( 'Cleaning quote' );
		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );

		expect( await screen.findByRole( 'heading', { name: 'Quoteform' } ) ).toHaveFocus();
	} );

	it( 'discards a late load response for a form the user has already left', async () => {
		const formB = { ...form, id: 4, title: 'Other form' };

		listForms.mockResolvedValue( {
			forms: [
				{ id: 3, title: 'Cleaning quote', modified: '2026-01-01' },
				{ id: 4, title: 'Other form', modified: '2026-01-01' },
			],
			total: 2,
			totalPages: 1,
		} );

		let resolveStale;

		getForm.mockImplementation( ( id ) => {
			if ( id === 4 ) {
				return Promise.resolve( formB );
			}

			return new Promise( ( resolve ) => {
				resolveStale = resolve;
			} );
		} );

		const user = userEvent.setup();

		render( <App /> );

		// Open "Cleaning quote"; its request never resolves in this test.
		await user.click(
			await screen.findByRole( 'button', { name: 'Edit “Cleaning quote” (form 3)' } )
		);
		await user.click( await screen.findByRole( 'button', { name: 'Back to all forms' } ) );

		// Open "Other form" instead; it resolves right away.
		await user.click(
			await screen.findByRole( 'button', { name: 'Edit “Other form” (form 4)' } )
		);
		await screen.findByDisplayValue( 'Other form' );

		// The stale request for "Cleaning quote" now resolves, after the
		// user has moved on to "Other form".
		await act( async () => {
			resolveStale( { ...form, title: 'Cleaning quote' } );
		} );

		expect( screen.getByDisplayValue( 'Other form' ) ).toBeInTheDocument();
		expect( screen.queryByDisplayValue( 'Cleaning quote' ) ).not.toBeInTheDocument();
	} );

	it( 'does not show the previous form while the next one is still loading', async () => {
		const formB = { ...form, id: 4, title: 'Other form' };

		listForms.mockResolvedValue( {
			forms: [
				{ id: 3, title: 'Cleaning quote', modified: '2026-01-01' },
				{ id: 4, title: 'Other form', modified: '2026-01-01' },
			],
			total: 2,
			totalPages: 1,
		} );

		getForm.mockImplementation( ( id ) => {
			if ( id === 3 ) {
				return Promise.resolve( form );
			}

			return new Promise( () => {} );
		} );

		const user = userEvent.setup();

		render( <App /> );

		await user.click(
			await screen.findByRole( 'button', { name: 'Edit “Cleaning quote” (form 3)' } )
		);
		await screen.findByDisplayValue( 'Cleaning quote' );
		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );

		await user.click(
			await screen.findByRole( 'button', { name: 'Edit “Other form” (form 4)' } )
		);

		expect( screen.queryByDisplayValue( 'Cleaning quote' ) ).not.toBeInTheDocument();
		expect( screen.queryByLabelText( 'Form title' ) ).not.toBeInTheDocument();
	} );
} );
