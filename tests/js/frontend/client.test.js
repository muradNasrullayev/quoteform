import { createClient, endpoint } from '../../../frontend-src/runtime/client';

const json = ( status, body ) => Promise.resolve( { ok: status >= 200 && status < 300, status, json: () => Promise.resolve( body ) } );

function setup( { responses, start = 0 } = {} ) {
	let clock = start;
	const calls = [];
	const waits = [];
	const queue = [ ...responses ];
	const fetchImpl = jest.fn( ( url, init ) => {
		calls.push( { url, init } );
		const next = queue.shift();

		return typeof next === 'function' ? next() : next;
	} );
	const client = createClient( {
		restUrl: 'https://site.test/wp-json/quoteform/v1/',
		formId: '7',
		fetchImpl,
		now: () => clock,
		wait: ( ms ) => {
			waits.push( ms );
			clock += ms;
			return Promise.resolve();
		},
	} );

	return { client, calls, waits, tick: ( ms ) => ( clock += ms ) };
}

describe( 'endpoint', () => {
	it( 'builds pretty-permalink URLs', () => {
		expect( endpoint( 'https://s/wp-json/quoteform/v1/', 'session', { form_id: 7 } ) ).toBe( 'https://s/wp-json/quoteform/v1/session?form_id=7' );
	} );

	it( 'builds plain-permalink URLs', () => {
		expect( endpoint( 'https://s/index.php?rest_route=/quoteform/v1/', 'session', { form_id: 7 } ) ).toBe( 'https://s/index.php?rest_route=/quoteform/v1/session&form_id=7' );
		expect( endpoint( 'https://s/index.php?rest_route=/quoteform/v1/', 'entries' ) ).toBe( 'https://s/index.php?rest_route=/quoteform/v1/entries' );
	} );
} );

describe( 'createClient', () => {
	it( 'reuses a session younger than an hour', async () => {
		const { client, calls, tick } = setup( { responses: [ json( 200, { nonce: 'n1', ticket: 't1' } ), json( 200, { nonce: 'n2', ticket: 't2' } ) ] } );

		await client.ensureSession();
		tick( 59 * 60 * 1000 );
		await client.ensureSession();
		expect( calls ).toHaveLength( 1 );

		tick( 2 * 60 * 1000 );
		await client.ensureSession();
		expect( calls ).toHaveLength( 2 );
		expect( calls[ 0 ].init.cache ).toBe( 'no-store' );
	} );

	it( 'waits until the ticket is old enough, so a quick visitor is not taken for a bot', async () => {
		const { client, waits, calls } = setup( { responses: [ json( 200, { nonce: 'n', ticket: 't' } ), json( 201, { success_action: 'message' } ) ] } );

		const result = await client.submit( { rooms: 1 }, '' );

		expect( waits ).toEqual( [ 3500 ] );
		expect( result.status ).toBe( 201 );
		expect( JSON.parse( calls[ 1 ].init.body ) ).toEqual( { form_id: 7, values: { rooms: 1 }, hp: '', ticket: 't', nonce: 'n' } );
	} );

	it( 'does not wait for a ticket that is already old enough', async () => {
		const { client, waits, tick } = setup( { responses: [ json( 200, { nonce: 'n', ticket: 't' } ), json( 201, {} ) ] } );

		await client.ensureSession();
		tick( 10000 );
		await client.submit( {}, '' );

		expect( waits ).toEqual( [] );
	} );

	it( 'renews an expired nonce once, keeping the old ticket', async () => {
		const { client, calls, tick } = setup( {
			responses: [
				json( 200, { nonce: 'n1', ticket: 'old' } ),
				json( 403, { code: 'qform_expired' } ),
				json( 200, { nonce: 'n2', ticket: 'fresh' } ),
				json( 201, { success_action: 'message' } ),
			],
		} );

		await client.ensureSession();
		tick( 10000 );
		const result = await client.submit( {}, '' );

		expect( result.status ).toBe( 201 );
		expect( JSON.parse( calls[ 3 ].init.body ) ).toMatchObject( { nonce: 'n2', ticket: 'old' } );
	} );

	it( 'gives up after one renewal', async () => {
		const { client, tick } = setup( {
			responses: [
				json( 200, { nonce: 'n1', ticket: 't' } ),
				json( 403, { code: 'qform_expired' } ),
				json( 200, { nonce: 'n2', ticket: 't2' } ),
				json( 403, { code: 'qform_expired' } ),
			],
		} );

		await client.ensureSession();
		tick( 10000 );

		expect( ( await client.submit( {}, '' ) ).status ).toBe( 403 );
	} );

	it( 'turns a network failure into status 0', async () => {
		const { client } = setup( { responses: [ () => Promise.reject( new Error( 'offline' ) ) ] } );

		expect( await client.submit( {}, '' ) ).toEqual( { status: 0, body: null } );
	} );

	it( 'survives a body that is not JSON', async () => {
		const broken = () => Promise.resolve( { ok: false, status: 500, json: () => Promise.reject( new Error( 'html' ) ) } );
		const { client, tick } = setup( { responses: [ json( 200, { nonce: 'n', ticket: 't' } ), broken ] } );

		await client.ensureSession();
		tick( 10000 );

		expect( await client.submit( {}, '' ) ).toEqual( { status: 500, body: null } );
	} );
} );

