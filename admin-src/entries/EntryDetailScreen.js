import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { deleteEntry, getEntry, updateEntries } from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import Notice from '../components/Notice';
import RemoveConfirm from '../components/RemoveConfirm';
import { entryErrorMessage, isNotFound } from './errors';
import { filterParams } from './filters';
import { updateMenuBadge } from './menuBadge';
import { isPlainClick } from './urlState';

export function neighbourLabels( filters ) {
	if ( filters.orderby !== 'date' ) {
		return { previous: __( 'Previous entry', 'quoteform' ), next: __( 'Next entry', 'quoteform' ) };
	}

	return filters.order === 'asc'
		? { previous: __( 'Older entry', 'quoteform' ), next: __( 'Newer entry', 'quoteform' ) }
		: { previous: __( 'Newer entry', 'quoteform' ), next: __( 'Older entry', 'quoteform' ) };
}

// Dəyər həmişə text node-dur (R15). Çoxsətirli mətnin sətir sonlarını
// `.quoteform_entry__value { white-space: pre-wrap }` saxlayır (CSS Task 13).
function Row( { label, children } ) {
	return (
		<div>
			<dt>{ label }</dt>
			<dd className="quoteform_entry__value">{ children }</dd>
		</div>
	);
}

function Answers( { answers } ) {
	return (
		<Card>
			<h2>{ __( 'Answers', 'quoteform' ) }</h2>
			{ answers.length === 0 ? (
				<p>{ __( 'No answers were saved with this entry.', 'quoteform' ) }</p>
			) : (
				<dl className="quoteform_entry__list">
					{ answers.map( ( item ) => (
						<Row key={ item.key } label={ item.label !== '' ? item.label : item.key }>
							{ item.display !== '' ? item.display : '—' }
						</Row>
					) ) }
				</dl>
			) }
		</Card>
	);
}

function Breakdown( { entry } ) {
	const { lines, error } = entry.breakdown;

	return (
		<Card>
			<h2>{ __( 'Price breakdown', 'quoteform' ) }</h2>
			{ error !== null && (
				<p className="quoteform_entry__error">
					{ sprintf(
						/* translators: %s: the calculation error code, e.g. division_by_zero. */
						__( 'The price could not be worked out when this entry was sent (%s).', 'quoteform' ),
						error
					) }
				</p>
			) }
			<table className="quoteform_entry__breakdown">
				<caption className="screen-reader-text">{ __( 'Price breakdown', 'quoteform' ) }</caption>
				<tbody>
					{ lines.map( ( line, index ) => (
						<tr key={ `${ line.key }-${ index }` }>
							<th scope="row">{ line.label !== '' ? line.label : line.key }</th>
							<td>{ line.amount_display !== '' ? line.amount_display : '—' }</td>
						</tr>
					) ) }
				</tbody>
				<tfoot>
					<tr>
						<th scope="row">{ __( 'Total', 'quoteform' ) }</th>
						<td>{ entry.total === null ? '—' : entry.total_display }</td>
					</tr>
				</tfoot>
			</table>
		</Card>
	);
}

function Details( { details } ) {
	return (
		<Card>
			<h2>{ __( 'Details', 'quoteform' ) }</h2>
			<dl className="quoteform_entry__list">
				{ details.ip !== null && <Row label={ __( 'IP address', 'quoteform' ) }>{ details.ip }</Row> }
				<Row label={ __( 'Browser', 'quoteform' ) }>{ details.user_agent !== '' ? details.user_agent : '—' }</Row>
				{ details.user !== null && (
					<Row label={ __( 'User', 'quoteform' ) }>
						{ details.user.url ? <a href={ details.user.url }>{ details.user.name }</a> : details.user.name }
					</Row>
				) }
				<Row label={ __( 'Submitted', 'quoteform' ) }>
					<time dateTime={ details.submitted.iso } title={ details.submitted.full }>
						{ details.submitted.display }
					</time>
				</Row>
			</dl>
		</Card>
	);
}

