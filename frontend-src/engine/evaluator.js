import { ExpressionError } from './errors';
import { callFunction } from './functions';
import { compare, equals, toBool, toNumber } from './values';

export function evaluate( node, variables ) {
	switch ( node.type ) {
		case 'number':
		case 'string':
		case 'boolean':
			return node.value;

		case 'var': {
			if ( Object.prototype.hasOwnProperty.call( variables, node.name ) ) {
				return variables[ node.name ];
			}

			throw new ExpressionError(
				'unknown_variable',
				`There is no field or calculation called "${ node.name }".`,
				0,
				{ name: node.name }
			);
		}

		case 'unary': {
			const operand = evaluate( node.operand, variables );

			return node.op === '-' ? -toNumber( operand ) : ! toBool( operand );
		}

		case 'binary':
			return evaluateBinary( node, variables );

		case 'call':
			return evaluateCall( node, variables );

		default:
			throw new ExpressionError( 'unknown_node', `Unsupported expression node "${ node.type }".` );
	}
}

function evaluateBinary( node, variables ) {
	if ( node.op === '&&' ) {
		return toBool( evaluate( node.left, variables ) ) && toBool( evaluate( node.right, variables ) );
	}

	if ( node.op === '||' ) {
		return toBool( evaluate( node.left, variables ) ) || toBool( evaluate( node.right, variables ) );
	}

	const left = evaluate( node.left, variables );
	const right = evaluate( node.right, variables );

	switch ( node.op ) {
		case '==':
			return equals( left, right );

		case '!=':
			return ! equals( left, right );

		case '>':
			return compare( left, right ) > 0;

		case '<':
			return compare( left, right ) < 0;

		case '>=':
			return compare( left, right ) >= 0;

		case '<=':
			return compare( left, right ) <= 0;

		default:
			break;
	}

	const leftNumber = toNumber( left );
	const rightNumber = toNumber( right );

	switch ( node.op ) {
		case '+':
			return assertFiniteResult( leftNumber + rightNumber );

		case '-':
			return assertFiniteResult( leftNumber - rightNumber );

		case '*':
			return assertFiniteResult( leftNumber * rightNumber );

		case '/':
			if ( rightNumber === 0 ) {
				throw new ExpressionError( 'division_by_zero', 'Cannot divide by zero.' );
			}

			return assertFiniteResult( leftNumber / rightNumber );

		case '%':
			if ( rightNumber === 0 ) {
				throw new ExpressionError( 'division_by_zero', 'Cannot take a remainder with zero.' );
			}

			return assertFiniteResult( leftNumber % rightNumber );

		default:
			throw new ExpressionError( 'unknown_operator', `Unsupported operator "${ node.op }".` );
	}
}

// Overflow finite əməliyyandlardan da yarana bilər. division_by_zero yoxlaması HƏMİŞƏ
// bundan ƏVVƏL işləməlidir ki, `1 / 0` `not_finite` yox, `division_by_zero` olaraq bildirilsin.
function assertFiniteResult( result ) {
	if ( ! Number.isFinite( result ) ) {
		throw new ExpressionError( 'not_finite', 'This number is too large to use in a calculation.' );
	}

	return result;
}

function evaluateCall( node, variables ) {
	if ( node.name === 'if' ) {
		if ( node.args.length !== 3 ) {
			throw new ExpressionError(
				'wrong_argument_count',
				`"if" needs exactly 3 arguments, ${ node.args.length } given.`,
				0,
				{ name: 'if', given: node.args.length, min: 3, max: 3 }
			);
		}

		const condition = toBool( evaluate( node.args[ 0 ], variables ) );

		return evaluate( node.args[ condition ? 1 : 2 ], variables );
	}

	return callFunction(
		node.name,
		node.args.map( ( argument ) => evaluate( argument, variables ) )
	);
}
