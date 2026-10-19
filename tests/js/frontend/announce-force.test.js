/**
 * @jest-environment jsdom
 */
import { createAnnouncer } from '../../../frontend-src/dom/announce';

describe( 'createAnnouncer — { force: true }', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	const mount = () => {
		const container = document.createElement( 'div' );

		document.body.appendChild( container );

		const announcer = createAnnouncer( container );

		return { announcer, region: container.querySelector( '[aria-live]' ) };
	};

	it( 'still skips a repeated message by default', () => {
		const { announcer, region } = mount();
		const heard = [];
		const observer = new MutationObserver( () => heard.push( region.textContent ) );

		announcer.announce( 'Failed.' );
		jest.advanceTimersByTime( 500 );
		observer.observe( region, { childList: true, characterData: true, subtree: true } );
		announcer.announce( 'Failed.' );
		jest.advanceTimersByTime( 500 );

		return Promise.resolve().then( () => {
			observer.disconnect();
			expect( heard ).toEqual( [] );
		} );
	} );

	it( 'says a repeated message again when forced, by emptying the region first', async () => {
		const { announcer, region } = mount();

		announcer.announce( 'Failed.' );
		jest.advanceTimersByTime( 500 );
		expect( region.textContent ).toBe( 'Failed.' );

		announcer.announce( 'Failed.', { force: true } );
		expect( region.textContent ).toBe( '' );

		jest.advanceTimersByTime( 500 );
		expect( region.textContent ).toBe( 'Failed.' );
	} );

	it( 'is cancelled like any other announcement', () => {
		const { announcer, region } = mount();

		announcer.announce( 'Failed.', { force: true } );
		announcer.announce( 'Step 1 of 2.' );
		jest.advanceTimersByTime( 500 );

		expect( region.textContent ).toBe( 'Step 1 of 2.' );
	} );
} );