export default function EntryDetailScreen( {
	id,
	filters,
	config,
	backHref,
	onBack,
	onNavigate,
	onDeleted,
	announce,
	focusOnMount = false,
	onUnread = updateMenuBadge,
} ) {
	const [ entry, setEntry ] = useState( null );
	// Yükləmə xətası (404 → "Entry not found", başqası → Try again) və əməliyyat
	// xətası (oxunmuş keçidi / silmə) ayrıdır: silmə 404 verəndə ekran "tapılmadı"
	// halına düşmür, müraciət görünür qalır və bildiriş onu izah edir.
	const [ loadError, setLoadError ] = useState( null );
	const [ actionError, setActionError ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ busy, setBusy ] = useState( false );
	const [ confirming, setConfirming ] = useState( false );
	const [ reloadKey, setReloadKey ] = useState( 0 );

	const headingRef = useRef( null );
	const deleteRef = useRef( null );
	const retryFocusRef = useRef( false );
	const mountedRef = useRef( true );
	const latest = useRef( {} );

	latest.current = { onUnread, announce, filters };

	useEffect( () => {
		mountedRef.current = true;

		return () => {
			mountedRef.current = false;
		};
	}, [] );

	// Başlıq bütün hallarda (yüklənir / tapılmadı / hazır) eyni yerdədir — fokus dərhal ona.
	useEffect( () => {
		if ( focusOnMount ) {
			headingRef.current?.focus();
		}
	}, [] ); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect( () => {
		let current = true;

		setLoading( true );

		getEntry( id, filterParams( latest.current.filters ) ).then(
			( result ) => {
				if ( ! current ) {
					return;
				}

				setEntry( result );
				setLoadError( null );
				setLoading( false );
				latest.current.onUnread( result.unread );

				// "Try again" uğurla bitdi: düymə yox olur — fokus body-yə düşməsin.
				if ( retryFocusRef.current ) {
					retryFocusRef.current = false;
					headingRef.current?.focus();
				}
			},
			( caught ) => {
				if ( ! current ) {
					return;
				}

				// Uğursuzluqda da təmizlənir: "Try again" yerində qalır, fokus onda.
				retryFocusRef.current = false;
				setEntry( null );
				setLoadError( caught );
				setLoading( false );
				latest.current.announce( entryErrorMessage( caught ), { force: true } );
			}
		);

		return () => {
			current = false;
		};
	}, [ id, reloadKey ] );

	function retry() {
		if ( loading ) {
			return;
		}

		retryFocusRef.current = true;
		setReloadKey( ( key ) => key + 1 );
	}

	// Düymələr `disabled` EDİLMİR (`aria-disabled` + klik qoruyucusu, R7):
	// fokuslu düymə deaktiv olanda brauzer fokusu body-yə atır.
	async function toggleRead() {
		if ( busy || ! entry ) {
			return;
		}

		const read = ! entry.is_read;

		setBusy( true );
		setActionError( null );

		try {
			const outcome = await updateEntries( read ? 'read' : 'unread', [ id ] );

			if ( ! mountedRef.current ) {
				return;
			}

			// Yenidən YÜKLƏMİRİK: GET müraciəti dərhal yenə oxunmuş edərdi.
			setEntry( ( previous ) => ( previous ? { ...previous, is_read: read } : previous ) );
			onUnread( outcome.unread );
			announce(
				read ? __( 'Entry marked as read.', 'quoteform' ) : __( 'Entry marked as unread.', 'quoteform' ),
				{ force: true }
			);
		} catch ( caught ) {
			if ( ! mountedRef.current ) {
				return;
			}

			setActionError( caught );
			announce( entryErrorMessage( caught ), { force: true } );
		}

		if ( mountedRef.current ) {
			setBusy( false );
		}
	}

	function askDelete() {
		if ( busy ) {
			return;
		}

		setConfirming( true );
	}

	function cancelDelete() {
		setConfirming( false );
		deleteRef.current?.focus();
	}

	async function confirmDelete() {
		if ( busy ) {
			return;
		}

		setConfirming( false );
		setBusy( true );
		setActionError( null );
		// Təsdiq paneli yox olur: fokus Delete-ə (o `disabled` deyil, fokus ala bilir).
		deleteRef.current?.focus();

		let outcome;

		try {
			outcome = await deleteEntry( id );
		} catch ( caught ) {
			// Başqası artıq silib — istifadəçinin istədiyi nəticə budur: uğur kimi bitir.
			if ( isNotFound( caught ) ) {
				/* translators: %d: entry number. */
				announce( sprintf( __( 'Entry #%d was already deleted.', 'quoteform' ), id ), { force: true } );

				if ( mountedRef.current ) {
					onDeleted();
				}

				return;
			}

			if ( ! mountedRef.current ) {
				return;
			}

			setActionError( caught );
			announce( entryErrorMessage( caught ), { force: true } );
			setBusy( false );

			return;
		}

		// Silmə faktdır: nişan və elan ekran tərk edilsə də yenilənir. Amma istifadəçi
		// artıq başqa müraciətə keçibsə (Newer/Back), `onDeleted()` onun yerini
		// siyahı ilə əvəz edib tarixçə qeydini üstələməməlidir.
		onUnread( outcome.unread );
		/* translators: %d: entry number. */
		announce( sprintf( __( 'Entry #%d deleted.', 'quoteform' ), id ), { force: true } );

		if ( mountedRef.current ) {
			onDeleted();
		}
	}

	// Bağlanan bildirişin fokuslu × düyməsi yox olur — fokus body-yə düşməsin.
	function dismissActionError() {
		setActionError( null );
		headingRef.current?.focus();
	}

	const labels = neighbourLabels( filters );
	const notFound = isNotFound( loadError );
	const formHref =
		entry && entry.form_title !== null && config.canManageForms && config.builderUrl
			? `${ config.builderUrl }&form=${ entry.form_id }`
			: null;

	return (
		<div className="quoteform_entries quoteform_entry">
			<div className="quoteform_topbar">
				<a
					className="quoteform_entry__back"
					href={ backHref }
					onClick={ ( event ) => {
						if ( isPlainClick( event ) ) {
							event.preventDefault();
							onBack();
						}
					} }
				>
					{ __( '← Back to entries', 'quoteform' ) }
				</a>
				<span className="quoteform_topbar__sep" aria-hidden="true">
					|
				</span>
				<h1 ref={ headingRef } tabIndex={ -1 }>
					{ sprintf(
						/* translators: %d: entry number. */
						__( 'Entry #%d', 'quoteform' ),
						id
					) }
				</h1>
				{ entry && (
					<span className="quoteform_entry__meta">
						{ entry.form_title === null && <em>{ __( '(deleted form)', 'quoteform' ) }</em> }
						{ entry.form_title !== null && formHref && <a href={ formHref }>{ entry.form_title }</a> }
						{ entry.form_title !== null && ! formHref && <span>{ entry.form_title }</span> }
						{ ' · ' }
						<time dateTime={ entry.date.iso } title={ entry.date.full }>
							{ entry.date.display }
						</time>
						{ ' · ' }
						<span className="quoteform_entry__status">
							{ entry.is_read ? __( 'Read', 'quoteform' ) : __( 'New', 'quoteform' ) }
						</span>
					</span>
				) }
				{ entry && (
					<div className="quoteform_topbar__actions">
						<Button
							onClick={ toggleRead }
							aria-disabled={ busy ? 'true' : undefined }
							aria-busy={ busy ? 'true' : undefined }
						>
							{ entry.is_read ? __( 'Mark as unread', 'quoteform' ) : __( 'Mark as read', 'quoteform' ) }
						</Button>
						{ config.canDelete && (
							<Button
								variant="danger"
								ref={ deleteRef }
								onClick={ askDelete }
								aria-disabled={ busy ? 'true' : undefined }
							>
								{ __( 'Delete', 'quoteform' ) }
							</Button>
						) }
					</div>
				) }
			</div>

			{ confirming && (
				<RemoveConfirm
					message={ sprintf(
						/* translators: %d: entry number. */
						__( 'Delete entry #%d? This cannot be undone.', 'quoteform' ),
						id
					) }
					confirmLabel={ __( 'Delete permanently', 'quoteform' ) }
					cancelLabel={ __( 'Cancel', 'quoteform' ) }
					onConfirm={ confirmDelete }
					onCancel={ cancelDelete }
				/>
			) }

			{ actionError && (
				<Notice status="error" live={ false } onDismiss={ dismissActionError }>
					{ entryErrorMessage( actionError ) }
				</Notice>
			) }

			{ loadError && ! notFound && (
				<>
					<Notice status="error" live={ false }>
						{ entryErrorMessage( loadError ) }
					</Notice>
					<Button onClick={ retry } aria-disabled={ loading ? 'true' : undefined }>
						{ __( 'Try again', 'quoteform' ) }
					</Button>
				</>
			) }

			{ loading && ! entry && ! loadError && (
				<p className="quoteform_card quoteform_empty">{ __( 'Loading entry…', 'quoteform' ) }</p>
			) }

			{ notFound && (
				<Card className="quoteform_empty">
					<p>{ __( 'Entry not found.', 'quoteform' ) }</p>
					<p>{ __( 'It may have been deleted.', 'quoteform' ) }</p>
				</Card>
			) }

			{ entry && (
				<>
					<nav className="quoteform_entry__neighbours" aria-label={ __( 'Entry navigation', 'quoteform' ) }>
						<Button
							onClick={ () => onNavigate( entry.neighbours.previous ) }
							disabled={ entry.neighbours.previous === null }
						>
							<span aria-hidden="true">‹ </span>
							{ labels.previous }
						</Button>
						<Button onClick={ () => onNavigate( entry.neighbours.next ) } disabled={ entry.neighbours.next === null }>
							{ labels.next }
							<span aria-hidden="true"> ›</span>
						</Button>
					</nav>
					<Answers answers={ entry.answers } />
					<Breakdown entry={ entry } />
					<Details details={ entry.details } />
				</>
			) }
		</div>
	);
}
