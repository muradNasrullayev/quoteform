import { ExpressionError } from './errors';
import { evaluate } from './evaluator';
import { parse } from './parser';

const cache = new Map();

export function compileExpression( source ) {
	if ( ! cache.has( source ) ) {
		cache.set( source, parse( source ) );
	}

	return cache.get( source );
}

export function evaluateExpression( source, variables ) {
	return evaluate( compileExpression( source ), variables );
}

function collectVariables( node, names ) {
	switch ( node.type ) {
		case 'var':
			names.push( node.name );
			return;

		case 'unary':
			collectVariables( node.operand, names );
			return;

		case 'binary':
			collectVariables( node.left, names );
			collectVariables( node.right, names );
			return;

		case 'call':
			node.args.forEach( ( argument ) => collectVariables( argument, names ) );
			return;

		default:
	}
}

export function expressionVariables( source ) {
	const names = [];

	collectVariables( compileExpression( source ), names );

	return [ ...new Set( names ) ];
}

export function clearExpressionCache() {
	cache.clear();
}

export function expressionCacheSize() {
	return cache.size;
}

export { ExpressionError };
