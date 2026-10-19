/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../../../admin-src/App';
import { ApiError, getForm, listForms } from '../../../admin-src/api/client';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listForms: jest.fn(),
	getForm: jest.fn(),
	createForm: jest.fn(),
	updateForm: jest.fn(),
	deleteForm: jest.fn(),
} ) );

beforeEach( () => {
	jest.resetAllMocks();
	listForms.mockResolvedValue( { forms: [], total: 0, totalPages: 0 } );
} );

afterEach( () => {
	window.history.replaceState( null, '', '/' );
} );

describe( 'opening the builder from an entry', () => {
	it( 'goes straight to the form named in the address', async () => {
		window.history.replaceState( null, '', '/wp-admin/admin.php?page=quoteform&form=7' );
		getForm.mockRejectedValue( new ApiError( { code: 'qform_form_not_found', status: 404, message: 'Form not found.' } ) );

		render( <App /> );

		await waitFor( () => expect( getForm ).toHaveBeenCalledWith( 7 ) );
		expect( listForms ).not.toHaveBeenCalled();
	} );

	it( 'drops the form from the address when the editor closes', async () => {
		window.history.replaceState( null, '', '/wp-admin/admin.php?page=quoteform&form=7' );
		getForm.mockRejectedValue( new ApiError( { code: 'qform_form_not_found', status: 404, message: 'Form not found.' } ) );
		const user = userEvent.setup();

		render( <App /> );

		// Yükləmə halının düyməsi `getForm` rədd olunanda DOM-dan çıxır; klik xəta halındakı düyməyə getsin.
		await waitFor( () => expect( screen.queryByText( 'Loading…' ) ).not.toBeInTheDocument() );
		await user.click( screen.getAllByRole( 'button', { name: 'Back to all forms' } )[ 0 ] );

		expect( window.location.search ).toBe( '?page=quoteform' );
		await waitFor( () => expect( listForms ).toHaveBeenCalled() );
	} );

	it( 'ignores a form value that is not an id', async () => {
		window.history.replaceState( null, '', '/wp-admin/admin.php?page=quoteform&form=7abc' );

		render( <App /> );

		await waitFor( () => expect( listForms ).toHaveBeenCalled() );
		expect( getForm ).not.toHaveBeenCalled();
	} );
} );
