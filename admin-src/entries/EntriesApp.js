import { useCallback, useEffect, useRef, useState } from '@wordpress/element';

import EntriesListScreen from './EntriesListScreen';
import EntryDetailScreen from './EntryDetailScreen';
import { buildSearch, parseState } from './urlState';
import useAnnouncer from './useAnnouncer';

/**
 * Entries ekranının kiçik router-i (yeni spec §2.3). Vəziyyətin mənbəyi URL-dir:
 * filtr/sıralama/səhifə `replaceState` (geri düyməsini doldurmur), detal açma və
 * bağlama `pushState` ("geri" siyahıya qaytarır), `popstate` URL-i yenidən oxuyur.
 */
export default function EntriesApp( { config } ) {
	const [ state, setState ] = useState( () => parseState( window.location.search ) );
	const [ navigation, setNavigation ] = useState( 0 );
	// Səhifə ölçüsü URL-də deyil (D1), ona görə siyahı ekranının yox, router-in
	// vəziyyətidir (R6): detaldan qayıdanda yeni mount olan siyahı istifadəçinin son
	// seçimini göndərir, səhifə yüklənəndəki köhnə `config.perPage`-i yox.
	const [ perPage, setPerPage ] = useState( () => config.perPage || 20 );
	const stateRef = useRef( state );
	const liveRef = useRef( null );
	const announce = useAnnouncer( liveRef );

	stateRef.current = state;

	useEffect( () => {
		// Etibarsız və yad parametrlər ünvandan silinir: kopyalanan link ekranda görünəni desin.
		window.history.replaceState( window.history.state, '', buildSearch( stateRef.current ) );

		function onPopState() {
			const next = parseState( window.location.search );

			// Eyni səhifədəki `#` linki (WP-nin "Skip to main content" → `#wpbody-content`)
			// də popstate göndərir: marşrut dəyişməyibsə ekran yenidən qurulmur —
			// siyahı təkrar yüklənmir, seçim itmir, fokus yerindən oynamır.
			if ( buildSearch( next ) === buildSearch( stateRef.current ) ) {
				return;
			}

			stateRef.current = next;
			setState( next );
			setNavigation( ( count ) => count + 1 );
		}

		window.addEventListener( 'popstate', onPopState );

		return () => window.removeEventListener( 'popstate', onPopState );
	}, [] );

	const commit = useCallback( ( patch, mode ) => {
		const next = { ...stateRef.current, ...patch };

		if ( mode === 'push' ) {
			window.history.pushState( null, '', buildSearch( next ) );
		} else {
			window.history.replaceState( null, '', buildSearch( next ) );
		}

		stateRef.current = next;
		setState( next );
	}, [] );

	const changeList = useCallback( ( patch ) => commit( patch, 'replace' ), [ commit ] );

	const navigate = useCallback(
		( patch, mode ) => {
			setNavigation( ( count ) => count + 1 );
			commit( patch, mode );
		},
		[ commit ]
	);

	const focusOnMount = navigation > 0;

	return (
		<>
			<div className="quoteform_entries__live" ref={ liveRef } />
			{ state.entry === null ? (
				<EntriesListScreen
					key={ `list-${ navigation }` }
					config={ config }
					filters={ state.filters }
					paged={ state.paged }
					perPage={ perPage }
					onPerPage={ setPerPage }
					onChange={ changeList }
					onOpen={ ( id ) => navigate( { entry: id }, 'push' ) }
					announce={ announce }
					focusOnMount={ focusOnMount }
				/>
			) : (
				<EntryDetailScreen
					key={ `entry-${ state.entry }-${ navigation }` }
					id={ state.entry }
					filters={ state.filters }
					config={ config }
					backHref={ buildSearch( { ...state, entry: null } ) }
					onBack={ () => navigate( { entry: null }, 'push' ) }
					onNavigate={ ( id ) => navigate( { entry: id }, 'push' ) }
					onDeleted={ () => navigate( { entry: null }, 'replace' ) }
					announce={ announce }
					focusOnMount={ focusOnMount }
				/>
			) }
		</>
	);
}
