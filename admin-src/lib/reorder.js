function swap( list, a, b ) {
	const next = list.slice();

	next[ a ] = list[ b ];
	next[ b ] = list[ a ];

	return next;
}

export function moveUp( list, index ) {
	if ( index <= 0 || index >= list.length ) {
		return list;
	}

	return swap( list, index, index - 1 );
}

export function moveDown( list, index ) {
	if ( index < 0 || index >= list.length - 1 ) {
		return list;
	}

	return swap( list, index, index + 1 );
}
