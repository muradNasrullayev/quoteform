import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';

import { filterParams } from '../entries/filters';

const NAMESPACE = '/quoteform/v1';

const NETWORK_ERROR_MESSAGE = __(
	'The server could not be reached. Check your connection and try again.',
	'quoteform'
);

/**
 * `@wordpress/api-fetch` bəzi uğursuzluqları öz kodları ilə bildirir —
 * bunları saxlayırıq ki, çağıranlar onlara görə budaqlana bilsin, sadəcə
 * mesajı `quoteform` domenində tərcümə edirik.
 */
const KNOWN_CODE_MESSAGES = {
	fetch_error: __(
		'You appear to be offline. Check your connection and try again.',
		'quoteform'
	),
	invalid_json: __(
		'The server sent a response we could not understand. Please try again.',
		'quoteform'
	),
};

/**
 * Serverin İKİ xəta ləhcəsi var: sxem problemləri `data.errors` ilə,
 * WordPress-in öz arqument validasiyası isə onsuz gəlir. Panellər hər
 * ikisini ayrıca öyrənməsin deyə `errors` HƏMİŞƏ massivdir.
 */
export class ApiError extends Error {
	constructor( { code, status, message, errors = [] } = {} ) {
		super( message );

		this.name = 'ApiError';
		this.code = code;
		this.status = status;
		this.errors = errors;
	}
}

function toApiError( raw ) {
	if ( ! raw || typeof raw.code !== 'string' ) {
		return new ApiError( {
			code: 'qform_network_error',
			status: 0,
			message: NETWORK_ERROR_MESSAGE,
			errors: [],
		} );
	}

	const data = raw.data || {};

	return new ApiError( {
		code: raw.code,
		status: typeof data.status === 'number' ? data.status : 0,
		message: KNOWN_CODE_MESSAGES[ raw.code ] || raw.message || '',
		errors: Array.isArray( data.errors ) ? data.errors : [],
	} );
}

/**
 * `parse: false` çağırışlarında `apiFetch` xəta zamanı ayrışdırılmamış
 * `Response`-u atır (`parseAndThrowError( response, false )` sadəcə
 * `throw response` edir) — burada `.status` birbaşa mövcuddur, body isə
 * hələ oxunmayıb. Əsl kodu və mesajı `.json()` ilə oxuyub mövcud
 * `toApiError`-a ötürürük ki, normallaşdırma məntiqi bir yerdə qalsın.
 */
async function toApiErrorFromResponse( response ) {
	let body = null;

	try {
		body = await response.json();
	} catch ( e ) {
		body = null;
	}

	if ( body && typeof body.code === 'string' ) {
		return toApiError( {
			code: body.code,
			message: body.message,
			data: {
				status: response.status,
				errors: body.data ? body.data.errors : undefined,
			},
		} );
	}

	return new ApiError( {
		code: 'qform_network_error',
		status: response.status,
		message: NETWORK_ERROR_MESSAGE,
		errors: [],
	} );
}

async function request( options ) {
	try {
		return await apiFetch( options );
	} catch ( raw ) {
		if ( options.parse === false && raw && typeof raw.json === 'function' ) {
			throw await toApiErrorFromResponse( raw );
		}

		throw toApiError( raw );
	}
}

function headerNumber( headers, name ) {
	const value = headers && typeof headers.get === 'function' ? headers.get( name ) : null;
	const parsed = Number.parseInt( value, 10 );

	return Number.isNaN( parsed ) ? 0 : parsed;
}

export async function listForms( { page = 1, perPage = 20 } = {} ) {
	const response = await request( {
		path: `${ NAMESPACE }/forms?page=${ page }&per_page=${ perPage }`,
		parse: false,
	} );

	return {
		forms: await response.json(),
		total: headerNumber( response.headers, 'X-WP-Total' ),
		totalPages: headerNumber( response.headers, 'X-WP-TotalPages' ),
	};
}

export function getForm( id ) {
	return request( { path: `${ NAMESPACE }/forms/${ id }` } );
}

export function createForm( title ) {
	return request( {
		path: `${ NAMESPACE }/forms`,
		method: 'POST',
		data: { title },
	} );
}

export function updateForm( id, { title, schema } ) {
	return request( {
		path: `${ NAMESPACE }/forms/${ id }`,
		method: 'PUT',
		data: { title, schema },
	} );
}

export function deleteForm( id ) {
	return request( {
		path: `${ NAMESPACE }/forms/${ id }`,
		method: 'DELETE',
	} );
}

function queryString( params ) {
	const search = new URLSearchParams();

	Object.keys( params ).forEach( ( key ) => {
		const value = params[ key ];

		if ( value !== null && value !== undefined && value !== '' ) {
			search.set( key, String( value ) );
		}
	} );

	const text = search.toString();

	return text === '' ? '' : `?${ text }`;
}

export function listEntries( params = {} ) {
	return request( { path: `${ NAMESPACE }/entries${ queryString( params ) }` } );
}

export function getEntry( id, params = {} ) {
	return request( { path: `${ NAMESPACE }/entries/${ Number( id ) }${ queryString( params ) }` } );
}

export function updateEntries( action, ids ) {
	return request( {
		path: `${ NAMESPACE }/entries/batch`,
		method: 'POST',
		data: { action, ids },
	} );
}

/**
 * "Bu filtrə uyğun bütün müraciətlər": id siyahısı yox, ekrandakı siyahının filtrləri +
 * həmin siyahının `max_id`-si və istifadəçinin gördüyü say (`expectedTotal`). Server sonradan
 * gələn müraciətə (id > upToId) toxunmur; əhatə dəyişibsə 409 `qform_list_changed` qaytarır.
 * Filtrlər əvvəl, sabit açarlar sonra: filtr obyekti `action`/`scope`-u əvəz edə bilməz.
 */
export function updateMatchingEntries( action, filters, upToId, expectedTotal ) {
	return request( {
		path: `${ NAMESPACE }/entries/batch`,
		method: 'POST',
		data: { ...filterParams( filters ), action, scope: 'filter', up_to_id: upToId, expected_total: expectedTotal },
	} );
}

export function deleteEntry( id ) {
	return request( {
		path: `${ NAMESPACE }/entries/${ Number( id ) }`,
		method: 'DELETE',
	} );
}
