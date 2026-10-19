/**
 * @jest-environment jsdom
 */
import { buildControl } from '../../../frontend-src/dom/controls';

describe( 'length limits', () => {
	it.each( [ [ 'text', '500' ], [ 'email', '500' ], [ 'tel', '500' ], [ 'textarea', '5000' ] ] )( '%s is capped at %s characters', ( type, limit ) => {
		const control = buildControl( { key: 'f', type, label: 'F', help: '', required: false }, 'ns' );

		expect( control.input.getAttribute( 'maxlength' ) ).toBe( limit );
	} );

	it( 'leaves numbers alone', () => {
		const control = buildControl( { key: 'f', type: 'number', label: 'F', help: '', required: false }, 'ns' );

		expect( control.input.hasAttribute( 'maxlength' ) ).toBe( false );
	} );
} );
