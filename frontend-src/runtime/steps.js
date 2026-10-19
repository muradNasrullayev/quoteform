export function visibleSteps( schema, visibility ) {
	return ( schema.steps || [] ).filter( ( step ) => visibility.steps.has( step.key ) );
}

export function stepPosition( steps, currentKey ) {
	return {
		index: steps.findIndex( ( step ) => step.key === currentKey ),
		total: steps.length,
	};
}

export function settleStep( schema, steps, currentKey ) {
	if ( ! steps.length ) {
		return null;
	}

	if ( stepPosition( steps, currentKey ).index > -1 ) {
		return currentKey;
	}

	const order = Array.isArray( schema.steps ) ? schema.steps : [];
	const at = ( key ) => order.findIndex( ( step ) => step.key === key );
	const earlier = steps.filter( ( step ) => at( step.key ) < at( currentKey ) );

	return earlier.length ? earlier[ earlier.length - 1 ].key : steps[ 0 ].key;
}
