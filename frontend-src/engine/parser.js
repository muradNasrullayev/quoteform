import { ExpressionError } from './errors';
import { TOKEN, tokenize } from './lexer';

// PHP Parser::PRECEDENCE ilə eyni.
const PRECEDENCE = {
	'||': 1,
	'&&': 2,
	'==': 3,
	'!=': 3,
	'>': 3,
	'<': 3,
	'>=': 3,
	'<=': 3,
	'+': 4,
	'-': 4,
	'*': 5,
	'/': 5,
	'%': 5,
};

export function parse( source ) {
	const tokens = tokenize( source );
	let index = 0;

	const current = () => tokens[ index ];

	const expect = ( type ) => {
		const token = current();

		if ( token.type !== type ) {
			throw new ExpressionError(
				'unexpected_token',
				`Expected ${ type } but found ${ token.type }.`,
				token.position,
				{ expected: type, found: token.type }
			);
		}

		index++;

		return token;
	};

	const parseExpression = ( minimumPrecedence ) => {
		let left = parseUnary();

		for (;;) {
			const token = current();

			if ( token.type !== TOKEN.OPERATOR || ! ( token.value in PRECEDENCE ) ) {
				break;
			}

			const precedence = PRECEDENCE[ token.value ];

			if ( precedence < minimumPrecedence ) {
				break;
			}

			index++;

			left = {
				type: 'binary',
				op: token.value,
				left,
				right: parseExpression( precedence + 1 ),
			};
		}

		return left;
	};

	function parseUnary() {
		const token = current();

		if ( token.type === TOKEN.OPERATOR && ( token.value === '-' || token.value === '!' ) ) {
			index++;

			return { type: 'unary', op: token.value, operand: parseUnary() };
		}

		return parsePrimary();
	}

	function parseCall() {
		const identifier = current();
		index++;

		if ( current().type !== TOKEN.LPAREN ) {
			throw new ExpressionError(
				'unexpected_token',
				`"${ identifier.value }" must be followed by "(".`,
				identifier.position,
				{ name: identifier.value }
			);
		}

		index++;
		const args = [];

		if ( current().type !== TOKEN.RPAREN ) {
			for (;;) {
				args.push( parseExpression( 1 ) );

				if ( current().type === TOKEN.COMMA ) {
					index++;
					continue;
				}

				break;
			}
		}

		expect( TOKEN.RPAREN );

		return { type: 'call', name: identifier.value, args };
	}

	function parsePrimary() {
		const token = current();

		switch ( token.type ) {
			case TOKEN.NUMBER:
				index++;
				return { type: 'number', value: token.value };

			case TOKEN.STRING:
				index++;
				return { type: 'string', value: token.value };

			case TOKEN.BOOLEAN:
				index++;
				return { type: 'boolean', value: token.value };

			case TOKEN.VARIABLE:
				index++;
				return { type: 'var', name: token.value };

			case TOKEN.IDENT:
				return parseCall();

			case TOKEN.LPAREN: {
				index++;
				const node = parseExpression( 1 );
				expect( TOKEN.RPAREN );
				return node;
			}

			default:
				throw new ExpressionError(
					'unexpected_token',
					'Unexpected token in the expression.',
					token.position,
					{ token: token.type }
				);
		}
	}

	if ( current().type === TOKEN.EOF ) {
		throw new ExpressionError( 'empty_expression', 'The expression is empty.', 0 );
	}

	const node = parseExpression( 1 );

	if ( current().type !== TOKEN.EOF ) {
		throw new ExpressionError(
			'unexpected_token',
			'Unexpected input after the end of the expression.',
			current().position
		);
	}

	return node;
}
