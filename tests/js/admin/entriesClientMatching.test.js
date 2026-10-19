/**
 * @jest-environment jsdom
 */
import apiFetch from '@wordpress/api-fetch';

import { updateMatchingEntries } from '../../../admin-src/api/client';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

jest.mock( '@wordpress/api-fetch' );

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'the filter-wide batch call', () => {
	it( 'sends the list filters, the scope, the highest id and the count seen — never a list of ids', async () => {
		apiFetch.mockResolvedValue( { affected: 60, unread: 0 } );

		await expect(
			updateMatchingEntries( 'delete', { ...DEFAULT_FILTERS, form: 7, status: 'new', min: '10.5', orderby: 'total' }, 912, 60 )
		).resolves.toEqual( { affected: 60, unread: 0 } );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/entries/batch',
			method: 'POST',
			data: { form: '7', status: 'new', min: '10.5', orderby: 'total', action: 'delete', scope: 'filter', up_to_id: 912, expected_total: 60 },
		} );
	} );

	it( 'sends only the scope and the id when no filter is active', async () => {
		apiFetch.mockResolvedValue( { affected: 3, unread: 3 } );

		await updateMatchingEntries( 'unread', DEFAULT_FILTERS, 5, 0 );

		expect( apiFetch.mock.calls[ 0 ][ 0 ].data ).toEqual( { action: 'unread', scope: 'filter', up_to_id: 5, expected_total: 0 } );
	} );
} );
