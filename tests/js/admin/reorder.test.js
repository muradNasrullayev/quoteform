import { moveDown, moveUp } from '../../../admin-src/lib/reorder';

describe( 'moveUp', () => {
	it( 'swaps with the item above', () => {
		expect( moveUp( [ 'a', 'b', 'c' ], 1 ) ).toEqual( [ 'b', 'a', 'c' ] );
	} );

	it( 'does nothing at the top', () => {
		const list = [ 'a', 'b' ];

		expect( moveUp( list, 0 ) ).toBe( list );
	} );

	it( 'does nothing for an index that is not there', () => {
		const list = [ 'a', 'b' ];

		expect( moveUp( list, 9 ) ).toBe( list );
		expect( moveUp( list, -1 ) ).toBe( list );
	} );

	it( 'does not mutate the original', () => {
		const list = [ 'a', 'b' ];

		moveUp( list, 1 );

		expect( list ).toEqual( [ 'a', 'b' ] );
	} );
} );

describe( 'moveDown', () => {
	it( 'swaps with the item below', () => {
		expect( moveDown( [ 'a', 'b', 'c' ], 1 ) ).toEqual( [ 'a', 'c', 'b' ] );
	} );

	it( 'does nothing at the bottom', () => {
		const list = [ 'a', 'b' ];

		expect( moveDown( list, 1 ) ).toBe( list );
	} );
} );