// R11 (Task 12, Fix round 1): the ticket-reuse/expiry boundary, credentials/
// header hygiene (R10), clock-skew clamping, in-flight request sharing and
// the wait-on-retry rule around the 23h ticket window.
describe( 'createClient — ticket lifecycle edge cases (R11)', () => {
	it( 'replaces the ticket once it turns 23 hours old, and waits again before posting', async () => {
		const { client, calls, waits, tick } = setup( {
			responses: [
				json( 200, { nonce: 'n1', ticket: 'old' } ),
				json( 200, { nonce: 'n2', ticket: 'new' } ),
				json( 201, {} ),
			],
		} );

		await client.ensureSession();
		tick( 23 * 60 * 60 * 1000 + 1000 );
		const result = await client.submit( {}, '' );

		expect( calls ).toHaveLength( 3 );
		expect( JSON.parse( calls[ 2 ].init.body ) ).toMatchObject( { ticket: 'new', nonce: 'n2' } );
		expect( waits ).toEqual( [ 3500 ] );
		expect( result.status ).toBe( 201 );
	} );

	it( 'keeps the same ticket across an hourly session refresh, well inside the 23 hour window', async () => {
		const { client, calls, waits, tick } = setup( {
			responses: [
				json( 200, { nonce: 'n1', ticket: 'same' } ),
				json( 200, { nonce: 'n2', ticket: 'ignored' } ),
				json( 201, {} ),
			],
		} );

		await client.ensureSession();
		tick( 60 * 60 * 1000 + 1000 );
		const result = await client.submit( {}, '' );

		expect( calls ).toHaveLength( 3 );
		expect( JSON.parse( calls[ 2 ].init.body ) ).toMatchObject( { ticket: 'same', nonce: 'n2' } );
		expect( waits ).toEqual( [] );
		expect( result.status ).toBe( 201 );
	} );

	it( 'never sends an X-WP-Nonce header, and always uses same-origin credentials (R10)', async () => {
		const { client, calls, tick } = setup( {
			responses: [ json( 200, { nonce: 'n', ticket: 't' } ), json( 201, {} ) ],
		} );

		await client.ensureSession();
		tick( 10000 );
		await client.submit( {}, '' );

		expect( calls.length ).toBeGreaterThan( 0 );
		calls.forEach( ( call ) => {
			expect( call.init.credentials ).toBe( 'same-origin' );
			expect( call.init.headers ? call.init.headers[ 'X-WP-Nonce' ] : undefined ).toBeUndefined();
		} );
	} );

	it( 'never asks for more than the minimum wait, even if the clock runs backward', async () => {
		const { client, waits, tick } = setup( {
			responses: [
				json( 200, { nonce: 'n1', ticket: 'old' } ),
				json( 200, { nonce: 'n2', ticket: 'new' } ),
				json( 201, {} ),
			],
		} );

		await client.ensureSession();
		tick( -60 * 60 * 1000 ); // saat 1 saat geri düşür (sistem saatı düzəlişi, RTC s.)
		const result = await client.submit( {}, '' );

		waits.forEach( ( ms ) => expect( ms ).toBeLessThanOrEqual( 3500 ) );
		expect( result.status ).toBe( 201 );
	} );

	it( 'shares an in-flight session request between concurrent callers', async () => {
		const { client, calls } = setup( { responses: [ json( 200, { nonce: 'n', ticket: 't' } ) ] } );

		const [ a, b ] = await Promise.all( [ client.ensureSession(), client.ensureSession() ] );

		expect( calls ).toHaveLength( 1 );
		expect( a ).toEqual( b );
	} );

	it( 'clears the shared session promise on failure, so a later call can retry', async () => {
		const { client, calls } = setup( {
			responses: [
				json( 500, { code: 'server_error' } ),
				json( 200, { nonce: 'n', ticket: 't' } ),
			],
		} );

		await expect( client.ensureSession() ).rejects.toThrow();
		const session = await client.ensureSession();

		expect( calls ).toHaveLength( 2 );
		expect( session ).toEqual( expect.objectContaining( { nonce: 'n', ticket: 't' } ) );
	} );

	it( 'does not re-wait when a nonce-renewal retry keeps the same ticket', async () => {
		const { client, calls, waits, tick } = setup( {
			responses: [
				json( 200, { nonce: 'n1', ticket: 'old' } ),
				json( 403, { code: 'qform_expired' } ),
				json( 200, { nonce: 'n2', ticket: 'fresh' } ),
				json( 201, { success_action: 'message' } ),
			],
		} );

		await client.ensureSession();
		tick( 10000 );
		const result = await client.submit( {}, '' );

		expect( result.status ).toBe( 201 );
		expect( JSON.parse( calls[ 3 ].init.body ) ).toMatchObject( { nonce: 'n2', ticket: 'old' } );
		expect( waits ).toEqual( [] );
	} );

	it( 'applies the same wait to a fresh ticket picked up mid-retry, when the old one turns 23 hours old first', async () => {
		let clock = 0;
		const waits = [];
		const calls = [];
		let entryAttempts = 0;
		let sessionCalls = 0;

		const fetchImpl = jest.fn( ( url, init ) => {
			calls.push( { url, init } );

			if ( url.indexOf( 'session' ) !== -1 ) {
				sessionCalls += 1;

				return json( 200, { nonce: `n${ sessionCalls }`, ticket: `server${ sessionCalls }` } );
			}

			entryAttempts += 1;

			if ( entryAttempts === 1 ) {
				// Sorğu serverə çatana qədər gecikir — bu müddətdə ticket 23 saatı keçir.
				clock += 10000;

				return json( 403, { code: 'qform_expired' } );
			}

			return json( 201, {} );
		} );

		const client = createClient( {
			restUrl: 'https://site.test/wp-json/quoteform/v1/',
			formId: '7',
			fetchImpl,
			now: () => clock,
			wait: ( ms ) => {
				waits.push( ms );
				clock += ms;

				return Promise.resolve();
			},
		} );

		await client.ensureSession(); // ticketAt = 0, ticket = 'server1'
		clock = 23 * 60 * 60 * 1000 - 10000; // 23 saata 10 saniyə qalıb
		const result = await client.submit( {}, '' );

		expect( result.status ).toBe( 201 );
		expect( waits ).toEqual( [ 3500 ] );
	} );
} );
