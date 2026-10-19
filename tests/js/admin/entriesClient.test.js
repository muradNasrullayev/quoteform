/**
 * @jest-environment jsdom
 */
import apiFetch from '@wordpress/api-fetch';

import {
	ApiError,
	deleteEntry,
	getEntry,
	listEntries,
	updateEntries,
} from '../../../admin-src/api/client';

jest.mock( '@wordpress/api-fetch' );

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'entries REST calls', () => {
	it( 'lists with only the parameters that carry a value', async () => {
		apiFetch.mockResolvedValue( { items: [], total: 0, pages: 0, page: 1, per_page: 20, unread: 0 } );

		await listEntries( { form: '7', status: undefined, min: null, max: '', page: 2, per_page: 50 } );

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries?form=7&page=2&per_page=50' } );
	} );

	it( 'lists without a query string when nothing is set', async () => {
		apiFetch.mockResolvedValue( {} );

		await listEntries();

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries' } );
	} );

	it( 'encodes values so a stray ampersand cannot add a parameter', async () => {
		apiFetch.mockResolvedValue( {} );

		await listEntries( { status: 'new&form=1' } );

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries?status=new%26form%3D1' } );
	} );

	it( 'reads one entry with the list filters for its neighbours', async () => {
		apiFetch.mockResolvedValue( { id: 41 } );

		await getEntry( 41, { status: 'new', orderby: 'total' } );

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries/41?status=new&orderby=total' } );
	} );

	it( 'sends batch actions as JSON', async () => {
		apiFetch.mockResolvedValue( { affected: 2, unread: 0 } );

		await expect( updateEntries( 'read', [ 4, 5 ] ) ).resolves.toEqual( { affected: 2, unread: 0 } );
		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/entries/batch',
			method: 'POST',
			data: { action: 'read', ids: [ 4, 5 ] },
		} );
	} );

	it( 'deletes one entry', async () => {
		apiFetch.mockResolvedValue( { id: 9, deleted: true, unread: 3 } );

		await deleteEntry( 9 );

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries/9', method: 'DELETE' } );
	} );

	it( 'turns a REST error into an ApiError with its code and status', async () => {
		apiFetch.mockRejectedValue( { code: 'qform_entry_not_found', message: 'Entry not found.', data: { status: 404 } } );

		const caught = await getEntry( 5 ).catch( ( error ) => error );

		expect( caught ).toBeInstanceOf( ApiError );
		expect( caught.code ).toBe( 'qform_entry_not_found' );
		expect( caught.status ).toBe( 404 );
	} );
} );
