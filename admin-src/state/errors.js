export const EMPTY_INDEX = Object.freeze( { byPath: new Map(), paths: Object.freeze( [] ) } );

export function indexErrors( errors ) {
	if ( ! Array.isArray( errors ) ) {
		return EMPTY_INDEX;
	}

	const byPath = new Map();

	errors.forEach( ( error ) => {
		if ( ! error || typeof error.path !== 'string' ) {
			return;
		}

		const existing = byPath.get( error.path );

		if ( existing ) {
			existing.push( error );
		} else {
			byPath.set( error.path, [ error ] );
		}
	} );

	byPath.forEach( ( list ) => Object.freeze( list ) );

	return Object.freeze( { byPath, paths: Object.freeze( Array.from( byPath.keys() ) ) } );
}

export function errorsFor( index, path ) {
	return index.byPath.get( path ) || [];
}

/**
 * Prefiks YALNIZ seqment sərhədində uyğun gəlir. Sadə `startsWith`
 * işlədilsəydi, `fields.room` prefiksi `fields.room_count.label`
 * xətasını tutardı və builder nişanı SƏHV sahənin üstünə qoyardı.
 */
export function hasErrorsUnder( index, prefix ) {
	if ( prefix === '' ) {
		return index.paths.length > 0;
	}

	return index.paths.some(
		( path ) => path === prefix || path.startsWith( `${ prefix }.` )
	);
}
