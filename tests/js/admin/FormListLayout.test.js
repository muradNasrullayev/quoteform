/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import FormListScreen from '../../../admin-src/screens/FormListScreen';
import { listForms } from '../../../admin-src/api/client';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listForms: jest.fn(),
	getForm: jest.fn(),
	createForm: jest.fn(),
	updateForm: jest.fn(),
	deleteForm: jest.fn(),
} ) );

const oneForm = {
	forms: [ { id: 328, title: 'Cleaning', modified: '2026-09-16T15:28:58' } ],
	total: 1,
	totalPages: 1,
};

beforeEach( () => {
	jest.resetAllMocks();
	listForms.mockResolvedValue( oneForm );
} );

const renderList = async () => {
	render( <FormListScreen onOpen={ jest.fn() } /> );
	await screen.findByText( 'Cleaning' );
};

describe( 'the form list layout', () => {
	it( 'offers the shortcode for each form', async () => {
		await renderList();

		expect( await screen.findByRole( 'textbox', { name: 'Shortcode for “Cleaning”' } ) ).toHaveValue(
			'[quoteform id="328"]'
		);
	} );

	it( 'names the copy button from its own translatable string', async () => {
		await renderList();

		expect(
			await screen.findByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } )
		).toBeInTheDocument();
	} );

	it( 'shows a readable date, not the raw timestamp', async () => {
		await renderList();
		await screen.findByText( 'Cleaning' );

		expect( screen.queryByText( '2026-09-16T15:28:58' ) ).not.toBeInTheDocument();

		const time = document.querySelector( 'time' );

		expect( time.textContent ).not.toBe( '' );
		expect( time.textContent ).not.toContain( 'Invalid Date' );
		expect( time.getAttribute( 'dateTime' ) ).toMatch( /Z$/ );
	} );

	it( 'shows the form id under its title', async () => {
		await renderList();

		expect( await screen.findByText( 'ID 328' ) ).toBeInTheDocument();
	} );
} );
