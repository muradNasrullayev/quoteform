/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

// Final fix F1 (Ruling R15) — müdafiə xətti: server 422 ilə səhifədə OLMAYAN
// sahəni adlandırsa (məs. brauzerin gizlətdiyi sahə), fokus heç yerə getməməli,
// ümumi uğursuzluq zolağı göstərilməlidir.

const schema = () => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Get my quote' },
	fields: {
		coupon: { key: 'coupon', type: 'text', label: 'Coupon', help: '', required: false, default: '' },
		code: { key: 'code', type: 'text', label: 'Member code', help: '', required: true, default: '' },
	},
	steps: [ { key: 'one', title: 'One', description: '', fields: [ 'coupon', 'code' ] } ],
	calculations: [ { key: 'total', label: 'Total', expression: '10', visible: true } ],
	rules: [
		{ target: { kind: 'field', key: 'code' }, action: 'hide', match: 'all', conditions: [ { field: 'coupon', operator: 'not_equals', value: 'MEMBER' } ] },
	],
} );

const FAILURE = 'We couldn’t send your quote. Please try again.';

function mount( respond ) {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );

	const client = {
		ensureSession: jest.fn( () => Promise.resolve() ),
		submit: jest.fn( () => Promise.resolve( respond ) ),
	};

	createForm( container, schema(), { client, navigate: jest.fn() } );

	return { container, client };
}

const q = ( container, selector ) => container.querySelector( selector );
const click = ( element ) => element.dispatchEvent( new Event( 'click', { bubbles: true } ) );
const byId = ( container, suffix ) => container.querySelector( `#${ q( container, '.quoteform' ).id }_${ suffix }` );

function type( container, key, value ) {
	const input = byId( container, key );

	input.value = String( value );
	input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	jest.advanceTimersByTime( 60 );
}

async function flush() {
	for ( let tick = 0; tick < 20; tick++ ) {
		await Promise.resolve();
	}
}

function listen( container ) {
	const region = q( container, '[role="status"]' );
	const heard = [];
	const observer = new MutationObserver( () => heard.push( region.textContent ) );

	observer.observe( region, { childList: true, characterData: true, subtree: true } );

	return { heard, stop: () => observer.disconnect() };
}

async function submitAndSettle( container ) {
	click( q( container, '[data-quoteform-submit]' ) );
	await flush();
	jest.advanceTimersByTime( 600 );
	await flush();
}

beforeEach( () => {
	jest.useFakeTimers();
	document.body.innerHTML = '';
	delete window.quoteformConfig;
} );

afterEach( () => {
	jest.useRealTimers();
} );

describe( 'server errors for fields that are not on the page', () => {
	it( 'shows the failure banner when the server names a field the browser hid', async () => {
		const { container } = mount( { status: 422, body: { code: 'qform_invalid_submission', errors: { code: 'This field is required.' }, step: 'one' } } );

		type( container, 'coupon', 'MEMBER ' );

		const { heard, stop } = listen( container );

		await submitAndSettle( container );
		stop();

		const banner = q( container, '.quoteform_submit_error' );
		const button = q( container, '[data-quoteform-submit]' );

		expect( banner.hidden ).toBe( false );
		expect( banner.textContent ).toBe( FAILURE );
		expect( heard ).toContain( FAILURE );
		expect( document.activeElement ).toBe( button );
		expect( button.disabled ).toBe( false );
	} );

	it( 'shows the failure banner when the server names a field the form does not have', async () => {
		const { container } = mount( { status: 422, body: { code: 'qform_invalid_submission', errors: { ghost: 'This field is required.' }, step: 'nowhere' } } );

		await submitAndSettle( container );

		expect( q( container, '.quoteform_submit_error' ).hidden ).toBe( false );
		expect( document.activeElement ).toBe( q( container, '[data-quoteform-submit]' ) );
	} );

	it( 'announces the failure again on a second identical 422', async () => {
		const { container } = mount( { status: 422, body: { code: 'qform_invalid_submission', errors: { ghost: 'x' }, step: 'one' } } );
		const { heard, stop } = listen( container );

		await submitAndSettle( container );
		await submitAndSettle( container );
		stop();

		expect( heard.filter( ( text ) => text === FAILURE ) ).toHaveLength( 2 );
	} );

	it( 'clears an earlier field message before showing the banner', async () => {
		const { container, client } = mount( { status: 422, body: { code: 'qform_invalid_submission', errors: { coupon: 'Too long.' }, step: 'one' } } );

		await submitAndSettle( container );
		expect( byId( container, 'coupon_error' ).textContent ).toBe( 'Too long.' );

		client.submit.mockImplementation( () => Promise.resolve( { status: 422, body: { code: 'qform_invalid_submission', errors: { ghost: 'x' }, step: 'one' } } ) );
		await submitAndSettle( container );

		expect( byId( container, 'coupon_error' ).textContent ).toBe( '' );
		expect( q( container, '.quoteform_submit_error' ).hidden ).toBe( false );
	} );

	it( 'still points at the field when the server names one that is on the page', async () => {
		const { container } = mount( { status: 422, body: { code: 'qform_invalid_submission', errors: { coupon: 'Too long.', ghost: 'x' }, step: 'one' } } );

		await submitAndSettle( container );

		expect( q( container, '.quoteform_submit_error' ).hidden ).toBe( true );
		expect( byId( container, 'coupon_error' ).textContent ).toBe( 'Too long.' );
		expect( document.activeElement ).toBe( byId( container, 'coupon' ) );
	} );
} );
