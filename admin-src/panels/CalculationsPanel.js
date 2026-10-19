import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _x, sprintf } from '@wordpress/i18n';

import { orderCalculations } from '../../frontend-src/engine';
import Button from '../components/Button';
import MoveButtons from '../components/MoveButtons';
import Notice from '../components/Notice';
import TextControl from '../components/TextControl';
import ToggleControl from '../components/ToggleControl';
import {
	addCalculation,
	moveCalculation,
	removeCalculation,
	updateCalculation,
} from '../state/actions';
import { useMoveFocus } from '../lib/useMoveFocus';
import { errorsFor } from '../state/errors';
import { PRICE_BEARING_TYPES } from '../state/fields';
import { useDispatch, useStore } from '../state/StoreContext';
import FormulaEditor from './FormulaEditor';

const REQUIRED_KEY = 'total';

function loopWarning( calculations ) {
	try {
		orderCalculations( calculations );

		return null;
	} catch ( error ) {
		if ( error.codeSlug === 'circular_reference' ) {
			return __( 'These calculations reference each other in a loop.', 'quoteform' );
		}

		return null;
	}
}

export default function CalculationsPanel( { errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();
	const [ confirming, setConfirming ] = useState( null );
	const addButtonRef = useRef( null );
	const confirmButtonRef = useRef( null );
	const removeButtonRefs = useRef( {} );
	const moveFocus = useMoveFocus();

	useEffect( () => {
		if ( confirming !== null ) {
			confirmButtonRef.current?.focus();
		}
	}, [ confirming ] );

	function handleMove( index, direction ) {
		moveFocus.follow( index, direction );

		dispatch( moveCalculation( index, direction ) );
	}

	if ( schema === null ) {
		return null;
	}

	const { calculations, fields } = schema;
	const fieldKeys = Object.keys( fields );
	const priceFieldKeys = fieldKeys.filter( ( key ) =>
		PRICE_BEARING_TYPES.includes( fields[ key ].type )
	);
	const known = [ ...new Set( [ ...fieldKeys, ...calculations.map( ( c ) => c.key ) ] ) ];
	const hasTotal = calculations.some( ( c ) => c.key === REQUIRED_KEY );
	const loop = loopWarning( calculations );

	return (
		<section className="quoteform_panel" aria-labelledby="quoteform_calculations-heading">
			<div className="quoteform_panel__head">
				<div>
					<h2 id="quoteform_calculations-heading">{ __( 'Calculations', 'quoteform' ) }</h2>
					<p className="quoteform_panel__intro">
						{ __(
							'They run top to bottom, so a later one can use an earlier one’s key.',
							'quoteform'
						) }
					</p>
				</div>
				<Button ref={ addButtonRef } onClick={ () => dispatch( addCalculation() ) }>
					{ __( 'Add calculation', 'quoteform' ) }
				</Button>
			</div>

			{ ! hasTotal && (
				<Notice status="warning">
					{ __( 'Every form needs a calculation named “total”.', 'quoteform' ) }
				</Notice>
			) }

			{ loop && <Notice status="warning">{ loop }</Notice> }

			{ calculations.map( ( calculation, index ) => {
				const number = index + 1;
				const at = ( key ) => errorsFor( errorIndex, `calculations.${ index }.${ key }` );
				const collidesWithField = fieldKeys.includes( calculation.key );
				const collidesWithCalculation =
					! collidesWithField &&
					calculations.some(
						( other, otherIndex ) => otherIndex !== index && other.key === calculation.key
					);
				const calculationName = calculation.key || String( number );
				const removeLabel = sprintf(
					/* translators: %s: calculation key, or its row number while the key is still empty. */
					__( 'Remove calculation %s', 'quoteform' ),
					calculationName
				);

				return (
					<div className="quoteform_calculation quoteform_card" key={ index }>
						<div className="quoteform_calculation__head" aria-hidden="true">
							<span className="quoteform_step__number">{ number }</span>
							<span className="quoteform_calculation__name">
								{ calculation.label || calculation.key }
							</span>
							{ calculation.key && (
								<code className="quoteform_calculation__key">{ `{${ calculation.key }}` }</code>
							) }
						</div>

						<div className="quoteform_calculation__pair">
							<TextControl
								id={ `quoteform_calc-${ index }-key` }
								label={ sprintf(
									/* translators: %d: calculation number. */
									__( 'Calculation %d key', 'quoteform' ),
									number
								) }
								visibleLabel={
									/* translators: short visible label of a numbered calculation field; the full name is "Calculation N key". */
									_x( 'Key', 'short label for a numbered field', 'quoteform' )
								}
								value={ calculation.key }
								onChange={ ( value ) => dispatch( updateCalculation( index, { key: value } ) ) }
								errors={ at( 'key' ) }
							/>

							{ collidesWithField && (
								<p className="quoteform_warning">
									{ __( 'That key is already used by a field.', 'quoteform' ) }
								</p>
							) }

							{ collidesWithCalculation && (
								<p className="quoteform_warning">
									{ __( 'Two calculations cannot share a key.', 'quoteform' ) }
								</p>
							) }

							<TextControl
								id={ `quoteform_calc-${ index }-label` }
								label={ sprintf(
									/* translators: %d: calculation number. */
									__( 'Calculation %d label', 'quoteform' ),
									number
								) }
								visibleLabel={
									/* translators: short visible label of a numbered calculation field; the full name is "Calculation N label". */
									_x( 'Label', 'short label for a numbered field', 'quoteform' )
								}
								value={ calculation.label }
								onChange={ ( value ) => dispatch( updateCalculation( index, { label: value } ) ) }
								errors={ at( 'label' ) }
							/>
						</div>

						<FormulaEditor
							id={ `quoteform_calc-${ index }-expression` }
							label={ sprintf(
								/* translators: %d: calculation number. */
								__( 'Calculation %d formula', 'quoteform' ),
								number
							) }
							visibleLabel={
								/* translators: short visible label of a numbered calculation field; the full name is "Calculation N formula". */
								_x( 'Formula', 'short label for a numbered field', 'quoteform' )
							}
							value={ calculation.expression }
							onChange={ ( value ) =>
								dispatch( updateCalculation( index, { expression: value } ) )
							}
							knownVariables={ known.filter( ( name ) => name !== calculation.key ) }
							priceVariables={ priceFieldKeys }
							errors={ at( 'expression' ) }
						/>

						<ToggleControl
							id={ `quoteform_calc-${ index }-visible` }
							label={ sprintf(
								/* translators: %d: calculation number. */
								__( 'Show calculation %d to the visitor', 'quoteform' ),
								number
							) }
							checked={ calculation.visible }
							onChange={ ( value ) => dispatch( updateCalculation( index, { visible: value } ) ) }
							errors={ at( 'visible' ) }
						/>

						<div className="quoteform_step__tools">
							<MoveButtons
								label={ calculationName }
								onMoveUp={ () => handleMove( index, 'up' ) }
								onMoveDown={ () => handleMove( index, 'down' ) }
								canMoveUp={ index > 0 }
								canMoveDown={ index < calculations.length - 1 }
								{ ...moveFocus.refsFor( index ) }
							/>

							<Button
								variant="danger"
								ref={ ( node ) => {
									removeButtonRefs.current[ index ] = node;
								} }
								onClick={ () => setConfirming( index ) }
								aria-label={ removeLabel }
							>
								{ __( 'Remove', 'quoteform' ) }
							</Button>
						</div>

						{ confirming === index && (
							<span className="quoteform_confirm">
								<span>
									{ sprintf(
										/* translators: %s: calculation key, or its row number while the key is still empty. */
										__( 'Remove “%s”? Anything using it will stop working.', 'quoteform' ),
										calculationName
									) }
								</span>
								<Button
									variant="danger"
									ref={ confirmButtonRef }
									onClick={ () => {
										setConfirming( null );
										dispatch( removeCalculation( index ) );
										addButtonRef.current?.focus();
									} }
								>
									{ sprintf(
										/* translators: %s: calculation key, or its row number while the key is still empty. */
										__( 'Yes, remove %s', 'quoteform' ),
										calculationName
									) }
								</Button>
								<Button
									onClick={ () => {
										setConfirming( null );
										removeButtonRefs.current[ index ]?.focus();
									} }
								>
									{ sprintf(
										/* translators: %s: calculation key, or its row number while the key is still empty. */
										__( 'Keep %s', 'quoteform' ),
										calculationName
									) }
								</Button>
							</span>
						) }
					</div>
				);
			} ) }
		</section>
	);
}
