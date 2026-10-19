/**
 * @jest-environment jsdom
 */
import apiFetch from '@wordpress/api-fetch';

import {
	ApiError,
	createForm,
	deleteForm,
	getForm,
	listForms,
	updateForm,
} from '../../../admin-src/api/client';

jest.mock( '@wordpress/api-fetch' );

function mockListResponse( body, headers ) {
	apiFetch.mockResolvedValue( {
		headers,
		json: () => Promise.resolve( body ),
	} );
}

describe( 'listForms', () => {
	it( 'returns the forms and the totals from the response headers', async () => {
		mockListResponse(
			[ { id: 3, title: 'Cleaning', modified: '2026-09-15T11:20:45' } ],
			new Headers( { 'X-WP-Total': '41', 'X-WP-TotalPages': '3' } )
		);

		const result = await listForms( { page: 2, perPage: 20 } );

		expect( result.forms ).toEqual( [
			{ id: 3, title: 'Cleaning', modified: '2026-09-15T11:20:45' },
		] );
		expect( result.total ).toBe( 41 );
		expect( result.totalPages ).toBe( 3 );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms?page=2&per_page=20',
			parse: false,
		} );
	} );

	it( 'falls back to zero totals when the headers are absent', async () => {
		mockListResponse( [], new Headers() );

		const result = await listForms();

		expect( result.total ).toBe( 0 );
		expect( result.totalPages ).toBe( 0 );
	} );

	it( 'defaults to page 1 and 20 per page when called with no arguments', async () => {
		mockListResponse( [], new Headers() );

		await listForms();

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms?page=1&per_page=20',
			parse: false,
		} );
	} );

	it( 'treats a non-numeric header value as zero', async () => {
		mockListResponse( [], new Headers( { 'X-WP-Total': 'abc' } ) );

		const result = await listForms();

		expect( result.total ).toBe( 0 );
	} );
} );

describe( 'getForm', () => {
	it( 'requests one form by id', async () => {
		apiFetch.mockResolvedValue( { id: 7, title: 'Quote', schema: { version: 1 } } );

		const form = await getForm( 7 );

		expect( form.id ).toBe( 7 );
		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/forms/7' } );
	} );
} );

describe( 'createForm', () => {
	it( 'posts the title and resolves with the created form', async () => {
		apiFetch.mockResolvedValue( { id: 9, title: 'New form', schema: {} } );

		const result = await createForm( 'New form' );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms',
			method: 'POST',
			data: { title: 'New form' },
		} );
		expect( result ).toEqual( { id: 9, title: 'New form', schema: {} } );
	} );
} );

describe( 'updateForm', () => {
	it( 'puts the whole document and resolves with the updated form', async () => {
		const schema = { version: 1, settings: {} };
		apiFetch.mockResolvedValue( { id: 7, title: 'Quote', schema } );

		const result = await updateForm( 7, { title: 'Quote', schema } );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms/7',
			method: 'PUT',
			data: { title: 'Quote', schema },
		} );
		expect( result ).toEqual( { id: 7, title: 'Quote', schema } );
	} );
} );

describe( 'deleteForm', () => {
	it( 'deletes by id and resolves with the confirmation payload', async () => {
		apiFetch.mockResolvedValue( { id: 7, deleted: true } );

		const result = await deleteForm( 7 );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms/7',
			method: 'DELETE',
		} );
		expect( result ).toEqual( { id: 7, deleted: true } );
	} );
} );

