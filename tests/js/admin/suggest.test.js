/**
 * @jest-environment jsdom
 */
import { suggestName } from '../../../admin-src/lib/suggest';

describe( 'suggestName', () => {
	it( 'suggests the key the spec’s own example is a typo of', () => {
		expect( suggestName( 'bathroms', [ 'rooms', 'bathrooms', 'total' ] ) ).toBe( 'bathrooms' );
	} );

	it( 'forgives a transposition', () => {
		expect( suggestName( 'bahtrooms', [ 'rooms', 'bathrooms' ] ) ).toBe( 'bathrooms' );
	} );

	it( 'forgives a missing, an extra and a wrong letter', () => {
		expect( suggestName( 'bathroom', [ 'bathrooms' ] ) ).toBe( 'bathrooms' );
		expect( suggestName( 'bathrooms_', [ 'bathrooms' ] ) ).toBe( 'bathrooms' );
		expect( suggestName( 'bathrxoms', [ 'bathrooms' ] ) ).toBe( 'bathrooms' );
	} );

	it( 'says nothing when the nearest key is still too far away', () => {
		expect( suggestName( 'ghost', [ 'rooms', 'urgency', 'subtotal' ] ) ).toBeNull();
	} );

	/**
	 * Səhv təklif heç bir təklifdən pisdir — bu iki hal həddin niyə belə
	 * seçildiyini saxlayır.
	 */
	it( 'holds short keys to a single letter, since two rewrites a short key into another one', () => {
		expect( suggestName( 'site', [ 'date' ] ) ).toBeNull();
		expect( suggestName( 'sise', [ 'size' ] ) ).toBe( 'size' );
	} );

	/**
	 * Həddin ÖZÜ — iki düzəliş. Sabit olaraq oxumaq azdır: üçə qaldırmaq
	 * `hours` üçün `rooms` təklif etdirir, yəni tamamilə başqa bir açar.
	 * Ona görə hər iki tərəf bağlanır: 2 təklif verir, 3 vermir.
	 */
	it( 'stops at two edits, since a third turns a typo into a different key', () => {
		expect( suggestName( 'bathrxxms', [ 'bathrooms' ] ) ).toBe( 'bathrooms' );
		expect( suggestName( 'bathrxxxs', [ 'bathrooms' ] ) ).toBeNull();
		expect( suggestName( 'hours', [ 'rooms' ] ) ).toBeNull();
	} );

	it( 'says nothing when two keys are equally close, because it cannot know which', () => {
		expect( suggestName( 'roams', [ 'rooms', 'reams' ] ) ).toBeNull();
	} );

	it( 'suggests a price variable by its whole name, suffix included', () => {
		expect( suggestName( 'urgency.prise', [ 'rooms', 'urgency.price' ] ) ).toBe(
			'urgency.price'
		);
	} );

	it( 'never suggests the name it was given', () => {
		expect( suggestName( 'rooms', [ 'rooms' ] ) ).toBeNull();
	} );

	it( 'survives an empty name and a missing candidate list', () => {
		expect( suggestName( '', [ 'rooms' ] ) ).toBeNull();
		expect( suggestName( 'rooms', undefined ) ).toBeNull();
	} );
} );
