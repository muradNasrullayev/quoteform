import { ExpressionError } from '../../../frontend-src/engine/errors';
import { TOKEN, tokenize } from '../../../frontend-src/engine/lexer';

const pairs = ( source ) => tokenize( source ).map( ( token ) => [ token.type, token.value ] );

describe( 'tokenize', () => {
	it( 'tokenizes arithmetic with a variable', () => {
		expect( pairs( '{room_count} * 50 + 1.5' ) ).toEqual( [
			[ TOKEN.VARIABLE, 'room_count' ],
			[ TOKEN.OPERATOR, '*' ],
			[ TOKEN.NUMBER, 50 ],
			[ TOKEN.OPERATOR, '+' ],
			[ TOKEN.NUMBER, 1.5 ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'tokenizes a dotted variable', () => {
		expect( pairs( '{urgency.price}' ) ).toEqual( [
			[ TOKEN.VARIABLE, 'urgency.price' ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'prefers two-character operators over single ones', () => {
		expect( pairs( '1 >= 2 && 3 != 4' ) ).toEqual( [
			[ TOKEN.NUMBER, 1 ],
			[ TOKEN.OPERATOR, '>=' ],
			[ TOKEN.NUMBER, 2 ],
			[ TOKEN.OPERATOR, '&&' ],
			[ TOKEN.NUMBER, 3 ],
			[ TOKEN.OPERATOR, '!=' ],
			[ TOKEN.NUMBER, 4 ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'tokenizes strings with escapes', () => {
		expect( pairs( '"ex\\"press"' ) ).toEqual( [
			[ TOKEN.STRING, 'ex"press' ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'tokenizes booleans and calls', () => {
		expect( pairs( 'if(true, false, 0)' ) ).toEqual( [
			[ TOKEN.IDENT, 'if' ],
			[ TOKEN.LPAREN, '(' ],
			[ TOKEN.BOOLEAN, true ],
			[ TOKEN.COMMA, ',' ],
			[ TOKEN.BOOLEAN, false ],
			[ TOKEN.COMMA, ',' ],
			[ TOKEN.NUMBER, 0 ],
			[ TOKEN.RPAREN, ')' ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'rejects an unterminated variable', () => {
		expect( () => tokenize( '{room_count' ) ).toThrow( ExpressionError );
	} );

	it( 'reports the code slug and position of an unexpected character', () => {
		try {
			tokenize( '1 # 2' );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'unexpected_character' );
			expect( error.position ).toBe( 2 );
		}
	} );

	it( 'rejects a malformed number', () => {
		try {
			tokenize( '1.2.3' );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'malformed_number' );
		}
	} );
} );
