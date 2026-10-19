import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import { displayName } from '../lib/names';
import { addField, removeField } from '../state/actions';
import { hasErrorsUnder } from '../state/errors';
import { FIELD_TYPES, TYPE_LABELS } from '../state/fields';
import { useDispatch, useStore } from '../state/StoreContext';

export default function FieldsPanel( { errorIndex, selectedKey, onSelect } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();
	const [ pendingType, setPendingType ] = useState( FIELD_TYPES[ 0 ] );
	const [ confirming, setConfirming ] = useState( null );

	const addButtonRef = useRef( null );
	const confirmButtonRef = useRef( null );
	const removeButtonRefs = useRef( {} );

	useEffect( () => {
		if ( confirming ) {
			confirmButtonRef.current?.focus();
		}
	}, [ confirming ] );

	if ( schema === null ) {
		return null;
	}

	const keys = Object.keys( schema.fields );

	function handleCancelRemove( key ) {
		setConfirming( null );
		removeButtonRefs.current[ key ]?.focus();
	}

	function handleRemove( key ) {
		setConfirming( null );

		if ( selectedKey === key ) {
			onSelect( null );
		}

		dispatch( removeField( key ) );
		addButtonRef.current?.focus();
	}

	return (
		<section className="quoteform_panel quoteform_card" aria-labelledby="quoteform_fields-heading">
			<div className="quoteform_panel__head">
				<h2 id="quoteform_fields-heading">{ __( 'Fields', 'quoteform' ) }</h2>
			</div>

			<div className="quoteform_fields__add">
				<label htmlFor="quoteform_new-field-type">{ __( 'Field type', 'quoteform' ) }</label>
				<select
					id="quoteform_new-field-type"
					value={ pendingType }
					onChange={ ( event ) => setPendingType( event.target.value ) }
				>
					{ FIELD_TYPES.map( ( type ) => (
						<option key={ type } value={ type }>
							{ TYPE_LABELS[ type ] }
						</option>
					) ) }
				</select>
				<Button variant="primary" ref={ addButtonRef } onClick={ () => dispatch( addField( pendingType ) ) }>
					{ __( 'Add field', 'quoteform' ) }
				</Button>
			</div>

			{ keys.length === 0 && (
				<p className="quoteform_empty">{ __( 'No fields yet. Add one to get started.', 'quoteform' ) }</p>
			) }

			{ keys.length > 0 && (
				<ul className="quoteform_fields__list">
					{ keys.map( ( key ) => {
						const field = schema.fields[ key ];
						const name = displayName( field.label, key );
						const broken = hasErrorsUnder( errorIndex, `fields.${ key }` );
						const isSelected = selectedKey === key;

						return (
							<li key={ key } className={ isSelected ? 'is-selected' : undefined }>
								<button
									type="button"
									className="quoteform_fields__name"
									onClick={ () => onSelect( key ) }
									aria-current={ isSelected ? 'true' : undefined }
								>
									{ name }
								</button>
								<span className="quoteform_fields__type quoteform_badge">{ TYPE_LABELS[ field.type ] }</span>
								{ broken && (
									<span className="quoteform_fields__badge quoteform_badge quoteform_badge--problem">
										{ __( 'Has a problem', 'quoteform' ) }
									</span>
								) }
								<Button
									variant="danger"
									ref={ ( el ) => {
										removeButtonRefs.current[ key ] = el;
									} }
									onClick={ () => setConfirming( key ) }
									aria-label={ sprintf(
										/* translators: %s: field label or key. */
										__( 'Remove %s', 'quoteform' ),
										name
									) }
								>
									{ __( 'Remove', 'quoteform' ) }
								</Button>

								{ confirming === key && (
									<span className="quoteform_confirm">
										<span>
											{ __(
												'Removing a field does not remove references to it. Any step, calculation or rule that uses it will report an error until you fix it.',
												'quoteform'
											) }
										</span>
										<Button variant="danger" ref={ confirmButtonRef } onClick={ () => handleRemove( key ) }>
											{ __( 'Remove field', 'quoteform' ) }
										</Button>
										<Button onClick={ () => handleCancelRemove( key ) }>
											{ __( 'Cancel', 'quoteform' ) }
										</Button>
									</span>
								) }
							</li>
						);
					} ) }
				</ul>
			) }
		</section>
	);
}
