import { useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import RemoveConfirm from '../components/RemoveConfirm';
import { isPlainClick } from './urlState';

export function tableCaption( filters ) {
	if ( filters.orderby === 'total' ) {
		return filters.order === 'asc'
			? __( 'Entries, lowest total first', 'quoteform' )
			: __( 'Entries, highest total first', 'quoteform' );
	}

	return filters.order === 'asc'
		? __( 'Entries, oldest first', 'quoteform' )
		: __( 'Entries, newest first', 'quoteform' );
}

function columnLabel( column ) {
	return column === 'total' ? __( 'Total', 'quoteform' ) : __( 'Date', 'quoteform' );
}

function SortHeader( { column, filters, onSort } ) {
	const active = filters.orderby === column;
	let sort;
	let arrow = '';

	if ( active ) {
		sort = filters.order === 'asc' ? 'ascending' : 'descending';
		arrow = filters.order === 'asc' ? '▲' : '▼';
	}

	return (
		<th scope="col" aria-sort={ sort }>
			<button type="button" className="quoteform_entries__sort" onClick={ () => onSort( column ) }>
				{ columnLabel( column ) }
				<span className="quoteform_entries__arrow" aria-hidden="true">
					{ arrow }
				</span>
			</button>
		</th>
	);
}

function NameEmail( { item } ) {
	if ( item.name === '' && item.email === '' ) {
		return <span className="quoteform_entries__none">—</span>;
	}

	return (
		<>
			{ item.name !== '' && <span className="quoteform_entries__name">{ item.name }</span> }
			{ item.email !== '' && (
				<a className="quoteform_entries__email" href={ `mailto:${ item.email }` }>
					{ item.email }
				</a>
			) }
		</>
	);
}

function FormCell( { item, formHref } ) {
	if ( item.form_title === null ) {
		return <em className="quoteform_entries__muted">{ __( '(deleted form)', 'quoteform' ) }</em>;
	}

	const href = formHref( item.form_id );

	return href ? <a href={ href }>{ item.form_title }</a> : <span>{ item.form_title }</span>;
}

function TotalCell( { item } ) {
	if ( item.total === null ) {
		return (
			<>
				<span aria-hidden="true">—</span>{ ' ' }
				<span className="quoteform_entries__muted">{ __( 'Calculation failed', 'quoteform' ) }</span>
			</>
		);
	}

	return item.total_display;
}

export default function EntriesTable( {
	items,
	filters,
	onSort,
	selected,
	onToggle,
	onToggleAll,
	entryHref,
	onOpen,
	formHref,
	canDelete,
	confirmingId,
	onAskDelete,
	onConfirmDelete,
	onCancelDelete,
	deleteButtonRef,
	busy,
	headerCheckboxRef,
} ) {
	const allSelected = items.length > 0 && items.every( ( item ) => selected.has( item.id ) );
	const someSelected = ! allSelected && items.some( ( item ) => selected.has( item.id ) );
	const selectAllRef = useRef( null );

	// `indeterminate` HTML atributu deyil, yalnız DOM xassəsidir: "bəziləri seçilib" halını
	// ekran oxuyucusu "qarışıq" kimi oxusun deyə hər render-dən sonra əl ilə yazılır
	// (asılılıqsız — brauzer klikdə xassəni özü sıfırlayır, React bunu görmür).
	useEffect( () => {
		if ( selectAllRef.current ) {
			selectAllRef.current.indeterminate = someSelected;
		}
	} );

	function open( event, id ) {
		if ( ! isPlainClick( event ) ) {
			return;
		}

		event.preventDefault();
		onOpen( id );
	}

	// `disabled` fokuslu düyməni fokussuz qoyur (fokus `<body>`-yə düşür). Ona görə məşğul
	// halda cərgənin Delete düyməsi `aria-disabled` olur və klik sadəcə nəzərə alınmır (R7).
	function guardedAskDelete( item ) {
		return () => {
			if ( ! busy ) {
				onAskDelete( item );
			}
		};
	}

	return (
		<div
			className="quoteform_entries__scroll"
			role="region"
			tabIndex={ 0 }
			aria-label={ __( 'Entries table', 'quoteform' ) }
		>
			<table className="quoteform_list__table quoteform_entries__table">
				<caption className="screen-reader-text">{ tableCaption( filters ) }</caption>
				<thead>
					<tr>
						<td className="quoteform_entries__check">
							<input
								ref={ ( element ) => {
									selectAllRef.current = element;

									if ( headerCheckboxRef ) {
										headerCheckboxRef.current = element;
									}
								} }
								type="checkbox"
								checked={ allSelected }
								onChange={ ( event ) => onToggleAll( event.target.checked ) }
								aria-label={ __( 'Select all entries on this page', 'quoteform' ) }
							/>
						</td>
						<th scope="col">{ __( 'Entry', 'quoteform' ) }</th>
						<th scope="col">{ __( 'Name / Email', 'quoteform' ) }</th>
						<th scope="col">{ __( 'Form', 'quoteform' ) }</th>
						<SortHeader column="total" filters={ filters } onSort={ onSort } />
						<SortHeader column="date" filters={ filters } onSort={ onSort } />
						<th scope="col">
							<span className="screen-reader-text">{ __( 'Actions', 'quoteform' ) }</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{ items.map( ( item ) => (
						<tr key={ item.id } className={ item.is_read ? undefined : 'quoteform_entries__row--unread' }>
							<td className="quoteform_entries__check">
								<input
									type="checkbox"
									checked={ selected.has( item.id ) }
									onChange={ () => onToggle( item.id ) }
									aria-label={ sprintf(
										/* translators: %d: entry number. */
										__( 'Select entry #%d', 'quoteform' ),
										item.id
									) }
								/>
							</td>
							<th scope="row">
								<a href={ entryHref( item.id ) } onClick={ ( event ) => open( event, item.id ) }>
									{ `#${ item.id }` }
								</a>
								{ ! item.is_read && (
									<span className="quoteform_entries__new">{ __( 'New', 'quoteform' ) }</span>
								) }
							</th>
							<td className="quoteform_entries__who">
								<NameEmail item={ item } />
							</td>
							<td>
								<FormCell item={ item } formHref={ formHref } />
							</td>
							<td className="quoteform_entries__total">
								<TotalCell item={ item } />
							</td>
							<td>
								<time dateTime={ item.date.iso } title={ item.date.full }>
									{ item.date.display }
								</time>
							</td>
							<td className="quoteform_list__actions">
								<a
									className="quoteform_button quoteform_button--secondary"
									href={ entryHref( item.id ) }
									onClick={ ( event ) => open( event, item.id ) }
									aria-label={ sprintf(
										/* translators: %d: entry number. */
										__( 'View entry #%d', 'quoteform' ),
										item.id
									) }
								>
									{ __( 'View', 'quoteform' ) }
								</a>
								{ canDelete && (
									<Button
										variant="danger"
										ref={ ( element ) => deleteButtonRef( item.id, element ) }
										onClick={ guardedAskDelete( item ) }
										aria-disabled={ busy ? 'true' : undefined }
										aria-label={ sprintf(
											/* translators: %d: entry number. */
											__( 'Delete entry #%d', 'quoteform' ),
											item.id
										) }
									>
										{ __( 'Delete', 'quoteform' ) }
									</Button>
								) }
								{ confirmingId === item.id && (
									<RemoveConfirm
										message={ sprintf(
											/* translators: %d: entry number. */
											__( 'Delete entry #%d? This cannot be undone.', 'quoteform' ),
											item.id
										) }
										confirmLabel={ __( 'Delete permanently', 'quoteform' ) }
										cancelLabel={ __( 'Cancel', 'quoteform' ) }
										onConfirm={ () => onConfirmDelete( item ) }
										onCancel={ () => onCancelDelete( item ) }
									/>
								) }
							</td>
						</tr>
					) ) }
				</tbody>
			</table>
		</div>
	);
}
