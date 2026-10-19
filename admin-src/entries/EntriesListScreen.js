import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { deleteEntry, listEntries, updateEntries, updateMatchingEntries } from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import Notice from '../components/Notice';
import { shortcodeFor } from '../lib/shortcode';
import BulkBar from './BulkBar';
import EntriesTable from './EntriesTable';
import { entryErrorMessage } from './errors';
import FilterBar, { exportHref } from './FilterBar';
import { DEFAULT_FILTERS, filterParams, filtersAreActive } from './filters';
import { formatCount, updateMenuBadge } from './menuBadge';
import Pagination from './Pagination';
import { buildSearch } from './urlState';

export function batchMessage( action, affected ) {
	if ( action === 'delete' ) {
		/* translators: %d: number of entries. */
		return sprintf( _n( '%d entry deleted.', '%d entries deleted.', affected, 'quoteform' ), affected );
	}

	if ( action === 'unread' ) {
		/* translators: %d: number of entries. */
		return sprintf( _n( '%d entry marked as unread.', '%d entries marked as unread.', affected, 'quoteform' ), affected );
	}

	/* translators: %d: number of entries. */
	return sprintf( _n( '%d entry marked as read.', '%d entries marked as read.', affected, 'quoteform' ), affected );
}

export default function EntriesListScreen( {
	config,
	filters,
	paged,
	onChange,
	onOpen,
	announce,
	focusOnMount = false,
	onUnread = updateMenuBadge,
	perPage: initialPerPage = config.perPage,
	onPerPage,
} ) {
	const [ data, setData ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ perPage, setPerPage ] = useState( initialPerPage || 20 );
	const [ selected, setSelected ] = useState( () => new Set() );
	const [ busy, setBusy ] = useState( false );
	const [ confirmingId, setConfirmingId ] = useState( null );
	const [ reloadKey, setReloadKey ] = useState( 0 );
	const [ loadFailed, setLoadFailed ] = useState( false );
	// "Filtrə uyğun hamısı" rejimi və ekrandakı siyahının YÜKLƏNDİYİ filtrlər: əməliyyat
	// istifadəçinin gördüyü siyahıya (onun `max_id`-si ilə) aid olmalıdır, yeni seçilən filtrə yox.
	const [ matchAll, setMatchAll ] = useState( false );
	const [ loadedFilters, setLoadedFilters ] = useState( filters );
	// Ekrandakı siyahının sorğu açarı. Cari açardan fərqlidirsə (filtr/sıralama/səhifə/ölçü dəyişib,
	// yeni siyahı hələ gəlməyib) toplu əməliyyatlar ölüdür — render zamanı, sinxron hesablanır.
	const [ loadedKey, setLoadedKey ] = useState( null );

	const headingRef = useRef( null );
	const headerCheckboxRef = useRef( null );
	const keepErrorRef = useRef( false );
	const focusAfterLoadRef = useRef( false );
	const announceCountRef = useRef( false );
	const deleteRefs = useRef( {} );
	const pendingFocusRef = useRef( null );
	const latest = useRef( {} );
	const mountedRef = useRef( false );

	latest.current = { onChange, onUnread, announce, paged };

	// Sabit asılılıq: filtr obyektinin şəxsiyyəti yox, dəyəri dəyişəndə yenidən yüklə.
	const filtersKey = JSON.stringify( filterParams( filters ) );
	const queryKey = JSON.stringify( [ filtersKey, paged, perPage ] );
	const forms = Array.isArray( config.forms ) ? config.forms : [];

	// `await`-dən sonra ekran artıq bağlanmış ola bilər (detala keçid): o zaman nə state,
	// nə elan, nə menyu nişanı yenilənir.
	useEffect( () => {
		mountedRef.current = true;

		return () => {
			mountedRef.current = false;
		};
	}, [] );

	useEffect( () => {
		if ( focusOnMount ) {
			headingRef.current?.focus();
		}
	}, [] ); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect( () => {
		// Effekt təmizlənəndə (yeni filtr/səhifə və ya ekran bağlananda) bu sorğunun
		// cavabı atılır: yavaş köhnə cavab yeni siyahının üstünə yazılmır.
		let current = true;
		const requestKey = JSON.stringify( [ filtersKey, paged, perPage ] );

		setLoading( true );
		// Filtr, sıralama, səhifə, səhifə ölçüsü və ya yenidən yükləmə: "hamısı" rejimi dərhal bitir,
		// yeni siyahı gəlməmiş belə (sətirlərin seçimi isə yeni siyahı gələndə sıfırlanır).
		setMatchAll( false );

		listEntries( { ...filterParams( filters ), page: paged, per_page: perPage } ).then(
			( result ) => {
				if ( ! current ) {
					return;
				}

				setData( result );
				setLoadedFilters( filters );
				setLoadedKey( requestKey );

				// "Siyahı dəyişdi" xəbərdarlığı özünün başlatdığı yenidən yükləmədən sağ çıxır.
				if ( keepErrorRef.current ) {
					keepErrorRef.current = false;
				} else {
					setError( null );
				}

				setLoadFailed( false );
				setSelected( new Set() );
				setConfirmingId( null );
				setLoading( false );
				latest.current.onUnread( result.unread );

				if ( result.page !== latest.current.paged ) {
					latest.current.onChange( { paged: result.page } );
				}

				if ( focusAfterLoadRef.current ) {
					focusAfterLoadRef.current = false;
					headingRef.current?.focus();
				}

				if ( announceCountRef.current ) {
					announceCountRef.current = false;
					latest.current.announce(
						/* translators: %d: number of entries. */
						sprintf( _n( '%d entry found.', '%d entries found.', result.total, 'quoteform' ), result.total )
					);
				}
			},
			( caught ) => {
				if ( ! current ) {
					return;
				}

				// Uğursuz yükləmə öz niyyətlərini də aparır: sonrakı (əlaqəsiz) yükləmə
				// fokusu h1-ə çəkməməli və "N found" elan etməməlidir.
				focusAfterLoadRef.current = false;
				announceCountRef.current = false;
				keepErrorRef.current = false;
				setError( caught );
				setLoadFailed( true );
				setLoading( false );
				latest.current.announce( entryErrorMessage( caught ), { force: true } );
			}
		);

		return () => {
			current = false;
		};
	}, [ filtersKey, paged, perPage, reloadKey ] ); // eslint-disable-line react-hooks/exhaustive-deps

	// `disabled` düymə fokus ala bilmir: fokus `busy` bitəndən SONRA qaytarılır.
	useEffect( () => {
		if ( ! busy && pendingFocusRef.current ) {
			pendingFocusRef.current();
			pendingFocusRef.current = null;
		}
	}, [ busy ] );

	function reload() {
		focusAfterLoadRef.current = true;
		setReloadKey( ( key ) => key + 1 );
	}

	// Sorğunu dəyişən hər əməliyyat seçimi DƏRHAL (eyni handler-də) atır: köhnə sətirlər yeni
	// siyahı gələnə qədər ekranda qalsa da, onlara və ya köhnə filtrə toplu əməliyyat getmir.
	function resetSelection() {
		setMatchAll( false );
		setSelected( new Set() );
	}

	function handleFilters( next ) {
		// Yalnız sorğu həqiqətən dəyişəndə: yoxsa bayraq qalıb sonrakı səhifə keçidində səslənərdi.
		if ( JSON.stringify( filterParams( next ) ) !== filtersKey ) {
			announceCountRef.current = true;
		}

		resetSelection();
		onChange( { filters: next, paged: 1 } );
	}

	function handleSort( column ) {
		const order = filters.orderby === column && filters.order === 'desc' ? 'asc' : 'desc';

		resetSelection();
		onChange( { filters: { ...filters, orderby: column, order }, paged: 1 } );
	}

	function handlePage( page ) {
		if ( page === paged || page < 1 ) {
			return;
		}

		focusAfterLoadRef.current = true;
		resetSelection();
		onChange( { paged: page } );
	}

	function handlePerPage( value ) {
		resetSelection();
		setPerPage( value );

		// Router seçimi saxlayır (R6): ekran yenidən mount olanda (detaldan qayıdış)
		// səhifə yüklənəndəki köhnə `config.perPage` serverə göndərilib yeni seçimi silmir.
		if ( onPerPage ) {
			onPerPage( value );
		}

		if ( paged !== 1 ) {
			onChange( { paged: 1 } );
		}
	}

	function clearFilters() {
		handleFilters( { ...DEFAULT_FILTERS, orderby: filters.orderby, order: filters.order } );
	}

	function toggle( id ) {
		setMatchAll( false );
		setSelected( ( current ) => {
			const next = new Set( current );

			if ( next.has( id ) ) {
				next.delete( id );
			} else {
				next.add( id );
			}

			return next;
		} );
	}

	function toggleAll( checked ) {
		setMatchAll( false );
		setSelected( checked && data ? new Set( data.items.map( ( item ) => item.id ) ) : new Set() );
	}

	function selectAllMatching() {
		setMatchAll( true );
		announce(
			sprintf(
				/* translators: %d: number of entries matching the current filter. */
				_n( 'All %d entry selected.', 'All %d entries selected.', data.total, 'quoteform' ),
				data.total
			)
		);
	}

	function clearAllMatching() {
		// R12: Gmail kimi — hər şey seçimdən çıxır; panel yox olur, fokus başlıq checkbox-una.
		resetSelection();
		headerCheckboxRef.current?.focus();
	}

	async function runBatch( action ) {
		const ids = Array.from( selected );
		const scoped = matchAll && data && Number.isInteger( data.max_id );

		if ( ids.length === 0 || busy || stale || ( matchAll && ! scoped ) ) {
			return;
		}

		// Əməliyyatı başladan düymə (BulkBar düymələri `disabled` olmur, fokus adətən yerində qalır).
		const trigger = document.activeElement;

		setBusy( true );

		try {
			const outcome = scoped
				? await updateMatchingEntries( action, loadedFilters, data.max_id, data.total )
				: await updateEntries( action, ids );

			if ( ! mountedRef.current ) {
				return;
			}

			onUnread( outcome.unread );
			announce( batchMessage( action, outcome.affected ), { force: true } );
			reload();
		} catch ( caught ) {
			if ( ! mountedRef.current ) {
				return;
			}

			setError( caught );
			setLoadFailed( false );
			announce( entryErrorMessage( caught ), { force: true } );

			if ( caught && caught.code === 'qform_list_changed' ) {
				// Server heç nəyə toxunmayıb: yeni siyahı göstərilir, istifadəçi yenidən baxıb qərar verir.
				setMatchAll( false );
				keepErrorRef.current = true;
				reload();
				return;
			}

			pendingFocusRef.current = () => {
				const lost = ! document.activeElement || document.activeElement === document.body;

				if ( lost && trigger && trigger.isConnected ) {
					trigger.focus();
				}
			};
		} finally {
			if ( mountedRef.current ) {
				setBusy( false );
			}
		}
	}

	function cancelDelete( item ) {
		setConfirmingId( null );
		deleteRefs.current[ item.id ]?.focus();
	}

	async function confirmDelete( item ) {
		setConfirmingId( null );
		// Təsdiq paneli yox olur: fokus cərgənin Delete düyməsinə (o `aria-disabled` olsa da,
		// `disabled` deyil, fokus ala bilir — R7).
		deleteRefs.current[ item.id ]?.focus();
		setBusy( true );

		try {
			const outcome = await deleteEntry( item.id );

			if ( ! mountedRef.current ) {
				return;
			}

			onUnread( outcome.unread );
			/* translators: %d: entry number. */
			announce( sprintf( __( 'Entry #%d deleted.', 'quoteform' ), item.id ), { force: true } );
			reload();
		} catch ( caught ) {
			if ( ! mountedRef.current ) {
				return;
			}

			setError( caught );
			setLoadFailed( false );
			announce( entryErrorMessage( caught ), { force: true } );
			pendingFocusRef.current = () => deleteRefs.current[ item.id ]?.focus();
		} finally {
			if ( mountedRef.current ) {
				setBusy( false );
			}
		}
	}

	const stale = loading || loadedKey !== queryKey;
	const pageComplete = !! data && data.items.length > 0 && data.items.every( ( item ) => selected.has( item.id ) );

	const formHref =
		config.canManageForms && config.builderUrl
			? ( formId ) => `${ config.builderUrl }&form=${ formId }`
			: () => null;

	return (
		<div className="quoteform_list quoteform_entries">
			<div className="quoteform_list__header">
				<div className="quoteform_entries__title">
					<h1 ref={ headingRef } tabIndex={ -1 }>
						{ __( 'Entries', 'quoteform' ) }
					</h1>
					{ data && (
						<span className="quoteform_entries__count">
							{ sprintf(
								/* translators: %s: number of entries. */
								_n( '%s entry', '%s entries', data.total, 'quoteform' ),
								formatCount( data.total )
							) }
						</span>
					) }
				</div>
				{ config.canExport && (
					<a
						className="quoteform_button quoteform_button--secondary"
						href={ exportHref( config.exportUrl, filters ) }
					>
						{ __( 'Export CSV', 'quoteform' ) }
					</a>
				) }
			</div>

			<FilterBar
				forms={ forms }
				hasDeletedForms={ !! config.hasDeletedForms }
				filters={ filters }
				onChange={ handleFilters }
			/>

			{ error && (
				<Notice status="error" live={ false } onDismiss={ () => setError( null ) }>
					{ entryErrorMessage( error ) }
				</Notice>
			) }

			{ error && loadFailed && (
				// Köhnə sətirlər ekranda qalsa belə: yükləmə uğursuz olubsa təkrar cəhd təklif olunur.
				<Button onClick={ reload }>{ __( 'Try again', 'quoteform' ) }</Button>
			) }

			<BulkBar
				count={ selected.size }
				canDelete={ !! config.canDelete }
				busy={ busy }
				onRead={ () => runBatch( 'read' ) }
				onUnread={ () => runBatch( 'unread' ) }
				onDelete={ () => runBatch( 'delete' ) }
				pageComplete={ pageComplete }
				matchTotal={ data ? data.total : 0 }
				matching={ matchAll }
				onMatchAll={ selectAllMatching }
				onClearMatch={ clearAllMatching }
				inert={ stale }
			/>

			{ loading && ! data && ! error && (
				<p className="quoteform_card quoteform_empty">{ __( 'Loading entries…', 'quoteform' ) }</p>
			) }

			{ data && data.items.length === 0 && filtersAreActive( filters ) && (
				<Card className="quoteform_empty">
					<p>{ __( 'No entries match these filters.', 'quoteform' ) }</p>
					<Button onClick={ clearFilters }>{ __( 'Clear filters', 'quoteform' ) }</Button>
				</Card>
			) }

			{ data && data.items.length === 0 && ! filtersAreActive( filters ) && (
				<Card className="quoteform_empty">
					<span className="dashicons dashicons-email-alt" aria-hidden="true" />
					<p>{ __( 'No entries yet. They appear here when visitors send one of your forms.', 'quoteform' ) }</p>
					{ forms.length > 0 && (
						<p>
							{ sprintf(
								/* translators: %s: a shortcode such as [quoteform id="12"]. */
								__( 'Put a form on a page with its shortcode, for example %s.', 'quoteform' ),
								shortcodeFor( forms[ 0 ].id )
							) }
						</p>
					) }
				</Card>
			) }

			{ data && data.items.length > 0 && (
				<Card aria-busy={ loading ? 'true' : undefined }>
					<EntriesTable
						items={ data.items }
						filters={ filters }
						onSort={ handleSort }
						selected={ selected }
						onToggle={ toggle }
						onToggleAll={ toggleAll }
						entryHref={ ( id ) => buildSearch( { filters, paged, entry: id } ) }
						onOpen={ onOpen }
						formHref={ formHref }
						canDelete={ !! config.canDelete }
						confirmingId={ confirmingId }
						onAskDelete={ ( item ) => setConfirmingId( item.id ) }
						onConfirmDelete={ confirmDelete }
						onCancelDelete={ cancelDelete }
						deleteButtonRef={ ( id, element ) => {
							deleteRefs.current[ id ] = element;
						} }
						busy={ busy }
						headerCheckboxRef={ headerCheckboxRef }
					/>
				</Card>
			) }

			{ data && data.total > 0 && (
				<Pagination
					page={ data.page }
					pages={ data.pages }
					perPage={ perPage }
					onPage={ handlePage }
					onPerPage={ handlePerPage }
				/>
			) }
		</div>
	);
}
