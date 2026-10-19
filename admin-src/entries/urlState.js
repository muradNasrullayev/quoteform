import { filterParams, normaliseFilters } from './filters';

export const PAGE_SLUG = 'quoteform-entries';

// Filtr id-ləri ilə eyni: 15 rəqəmə qədər (JS Number dəqiq saxlayır).
const POSITIVE = /^[1-9]\d{0,14}$/;

/**
 * URL → ekran vəziyyəti. `Object.fromEntries` təkrar parametrdə SONUNCUNU götürür —
 * PHP `$_GET` də belədir, ona görə eksport linki ekranla eyni filtri görür.
 */
export function parseState( search ) {
	const params = Object.fromEntries( new URLSearchParams( search ) );

	return {
		filters: normaliseFilters( params ),
		paged: POSITIVE.test( params.paged || '' ) ? Number( params.paged ) : 1,
		entry: POSITIVE.test( params.entry || '' ) ? Number( params.entry ) : null,
	};
}

export function buildSearch( { filters, paged, entry } ) {
	const search = new URLSearchParams( { page: PAGE_SLUG, ...filterParams( filters ) } );

	if ( paged > 1 ) {
		search.set( 'paged', String( paged ) );
	}

	if ( entry !== null && entry !== undefined ) {
		search.set( 'entry', String( entry ) );
	}

	return `?${ search.toString() }`;
}

/**
 * Keçidlər əsl `href` daşıyır (yeni tabda açmaq üçün); yalnız adi sol klik
 * səhifə daxilində (history) açılır.
 */
export function isPlainClick( event ) {
	return event.button === 0 && ! event.metaKey && ! event.ctrlKey && ! event.shiftKey && ! event.altKey;
}
