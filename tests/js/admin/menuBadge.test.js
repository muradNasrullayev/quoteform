/**
 * @jest-environment jsdom
 */
import { updateMenuBadge } from '../../../admin-src/entries/menuBadge';

// PHP EntriesPage::badge( 3 ) ilə eyni markup.
const BADGE = '<a>Entries <span class="awaiting-mod quoteform_unread-badge count-3"><span class="pending-count" aria-hidden="true">3</span><span class="screen-reader-text">3 unread entries</span></span></a>';

beforeEach( () => {
	document.documentElement.lang = 'en-US';
	document.body.innerHTML = `<ul id="adminmenu"><li>${ BADGE }</li></ul>`;
} );

function badge() {
	return document.querySelector( '.quoteform_unread-badge' );
}

describe( 'updateMenuBadge', () => {
	it( 'shows the new count to eyes and to screen readers', () => {
		updateMenuBadge( 1234 );

		expect( badge().className ).toBe( 'awaiting-mod quoteform_unread-badge count-1234' );
		expect( badge().querySelector( '.pending-count' ).textContent ).toBe( '1,234' );
		expect( badge().querySelector( '.screen-reader-text' ).textContent ).toBe( '1,234 unread entries' );
	} );

	it( 'uses the singular for one', () => {
		updateMenuBadge( 1 );

		expect( badge().querySelector( '.screen-reader-text' ).textContent ).toBe( '1 unread entry' );
	} );

	it( 'hides itself at zero the way WordPress does', () => {
		updateMenuBadge( 0 );

		expect( badge().classList.contains( 'count-0' ) ).toBe( true );
	} );

	it( 'treats a missing or broken count as zero', () => {
		updateMenuBadge( undefined );
		expect( badge().classList.contains( 'count-0' ) ).toBe( true );

		updateMenuBadge( -4 );
		expect( badge().classList.contains( 'count-0' ) ).toBe( true );
	} );

	it( 'does nothing when the menu has no badge', () => {
		document.body.innerHTML = '';

		expect( () => updateMenuBadge( 5 ) ).not.toThrow();
	} );
} );
