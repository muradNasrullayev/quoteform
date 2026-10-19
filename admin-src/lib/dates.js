function formatterFor( locale ) {
	const options = { dateStyle: 'medium', timeStyle: 'short' };

	try {
		return new Intl.DateTimeFormat( locale || undefined, options );
	} catch ( error ) {
		// Tanınmayan locale teqi (`RangeError`) — brauzerin öz dilinə düş.
		return new Intl.DateTimeFormat( undefined, options );
	}
}

const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * REST `modified` `post_modified_gmt`-dən gəlir, amma ofsetsiz
 * (`Y-m-d\TH:i:s`). Ofsetsiz ISO sətrini `Date` yerli vaxt kimi oxuyur —
 * ona görə zona yoxdursa `Z` əlavə olunur. `<time dateTime>` də bunu işlədir.
 */
export function toUtcIso( raw ) {
	if ( typeof raw !== 'string' || raw === '' || HAS_ZONE.test( raw ) ) {
		return raw;
	}

	return `${ raw }Z`;
}

/**
 * REST `modified`-i oxunaqlı tarixə çevirir. Oxuya bilmədiyini olduğu kimi
 * qaytarır: "Invalid Date" yazmaqdansa xam dəyəri göstərmək yaxşıdır.
 */
export function formatModified( raw, locale ) {
	if ( typeof raw !== 'string' || raw === '' ) {
		return raw === null || raw === undefined ? '' : String( raw );
	}

	const date = new Date( toUtcIso( raw ) );

	if ( Number.isNaN( date.getTime() ) ) {
		return raw;
	}

	return formatterFor( locale ).format( date );
}
