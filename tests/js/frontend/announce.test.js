/**
 * @jest-environment jsdom
 */
import { createAnnouncer } from '../../../frontend-src/dom/announce';

describe( 'createAnnouncer', () => {
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

		return { container, announcer: createAnnouncer( container ) };
	};

	it( 'creates the live region empty, at mount', () => {
		const { container } = mount();
		const region = container.querySelector( '[aria-live]' );

		expect( region ).not.toBeNull();
		expect( region.getAttribute( 'aria-live' ) ).toBe( 'polite' );
		expect( region.textContent ).toBe( '' );
	} );

	it( 'is visually hidden but not hidden from assistive technology', () => {
		const { container } = mount();
		const region = container.querySelector( '[aria-live]' );

		expect( region.hasAttribute( 'hidden' ) ).toBe( false );
		expect( region.getAttribute( 'aria-hidden' ) ).toBeNull();
		expect( region.className ).toContain( 'quoteform_sr_only' );
	} );

	it( 'announces after the debounce, once', () => {
		const { container, announcer } = mount();

		announcer.announce( 'Total $50.00' );
		announcer.announce( 'Total $100.00' );
		announcer.announce( 'Total $150.00' );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( '' );

		jest.advanceTimersByTime( 600 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'Total $150.00' );
	} );

	it( 'does not repeat an identical message', () => {
		const { container, announcer } = mount();

		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 600 );
		container.querySelector( '[aria-live]' ).textContent = 'cleared by test';
		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 600 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'cleared by test' );
	} );

	it( 'removes its region on destroy', () => {
		const { container, announcer } = mount();

		announcer.destroy();

		expect( container.querySelector( '[aria-live]' ) ).toBeNull();
	} );

	it( 'drops a pending announcement the newest value has undone', () => {
		const { container, announcer } = mount();

		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 600 );
		announcer.announce( 'Total $100.00' );
		jest.advanceTimersByTime( 100 );
		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 600 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'Total $50.00' );
	} );

	it( 'says nothing more after destroy', () => {
		const { container, announcer } = mount();
		const region = container.querySelector( '[aria-live]' );

		announcer.announce( 'Total $50.00' );
		announcer.destroy();
		jest.advanceTimersByTime( 600 );

		expect( container.querySelector( '[aria-live]' ) ).toBeNull();
		expect( region.textContent ).toBe( '' );
	} );

	it( 'still announces a message that repeats before the first one landed', () => {
		const { container, announcer } = mount();

		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 100 );
		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 600 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'Total $50.00' );
	} );

	it( 'waits the full half second, not a shorter one', () => {
		const { container, announcer } = mount();

		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 499 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( '' );

		jest.advanceTimersByTime( 1 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'Total $50.00' );
	} );
} );
