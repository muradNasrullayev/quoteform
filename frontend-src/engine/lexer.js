import { ExpressionError } from './errors';

export const TOKEN = {
	NUMBER: 'number',
	STRING: 'string',
	BOOLEAN: 'boolean',
	VARIABLE: 'variable',
	IDENT: 'ident',
	OPERATOR: 'operator',
	LPAREN: 'lparen',
	RPAREN: 'rparen',
	COMMA: 'comma',
	EOF: 'eof',
};

// İki simvollu operatorlar birsimvollulardan ƏVVƏL yoxlanılır (PHP Lexer::OPERATORS ilə eyni sıra).
const OPERATORS = [ '==', '!=', '>=', '<=', '&&', '||', '>', '<', '+', '-', '*', '/', '%', '!' ];

const isDigit = ( character ) => character >= '0' && character <= '9';

const isIdentifierStart = ( character ) =>
	character === '_' ||
	( character >= 'a' && character <= 'z' ) ||
	( character >= 'A' && character <= 'Z' );

const isIdentifierPart = ( character ) => isIdentifierStart( character ) || isDigit( character );

export function tokenize( source ) {
	const length = source.length;
	const tokens = [];
	let position = 0;

	const peek = ( offset ) => ( position + offset < length ? source[ position + offset ] : '' );

	const readVariable = () => {
		const start = position;
		position++;
		let name = '';

		while ( position < length && source[ position ] !== '}' ) {
			const character = source[ position ];

			if ( ! isIdentifierPart( character ) && character !== '.' ) {
				throw new ExpressionError(
					'malformed_variable',
					`Invalid character "${ character }" in a variable name.`,
					position,
					{ character }
				);
			}

			name += character;
			position++;
		}

		if ( position >= length ) {
			throw new ExpressionError( 'unterminated_variable', 'A variable is missing its closing brace.', start );
		}

		position++;

		if ( name === '' ) {
			throw new ExpressionError( 'empty_variable', 'A variable name cannot be empty.', start );
		}

		return { type: TOKEN.VARIABLE, value: name, position: start };
	};

	const readString = ( quote ) => {
		const start = position;
		position++;
		let value = '';

		while ( position < length ) {
			const character = source[ position ];

			if ( character === '\\' && position + 1 < length ) {
				const next = source[ position + 1 ];

				if ( next === quote || next === '\\' ) {
					value += next;
					position += 2;
					continue;
				}
			}

			if ( character === quote ) {
				position++;
				return { type: TOKEN.STRING, value, position: start };
			}

			value += character;
			position++;
		}

		throw new ExpressionError( 'unterminated_string', 'A text value is missing its closing quote.', start );
	};

	const readNumber = () => {
		const start = position;
		let raw = '';
		let hasPoint = false;

		while ( position < length ) {
			const character = source[ position ];

			if ( isDigit( character ) ) {
				raw += character;
				position++;
				continue;
			}

			if ( character === '.' ) {
				if ( hasPoint ) {
					throw new ExpressionError( 'malformed_number', 'A number cannot contain two decimal points.', position );
				}

				hasPoint = true;
				raw += character;
				position++;
				continue;
			}

			break;
		}

		return { type: TOKEN.NUMBER, value: parseFloat( raw ), position: start };
	};

	const readIdentifier = () => {
		const start = position;
		let name = '';

		while ( position < length && isIdentifierPart( source[ position ] ) ) {
			name += source[ position ];
			position++;
		}

		const lowercase = name.toLowerCase();

		if ( lowercase === 'true' ) {
			return { type: TOKEN.BOOLEAN, value: true, position: start };
		}

		if ( lowercase === 'false' ) {
			return { type: TOKEN.BOOLEAN, value: false, position: start };
		}

		return { type: TOKEN.IDENT, value: lowercase, position: start };
	};

	const readOperator = () => {
		for ( const operator of OPERATORS ) {
			if ( source.substr( position, operator.length ) === operator ) {
				const token = { type: TOKEN.OPERATOR, value: operator, position };
				position += operator.length;
				return token;
			}
		}

		return null;
	};

	while ( position < length ) {
		const character = source[ position ];

		if ( character === ' ' || character === '\t' || character === '\n' || character === '\r' ) {
			position++;
			continue;
		}

		if ( character === '{' ) {
			tokens.push( readVariable() );
			continue;
		}

		if ( character === '"' || character === "'" ) {
			tokens.push( readString( character ) );
			continue;
		}

		if ( isDigit( character ) || ( character === '.' && isDigit( peek( 1 ) ) ) ) {
			tokens.push( readNumber() );
			continue;
		}

		if ( isIdentifierStart( character ) ) {
			tokens.push( readIdentifier() );
			continue;
		}

		if ( character === '(' ) {
			tokens.push( { type: TOKEN.LPAREN, value: '(', position: position++ } );
			continue;
		}

		if ( character === ')' ) {
			tokens.push( { type: TOKEN.RPAREN, value: ')', position: position++ } );
			continue;
		}

		if ( character === ',' ) {
			tokens.push( { type: TOKEN.COMMA, value: ',', position: position++ } );
			continue;
		}

		const operator = readOperator();

		if ( operator !== null ) {
			tokens.push( operator );
			continue;
		}

		throw new ExpressionError(
			'unexpected_character',
			`Unexpected character "${ character }".`,
			position,
			{ character }
		);
	}

	tokens.push( { type: TOKEN.EOF, value: null, position } );

	return tokens;
}
