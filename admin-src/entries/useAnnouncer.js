import { useCallback, useEffect, useRef } from '@wordpress/element';

import { createAnnouncer } from '../../frontend-src/dom/announce';

/**
 * Entries ekranının YEGANƏ canlı sahəsi — ziyarətçi formasındakı ilə eyni
 * `createAnnouncer` (kopya deyil). Qaytarılan funksiya stabildir.
 */
export default function useAnnouncer( containerRef ) {
	const announcerRef = useRef( null );

	useEffect( () => {
		const announcer = createAnnouncer( containerRef.current );

		announcerRef.current = announcer;

		return () => {
			announcer.destroy();
			announcerRef.current = null;
		};
	}, [ containerRef ] );

	return useCallback( ( message, options ) => {
		if ( announcerRef.current ) {
			announcerRef.current.announce( message, options );
		}
	}, [] );
}
