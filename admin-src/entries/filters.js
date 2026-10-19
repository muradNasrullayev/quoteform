/**
 * Müraciət filtrlərinin YEGANƏ oxunuşu (JS tərəfi). PHP əkizi
 * `includes/Entries/EntryFilters.php`-dir; ikisi `tests/fixtures/entry-filters.json`
 * ilə kilidlənib — birini dəyişəndə o birini də dəyiş və hər iki dəsti qaçır.
 */

export const DEFAULT_FILTERS = Object.freeze( {
	form: null,
	status: null,
	from: null,
	to: null,
	min: null,
	max: null,
	orderby: 'date',
	order: 'desc',
} );

// JS `$` sətir sonundakı "\n"-dən əvvəl uyğun gəlmir; PHP tərəfi eyni davranış üçün `/D` işlədir.
export const DECIMAL_PATTERN = /^-?\d{1,14}(?:\.\d{1,4})?$/;

const FORM_PATTERN = /^[1-9]\d{0,14}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FILTER_KEYS = [ 'form', 'status', 'from', 'to', 'min', 'max' ];

export function isCalendarDate( value ) {
	const parts = typeof value === 'string' ? DATE_PATTERN.exec( value ) : null;

	if ( ! parts ) {
		return false;
	}

	const year = Number( parts[ 1 ] );
	const month = Number( parts[ 2 ] );
	const day = Number( parts[ 3 ] );

	if ( year < 1000 || month < 1 || month > 12 || day < 1 ) {
		return false;
	}

	// Növbəti ayın 0-cı günü = bu ayın son günü. İl ≥ 1000 olduğu üçün
	// `Date.UTC`-nin 0–99 illərini 1900-ə köçürməsi bura çatmır.
	return day <= new Date( Date.UTC( year, month, 0 ) ).getUTCDate();
}

function text( params, key ) {
	const value = params && Object.prototype.hasOwnProperty.call( params, key ) ? params[ key ] : undefined;

	return typeof value === 'string' ? value : null;
}

export function normaliseFilters( params ) {
	const filters = { ...DEFAULT_FILTERS };
	const form = text( params, 'form' );

	if ( form === 'deleted' ) {
		filters.form = 'deleted';
	} else if ( form !== null && FORM_PATTERN.test( form ) ) {
		filters.form = Number( form );
	}

	const status = text( params, 'status' );

	if ( status === 'new' || status === 'read' ) {
		filters.status = status;
	}

	[ 'from', 'to' ].forEach( ( key ) => {
		const value = text( params, key );

		if ( value !== null && isCalendarDate( value ) ) {
			filters[ key ] = value;
		}
	} );

	[ 'min', 'max' ].forEach( ( key ) => {
		const value = text( params, key );

		if ( value !== null && DECIMAL_PATTERN.test( value ) ) {
			filters[ key ] = value;
		}
	} );

	if ( text( params, 'orderby' ) === 'total' ) {
		filters.orderby = 'total';
	}

	if ( text( params, 'order' ) === 'asc' ) {
		filters.order = 'asc';
	}

	return filters;
}

export function filtersAreActive( filters ) {
	return FILTER_KEYS.some( ( key ) => filters[ key ] !== null );
}

export function filterParams( filters ) {
	const params = {};

	FILTER_KEYS.forEach( ( key ) => {
		if ( filters[ key ] !== null ) {
			params[ key ] = String( filters[ key ] );
		}
	} );

	if ( filters.orderby !== DEFAULT_FILTERS.orderby ) {
		params.orderby = filters.orderby;
	}

	if ( filters.order !== DEFAULT_FILTERS.order ) {
		params.order = filters.order;
	}

	return params;
}
