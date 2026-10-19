import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import SelectControl from '../components/SelectControl';
import {
	DECIMAL_PATTERN,
	DEFAULT_FILTERS,
	filterParams,
	filtersAreActive,
	isCalendarDate,
} from './filters';

export const DEBOUNCE_MS = 400;

export function exportHref( exportUrl, filters ) {
	const params = filterParams( filters );
	const keys = Object.keys( params );

	if ( keys.length === 0 ) {
		return exportUrl;
	}

	const url = new URL( exportUrl, window.location.href );

	keys.forEach( ( key ) => url.searchParams.set( key, params[ key ] ) );

	return url.toString();
}

/**
 * Məbləğ sahəsinin qaralaması. `ownRef` bu sahənin sonuncu göndərdiyi (və ya qəbul etdiyi)
 * dəyəridir: xaricdən FƏRQLİ dəyər gələndə (Clear filters, "geri") qaralama yenilənir, öz
 * göndərdiyi dəyər qayıdanda isə yox — ona görə istifadəçinin yazdığı etibarsız "1e" silinmir.
 */
function useDecimalDraft( value, commit ) {
	const [ draft, setDraft ] = useState( value ?? '' );
	const ownRef = useRef( value );
	const commitRef = useRef( commit );

	commitRef.current = commit;

	useEffect( () => {
		if ( value !== ownRef.current ) {
			ownRef.current = value;
			setDraft( value ?? '' );
		}
	}, [ value ] );

	useEffect( () => {
		const timer = window.setTimeout( () => {
			const next = DECIMAL_PATTERN.test( draft ) ? draft : null;

			if ( next !== ownRef.current ) {
				ownRef.current = next;
				commitRef.current( next );
			}
		}, DEBOUNCE_MS );

		return () => window.clearTimeout( timer );
	}, [ draft ] );

	return [ draft, setDraft, draft !== '' && ! DECIMAL_PATTERN.test( draft ) ];
}

function DecimalField( { id, label, draft, setDraft, invalid } ) {
	const hintId = `${ id }-hint`;

	return (
		<div className="quoteform_control">
			<label htmlFor={ id }>{ label }</label>
			<input
				id={ id }
				type="text"
				inputMode="decimal"
				value={ draft }
				onChange={ ( event ) => setDraft( event.target.value ) }
				aria-invalid={ invalid ? 'true' : undefined }
				aria-describedby={ invalid ? hintId : undefined }
			/>
			{ invalid && (
				<p className="quoteform_help" id={ hintId }>
					{ __( 'Use a plain number, like 150 or 99.50.', 'quoteform' ) }
				</p>
			) }
		</div>
	);
}

export default function FilterBar( { forms, hasDeletedForms, filters, onChange } ) {
	const latest = useRef( { filters, onChange } );

	latest.current = { filters, onChange };

	function update( patch ) {
		latest.current.onChange( { ...latest.current.filters, ...patch } );
	}

	const [ minDraft, setMinDraft, minInvalid ] = useDecimalDraft( filters.min, ( min ) => update( { min } ) );
	const [ maxDraft, setMaxDraft, maxInvalid ] = useDecimalDraft( filters.max, ( max ) => update( { max } ) );

	const formValue = filters.form === null ? '' : String( filters.form );

	const formOptions = [
		{ value: '', label: __( 'All forms', 'quoteform' ) },
		...forms.map( ( form ) => ( {
			value: String( form.id ),
			label:
				form.title !== ''
					? form.title
					: sprintf(
							/* translators: %d: form id. */
							__( 'Form #%d', 'quoteform' ),
							form.id
					  ),
		} ) ),
		...( hasDeletedForms ? [ { value: 'deleted', label: __( 'Deleted forms', 'quoteform' ) } ] : [] ),
	];

	// Paylaşılan keçid (`form=deleted` silinmiş-forma müraciəti olmayan saytda, ya da zibil
	// qutusuna atılmış/naməlum `form=<id>`) SelectControl-un ümumi "Unrecognised value: …"
	// mətnini göstərməsin deyə, dəyər siyahıda yoxdursa oxunaqlı bir seçim əlavə edirik.
	if ( formValue !== '' && ! formOptions.some( ( option ) => option.value === formValue ) ) {
		formOptions.push(
			filters.form === 'deleted'
				? { value: 'deleted', label: __( 'Deleted forms', 'quoteform' ) }
				: {
						value: formValue,
						label: sprintf(
							/* translators: %d: form id. */
							__( 'Form #%d (not available)', 'quoteform' ),
							filters.form
						),
				  }
		);
	}

	function changeForm( value ) {
		let form = null;

		if ( value === 'deleted' ) {
			form = 'deleted';
		} else if ( value !== '' ) {
			form = Number( value );
		}

		update( { form } );
	}

	function changeDate( key, value ) {
		update( { [ key ]: isCalendarDate( value ) ? value : null } );
	}

	return (
		<div className="quoteform_entries__filters" role="group" aria-label={ __( 'Filter entries', 'quoteform' ) }>
			<SelectControl
				id="quoteform_entries-form"
				label={ __( 'Form', 'quoteform' ) }
				value={ formValue }
				options={ formOptions }
				onChange={ changeForm }
			/>
			<SelectControl
				id="quoteform_entries-status"
				label={ __( 'Status', 'quoteform' ) }
				value={ filters.status === null ? '' : filters.status }
				options={ [
					{ value: '', label: __( 'All', 'quoteform' ) },
					{ value: 'new', label: __( 'New', 'quoteform' ) },
					{ value: 'read', label: __( 'Read', 'quoteform' ) },
				] }
				onChange={ ( value ) => update( { status: value === '' ? null : value } ) }
			/>
			<div className="quoteform_control">
				<label htmlFor="quoteform_entries-from">{ __( 'From', 'quoteform' ) }</label>
				<input
					id="quoteform_entries-from"
					type="date"
					value={ filters.from ?? '' }
					onChange={ ( event ) => changeDate( 'from', event.target.value ) }
				/>
			</div>
			<div className="quoteform_control">
				<label htmlFor="quoteform_entries-to">{ __( 'To', 'quoteform' ) }</label>
				<input
					id="quoteform_entries-to"
					type="date"
					value={ filters.to ?? '' }
					onChange={ ( event ) => changeDate( 'to', event.target.value ) }
				/>
			</div>
			<DecimalField
				id="quoteform_entries-min"
				label={ __( 'Minimum total', 'quoteform' ) }
				draft={ minDraft }
				setDraft={ setMinDraft }
				invalid={ minInvalid }
			/>
			<DecimalField
				id="quoteform_entries-max"
				label={ __( 'Maximum total', 'quoteform' ) }
				draft={ maxDraft }
				setDraft={ setMaxDraft }
				invalid={ maxInvalid }
			/>
			{ filtersAreActive( filters ) && (
				<Button
					onClick={ () => onChange( { ...DEFAULT_FILTERS, orderby: filters.orderby, order: filters.order } ) }
				>
					{ __( 'Clear filters', 'quoteform' ) }
				</Button>
			) }
		</div>
	);
}
