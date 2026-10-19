/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

const schema = ( rules = [] ) => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Get my quote' },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', required: true, default: 1, min: 1, max: 10 },
		email: { key: 'email', type: 'email', label: 'Email', help: '', required: true, default: '' },
	},
	steps: [
		{ key: 'one', title: 'One', description: '', fields: [ 'rooms' ] },
		{ key: 'two', title: 'Two', description: '', fields: [ 'email' ] },
	],
	calculations: [ { key: 'total', label: 'Total', expression: '{rooms} * 50', visible: true } ],
	rules,
} );

const hideStepTwo = [ { target: { kind: 'step', key: 'two' }, action: 'hide', match: 'all', conditions: [ { field: 'rooms', operator: 'greater', value: 5 } ] } ];

function mount( { rules, respond, navigate } = {} ) {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );

	const client = {
		ensureSession: jest.fn( () => Promise.resolve() ),
		submit: jest.fn( () => Promise.resolve( respond || { status: 201, body: { success_action: 'message', message: 'Thanks!', total: '$50.00', breakdown: [ { label: 'Total', formatted: '$50.00' } ] } } ) ),
	};
	const form = createForm( container, schema( rules ), { client, navigate: navigate || jest.fn() } );

	return { container, form, client };
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

// Göndərmə zənciri bir neçə `await` keçir; sabit sayda mikrotask gözləmək
// hər birini bitirir (fake timer-lər `setImmediate`-i də saxtalaşdırır).
async function flush() {
	for ( let tick = 0; tick < 20; tick++ ) {
		await Promise.resolve();
	}
}

beforeEach( () => {
	jest.useFakeTimers();
	document.body.innerHTML = '';
} );

afterEach( () => {
	jest.useRealTimers();
} );

describe( 'submitting', () => {
	it( 'opens a session as soon as the form is on the page', () => {
		const { client } = mount();

		expect( client.ensureSession ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'shows the submit button only on the last visible step', () => {
		const { container } = mount();

		expect( q( container, '[data-quoteform-submit]' ) ).toBeNull();
		click( q( container, '[data-quoteform-next]' ) );
		expect( q( container, '[data-quoteform-submit]' ).textContent ).toBe( 'Get my quote' );
		expect( q( container, '[data-quoteform-next]' ) ).toBeNull();
	} );

	it( 'moves the submit button when a rule hides the last step', () => {
		const { container } = mount( { rules: hideStepTwo } );

		type( container, 'rooms', 6 );

		expect( q( container, '[data-quoteform-submit]' ) ).not.toBeNull();
	} );

	it( 'checks the current step before sending', async () => {
		const { container, client } = mount();

		click( q( container, '[data-quoteform-next]' ) );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( client.submit ).not.toHaveBeenCalled();
		expect( byId( container, 'email_error' ).textContent ).toBe( 'This field is required.' );
	} );

	it( 'sends the answers and the honeypot, and shows the server’s price', async () => {
		const { container, client } = mount();

		click( q( container, '[data-quoteform-next]' ) );
		type( container, 'email', 'a@b' );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( client.submit ).toHaveBeenCalledWith( expect.objectContaining( { rooms: 1, email: 'a@b' } ), '' );

		const panel = q( container, '[data-quoteform-success]' );

		expect( panel.textContent ).toContain( 'Thanks!' );
		expect( panel.textContent ).toContain( '$50.00' );
		expect( document.activeElement ).toBe( panel );
		expect( q( container, '.quoteform_steps' ).hidden ).toBe( true );
	} );

	it( 'shows only the message when the server sends no total', async () => {
		const { container } = mount( { rules: hideStepTwo, respond: { status: 201, body: { success_action: 'message', message: 'Thanks!', total: null, breakdown: [] } } } );

		type( container, 'rooms', 6 );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( q( container, '[data-quoteform-success]' ).textContent ).toBe( 'Thanks!' );
	} );

	it( 'follows a redirect', async () => {
		const navigate = jest.fn();
		const { container } = mount( { rules: hideStepTwo, navigate, respond: { status: 201, body: { success_action: 'redirect', redirect_url: 'https://example.com/thanks' } } } );

		type( container, 'rooms', 6 );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( navigate ).toHaveBeenCalledWith( 'https://example.com/thanks' );
	} );

	it( 'takes the visitor back to the step the server complained about', async () => {
		const { container } = mount( { respond: { status: 422, body: { code: 'qform_invalid_submission', errors: { rooms: 'Enter 10 or less.' }, step: 'one' } } } );

		click( q( container, '[data-quoteform-next]' ) );
		type( container, 'email', 'a@b' );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( q( container, '[data-quoteform-step]' ).getAttribute( 'data-quoteform-step' ) ).toBe( 'one' );
		expect( byId( container, 'rooms_error' ).textContent ).toBe( 'Enter 10 or less.' );
		expect( document.activeElement ).toBe( byId( container, 'rooms' ) );
	} );

	it( 'keeps the answers and says so when sending fails', async () => {
		const { container } = mount( { rules: hideStepTwo, respond: { status: 0, body: null } } );

		type( container, 'rooms', 6 );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		const banner = q( container, '.quoteform_submit_error' );

		expect( banner.hidden ).toBe( false );
		expect( banner.hasAttribute( 'role' ) ).toBe( false );
		expect( container.querySelectorAll( 'output, [role="status"], [role="alert"], [role="log"], [aria-live]' ) ).toHaveLength( 1 );
		expect( byId( container, 'rooms' ).value ).toBe( '6' );
		expect( q( container, '[data-quoteform-submit]' ).disabled ).toBe( false );
	} );

	it( 'sends once, however often the button is pressed', async () => {
		const { container, client } = mount( { rules: hideStepTwo } );

		type( container, 'rooms', 6 );
		const button = q( container, '[data-quoteform-submit]' );

		click( button );
		click( button );
		await flush();

		expect( client.submit ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'is busy while sending, and keeps its name', () => {
		const { container } = mount( { rules: hideStepTwo } );

		type( container, 'rooms', 6 );
		const button = q( container, '[data-quoteform-submit]' );

		click( button );

		expect( button.getAttribute( 'aria-busy' ) ).toBe( 'true' );
		expect( button.textContent ).toBe( 'Get my quote' );
	} );

	it( 'hides the honeypot from people and assistive technology', () => {
		const { container } = mount();
		const trap = q( container, '.quoteform_hp' );

		expect( trap.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
		expect( trap.querySelector( 'input' ).tabIndex ).toBe( -1 );
		expect( trap.querySelector( 'input' ).getAttribute( 'autocomplete' ) ).toBe( 'off' );
	} );
} );
