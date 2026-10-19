/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

// Fix round 1 (R12/R13): submit-flow.test.js brief-dən dəqiq köçürülüb və
// toxunulmur; sərtləşdirmə halları burada yaşayır.

const schema = () => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Get my quote' },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', required: true, default: 1, min: 1, max: 10 },
	},
	steps: [ { key: 'one', title: 'One', description: '', fields: [ 'rooms' ] } ],
	calculations: [ { key: 'total', label: 'Total', expression: '{rooms} * 50', visible: true } ],
	rules: [],
} );

const FAILURE = 'We couldn’t send your quote. Please try again.';

function mount( { respond, navigate, withClient = true } = {} ) {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );

	const client = {
		ensureSession: jest.fn( () => Promise.resolve() ),
		submit: jest.fn( () => Promise.resolve( respond ) ),
	};
	const options = { navigate: navigate || jest.fn() };

	if ( withClient ) {
		options.client = client;
	}

	createForm( container, schema(), options );

	return { container, client };
}

const q = ( container, selector ) => container.querySelector( selector );
const click = ( element ) => element.dispatchEvent( new Event( 'click', { bubbles: true } ) );

async function flush() {
	for ( let tick = 0; tick < 20; tick++ ) {
		await Promise.resolve();
	}
}

beforeEach( () => {
	jest.useFakeTimers();
	document.body.innerHTML = '';
	delete window.quoteformConfig;
} );

afterEach( () => {
	jest.useRealTimers();
} );

describe( 'redirects', () => {
	it( 'never sends twice once the server said where to go', async () => {
		const navigate = jest.fn();
		const { container, client } = mount( {
			navigate,
			respond: { status: 201, body: { success_action: 'redirect', redirect_url: 'https://example.com/thanks' } },
		} );
		const button = q( container, '[data-quoteform-submit]' );

		click( button );
		await flush();
		click( button );
		await flush();

		expect( navigate ).toHaveBeenCalledTimes( 1 );
		expect( client.submit ).toHaveBeenCalledTimes( 1 );
		expect( button.disabled ).toBe( true );
	} );

	it( 'does not follow a URL that is not http(s), and shows the success panel instead', async () => {
		const navigate = jest.fn();
		const { container } = mount( {
			navigate,
			respond: { status: 201, body: { success_action: 'redirect', redirect_url: 'javascript:alert(1)', message: 'Thanks!' } },
		} );

		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( navigate ).not.toHaveBeenCalled();
		expect( q( container, '[data-quoteform-success]' ).textContent ).toContain( 'Thanks!' );
	} );
} );

describe( 'failures', () => {
	it( 'announces the failure every time, even when it is the same words', async () => {
		const { container } = mount( { respond: { status: 0, body: null } } );
		const region = q( container, '[role="status"]' );
		const heard = [];
		const observer = new MutationObserver( () => heard.push( region.textContent ) );

		observer.observe( region, { childList: true, characterData: true, subtree: true } );

		click( q( container, '[data-quoteform-submit]' ) );
		await flush();
		jest.advanceTimersByTime( 600 );
		await flush();

		click( q( container, '[data-quoteform-submit]' ) );
		await flush();
		jest.advanceTimersByTime( 600 );
		await flush();

		observer.disconnect();

		expect( heard.filter( ( text ) => text === FAILURE ) ).toHaveLength( 2 );
		expect( region.textContent ).toBe( FAILURE );
	} );

	it( 'puts focus back on the submit button when sending fails', async () => {
		const { container } = mount( { respond: { status: 500, body: null } } );
		const button = q( container, '[data-quoteform-submit]' );

		click( button );
		await flush();

		expect( document.activeElement ).toBe( button );
	} );

	it( 'puts focus back on the submit button when there is nothing to send with', async () => {
		const { container } = mount( { withClient: false } );
		const button = q( container, '[data-quoteform-submit]' );

		click( button );
		await flush();

		expect( q( container, '.quoteform_submit_error' ).hidden ).toBe( false );
		expect( document.activeElement ).toBe( button );
	} );
} );
