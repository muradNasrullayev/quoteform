import {
	isReservedKey,
	isValidKey,
	RESERVED_KEYS,
	slugify,
	uniqueKey,
} from '../../../admin-src/lib/keys';

describe( 'slugify', () => {
	it( 'lowercases and underscores a plain label', () => {
		expect( slugify( 'How many rooms?' ) ).toBe( 'how_many_rooms' );
	} );

	it( 'collapses runs of separators', () => {
		expect( slugify( '  Total   --  price  ' ) ).toBe( 'total_price' );
	} );

	it( 'drops a leading digit, because a key must start with a letter', () => {
		expect( slugify( '2nd bathroom' ) ).toBe( 'nd_bathroom' );
	} );

	it( 'truncates to the 64-character limit', () => {
		expect( slugify( 'a'.repeat( 200 ) ) ).toHaveLength( 64 );
	} );

	it( 'falls back to "field" when nothing usable survives', () => {
		expect( slugify( '???' ) ).toBe( 'field' );
		expect( slugify( '' ) ).toBe( 'field' );
		expect( slugify( '123' ) ).toBe( 'field' );
	} );

	it( 'always produces something the server would accept', () => {
		[ 'How many rooms?', '???', '2nd', 'ÜST QAT', 'a'.repeat( 200 ) ].forEach( ( label ) => {
			expect( isValidKey( slugify( label ) ) ).toBe( true );
		} );
	} );
} );

describe( 'isValidKey', () => {
	it( 'accepts the shapes the server accepts', () => {
		expect( isValidKey( 'a' ) ).toBe( true );
		expect( isValidKey( 'room_count' ) ).toBe( true );
		expect( isValidKey( 'a1_2' ) ).toBe( true );
		expect( isValidKey( `a${ 'b'.repeat( 63 ) }` ) ).toBe( true );
	} );

	it( 'rejects the shapes the server rejects', () => {
		expect( isValidKey( '' ) ).toBe( false );
		expect( isValidKey( '1st' ) ).toBe( false );
		expect( isValidKey( '_leading' ) ).toBe( false );
		expect( isValidKey( 'Room' ) ).toBe( false );
		expect( isValidKey( 'room count' ) ).toBe( false );
		expect( isValidKey( 'room-count' ) ).toBe( false );
		expect( isValidKey( `a${ 'b'.repeat( 64 ) }` ) ).toBe( false );
	} );

	it( 'rejects a trailing newline', () => {
		expect( isValidKey( 'room_count\n' ) ).toBe( false );
	} );
} );

describe( 'isReservedKey', () => {
	it( 'reserves exactly the two lowercase JavaScript built-ins', () => {
		expect( RESERVED_KEYS ).toEqual( [ 'constructor', 'prototype' ] );
		expect( isReservedKey( 'constructor' ) ).toBe( true );
		expect( isReservedKey( 'prototype' ) ).toBe( true );
	} );

	it( 'does not reserve the camelCase lookalikes, which a key can never be', () => {
		expect( isReservedKey( 'hasownproperty' ) ).toBe( false );
		expect( isReservedKey( 'tostring' ) ).toBe( false );
		expect( isReservedKey( 'valueof' ) ).toBe( false );
	} );
} );

describe( 'uniqueKey', () => {
	it( 'returns the base when it is free', () => {
		expect( uniqueKey( 'rooms', [ 'price' ] ) ).toBe( 'rooms' );
	} );

	it( 'suffixes until it finds a gap', () => {
		expect( uniqueKey( 'rooms', [ 'rooms' ] ) ).toBe( 'rooms_2' );
		expect( uniqueKey( 'rooms', [ 'rooms', 'rooms_2' ] ) ).toBe( 'rooms_3' );
	} );

	it( 'never exceeds the length limit while suffixing', () => {
		const base = 'a'.repeat( 64 );
		const key = uniqueKey( base, [ base ] );

		expect( key ).not.toBe( base );
		expect( isValidKey( key ) ).toBe( true );
	} );

	it( 'steps past a reserved base', () => {
		expect( uniqueKey( 'constructor', [] ) ).toBe( 'constructor_2' );
	} );
} );
