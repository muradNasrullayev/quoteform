function sameValue( left, right ) {
	if ( Array.isArray( left ) && Array.isArray( right ) ) {
		return left.length === right.length && left.every( ( item, index ) => item === right[ index ] );
	}

	return left === right;
}

export function createState( schema ) {
	const fields = schema.fields || {};
	const values = {};
	const subscribers = new Set();

	Object.keys( fields ).forEach( ( key ) => {
		const fallback = Array.isArray( fields[ key ].default ) ? [ ...fields[ key ].default ] : fields[ key ].default;

		values[ key ] = fallback === undefined ? '' : fallback;
	} );

	const get = () => ( { ...values } );

	return {
		get,
		set( key, value ) {
			if ( sameValue( values[ key ], value ) ) {
				return;
			}

			values[ key ] = value;
			subscribers.forEach( ( subscriber ) => subscriber( get() ) );
		},
		subscribe( subscriber ) {
			subscribers.add( subscriber );

			return () => subscribers.delete( subscriber );
		},
	};
}
