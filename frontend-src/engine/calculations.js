import { ExpressionError } from './errors';
import { evaluateExpression, expressionVariables } from './compile';

function buildExpressionMap( calculations ) {
	// PHP tərəfi ilə eyni sıra üçün Map: adi obyekt rəqəmə oxşayan açarları yenidən sıralayır.
	const expressions = new Map();

	calculations.forEach( ( calculation ) => {
		if ( expressions.has( calculation.key ) ) {
			throw new ExpressionError(
				'duplicate_calculation_key',
				`There is more than one calculation called "${ calculation.key }".`,
				0,
				{ key: calculation.key }
			);
		}

		expressions.set( calculation.key, calculation.expression );
	} );

	return expressions;
}

export function orderCalculations( calculations ) {
	const expressions = buildExpressionMap( calculations );
	const keys = [ ...expressions.keys() ];

	const dependencies = new Map();

	expressions.forEach( ( expression, key ) => {
		dependencies.set(
			key,
			expressionVariables( expression ).filter( ( name ) => expressions.has( name ) )
		);
	} );

	const ordered = [];
	const state = new Map();

	const visit = ( key, path ) => {
		const current = state.get( key ) || 'new';

		if ( current === 'done' ) {
			return;
		}

		if ( current === 'visiting' ) {
			const cycle = [ ...path, key ];

			throw new ExpressionError(
				'circular_reference',
				`The calculations reference each other in a loop: ${ cycle.join( ' → ' ) }.`,
				0,
				{ cycle }
			);
		}

		state.set( key, 'visiting' );
		const nextPath = [ ...path, key ];

		dependencies.get( key ).forEach( ( dependency ) => visit( dependency, nextPath ) );

		state.set( key, 'done' );
		ordered.push( key );
	};

	keys.forEach( ( key ) => visit( key, [] ) );

	return ordered;
}

/**
 * QEYD: qaytarılan obyektdəki açarların SIRASI bu mühərrikin kontraktının bir hissəsi DEYİL.
 * Tam ədədə bənzəyən açarlar (məsələn "1", "2") üçün JavaScript obyektləri bu açarları öz
 * aralarında yenidən sıralayır, PHP massivləri isə etmir — buna görə iki dilin nəticə-açar
 * sırası ümumiyyətlə üst-üstə düşməyə bilər. Sıra lazım olduqda `orderCalculations()`-dan
 * (PHP tərəfi: `CalculationGraph::order()`) istifadə et — bu ikisi hər iki dildə eynidir.
 */
export function evaluateAllCalculations( calculations, variables ) {
	const expressions = buildExpressionMap( calculations );

	// `{}` yox, prototipsiz obyekt: adi `{}` "__proto__" açarını exotic setter kimi
	// işlədir, deməli `results['__proto__'] = ...` heç bir "öz" property yaratmır və sonrakı
	// oxuma "unknown_variable" ilə nəticələnir — halbuki eyni açar PHP massivində normal işləyir.
	const results = Object.create( null );

	orderCalculations( calculations ).forEach( ( key ) => {
		results[ key ] = evaluateExpression( expressions.get( key ), { ...variables, ...results } );
	} );

	return results;
}
