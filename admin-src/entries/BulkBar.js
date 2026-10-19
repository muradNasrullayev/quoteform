import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import RemoveConfirm from '../components/RemoveConfirm';

/**
 * Toplu əməliyyat paneli. Gmail üslubu: səhifədəki hər sətir seçilib və filtrdə daha çox
 * müraciət varsa (`pageComplete` + `matchTotal > count`), "filtrə uyğun hamısını seç" təklifi
 * görünür; `matching` rejimində düymələr bütün filtrə təsir edir (EntriesListScreen qərar verir).
 */
export default function BulkBar( {
	count,
	canDelete,
	busy,
	onRead,
	onUnread,
	onDelete,
	pageComplete = false,
	matchTotal = 0,
	matching = false,
	onMatchAll = () => {},
	onClearMatch = () => {},
	inert = false,
} ) {
	const [ confirming, setConfirming ] = useState( false );
	const deleteRef = useRef( null );
	const offerRef = useRef( null );
	const clearRef = useRef( null );
	// Təklif düyməsi basılanda o yox olur və yerinə "Clear selection" gəlir: fokus ona keçir.
	// (Clear seçimi tam sıfırlayır, panel yox olur — fokusu ekran başlıq checkbox-una verir.)
	const swapFocusRef = useRef( false );
	// `inert`: ekrandakı siyahı artıq sorğuya uyğun deyil (yeni siyahı yüklənir). Köhnə sətirlərə
	// və ya köhnə filtrə əməliyyat getməsin deyə panel məşğul kimi davranır.
	const blocked = busy || inert;

	// `disabled` fokuslu düyməni fokussuz qoyur (fokus `<body>`-yə düşür). Ona görə məşğul
	// halda düymələr `aria-disabled` olur və kliklər sadəcə nəzərə alınmır.
	function guarded( action ) {
		return () => {
			if ( ! blocked ) {
				action();
			}
		};
	}

	function swapping( action ) {
		return guarded( () => {
			swapFocusRef.current = true;
			action();
		} );
	}

	const busyProps = { 'aria-disabled': blocked ? 'true' : undefined };
	const offer = ! matching && pageComplete && matchTotal > count;

	// Təsdiq açıq ikən seçim (və ya onun əhatəsi) dəyişibsə, köhnə saylı sual cavablandırılmamalıdır.
	useEffect( () => {
		setConfirming( false );
	}, [ count, matching ] );

	useEffect( () => {
		if ( inert ) {
			setConfirming( false );
		}
	}, [ inert ] );

	useEffect( () => {
		if ( ! swapFocusRef.current ) {
			return;
		}

		swapFocusRef.current = false;

		if ( matching ) {
			clearRef.current?.focus();
		}
	}, [ matching ] );

	if ( count === 0 ) {
		return null;
	}

	return (
		<div className="quoteform_entries__bulk" role="group" aria-label={ __( 'Bulk actions', 'quoteform' ) }>
			{ matching ? (
				<span className="quoteform_entries__selected">
					{ sprintf(
						/* translators: %d: number of entries matching the current filter. */
						_n( 'All %d entry selected.', 'All %d entries selected.', matchTotal, 'quoteform' ),
						matchTotal
					) }
				</span>
			) : (
				<span className="quoteform_entries__selected">
					{ sprintf(
						/* translators: %d: number of selected entries. */
						_n( '%d selected', '%d selected', count, 'quoteform' ),
						count
					) }
				</span>
			) }
			<Button onClick={ guarded( onRead ) } { ...busyProps }>
				{ __( 'Mark as read', 'quoteform' ) }
			</Button>
			<Button onClick={ guarded( onUnread ) } { ...busyProps }>
				{ __( 'Mark as unread', 'quoteform' ) }
			</Button>
			{ canDelete && (
				<Button
					variant="danger"
					ref={ deleteRef }
					onClick={ guarded( () => setConfirming( true ) ) }
					{ ...busyProps }
				>
					{ __( 'Delete', 'quoteform' ) }
				</Button>
			) }
			{ offer && (
				<span className="quoteform_entries__scope">
					{ sprintf(
						/* translators: %d: number of entries on the current page, all of them selected. */
						_n( 'All %d entry on this page is selected.', 'All %d entries on this page are selected.', count, 'quoteform' ),
						count
					) }{ ' ' }
					<button
						type="button"
						ref={ offerRef }
						className="quoteform_entries__link"
						onClick={ swapping( onMatchAll ) }
						{ ...busyProps }
					>
						{ sprintf(
							/* translators: %d: number of entries matching the current filter (more than one page). */
							_n( 'Select all %d entry matching this filter', 'Select all %d entries matching this filter', matchTotal, 'quoteform' ),
							matchTotal
						) }
					</button>
				</span>
			) }
			{ matching && (
				<button
					type="button"
					ref={ clearRef }
					className="quoteform_entries__link"
					onClick={ guarded( onClearMatch ) }
					{ ...busyProps }
				>
					{ __( 'Clear selection', 'quoteform' ) }
				</button>
			) }
			{ confirming && (
				<RemoveConfirm
					message={
						matching
							? sprintf(
									/* translators: %d: number of entries matching the current filter. */
									_n(
										'Delete %d entry matching this filter? This cannot be undone.',
										'Delete all %d entries matching this filter? This cannot be undone.',
										matchTotal,
										'quoteform'
									),
									matchTotal
							  )
							: sprintf(
									/* translators: %d: number of selected entries. */
									_n( 'Delete %d entry? This cannot be undone.', 'Delete %d entries? This cannot be undone.', count, 'quoteform' ),
									count
							  )
					}
					confirmLabel={ __( 'Delete permanently', 'quoteform' ) }
					cancelLabel={ __( 'Cancel', 'quoteform' ) }
					onConfirm={ () => {
						setConfirming( false );
						// Təsdiq düyməsi yox olur: fokus sorğu gedərkən (və uğursuz olsa) Delete-də qalsın.
						deleteRef.current?.focus();
						onDelete();
					} }
					onCancel={ () => {
						setConfirming( false );
						deleteRef.current?.focus();
					} }
				/>
			) }
		</div>
	);
}
