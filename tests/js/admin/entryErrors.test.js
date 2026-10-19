/**
 * @jest-environment jsdom
 */
import { ApiError } from '../../../admin-src/api/client';
import { entryErrorMessage, isNotFound } from '../../../admin-src/entries/errors';

describe( 'entry error messages', () => {
	it( 'asks for a reload when the session no longer allows entries', () => {
		const error = new ApiError( { code: 'rest_forbidden', status: 403, message: 'no' } );

		expect( entryErrorMessage( error ) ).toBe( 'You are no longer allowed to see entries. Reload the page and sign in again.' );
	} );

	it( 'recognises a missing entry', () => {
		const error = new ApiError( { code: 'qform_entry_not_found', status: 404, message: 'Entry not found.' } );

		expect( isNotFound( error ) ).toBe( true );
		expect( entryErrorMessage( error ) ).toBe( 'That entry no longer exists.' );
		expect( isNotFound( null ) ).toBe( false );
	} );

	it( 'falls back to the shared messages', () => {
		expect( entryErrorMessage( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) ) ).toBe( 'You appear to be offline.' );
	} );
} );
