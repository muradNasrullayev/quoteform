import { __, _x, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import FieldError from '../components/FieldError';
import RemoveConfirm from '../components/RemoveConfirm';
import SelectControl from '../components/SelectControl';
import TextControl from '../components/TextControl';
import { OPERATOR_LABELS, OPERATORS, VALUELESS_OPERATORS } from '../state/rules';

function toOptions( keys, labelFor ) {
	return keys.map( ( key ) => ( { value: key, label: labelFor( key ) } ) );
}

const OPERATOR_OPTIONS = toOptions( OPERATORS, ( operator ) => OPERATOR_LABELS[ operator ] );

export default function RuleConditionRow( {
	ruleIndex,
	ruleNumber,
	conditionIndex,
	condition,
	match,
	fieldOptions,
	rowErrors,
	fieldErrors,
	operatorErrors,
	valueErrors,
	disableRemove,
	isConfirming,
	removeButtonRef,
	onFieldChange,
	onOperatorChange,
	onValueChange,
	onRequestRemove,
	onConfirmRemove,
	onCancelRemove,
} ) {
	const conditionNumber = conditionIndex + 1;
	const isValueless = VALUELESS_OPERATORS.includes( condition.operator );
	const removeLabel = sprintf(
		/* translators: %1$d: rule number, %2$d: condition number. */
		__( 'Remove condition %2$d from rule %1$d', 'quoteform' ),
		ruleNumber,
		conditionNumber
	);

	return (
		<div className="quoteform_rule-condition">
			<FieldError
				id={ `quoteform_rule-${ ruleIndex }-condition-${ conditionIndex }-error` }
				errors={ rowErrors }
			/>

			<span className="quoteform_rule__word" aria-hidden="true">
				{ conditionIndex === 0
					? /* translators: connector word before a rule's first condition, e.g. "if Pets is Yes". */
					  _x( 'if', 'rule condition connector', 'quoteform' )
					: match === 'any'
					? /* translators: connector word between rule conditions when any may match. */
					  _x( 'or', 'rule condition connector', 'quoteform' )
					: /* translators: connector word between rule conditions when all must match. */
					  _x( 'and', 'rule condition connector', 'quoteform' ) }
			</span>

			<SelectControl
				id={ `quoteform_rule-${ ruleIndex }-condition-${ conditionIndex }-field` }
				label={ sprintf(
					/* translators: %1$d: rule number, %2$d: condition number. */
					__( 'Rule %1$d condition %2$d field', 'quoteform' ),
					ruleNumber,
					conditionNumber
				) }
				hideLabel
				value={ condition.field }
				onChange={ onFieldChange }
				options={ fieldOptions }
				placeholder={ __( 'Choose a field to test…', 'quoteform' ) }
				errors={ fieldErrors }
			/>

			<SelectControl
				id={ `quoteform_rule-${ ruleIndex }-condition-${ conditionIndex }-operator` }
				label={ sprintf(
					/* translators: %1$d: rule number, %2$d: condition number. */
					__( 'Rule %1$d condition %2$d operator', 'quoteform' ),
					ruleNumber,
					conditionNumber
				) }
				hideLabel
				value={ condition.operator }
				onChange={ onOperatorChange }
				options={ OPERATOR_OPTIONS }
				errors={ operatorErrors }
			/>

			{ ! isValueless && (
				<TextControl
					id={ `quoteform_rule-${ ruleIndex }-condition-${ conditionIndex }-value` }
					label={ sprintf(
						/* translators: %1$d: rule number, %2$d: condition number. */
						__( 'Rule %1$d condition %2$d value', 'quoteform' ),
						ruleNumber,
						conditionNumber
					) }
					hideLabel
					value={ condition.value }
					onChange={ onValueChange }
					errors={ valueErrors }
				/>
			) }

			<Button
				variant="danger"
				ref={ removeButtonRef }
				disabled={ disableRemove }
				onClick={ onRequestRemove }
				aria-label={ removeLabel }
			>
				{ __( 'Remove condition', 'quoteform' ) }
			</Button>

			{ isConfirming && (
				<RemoveConfirm
					message={ sprintf(
						/* translators: %1$d: rule number, %2$d: condition number. */
						__( 'Remove condition %2$d from rule %1$d?', 'quoteform' ),
						ruleNumber,
						conditionNumber
					) }
					confirmLabel={ sprintf(
						/* translators: %1$d: rule number, %2$d: condition number. */
						__( 'Yes, remove rule %1$d condition %2$d', 'quoteform' ),
						ruleNumber,
						conditionNumber
					) }
					cancelLabel={ sprintf(
						/* translators: %1$d: rule number, %2$d: condition number. */
						__( 'Keep rule %1$d condition %2$d', 'quoteform' ),
						ruleNumber,
						conditionNumber
					) }
					onConfirm={ onConfirmRemove }
					onCancel={ onCancelRemove }
				/>
			) }
		</div>
	);
}
