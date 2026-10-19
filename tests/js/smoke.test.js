describe( 'toolchain', () => {
	it( 'runs ESM sources through babel', () => {
		const value = [ 1, 2, 3 ].reduce( ( a, b ) => a + b, 0 );
		expect( value ).toBe( 6 );
	} );
} );