describe( 'error normalisation', () => {
	it( 'keeps every validation error, with its path and context intact', async () => {
		apiFetch.mockRejectedValue( {
			code: 'qform_invalid_schema',
			message: 'The form could not be saved.',
			data: {
				status: 400,
				errors: [
					{
						path: 'settings.decimals',
						code: 'out_of_range',
						message: 'Too many decimals.',
						context: { min: 0, max: 6 },
					},
					{
						path: 'calculations.0.expression',
						code: 'invalid_expression',
						message: 'Broken formula.',
						context: { engine_code: 'unexpected_token', position: 19 },
					},
				],
			},
		} );

		expect.assertions( 5 );

		try {
			await updateForm( 7, { title: 'x', schema: {} } );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ApiError );
			expect( error.code ).toBe( 'qform_invalid_schema' );
			expect( error.status ).toBe( 400 );
			expect( error.errors ).toHaveLength( 2 );
			expect( error.errors[ 1 ].context.position ).toBe( 19 );
		}
	} );

	it( 'gives an empty errors array when the server sent none', async () => {
		apiFetch.mockRejectedValue( {
			code: 'rest_invalid_param',
			message: 'Invalid parameter(s): title',
			data: { status: 400, params: { title: 'Invalid.' } },
		} );

		expect.assertions( 3 );

		try {
			await createForm( '' );
		} catch ( error ) {
			expect( error.code ).toBe( 'rest_invalid_param' );
			expect( error.errors ).toEqual( [] );
			expect( error.message ).toBe( 'Invalid parameter(s): title' );
		}
	} );

	it( 'survives a rejection that is not shaped like a WordPress error at all', async () => {
		apiFetch.mockRejectedValue( new TypeError( 'Failed to fetch' ) );

		expect.assertions( 3 );

		try {
			await getForm( 7 );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ApiError );
			expect( error.code ).toBe( 'qform_network_error' );
			expect( error.errors ).toEqual( [] );
		}
	} );

	it( 'gives fetch_error a translated message while keeping the original code', async () => {
		apiFetch.mockRejectedValue( {
			code: 'fetch_error',
			message: 'You are probably offline.',
		} );

		expect.assertions( 3 );

		try {
			await getForm( 7 );
		} catch ( error ) {
			expect( error.code ).toBe( 'fetch_error' );
			expect( error.message ).not.toBe( 'You are probably offline.' );
			expect( error.errors ).toEqual( [] );
		}
	} );

	it( 'gives invalid_json a translated message while keeping the original code', async () => {
		apiFetch.mockRejectedValue( {
			code: 'invalid_json',
			message: 'The response is not a valid JSON response.',
		} );

		expect.assertions( 2 );

		try {
			await getForm( 7 );
		} catch ( error ) {
			expect( error.code ).toBe( 'invalid_json' );
			expect( error.message ).not.toBe( 'The response is not a valid JSON response.' );
		}
	} );
} );

describe( 'ApiError', () => {
	it( 'defaults errors to an empty array when none is given', () => {
		const error = new ApiError( { code: 'x', status: 1, message: 'm' } );

		expect( error.errors ).toEqual( [] );
	} );

	it( 'does not throw when constructed with no argument at all', () => {
		expect( () => new ApiError() ).not.toThrow();
	} );
} );

describe( 'real @wordpress/api-fetch integration', () => {
	function fakeResponse( { status = 200, jsonBody, jsonError, headers } = {} ) {
		return {
			status,
			headers: new Headers( headers || {} ),
			json: () => {
				if ( jsonError ) {
					return Promise.reject( jsonError );
				}

				return Promise.resolve( jsonBody );
			},
		};
	}

	let realClient;
	let previousFetch;

	beforeEach( () => {
		jest.resetModules();
		jest.unmock( '@wordpress/api-fetch' );

		previousFetch = window.fetch;
		window.fetch = jest.fn();

		realClient = require( '../../../admin-src/api/client' );
	} );

	afterEach( () => {
		window.fetch = previousFetch;
		jest.resetModules();
	} );

	it( 'listForms on a 200 returns a real array, not the unread response stream', async () => {
		window.fetch.mockResolvedValue(
			fakeResponse( {
				status: 200,
				jsonBody: [ { id: 3, title: 'Cleaning' } ],
				headers: { 'X-WP-Total': '1', 'X-WP-TotalPages': '1' },
			} )
		);

		const result = await realClient.listForms();

		expect( Array.isArray( result.forms ) ).toBe( true );
		expect( result.forms ).toEqual( [ { id: 3, title: 'Cleaning' } ] );
		expect( result.total ).toBe( 1 );
		expect( result.totalPages ).toBe( 1 );
	} );

	it( 'listForms on a 403 reports rest_forbidden with status 403, not a network error', async () => {
		window.fetch.mockResolvedValue(
			fakeResponse( {
				status: 403,
				jsonBody: {
					code: 'rest_forbidden',
					message: 'Sorry, you are not allowed to do that.',
					data: { status: 403 },
				},
			} )
		);

		expect.assertions( 3 );

		try {
			await realClient.listForms();
		} catch ( error ) {
			expect( error ).toBeInstanceOf( realClient.ApiError );
			expect( error.code ).toBe( 'rest_forbidden' );
			expect( error.status ).toBe( 403 );
		}
	} );

	it( 'surfaces a dropped connection as fetch_error', async () => {
		window.fetch.mockRejectedValue( new TypeError( 'Failed to fetch' ) );

		expect.assertions( 1 );

		try {
			await realClient.getForm( 7 );
		} catch ( error ) {
			expect( error.code ).toBe( 'fetch_error' );
		}
	} );

	it( 'surfaces a non-JSON body as invalid_json', async () => {
		window.fetch.mockResolvedValue(
			fakeResponse( {
				status: 200,
				jsonError: new SyntaxError( 'Unexpected token <' ),
			} )
		);

		expect.assertions( 1 );

		try {
			await realClient.getForm( 7 );
		} catch ( error ) {
			expect( error.code ).toBe( 'invalid_json' );
		}
	} );
} );
