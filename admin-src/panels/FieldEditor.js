import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import NumberControl from '../components/NumberControl';
import TextControl from '../components/TextControl';
import ToggleControl from '../components/ToggleControl';
import { fieldReferences } from '../lib/references';
import { isReservedKey, isValidKey } from '../lib/keys';
import { renameField, updateField } from '../state/actions';
import { errorsFor } from '../state/errors';
import { LABEL_OPTIONAL_TYPES, TYPE_EXTRA_KEYS } from '../state/fields';
import { useDispatch, useStore } from '../state/StoreContext';
import OptionsEditor from './OptionsEditor';

export default function FieldEditor( { fieldKey, errorIndex, onKeyChange } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();

	/**
	 * `fieldKey` yalnız valideynin bu editoru HANSI sahə üçün açdığını
	 * bildirir. Adı dəyişmək öz map girişini köçürür, ona görə redaktə
	 * olunan sahənin HƏQİQİ açarı öz state-imizdə izlənilir — valideyn
	 * hər `renameField`-dən sonra `fieldKey`-i yeniləməsə belə.
	 */
	const [ activeKey, setActiveKey ] = useState( fieldKey );

	useEffect( () => {
		setActiveKey( fieldKey );
	}, [ fieldKey ] );

	const field = schema === null ? null : schema.fields[ activeKey ] || null;

	const [ draftKey, setDraftKey ] = useState( field ? field.key : '' );
	const keyAtFocusRef = useRef( field ? field.key : '' );

	useEffect( () => {
		setDraftKey( field ? field.key : '' );
	}, [ activeKey, field ? field.key : null ] );

	if ( schema === null || ! field ) {
		return null;
	}

	const base = `fields.${ activeKey }`;
	const at = ( key ) => errorsFor( errorIndex, `${ base }.${ key }` );
	const set = ( key ) => ( value ) => dispatch( updateField( activeKey, { [ key ]: value } ) );
	const extras = TYPE_EXTRA_KEYS[ field.type ] || [];
	const usedIn = fieldReferences( schema, activeKey );
	const keyLocked = usedIn.length > 0;

	const keyShapeProblem = draftKey !== '' && ! isValidKey( draftKey );
	const keyReserved = isReservedKey( draftKey );
	const keyTaken =
		isValidKey( draftKey ) &&
		! isReservedKey( draftKey ) &&
		draftKey !== field.key &&
		Object.prototype.hasOwnProperty.call( schema.fields, draftKey );

	const handleKeyChange = ( value ) => {
		setDraftKey( value );
	};

	const handleKeyFocus = () => {
		keyAtFocusRef.current = field.key;
	};

	const commitDraftKey = () => {
		const committable =
			isValidKey( draftKey ) &&
			! isReservedKey( draftKey ) &&
			draftKey !== field.key &&
			! Object.prototype.hasOwnProperty.call( schema.fields, draftKey );

		if ( committable ) {
			dispatch( renameField( activeKey, draftKey ) );
			setActiveKey( draftKey );
			keyAtFocusRef.current = draftKey;
			onKeyChange?.( draftKey );

			return;
		}

		setDraftKey( keyAtFocusRef.current );
	};

	const handleKeyDown = ( event ) => {
		if ( event.key === 'Enter' ) {
			event.preventDefault();
			commitDraftKey();
		} else if ( event.key === 'Escape' ) {
			setDraftKey( keyAtFocusRef.current );
		}
	};

	const keyErrors = at( 'key' );
	const keyShapeWarningId = 'quoteform_field-key-shape-warning';
	const keyReservedWarningId = 'quoteform_field-key-reserved-warning';
	const keyTakenWarningId = 'quoteform_field-key-taken-warning';
	const keyHelpText = keyLocked
		? __( 'This key is in use, so it cannot be renamed here.', 'quoteform' )
		: __( 'Used in formulas, like {room_count}.', 'quoteform' );
	const keyWarningIds =
		[
			keyShapeProblem ? keyShapeWarningId : null,
			keyReserved ? keyReservedWarningId : null,
			keyTaken ? keyTakenWarningId : null,
		]
			.filter( Boolean )
			.join( ' ' ) || undefined;

	return (
		<section className="quoteform_panel quoteform_card" aria-labelledby="quoteform_field-heading">
			<h3 id="quoteform_field-heading">
				{ field.label || activeKey } — { field.type }
			</h3>

			<TextControl
				id="quoteform_field-key"
				label={ __( 'Key', 'quoteform' ) }
				value={ draftKey }
				onChange={ handleKeyChange }
				errors={ keyErrors }
				help={ keyHelpText }
				disabled={ keyLocked }
				describedBy={ keyWarningIds }
				onFocus={ handleKeyFocus }
				onBlur={ commitDraftKey }
				onKeyDown={ handleKeyDown }
			/>

			{ keyLocked && (
				<p className="quoteform_help">
					{ __( 'Used in:', 'quoteform' ) } { usedIn.join( ', ' ) }
				</p>
			) }

			{ keyShapeProblem && (
				<p
					className="quoteform_warning"
					id={ keyShapeWarningId }
					role="status"
					aria-live="polite"
				>
					{ __(
						'A key must start with a lowercase letter and use only lowercase letters, numbers and underscores.',
						'quoteform'
					) }
				</p>
			) }

			{ keyReserved && (
				<p
					className="quoteform_warning"
					id={ keyReservedWarningId }
					role="status"
					aria-live="polite"
				>
					{ __( 'That key is reserved. Choose another one.', 'quoteform' ) }
				</p>
			) }

			{ keyTaken && (
				<p
					className="quoteform_warning"
					id={ keyTakenWarningId }
					role="status"
					aria-live="polite"
				>
					{ __( 'That key is already used by another field.', 'quoteform' ) }
				</p>
			) }

			{ ! LABEL_OPTIONAL_TYPES.includes( field.type ) && (
				<TextControl
					id="quoteform_field-label"
					label={ __( 'Label', 'quoteform' ) }
					value={ field.label }
					onChange={ set( 'label' ) }
					errors={ at( 'label' ) }
				/>
			) }

			<TextControl
				id="quoteform_field-help"
				label={ __( 'Help text', 'quoteform' ) }
				value={ field.help }
				onChange={ set( 'help' ) }
				errors={ at( 'help' ) }
			/>

			<TextControl
				id="quoteform_field-placeholder"
				label={ __( 'Placeholder', 'quoteform' ) }
				value={ field.placeholder }
				onChange={ set( 'placeholder' ) }
				errors={ at( 'placeholder' ) }
			/>

			<ToggleControl
				id="quoteform_field-required"
				label={ __( 'Required', 'quoteform' ) }
				checked={ field.required }
				onChange={ set( 'required' ) }
				errors={ at( 'required' ) }
			/>

			{ extras.includes( 'min' ) && (
				<>
					<NumberControl
						id="quoteform_field-min"
						label={ __( 'Minimum', 'quoteform' ) }
						value={ field.min }
						onChange={ set( 'min' ) }
						errors={ at( 'min' ) }
					/>
					<NumberControl
						id="quoteform_field-max"
						label={ __( 'Maximum', 'quoteform' ) }
						value={ field.max }
						onChange={ set( 'max' ) }
						errors={ at( 'max' ) }
					/>
					<NumberControl
						id="quoteform_field-step"
						label={ __( 'Step', 'quoteform' ) }
						value={ field.step }
						onChange={ set( 'step' ) }
						errors={ at( 'step' ) }
					/>
				</>
			) }

			{ extras.includes( 'content' ) && (
				<TextControl
					id="quoteform_field-content"
					label={ __( 'Content', 'quoteform' ) }
					value={ field.content }
					onChange={ set( 'content' ) }
					errors={ at( 'content' ) }
					multiline
				/>
			) }

			{ extras.includes( 'options' ) && (
				<OptionsEditor
					options={ field.options }
					onChange={ set( 'options' ) }
					errorIndex={ errorIndex }
					pathPrefix={ `${ base }.options` }
				/>
			) }
		</section>
	);
}
